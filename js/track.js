import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createKit, seededRandom, snapStud, FLOWER_COLORS } from './legoKit.js';
import { STUD } from './bricks.js';
import { createFigureMesh, mergeFigure, applyPose } from './figureMesh.js';
import { randomFigure } from './figures.js';

export const ROAD_WIDTH = 14;
const HALF = ROAD_WIDTH / 2;
const SAMPLES = 600;
const CHECKPOINTS = 16;
const BARRIER_EVERY = 4; // samples per barrier block
const UP = new THREE.Vector3(0, 1, 0);

// A closed loop on flat ground (x, z), driven in this order: the start straight, a sweeper, an S-bend, a hairpin,
// the bridge straight and the long lava straight home. Runs of points in a line keep the straights dead straight.
const CONTROL_POINTS = [
  [0, -40], [0, 30], [8, 62], [32, 82], [64, 80], [82, 58], [104, 40], [134, 48], [158, 72], [190, 70], [206, 40],
  [200, 6], [198, -24], [196, -48], [190, -80], [178, -102], [160, -114], [135, -114], [110, -114], [85, -114],
  [60, -114], [35, -114], [12, -104], [0, -80],
];
const RIVER = { x: 197, z: -36, w: 90, d: 14 };
const BRIDGE = { height: 3.5, top: 11, ramp: 18 }; // m: half the flat top over the river, and each ramp
// The lava jump, in metres along the road: a run-up, a climb of `up` to `takeoff` high (steepest at the top, the
// kicker, about 10°: steeper and the fastest cars fly past the landing), `gap` of lava, then a straight landing ramp
// from `land` high, `down` long. At 10 m/s a car clears it.
export const LAVA_JUMP = { lip: [95, -114], runUp: 28, up: 30, takeoff: 5, kicker: 5, gap: 8, land: 2.5, down: 36 };
const PIT_HALF = HALF + 7; // the lava reaches past the road on both sides
export const TRACK_CENTER = { x: 100, z: -15 }; // the middle of it all: the hills ring it and the clouds drift over it
const CONE_SAMPLES = [40, 46, 52, 186, 192, 198, 300, 306, 312, 392, 398];

// Where the road goes, without drawing anything: centre points with their height, where the lava gap is and the checkpoints.
export function layTrack() {
  const curve = new THREE.CatmullRomCurve3(CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const points = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
  const length = curve.getLength();
  const spacing = length / SAMPLES;
  const nearestSample = (x, z) => points.reduce((best, p, i) => ((p.x - x) ** 2 + (p.z - z) ** 2 < (points[best].x - x) ** 2 + (points[best].z - z) ** 2 ? i : best), 0);
  const after = (i, from) => ((i - from + SAMPLES + SAMPLES / 2) % SAMPLES) - SAMPLES / 2; // samples from `from` on to i (negative: before)
  const steps = m => Math.round(m / spacing);

  const J = LAVA_JUMP;
  const lip = nearestSample(...J.lip);
  const [runUp, up, kicker, gap, down] = [J.runUp, J.up, J.kicker, J.gap, J.down].map(steps);
  const land = (lip + gap) % SAMPLES; // where the landing ramp starts
  const bridge = nearestSample(RIVER.x, RIVER.z);
  const smooth = t => t * t * (3 - 2 * t);
  function rise(i) {
    const b = Math.abs(after(i, bridge)) * spacing;
    if (b < BRIDGE.top + BRIDGE.ramp) return BRIDGE.height * smooth(Math.min(1, (BRIDGE.top + BRIDGE.ramp - b) / BRIDGE.ramp));
    const k = after(i, lip);
    if (k >= -up && k <= 0) {
      const u = 1 + k / up;
      return J.takeoff * (0.9 * u + 0.1 * u * u); // a little steeper at the top
    }
    if (k > 0 && k < gap) return J.takeoff + ((J.land - J.takeoff) * k) / gap + 1.2 * Math.sin((Math.PI * k) / gap); // no road: roughly where a car flies
    if (k >= gap && k <= gap + down) return J.land * (1 - (k - gap) / down);
    return 0;
  }
  points.forEach((p, i) => { p.y = rise(i); });

  const isGap = i => { const k = after(i, lip); return k >= 0 && k < gap; }; // no road from sample i to i + 1
  const isKicker = i => { const k = after(i, lip); return k < 0 && k >= -kicker; };
  const inJump = i => { const k = after(i, lip); return k >= -up - runUp && k <= gap + down; }; // run-up to the bottom of the landing

  // Evenly round the lap, but never on the jump: it has to be driven, between two checkpoints.
  const checkpointSamples = [];
  for (let c = 0; c < CHECKPOINTS; c++) {
    let i = Math.round((c * SAMPLES) / CHECKPOINTS) % SAMPLES;
    if (inJump(i)) i = (lip + gap + down + 1) % SAMPLES;
    if (!checkpointSamples.includes(i)) checkpointSamples.push(i);
  }

  // The pit, as a box on the ground between the two ramps (along: the way the road goes, across: to its right).
  const a = points[lip];
  const b = points[land];
  const along = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  const pit = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, dx: along.x, dz: along.z, length: Math.hypot(b.x - a.x, b.z - a.z) + 2, half: PIT_HALF };
  const nearPit = (x, z, pad = 0) => {
    const dx = x - pit.x;
    const dz = z - pit.z;
    return Math.abs(dx * pit.dx + dz * pit.dz) < pit.length / 2 + pad && Math.abs(dz * pit.dx - dx * pit.dz) < pit.half + pad;
  };

  return {
    points, length, spacing, lip, land, isGap, isKicker, inJump, checkpointSamples, pit, nearPit, after,
    rampFoot: (lip - up + SAMPLES) % SAMPLES,
    landEnd: (land + down) % SAMPLES,
    respawnSample: (lip - up - runUp + SAMPLES) % SAMPLES, // back on the road with a run-up, after falling in
    // Down in the lava, or hung on the edge of a ramp above it (not flying over it).
    inLava: p => nearPit(p.x, p.z) && p.y < J.land,
  };
}

// A fan in the stand cheering: arms up and waving, a little bounce.
const fanPose = (time, phase) => {
  const wave = Math.max(0, Math.sin(time * 6 + phase));
  return { legL: 0, legR: 0, armL: 2.4 + wave * 0.5, armR: 2.6 - wave * 0.5, bob: wave * 0.08, lean: 0, twist: 0, spread: 0.3, headTilt: -0.1 };
};

export function createTrack(scene, world) {
  const disposables = [];
  const own = thing => { disposables.push(thing); return thing; };
  const kit = createKit(own); // everything static is drawn as toy bricks and merged at the end
  const white = kit.plastic(0xf5f5f5);
  const red = kit.plastic(0xe53935);
  const dark = kit.plastic(0x37474f);

  const layout = layTrack();
  const { points, isGap, isKicker, inJump, pit, nearPit } = layout;
  const frames = points.map((point, i) => {
    const next = points[(i + 1) % SAMPLES];
    const forward = next.clone().sub(point).normalize();
    const flat = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    return { point, forward, right: new THREE.Vector3().crossVectors(flat, UP).normalize(), heading: Math.atan2(flat.x, flat.z), length: next.distanceTo(point) };
  });

  // A road-aligned box from sample i to sample i+span: x = driver's left, y = road up, z = along the road.
  function segment(i, span = 1) {
    const a = points[i];
    const b = points[(i + span) % SAMPLES];
    const z = b.clone().sub(a).normalize();
    const x = new THREE.Vector3().crossVectors(UP, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    return { mid: a.clone().add(b).multiplyScalar(0.5), x, y, q, length: a.distanceTo(b) };
  }

  // Cars (race.js gives them carMaterial) slide freely on the jump's ramps: with cannon's friction, a car landing hard
  // enough to touch its body down stops dead. Wheels grip by their own rays, so driving up and down feels the same.
  const carMaterial = new CANNON.Material('car');
  const rampMaterial = new CANNON.Material('ramp');
  world.addContactMaterial(new CANNON.ContactMaterial(carMaterial, rampMaterial, { friction: 0, restitution: 0 }));

  function staticBox(center, hx, hy, hz, q, material = null) {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), material });
    body.position.set(center.x, center.y, center.z);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    body.aabbNeedsUpdate = true; // cannon-es caches bounds when the body is created
    world.addBody(body);
  }

  function canvasTexture(width, height, draw, repeat = false) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'));
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // --- ground: a studded green baseplate (the physics is one flat plane) ---
  const GRASS = 0x4caf50;
  kit.span(kit.plastic(GRASS, { look: 'studs' }), -450, -0.05, -450, 450, 0, 450);
  const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  groundBody.aabbNeedsUpdate = true;
  world.addBody(groundBody);

  // --- road ribbon (wheels drive on the ground plane or bridge/ramp boxes; this is just the paint) ---
  {
    const positions = [];
    const uvs = [];
    const indices = [];
    let v = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const f = frames[i % SAMPLES];
      const left = f.point.clone().addScaledVector(f.right, -HALF);
      const right = f.point.clone().addScaledVector(f.right, HALF);
      positions.push(left.x, left.y + 0.03, left.z, right.x, right.y + 0.03, right.z);
      uvs.push(0, v, 1, v);
      v += f.length / 10;
    }
    for (let i = 0; i < SAMPLES; i++) {
      if (isGap(i) || isKicker(i)) continue; // no road over the lava; the kicker shows its stripes
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    // Smooth grey road plates with red and white kerbs, white edge lines and a yellow centre dash.
    const asphalt = canvasTexture(128, 256, g => {
      g.fillStyle = '#5d626a';
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, 0, 128, 2);
      for (let y = 0; y < 256; y += 128) {
        g.fillStyle = y ? '#f5f5f5' : '#e53935';
        g.fillRect(0, y, 8, 128);
        g.fillRect(120, y, 8, 128);
      }
      g.fillStyle = '#ffffff';
      g.fillRect(11, 0, 4, 256);
      g.fillRect(113, 0, 4, 256);
      g.fillStyle = '#fdd835';
      g.fillRect(62, 0, 4, 128);
    }, true);
    asphalt.anisotropy = 8;
    const road = new THREE.Mesh(geometry, own(new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.55, side: THREE.DoubleSide })));
    road.receiveShadow = true;
    scene.add(road);
  }

  // --- bridge: solid deck boxes wherever the road leaves the ground, round-brick pillars and a river below ---
  // The lava jump's ramps are solid brick banks down to the ground instead, so nothing drives underneath them.
  const water = kit.plastic(0x29b6f6, { look: 'ripples', transparent: true, opacity: 0.85, roughness: 0.06 });
  water.userData.noShadow = true;
  {
    const deck = kit.plastic(0x78909c);
    const pillar = kit.plastic(0xb0bec5);
    const bank = kit.plastic(0x6d4c41, { look: 'bricks' });
    const stripes = [kit.plastic(0xfdd835), kit.plastic(0x263238)];
    for (let i = 0; i < SAMPLES; i++) {
      const low = Math.min(points[i].y, points[(i + 1) % SAMPLES].y);
      if (Math.max(points[i].y, points[(i + 1) % SAMPLES].y) < 0.05 || isGap(i)) continue;
      const s = segment(i);
      if (inJump(i)) {
        const depth = low + 0.6;
        kit.boxQ(isKicker(i) ? stripes[i % 2] : bank, s.mid.clone().addScaledVector(s.y, -depth / 2), ROAD_WIDTH + 1, depth, s.length + 0.4, s.q);
        continue;
      }
      const center = s.mid.clone().addScaledVector(s.y, -0.3);
      staticBox(center, HALF + 0.5, 0.3, s.length / 2 + 0.2, s.q);
      kit.boxQ(deck, center, ROAD_WIDTH + 1, 0.6, s.length + 0.4, s.q);
      if (i % 10 === 0 && points[i].y > 1.5) {
        for (const side of [-1, 1]) {
          const height = points[i].y - 0.6;
          const at = points[i].clone().addScaledVector(s.x, side * (HALF - 1));
          kit.cylinder(pillar, at.x, height / 2, at.z, 0.6, 0.6, height, 14);
          for (let y = 0.6; y < height; y += 0.6) kit.cylinder(white, at.x, y, at.z, 0.64, 0.64, 0.06, 14); // round-brick joints
        }
      }
    }
    // The jump's ramps are solid in long pieces (the landing in one): a car coming down nose-first onto a short box
    // can catch its end face and stop dead.
    for (const [from, to, most] of [[layout.rampFoot, layout.lip, 6], [layout.land, layout.landEnd, SAMPLES]]) {
      for (let i = from; i !== to;) {
        const span = Math.min(most, layout.after(to, i));
        const s = segment(i, span);
        const depth = Math.max(points[i].y, points[(i + span) % SAMPLES].y) + 0.6;
        staticBox(s.mid.clone().addScaledVector(s.y, -depth / 2), HALF + 0.5, depth / 2, s.length / 2 + 0.2, s.q, rampMaterial);
        i = (i + span) % SAMPLES;
      }
    }
    const sand = kit.plastic(0xe6c98f, { look: 'studs' });
    kit.span(sand, RIVER.x - RIVER.w / 2 - 2, 0, RIVER.z - RIVER.d / 2 - 2, RIVER.x + RIVER.w / 2 + 2, 0.012, RIVER.z + RIVER.d / 2 + 2);
    kit.span(water, RIVER.x - RIVER.w / 2, 0, RIVER.z - RIVER.d / 2, RIVER.x + RIVER.w / 2, 0.025, RIVER.z + RIVER.d / 2);
  }

  // --- the lava pit between the ramps: glowing, bubbling and too hot (race.js puts anyone who falls in back before the jump) ---
  const pitQ = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(pit.dx, pit.dz));
  const pitAt = (along, across, y) => new THREE.Vector3(pit.x + pit.dx * along - pit.dz * across, y, pit.z + pit.dz * along + pit.dx * across);
  const lavaMap = canvasTexture(128, 128, g => {
    g.fillStyle = '#e64a19';
    g.fillRect(0, 0, 128, 128);
    const random = seededRandom(3);
    for (let n = 0; n < 40; n++) {
      const x = random() * 128;
      const y = random() * 128;
      const r = 4 + random() * 14;
      const blob = g.createRadialGradient(x, y, 0, x, y, r);
      const hot = n % 3 ? 'rgba(255,193,7,0.95)' : 'rgba(120,20,10,0.8)'; // yellow-hot bubbles and dark crust
      blob.addColorStop(0, hot);
      blob.addColorStop(1, 'rgba(230,74,25,0)');
      g.fillStyle = blob;
      for (const [ox, oy] of [[0, 0], [128, 0], [0, 128], [128, 128], [-128, 0], [0, -128]]) g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); // wraps round seamlessly
    }
  }, true);
  lavaMap.repeat.set(1 / 8, 1 / 8); // the kit's boxes have UVs in metres
  const lava = own(new THREE.MeshStandardMaterial({ map: lavaMap, emissive: 0xffffff, emissiveMap: lavaMap, emissiveIntensity: 0.55, roughness: 0.85, fog: false }));
  lava.userData.noShadow = true;
  const glow = (hex, intensity = 1.3) => own(new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: intensity, roughness: 0.5 }));
  const bubbles = [];
  const flames = [];
  {
    kit.boxQ(lava, pitAt(0, 0, 0.03), pit.half * 2, 0.06, pit.length + 4, pitQ);
    const rock = kit.plastic(0x3e2723, { look: 'bricks' });
    // Rock walls along both sides (solid, so nobody drives round the jump) and low ones across the ends, under the ramps.
    for (const side of [-1, 1]) {
      const wall = pitAt(0, side * (pit.half + 0.6), 0.7);
      kit.boxQ(rock, wall, 1.2, 1.4, pit.length + 6.4, pitQ);
      staticBox(wall, 0.6, 0.7, pit.length / 2 + 3.2, pitQ);
      kit.boxQ(rock, pitAt(side * (pit.length / 2 + 2.6), 0, 0.5), pit.half * 2 + 2.4, 1, 1.2, pitQ);
      for (let k = 0; k < 4; k++) flames.push({ at: pitAt(((k + 0.5) / 4 - 0.5) * (pit.length + 4), side * (pit.half + 0.6), 1.4), phase: k * 1.7 + side });
    }
    const random = seededRandom(11);
    for (let n = 0; n < 12; n++) bubbles.push({ at: pitAt((random() - 0.5) * pit.length, (random() - 0.5) * (pit.half * 2 - 2), 0.06), size: 0.4 + random() * 0.6, phase: random(), rate: 0.4 + random() * 0.5 });
  }
  const bubbleMesh = new THREE.InstancedMesh(own(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), glow(0xff8f00, 1), bubbles.length);
  const flameMesh = new THREE.InstancedMesh(own(new THREE.ConeGeometry(0.45, 1.6, 7).translate(0, 0.8, 0)), glow(0xff9100, 1.6), flames.length);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const mesh of [bubbleMesh, flameMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // they move every frame, so there's no point keeping their bounds
    for (let k = 0; k < mesh.count; k++) mesh.setMatrixAt(k, hidden); // until the first update
    scene.add(mesh);
  }

  // Puffs of flame (falling in) and smoke (popping back on the road): a few little blocks flying apart and shrinking.
  const PUFF_BITS = 10;
  const PUFF_TIME = 0.9;
  const puffs = Array.from({ length: 3 }, () => ({ start: -10, origin: new THREE.Vector3(), bits: [] }));
  const puffMesh = new THREE.InstancedMesh(own(new THREE.BoxGeometry(0.5, 0.5, 0.5)), own(new THREE.MeshBasicMaterial()), puffs.length * PUFF_BITS);
  puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  puffMesh.frustumCulled = false;
  for (let k = 0; k < puffMesh.count; k++) puffMesh.setMatrixAt(k, hidden);
  scene.add(puffMesh);
  const puffColors = { flame: [0xffeb3b, 0xff9100, 0xff3d00], smoke: [0xffffff, 0xeceff1, 0xcfd8dc] };
  let nextPuff = 0;
  let now = 0;

  // --- a LAVA JUMP! arch over the foot of the ramp, and warning signs on the run-up ---
  {
    const f = frames[layout.rampFoot];
    const banner = canvasTexture(512, 96, g => {
      g.fillStyle = '#d32f2f';
      g.fillRect(0, 0, 512, 96);
      g.fillStyle = '#fdd835';
      for (let x = 0; x < 512; x += 32) g.fillRect(x, x % 64 ? 0 : 88, 32, 8);
      g.font = 'bold 60px Fredoka, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🔥 LAVA JUMP! 🔥', 256, 50);
    });
    const red = kit.plastic(0xd32f2f);
    const bannerMaterial = own(new THREE.MeshStandardMaterial({ map: banner, emissive: 0xffffff, emissiveMap: banner, emissiveIntensity: 0.35, roughness: 0.4 }));
    const arch = new THREE.Mesh(own(new THREE.BoxGeometry(ROAD_WIDTH + 3, 2.2, 0.4)), [red, red, red, red, bannerMaterial, bannerMaterial]);
    arch.position.set(f.point.x, 7.4, f.point.z);
    arch.rotation.y = f.heading;
    scene.add(arch);
    for (const side of [-1, 1]) {
      const p = f.point.clone().addScaledVector(f.right, side * (HALF + 1.2));
      kit.box(dark, p.x, 3.7, p.z, 0.6, 7.4, 0.6, f.heading);
    }
    const sign = canvasTexture(128, 128, g => {
      g.fillStyle = '#d32f2f';
      g.beginPath();
      g.moveTo(64, 4); g.lineTo(124, 116); g.lineTo(4, 116); g.closePath();
      g.fill();
      g.fillStyle = '#fdd835';
      g.beginPath();
      g.moveTo(64, 22); g.lineTo(108, 106); g.lineTo(20, 106); g.closePath();
      g.fill();
      g.font = 'bold 54px sans-serif';
      g.textAlign = 'center';
      g.fillText('🔥', 64, 96);
    });
    const spots = [];
    const pole = kit.plastic(0x90a4ae);
    for (const back of [6, 18, 30]) {
      const at = frames[(layout.rampFoot - Math.round(back / layout.spacing) + SAMPLES) % SAMPLES];
      for (const side of [-1, 1]) {
        const p = at.point.clone().addScaledVector(at.right, side * (HALF + 2));
        kit.cylinder(pole, p.x, 1.4, p.z, 0.08, 0.08, 2.8, 8);
        spots.push({ p, heading: at.heading });
      }
    }
    const signs = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(2, 2)), own(new THREE.MeshStandardMaterial({ map: sign, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4 })), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(({ p, heading }, n) => signs.setMatrixAt(n, m.compose(new THREE.Vector3(p.x, 3.6, p.z), new THREE.Quaternion().setFromAxisAngle(UP, heading + Math.PI), new THREE.Vector3(1, 1, 1))));
    signs.castShadow = true;
    scene.add(signs);
  }

  // --- red/white barriers on both edges, all the way round (along the ramps too, but not over the lava) ---
  {
    const blocks = [];
    for (let i = 0; i < SAMPLES;) {
      if (isGap(i)) { i++; continue; }
      let span = 1;
      while (span < BARRIER_EVERY && i + span < SAMPLES && !isGap(i + span)) span++;
      blocks.push([i, span]);
      i += span;
    }
    const mesh = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), own(new THREE.MeshStandardMaterial({ roughness: 0.32 })), blocks.length * 2);
    const colors = [new THREE.Color(0xf5f5f5), new THREE.Color(0xe53935)];
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    let n = 0;
    for (const [i, span] of blocks) {
      const s = segment(i, span);
      for (const side of [-1, 1]) {
        const center = s.mid.clone().addScaledVector(s.x, side * (HALF + 0.45)).addScaledVector(s.y, 0.55);
        staticBox(center, 0.35, 0.55, s.length / 2 + 0.35, s.q);
        mesh.setMatrixAt(n, matrix.compose(center, s.q, scale.set(0.7, 1.1, s.length + 0.7)));
        const k = (n >> 1) % 2;
        mesh.setColorAt(n, colors[k]);
        // A row of studs along the top, like a real brick wall.
        const along = new THREE.Vector3(0, 0, 1).applyQuaternion(s.q);
        const top = center.clone().addScaledVector(s.y, 0.55);
        const half = (s.length + 0.7) / 2;
        for (let t = -half + STUD / 2; t < half; t += STUD) kit.stud(k ? red : white, top.x + along.x * t, top.y + along.y * t, top.z + along.z * t);
        n++;
      }
    }
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // --- start line and arch ---
  {
    const f = frames[0];
    const checker = canvasTexture(64, 16, g => {
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 2; y++) {
          g.fillStyle = (x + y) % 2 ? '#111111' : '#ffffff';
          g.fillRect(x * 8, y * 8, 8, 8);
        }
      }
    });
    checker.magFilter = THREE.NearestFilter;
    const checkerMaterial = own(new THREE.MeshStandardMaterial({ map: checker, roughness: 0.35 }));
    const line = new THREE.Mesh(own(new THREE.PlaneGeometry(ROAD_WIDTH, 2).rotateX(-Math.PI / 2)), checkerMaterial);
    line.position.set(f.point.x, f.point.y + 0.05, f.point.z);
    line.rotation.y = f.heading;
    scene.add(line);
    const arch = new THREE.Group();
    const postMaterial = red;
    const postGeometry = own(new THREE.BoxGeometry(0.6, 6, 0.6));
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(side * (HALF + 1.2), 3, 0);
      post.castShadow = true;
      arch.add(post);
      const cap = new THREE.Mesh(postGeometry, white);
      cap.scale.set(1.25, 0.05, 1.25);
      cap.position.set(post.position.x, 0.15, 0);
      arch.add(cap);
    }
    const banner = new THREE.Mesh(own(new THREE.BoxGeometry(ROAD_WIDTH + 3, 1.4, 0.4)), checkerMaterial);
    banner.position.y = 6;
    arch.add(banner);
    arch.position.copy(f.point);
    arch.rotation.y = f.heading;
    scene.add(arch);
  }

  // --- a small jump across the whole start straight (cars always meet it head-on, never its side) ---
  {
    const f = frames[Math.round(30 / layout.spacing)]; // 30 m after the line
    const center = f.point.clone();
    center.y = 0.17; // back edge flush with the road
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, f.heading, 0, 'YXZ')); // nose up
    const stripes = canvasTexture(64, 64, g => {
      g.fillStyle = '#fdd835';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#263238';
      for (let k = -64; k < 64; k += 16) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 8, 0);
        g.lineTo(k + 72, 64);
        g.lineTo(k + 64, 64);
        g.fill();
      }
    });
    const ramp = new THREE.Mesh(own(new THREE.BoxGeometry(ROAD_WIDTH - 0.4, 0.5, 6)), own(new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.35 })));
    ramp.position.copy(center);
    ramp.quaternion.copy(q);
    ramp.castShadow = ramp.receiveShadow = true;
    scene.add(ramp);
    staticBox(center, HALF - 0.2, 0.25, 3, q);
  }

  // --- cones that go flying when you hit them ---
  const coneGeometry = own(new THREE.ConeGeometry(0.3, 0.7, 12));
  const coneMaterial = kit.plastic(0xff6d00);
  const cones = CONE_SAMPLES.map((i, k) => {
    const f = frames[i];
    const p = f.point.clone().addScaledVector(f.right, k % 2 ? -4.5 : -3.5).addScaledVector(f.forward, (k % 3) * 0.8);
    const body = new CANNON.Body({ mass: 1.5, shape: new CANNON.Cylinder(0.06, 0.3, 0.7, 8) });
    body.position.set(p.x, p.y + 0.36, p.z);
    world.addBody(body);
    const mesh = new THREE.Mesh(coneGeometry, coneMaterial);
    mesh.castShadow = true;
    scene.add(mesh);
    return { body, mesh };
  });

  function nearest(x, z) {
    let index = 0;
    let best = Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const d = (points[i].x - x) ** 2 + (points[i].z - z) ** 2;
      if (d < best) { best = d; index = i; }
    }
    return { index, point: points[index], distance: Math.sqrt(best) };
  }

  // --- how far every spot is from the road's middle, on a 1 m grid (so scenery can keep clear of it) ---
  // Each road point marks the squares round it out to REACH; nothing cares how far away anything further out is.
  const bounds = { x0: -110, z0: -200, x1: 310, z1: 170 };
  const REACH = 48;
  const gridW = bounds.x1 - bounds.x0;
  const gridD = bounds.z1 - bounds.z0;
  const gap = new Float32Array(gridW * gridD).fill(Infinity);
  for (const p of points) {
    const cx = p.x - bounds.x0 - 0.5;
    const cz = p.z - bounds.z0 - 0.5;
    for (let gx = Math.max(0, Math.ceil(cx - REACH)); gx <= Math.min(gridW - 1, cx + REACH); gx++) {
      for (let gz = Math.max(0, Math.ceil(cz - REACH)); gz <= Math.min(gridD - 1, cz + REACH); gz++) {
        const d = (gx - cx) ** 2 + (gz - cz) ** 2;
        if (d < gap[gx * gridD + gz]) gap[gx * gridD + gz] = d;
      }
    }
  }
  for (let k = 0; k < gap.length; k++) gap[k] = Math.sqrt(gap[k]);
  const roadGap = (x, z) => {
    const gx = Math.floor(x - bounds.x0);
    const gz = Math.floor(z - bounds.z0);
    return gx < 0 || gz < 0 || gx >= gridW || gz >= gridD ? Infinity : gap[gx * gridD + gz];
  };
  const inRiver = (x, z, pad) => Math.abs(x - RIVER.x) < RIVER.w / 2 + pad && Math.abs(z - RIVER.z) < RIVER.d / 2 + pad;

  // --- a grandstand of cheering fans beside the start straight ---
  const STAND = { x0: -21, x1: -13, z0: -34, z1: -8 };
  const fans = [];
  {
    const steps = 4;
    const seats = [kit.plastic(0x1e88e5), kit.plastic(0xfdd835), kit.plastic(0xe53935), kit.plastic(0x43a047)];
    const grey = kit.plastic(0xb0bec5, { look: 'bricks' });
    const depth = (STAND.x1 - STAND.x0) / steps;
    for (let k = 0; k < steps; k++) {
      const x1 = STAND.x1 - k * depth; // steps rise away from the track
      kit.span(grey, STAND.x0, 0, STAND.z0, x1, (k + 1) * 0.9, STAND.z1);
      kit.span(seats[k], x1 - 0.5, (k + 1) * 0.9, STAND.z0 + 0.5, x1 - 0.1, (k + 1) * 0.9 + 0.3, STAND.z1 - 0.5);
    }
    // A striped roof on posts.
    for (const z of [STAND.z0 + 0.4, (STAND.z0 + STAND.z1) / 2, STAND.z1 - 0.4]) {
      kit.box(dark, STAND.x0 + 0.3, 3.6 + 1.6, z, 0.3, 3.2, 0.3);
      kit.box(dark, STAND.x1 - 0.3, 0.9 + 2.75, z, 0.3, 5.5, 0.3);
    }
    for (let z = STAND.z0; z < STAND.z1; z += 2) kit.span((z - STAND.z0) % 4 ? white : red, STAND.x0 - 0.3, 6.4, z, STAND.x1 + 0.6, 6.7, Math.min(STAND.z1, z + 2));
    kit.studs(red, STAND.x0 - 0.3, STAND.z0, STAND.x1 + 0.6, STAND.z0 + 0.5, 6.7);
    kit.studs(red, STAND.x0 - 0.3, STAND.z1 - 0.5, STAND.x1 + 0.6, STAND.z1, 6.7);
    for (let n = 0; n < 18; n++) {
      const k = n % steps;
      const fan = createFigureMesh(randomFigure(700 + n * 11, 'Fan'));
      fan.position.set(STAND.x1 - k * depth - depth * 0.6, (k + 1) * 0.9, STAND.z0 + 1.5 + ((n * 7) % 18) * 1.25 + k * 0.3);
      fan.rotation.y = Math.PI / 2; // facing the track
      fan.scale.setScalar(1.25);
      fan.traverse(node => { node.castShadow = false; }); // 18 shadowed fans cost more than all the race cars; the stand's roof shades them anyway
      applyPose(fan, fanPose(0, 0));
      mergeFigure(fan, { moving: ['body', 'arms'] }); // they only bob and wave
      scene.add(fan);
      fans.push({ mesh: fan, phase: n * 1.3 });
    }
  }
  // Solid, so a car that leaves the road bumps into the stand instead of driving through the fans.
  staticBox(new THREE.Vector3((STAND.x0 + STAND.x1) / 2, 1.8, (STAND.z0 + STAND.z1) / 2), (STAND.x1 - STAND.x0) / 2, 1.8, (STAND.z1 - STAND.z0) / 2, new THREE.Quaternion());
  const inStand = (x, z, pad) => x > STAND.x0 - pad && x < STAND.x1 + pad && z > STAND.z0 - pad && z < STAND.z1 + pad;

  // --- flags on poles behind the barriers ---
  {
    const flagColors = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0x8e24aa];
    const pole = kit.plastic(0x90a4ae);
    for (let n = 0; n * 16 + 6 < SAMPLES; n++) {
      const f = frames[n * 16 + 6];
      const side = n % 2 ? 1 : -1; // one side, then the other
      const p = f.point.clone().addScaledVector(f.right, side * (HALF + 2.4));
      if (p.y > 0.1 || inRiver(p.x, p.z, 1) || inStand(p.x, p.z, 1) || nearPit(p.x, p.z, 4)) continue;
      kit.cylinder(pole, p.x, 2.5, p.z, 0.07, 0.09, 5, 8);
      kit.box(kit.plastic(flagColors[n % flagColors.length]), p.x + f.forward.x * 0.7, 4.4, p.z + f.forward.z * 0.7, ...(Math.abs(f.forward.x) > Math.abs(f.forward.z) ? [1.4, 0.9, 0.05] : [0.05, 0.9, 1.4]));
    }
  }

  // --- trees, bushes and flowers, kept well away from the road; stepped brick hills far off ---
  {
    const random = seededRandom(7);
    const trees = [];
    const bushes = [];
    const flowers = [];
    for (let tries = 0; trees.length < 280 && tries < 10000; tries++) {
      const x = -100 + random() * 400;
      const z = -190 + random() * 350;
      if (roadGap(x, z) > HALF + 8 && !inRiver(x, z, 6) && !inStand(x, z, 4) && !nearPit(x, z, 6)) trees.push({ x, y: 0, z, s: 0.9 + random() * 0.7, kind: random() < 0.5 ? 'pine' : 'round' });
    }
    for (let tries = 0; bushes.length < 160 && tries < 7000; tries++) {
      const x = -90 + random() * 380;
      const z = -180 + random() * 330;
      if (roadGap(x, z) > HALF + 3.5 && !inRiver(x, z, 1.5) && !inStand(x, z, 2) && !nearPit(x, z, 3)) bushes.push({ x, y: 0, z, s: 0.7 + random() * 0.6 });
    }
    for (let tries = 0; flowers.length < 1000 && tries < 7000; tries++) {
      const x = -80 + random() * 360;
      const z = -170 + random() * 310;
      if (roadGap(x, z) < HALF + 2.5 || roadGap(x, z) > HALF + 30 || inRiver(x, z, 1) || inStand(x, z, 1) || nearPit(x, z, 2)) continue;
      const c = FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)];
      for (let k = 0; k < 5; k++) flowers.push({ x: x + (random() - 0.5) * 1.6, y: 0, z: z + (random() - 0.5) * 1.6, c });
    }
    kit.plant(scene, { trees, bushes, flowers });

    const hill = kit.plastic(0x43a047);
    for (let n = 0; n < 9; n++) {
      const a = (n / 9) * Math.PI * 2 + 0.4;
      const cx = TRACK_CENTER.x + Math.cos(a) * 270;
      const cz = TRACK_CENTER.z + Math.sin(a) * 260;
      const size = 40 + random() * 30;
      const layers = 5 + Math.floor(random() * 4);
      for (let k = 0; k < layers; k++) {
        const r = size / 2 - k * (size / 2 / (layers + 1));
        kit.span(hill, cx - r, k * 1.8, cz - r * 0.8, cx + r, (k + 1) * 1.8, cz + r * 0.8);
      }
    }
  }

  // --- real studs on the grass near your car ---
  const field = kit.studField(scene);
  for (let x = snapStud(bounds.x0 + 30); x < bounds.x1 - 30; x += STUD) {
    for (let z = snapStud(bounds.z0 + 30); z < bounds.z1 - 30; z += STUD) {
      const d = roadGap(x, z);
      if (d < HALF + 1.2 || d > HALF + 30 || inRiver(x, z, 2.2) || inStand(x, z, 0.3) || nearPit(x, z, 1.5)) continue;
      field.add(x, 0, z, GRASS);
    }
  }
  field.finish();
  kit.build(scene);

  const { checkpointSamples } = layout;
  const checkpoints = checkpointSamples.map(i => {
    const p = frames[i].point;
    return { x: p.x, y: p.y, z: p.z };
  });
  // On the road at sample i, facing the way the race goes.
  const poseAt = i => {
    const f = frames[i];
    return { position: { x: f.point.x, y: f.point.y + 1.2, z: f.point.z }, heading: f.heading, racingIndex: Math.floor(i / 2) };
  };
  const matrix = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const size = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const color = new THREE.Color();

  return {
    width: ROAD_WIDTH,
    samples: points,
    checkpoints,
    // full: the jump's run-up, ramps and landing, which computer cars drive flat out (too slow and they'd fall in).
    racingLine: points.flatMap((p, i) => (i % 2 ? [] : [inJump(i) ? { x: p.x, z: p.z, full: true } : { x: p.x, z: p.z }])),
    nearest,
    carMaterial,
    startGrid(slot) {
      const f = frames[SAMPLES - 4 - Math.floor(slot / 2) * 6];
      const p = f.point.clone().addScaledVector(f.right, slot % 2 ? 3.2 : -3.2);
      return { position: { x: p.x, y: p.y + 1.2, z: p.z }, heading: f.heading };
    },
    respawnPoint: checkpoint => poseAt(checkpointSamples[checkpoint]),
    // Fell in the lava: back on the road with a run-up to try again.
    inLava: layout.inLava,
    lavaRespawn: () => poseAt(layout.respawnSample),
    // metres before the lip of the jump (for testing from the console).
    beforeJump: metres => poseAt((layout.lip - Math.round(metres / layout.spacing) + SAMPLES) % SAMPLES),
    // A puff of 'flame' or 'smoke' at p.
    puff(p, kind = 'smoke') {
      const puff = puffs[nextPuff];
      nextPuff = (nextPuff + 1) % puffs.length;
      puff.start = now;
      puff.origin.set(p.x, p.y, p.z);
      const random = seededRandom(Math.floor(now * 1000));
      puff.bits = Array.from({ length: PUFF_BITS }, (_, k) => {
        const a = (k / PUFF_BITS) * Math.PI * 2;
        puffMesh.setColorAt(puffs.indexOf(puff) * PUFF_BITS + k, color.setHex(puffColors[kind][k % 3]));
        return { vx: Math.cos(a) * (2 + random() * 2), vy: 3 + random() * 4, vz: Math.sin(a) * (2 + random() * 2), s: 0.6 + random() * 0.8 };
      });
      puffMesh.instanceColor.needsUpdate = true;
    },
    studs: field,
    // time: seconds of race; focus: the player's car, so the real studs near it switch on.
    update(time = 0, focus = null) {
      now = time;
      for (const cone of cones) {
        cone.mesh.position.copy(cone.body.position);
        cone.mesh.quaternion.copy(cone.body.quaternion);
      }
      if (focus) field.update(focus);
      water.normalMap.offset.set(time * 0.04, time * 0.02);
      lavaMap.offset.set(time * 0.03, Math.sin(time * 0.4) * 0.05);
      bubbles.forEach((b, n) => {
        const t = (time * b.rate + b.phase) % 1; // swell up, then pop
        bubbleMesh.setMatrixAt(n, matrix.compose(b.at, spin.identity(), size.setScalar(b.size * Math.sin(t * Math.PI) * (t < 0.92 ? 1 : 0))));
      });
      flames.forEach((f, n) => {
        const flicker = 0.75 + 0.25 * Math.sin(time * 11 + f.phase) + 0.15 * Math.sin(time * 23 + f.phase * 3);
        flameMesh.setMatrixAt(n, matrix.compose(f.at, spin.setFromAxisAngle(UP, time * 2 + f.phase), size.set(1, flicker, 1)));
      });
      puffs.forEach((puff, p) => {
        const age = time - puff.start;
        puff.bits.forEach((bit, k) => {
          const left = age < PUFF_TIME ? 1 - age / PUFF_TIME : 0;
          spot.set(puff.origin.x + bit.vx * age, puff.origin.y + bit.vy * age - 4 * age * age, puff.origin.z + bit.vz * age);
          puffMesh.setMatrixAt(p * PUFF_BITS + k, matrix.compose(spot, spin.setFromAxisAngle(UP, age * 6 + k), size.setScalar(bit.s * left)));
        });
      });
      bubbleMesh.instanceMatrix.needsUpdate = flameMesh.instanceMatrix.needsUpdate = puffMesh.instanceMatrix.needsUpdate = true;
      for (const fan of fans) applyPose(fan.mesh, fanPose(time, fan.phase));
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
