import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createKit, seededRandom, snapStud, FLOWER_COLORS } from './legoKit.js';
import { STUD } from './bricks.js';
import { createFigureMesh, applyPose } from './figureMesh.js';
import { randomFigure } from './figures.js';

export const ROAD_WIDTH = 14;
const HALF = ROAD_WIDTH / 2;
const SAMPLES = 400;
const CHECKPOINTS = 12;
const BARRIER_EVERY = 4; // samples per barrier block
const UP = new THREE.Vector3(0, 1, 0);

// A closed loop, driven in this order. The two 3.5 m points lift the road into a bridge over a river.
const CONTROL_POINTS = [
  [0, 0, -40], [0, 0, 20], [10, 0, 52], [38, 0, 64], [66, 0, 50], [78, 0, 20],
  [78, 3.5, -12], [78, 3.5, -34], [70, 0, -64], [45, 0, -80], [15, 0, -78], [2, 0, -62],
];
const CONE_SAMPLES = [40, 46, 52, 120, 126, 132, 230, 236, 242, 330, 336];

export function createTrack(scene, world) {
  const disposables = [];
  const own = thing => { disposables.push(thing); return thing; };
  const kit = createKit(own); // everything static is drawn as toy bricks and merged at the end
  const white = kit.plastic(0xf5f5f5);
  const red = kit.plastic(0xe53935);
  const dark = kit.plastic(0x37474f);

  const curve = new THREE.CatmullRomCurve3(CONTROL_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  const points = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
  for (const p of points) p.y = Math.max(0, p.y);
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

  function staticBox(center, hx, hy, hz, q) {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
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

  // --- road ribbon (wheels drive on the ground plane or bridge boxes; this is just the paint) ---
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
  const water = kit.plastic(0x29b6f6, { look: 'ripples', transparent: true, opacity: 0.85, roughness: 0.06 });
  water.userData.noShadow = true;
  const RIVER = { x: 78, z: -23, w: 70, d: 14 };
  {
    const deck = kit.plastic(0x78909c);
    const pillar = kit.plastic(0xb0bec5);
    for (let i = 0; i < SAMPLES; i++) {
      if (Math.max(points[i].y, points[(i + 1) % SAMPLES].y) < 0.05) continue;
      const s = segment(i);
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
    const sand = kit.plastic(0xe6c98f, { look: 'studs' });
    kit.span(sand, RIVER.x - RIVER.w / 2 - 2, 0, RIVER.z - RIVER.d / 2 - 2, RIVER.x + RIVER.w / 2 + 2, 0.012, RIVER.z + RIVER.d / 2 + 2);
    kit.span(water, RIVER.x - RIVER.w / 2, 0, RIVER.z - RIVER.d / 2, RIVER.x + RIVER.w / 2, 0.025, RIVER.z + RIVER.d / 2);
  }

  // --- red/white barriers on both edges, all the way round ---
  {
    const count = (SAMPLES / BARRIER_EVERY) * 2;
    const mesh = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), own(new THREE.MeshStandardMaterial({ roughness: 0.32 })), count);
    const colors = [new THREE.Color(0xf5f5f5), new THREE.Color(0xe53935)];
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < SAMPLES; i += BARRIER_EVERY) {
      const s = segment(i, BARRIER_EVERY);
      for (const side of [-1, 1]) {
        const center = s.mid.clone().addScaledVector(s.x, side * (HALF + 0.45)).addScaledVector(s.y, 0.55);
        staticBox(center, 0.35, 0.55, s.length / 2 + 0.35, s.q);
        mesh.setMatrixAt(n, matrix.compose(center, s.q, scale.set(0.7, 1.1, s.length + 0.7)));
        const k = (i / BARRIER_EVERY) % 2;
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
    const f = frames[Math.round(SAMPLES * 0.09)];
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
  const bounds = { x0: -110, z0: -170, x1: 190, z1: 150 };
  const gridW = bounds.x1 - bounds.x0;
  const gridD = bounds.z1 - bounds.z0;
  const gap = new Float32Array(gridW * gridD).fill(Infinity);
  for (let gx = 0; gx < gridW; gx++) {
    for (let gz = 0; gz < gridD; gz++) {
      const x = bounds.x0 + gx + 0.5;
      const z = bounds.z0 + gz + 0.5;
      let best = Infinity;
      for (let i = 0; i < SAMPLES; i += 2) best = Math.min(best, (points[i].x - x) ** 2 + (points[i].z - z) ** 2);
      gap[gx * gridD + gz] = Math.sqrt(best);
    }
  }
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
    for (let i = 6; i < SAMPLES; i += 16) {
      const f = frames[i];
      for (const side of [-1, 1]) {
        if ((i / 16 + (side > 0 ? 1 : 0)) % 2) continue;
        const p = f.point.clone().addScaledVector(f.right, side * (HALF + 2.4));
        if (p.y > 0.1 || inRiver(p.x, p.z, 1) || inStand(p.x, p.z, 1)) continue;
        kit.cylinder(pole, p.x, 2.5, p.z, 0.07, 0.09, 5, 8);
        kit.box(kit.plastic(flagColors[(i / 16) % flagColors.length]), p.x + f.forward.x * 0.7, 4.4, p.z + f.forward.z * 0.7, ...(Math.abs(f.forward.x) > Math.abs(f.forward.z) ? [1.4, 0.9, 0.05] : [0.05, 0.9, 1.4]));
      }
    }
  }

  // --- trees, bushes and flowers, kept well away from the road; stepped brick hills far off ---
  {
    const random = seededRandom(7);
    const trees = [];
    const bushes = [];
    const flowers = [];
    for (let tries = 0; trees.length < 160 && tries < 6000; tries++) {
      const x = -100 + random() * 280;
      const z = -160 + random() * 300;
      if (roadGap(x, z) > HALF + 8 && !inRiver(x, z, 6) && !inStand(x, z, 4)) trees.push({ x, y: 0, z, s: 0.9 + random() * 0.7, kind: random() < 0.5 ? 'pine' : 'round' });
    }
    for (let tries = 0; bushes.length < 90 && tries < 4000; tries++) {
      const x = -90 + random() * 260;
      const z = -150 + random() * 280;
      if (roadGap(x, z) > HALF + 3.5 && !inRiver(x, z, 1.5) && !inStand(x, z, 2)) bushes.push({ x, y: 0, z, s: 0.7 + random() * 0.6 });
    }
    for (let tries = 0; flowers.length < 600 && tries < 4000; tries++) {
      const x = -80 + random() * 240;
      const z = -140 + random() * 260;
      if (roadGap(x, z) < HALF + 2.5 || roadGap(x, z) > HALF + 30 || inRiver(x, z, 1) || inStand(x, z, 1)) continue;
      const c = FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)];
      for (let k = 0; k < 5; k++) flowers.push({ x: x + (random() - 0.5) * 1.6, y: 0, z: z + (random() - 0.5) * 1.6, c });
    }
    kit.plant(scene, { trees, bushes, flowers });

    const hill = kit.plastic(0x43a047);
    for (let n = 0; n < 7; n++) {
      const a = (n / 7) * Math.PI * 2 + 0.4;
      const cx = 40 + Math.cos(a) * 190;
      const cz = -10 + Math.sin(a) * 190;
      const size = 34 + random() * 26;
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
      if (d < HALF + 1.2 || d > HALF + 36 || inRiver(x, z, 2.2) || inStand(x, z, 0.3)) continue;
      field.add(x, 0, z, GRASS);
    }
  }
  field.finish();
  kit.build(scene);

  const checkpointSample = i => Math.round((i * SAMPLES) / CHECKPOINTS) % SAMPLES;
  const checkpoints = Array.from({ length: CHECKPOINTS }, (_, i) => {
    const p = frames[checkpointSample(i)].point;
    return { x: p.x, y: p.y, z: p.z };
  });

  return {
    width: ROAD_WIDTH,
    samples: points,
    checkpoints,
    racingLine: points.filter((_, i) => i % 2 === 0).map(p => ({ x: p.x, z: p.z })),
    nearest,
    startGrid(slot) {
      const f = frames[SAMPLES - 4 - Math.floor(slot / 2) * 7];
      const p = f.point.clone().addScaledVector(f.right, slot % 2 ? 3.2 : -3.2);
      return { position: { x: p.x, y: p.y + 1.2, z: p.z }, heading: f.heading };
    },
    respawnPoint(checkpoint) {
      const i = checkpointSample(checkpoint);
      const f = frames[i];
      return { position: { x: f.point.x, y: f.point.y + 1.2, z: f.point.z }, heading: f.heading, racingIndex: Math.floor(i / 2) };
    },
    studs: field,
    // time: seconds of race; focus: the player's car, so the real studs near it switch on.
    update(time = 0, focus = null) {
      for (const cone of cones) {
        cone.mesh.position.copy(cone.body.position);
        cone.mesh.quaternion.copy(cone.body.quaternion);
      }
      if (focus) field.update(focus);
      water.normalMap.offset.set(time * 0.04, time * 0.02);
      for (const fan of fans) {
        const wave = Math.max(0, Math.sin(time * 6 + fan.phase));
        applyPose(fan.mesh, { legL: 0, legR: 0, armL: 2.4 + wave * 0.5, armR: 2.6 - wave * 0.5, bob: wave * 0.08, lean: 0, twist: 0, spread: 0.3, headTilt: -0.1 });
      }
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
