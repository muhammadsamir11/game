import * as THREE from 'three';
import * as CANNON from 'cannon-es';

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

  // --- ground ---
  const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(900, 900)), own(new THREE.MeshStandardMaterial({ color: 0x6fcf5f, roughness: 1 })));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
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
    const asphalt = canvasTexture(128, 256, g => {
      g.fillStyle = '#55595f';
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = '#ffffff';
      g.fillRect(4, 0, 6, 256);
      g.fillRect(118, 0, 6, 256);
      g.fillStyle = '#fdd835';
      g.fillRect(61, 0, 6, 128);
    }, true);
    const road = new THREE.Mesh(geometry, own(new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, side: THREE.DoubleSide })));
    road.receiveShadow = true;
    scene.add(road);
  }

  // --- bridge: solid deck boxes wherever the road leaves the ground, pillars and a river below ---
  {
    const deckMaterial = own(new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 }));
    const pillarGeometry = own(new THREE.CylinderGeometry(0.6, 0.6, 1, 12));
    for (let i = 0; i < SAMPLES; i++) {
      if (Math.max(points[i].y, points[(i + 1) % SAMPLES].y) < 0.05) continue;
      const s = segment(i);
      const center = s.mid.clone().addScaledVector(s.y, -0.3);
      staticBox(center, HALF + 0.5, 0.3, s.length / 2 + 0.2, s.q);
      const deck = new THREE.Mesh(own(new THREE.BoxGeometry(ROAD_WIDTH + 1, 0.6, s.length + 0.4)), deckMaterial);
      deck.position.copy(center);
      deck.quaternion.copy(s.q);
      deck.castShadow = deck.receiveShadow = true;
      scene.add(deck);
      if (i % 10 === 0 && points[i].y > 1.5) {
        for (const side of [-1, 1]) {
          const height = points[i].y - 0.6;
          const pillar = new THREE.Mesh(pillarGeometry, deckMaterial);
          pillar.scale.y = height;
          pillar.position.copy(points[i]).addScaledVector(s.x, side * (HALF - 1));
          pillar.position.y = height / 2;
          scene.add(pillar);
        }
      }
    }
    const river = new THREE.Mesh(own(new THREE.PlaneGeometry(70, 14)), own(new THREE.MeshStandardMaterial({ color: 0x29b6f6, roughness: 0.2 })));
    river.rotation.x = -Math.PI / 2;
    river.position.set(78, 0.02, -23);
    scene.add(river);
  }

  // --- red/white barriers on both edges, all the way round ---
  {
    const count = (SAMPLES / BARRIER_EVERY) * 2;
    const mesh = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), own(new THREE.MeshStandardMaterial({ roughness: 0.6 })), count);
    const red = new THREE.Color(0xe53935);
    const white = new THREE.Color(0xf5f5f5);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < SAMPLES; i += BARRIER_EVERY) {
      const s = segment(i, BARRIER_EVERY);
      for (const side of [-1, 1]) {
        const center = s.mid.clone().addScaledVector(s.x, side * (HALF + 0.45)).addScaledVector(s.y, 0.55);
        staticBox(center, 0.35, 0.55, s.length / 2 + 0.35, s.q);
        mesh.setMatrixAt(n, matrix.compose(center, s.q, scale.set(0.7, 1.1, s.length + 0.7)));
        mesh.setColorAt(n, (i / BARRIER_EVERY) % 2 ? red : white);
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
    const checkerMaterial = own(new THREE.MeshStandardMaterial({ map: checker }));
    const line = new THREE.Mesh(own(new THREE.PlaneGeometry(ROAD_WIDTH, 2).rotateX(-Math.PI / 2)), checkerMaterial);
    line.position.set(f.point.x, f.point.y + 0.05, f.point.z);
    line.rotation.y = f.heading;
    scene.add(line);
    const arch = new THREE.Group();
    const postMaterial = own(new THREE.MeshStandardMaterial({ color: 0xe53935 }));
    const postGeometry = own(new THREE.BoxGeometry(0.6, 6, 0.6));
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(side * (HALF + 1.2), 3, 0);
      post.castShadow = true;
      arch.add(post);
    }
    const banner = new THREE.Mesh(own(new THREE.BoxGeometry(ROAD_WIDTH + 3, 1.4, 0.4)), checkerMaterial);
    banner.position.y = 6;
    arch.add(banner);
    arch.position.copy(f.point);
    arch.rotation.y = f.heading;
    scene.add(arch);
  }

  // --- a small jump on the right half of the start straight ---
  {
    const f = frames[Math.round(SAMPLES * 0.09)];
    const center = f.point.clone().addScaledVector(f.right, 3.2);
    center.y = 0.3;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, f.heading, 0, 'YXZ')); // nose up
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
    const ramp = new THREE.Mesh(own(new THREE.BoxGeometry(7, 0.5, 6)), own(new THREE.MeshStandardMaterial({ map: stripes })));
    ramp.position.copy(center);
    ramp.quaternion.copy(q);
    ramp.castShadow = ramp.receiveShadow = true;
    scene.add(ramp);
    staticBox(center, 3.5, 0.25, 3, q);
  }

  // --- cones that go flying when you hit them ---
  const coneGeometry = own(new THREE.ConeGeometry(0.3, 0.7, 12));
  const coneMaterial = own(new THREE.MeshStandardMaterial({ color: 0xfb8c00 }));
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

  // --- trees, kept well away from the road ---
  {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const spots = [];
    for (let tries = 0; spots.length < 70 && tries < 3000; tries++) {
      const x = -70 + random() * 230;
      const z = -130 + random() * 250;
      if (nearest(x, z).distance > HALF + 8 && Math.hypot(x - 78, z + 23) > 20) spots.push([x, z, 0.8 + random() * 0.6]);
    }
    const trunks = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.4, 0.5, 2, 8)), own(new THREE.MeshStandardMaterial({ color: 0x795548 })), spots.length);
    const leaves = new THREE.InstancedMesh(own(new THREE.ConeGeometry(2.2, 5, 8)), own(new THREE.MeshStandardMaterial({ color: 0x2e7d32 })), spots.length);
    const matrix = new THREE.Matrix4();
    spots.forEach(([x, z, s], i) => {
      trunks.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      leaves.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, 2 * s + 2.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
    });
    trunks.castShadow = leaves.castShadow = true;
    scene.add(trunks, leaves);
  }

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
    update() {
      for (const cone of cones) {
        cone.mesh.position.copy(cone.body.position);
        cone.mesh.quaternion.copy(cone.body.quaternion);
      }
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
