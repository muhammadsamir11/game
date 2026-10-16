import * as THREE from 'three';
import { SIZE, ROAD, BLOCKS, INTERSECTIONS, RACE_GATE, STUNT_PARK_BLOCK } from './cityMap.js';
import { STUNT_PARK } from './stuntPark.js';
import { lotRect, pondRect, TOP } from './cityGround.js';
import { seededRandom } from './legoKit.js';
import { MISSION_RING } from './missions.js';

// Trees, bushes, flowers, lamp posts, bollards, benches and traffic lights, all in toy-brick style.
// Looks only: none of these get physics, so nothing here changes how the city drives or plays.
const FLOWER_COLORS = [0xe53935, 0xfdd835, 0xffffff, 0xf06292, 0xfb8c00, 0xab47bc];
const LEAF_COLORS = [0x2e7d32, 0x388e3c, 0x43a047, 0x1b5e20];

export function createProps(kit, scene, own, { occupied }) {
  const rand = seededRandom(2024);
  const blocked = (x, z, pad) => occupied.some(r => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
  const trees = []; // { x, y, z, s, kind: 'round' | 'pine' }
  const bushes = [];
  const flowers = [];
  const dark = kit.plastic(0x37474f);
  const yellow = kit.plastic(0xfdd835);
  const brown = kit.plastic(0x6d4c41);

  // Scatter trees, bushes and flowers on a grassy lot, keeping clear of buildings and paths.
  function dress(lot, y, { treeCount, bushCount, flowerCount, keepOut = [] }) {
    const free = (x, z, pad) => !blocked(x, z, pad) && !keepOut.some(r => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
    const pick = pad => {
      for (let tries = 0; tries < 30; tries++) {
        const x = lot.x0 + pad + rand() * (lot.x1 - lot.x0 - 2 * pad);
        const z = lot.z0 + pad + rand() * (lot.z1 - lot.z0 - 2 * pad);
        if (free(x, z, pad)) return { x, z };
      }
      return null;
    };
    for (let n = 0; n < treeCount; n++) {
      const p = pick(1.8);
      if (p) trees.push({ ...p, y, s: 0.8 + rand() * 0.45, kind: rand() < 0.65 ? 'round' : 'pine' });
    }
    for (let n = 0; n < bushCount; n++) {
      const p = pick(0.8);
      if (p) bushes.push({ ...p, y, s: 0.6 + rand() * 0.5 });
    }
    for (let n = 0; n < flowerCount; n++) {
      const p = pick(0.3);
      if (!p) continue;
      // Flowers grow in little clumps of the same colour.
      const c = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)];
      for (let k = 0; k < 4; k++) flowers.push({ x: p.x + (rand() - 0.5) * 1.2, y, z: p.z + (rand() - 0.5) * 1.2, c });
    }
  }

  // A brown flower bed plate, studded with flowers.
  function flowerBed(x, z, y, alongX) {
    const w = alongX ? 3 : 1;
    const d = alongX ? 1 : 3;
    kit.box(brown, x, y + 0.06, z, w, 0.12, d);
    const c = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)];
    for (let k = -1; k <= 1; k++) flowers.push({ x: x + (alongX ? k : 0), y: y + 0.12, z: z + (alongX ? 0 : k), c });
  }

  function bench(x, z, y, rotY) {
    const sin = Math.sin(rotY);
    const cos = Math.cos(rotY);
    const at = (u, v) => [x + u * cos + v * sin, z - u * sin + v * cos];
    const wood = kit.plastic(0x8d6e63);
    kit.box(wood, x, y + 0.45, z, ...(Math.abs(sin) > 0.5 ? [0.5, 0.1, 1.8] : [1.8, 0.1, 0.5]));
    const [bx, bz] = at(0, -0.25);
    kit.box(wood, bx, y + 0.75, bz, ...(Math.abs(sin) > 0.5 ? [0.1, 0.45, 1.8] : [1.8, 0.45, 0.1]));
    for (const u of [-0.75, 0.75]) {
      const [lx, lz] = at(u, 0);
      kit.box(dark, lx, y + 0.22, lz, 0.12, 0.44, 0.12);
    }
  }

  // --- the lots ---
  for (const b of BLOCKS) {
    const lot = lotRect(b);
    const y = TOP.lot;
    const isStunt = b.bx === STUNT_PARK_BLOCK.bx && b.bz === STUNT_PARK_BLOCK.bz;
    if (b.type === 'houses') {
      dress(lot, y, { treeCount: 6, bushCount: 10, flowerCount: 10 });
    } else if (b.type === 'park' && !isStunt) {
      const p = pondRect(b);
      const keepOut = [{ x0: p.x0 - 2, z0: p.z0 - 2, x1: p.x1 + 2, z1: p.z1 + 2 }];
      // A ring of trees round the pond, benches facing it, flower beds by the paths.
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const x = (lot.x0 + lot.x1) / 2 + Math.cos(a) * 12.5;
        const z = (lot.z0 + lot.z1) / 2 + Math.sin(a) * 12.5;
        if (!blocked(x, z, 1.5)) trees.push({ x, y, z, s: 0.85 + rand() * 0.35, kind: k % 3 === 0 ? 'pine' : 'round' });
      }
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      bench(cx, p.z0 - 2.6, y, 0);
      bench(cx, p.z1 + 2.6, y, Math.PI);
      bench(p.x0 - 2.6, cz, y, Math.PI / 2);
      bench(p.x1 + 2.6, cz, y, -Math.PI / 2);
      for (const [fx, fz, along] of [[p.x0 - 3, p.z0 - 3, true], [p.x1 + 3, p.z1 + 3, true], [p.x1 + 3, p.z0 - 3, false], [p.x0 - 3, p.z1 + 3, false]]) flowerBed(fx, fz, y, along);
      dress(lot, y, { treeCount: 0, bushCount: 8, flowerCount: 8, keepOut });
    } else if (isStunt) {
      const i = STUNT_PARK.inner;
      dress(lot, y, { treeCount: 8, bushCount: 6, flowerCount: 4, keepOut: [{ x0: i.x0 - 1, z0: i.z0 - 1, x1: i.x1 + 1, z1: i.z1 + 1 }] });
    } else if (b.type === 'pizza') {
      // Tables with umbrellas out front, either side of the mission ring.
      const z = lot.z1 - 4;
      for (const x of [lot.x0 + 3, lot.x0 + 8, lot.x1 - 8, lot.x1 - 3]) {
        kit.cylinder(kit.plastic(0xf5f5f5), x, y + 0.75, z, 0.6, 0.6, 0.08, 16);
        kit.cylinder(dark, x, y + 0.37, z, 0.06, 0.1, 0.74, 8);
        kit.cylinder(dark, x, y + 1.4, z, 0.04, 0.04, 1.3, 6);
        kit.add(kit.plastic(x % 2 ? 0xe53935 : 0xf5f5f5), new THREE.ConeGeometry(1.3, 0.5, 8), x, y + 2.2, z);
        for (const s of [-1, 1]) kit.cylinder(kit.plastic(0xe53935), x + s * 0.95, y + 0.45, z, 0.25, 0.25, 0.08, 12);
      }
      dress(lot, y, { treeCount: 2, bushCount: 4, flowerCount: 4, keepOut: [{ x0: MISSION_RING.x - 5, z0: MISSION_RING.z - 4, x1: MISSION_RING.x + 5, z1: MISSION_RING.z + 8 }] });
    } else if (b.type === 'shopSoon') {
      // A building site: cones and a pile of loose bricks.
      const z = lot.z1 - 5;
      for (let x = lot.x0 + 3; x < lot.x1 - 2; x += 2.5) {
        kit.add(kit.plastic(0xff6d00), new THREE.ConeGeometry(0.28, 0.7, 10), x, y + 0.35, z);
        kit.cylinder(kit.plastic(0xf5f5f5), x, y + 0.36, z, 0.17, 0.19, 0.1, 10);
      }
      for (let n = 0; n < 14; n++) {
        const c = kit.plastic(FLOWER_COLORS[n % FLOWER_COLORS.length]);
        const x = lot.x0 + 4 + (n % 4) * 1.05;
        const layer = Math.floor(n / 4);
        const bz = z - 2.5 + (layer % 2) * 0.5;
        kit.box(c, x + layer * 0.25, y + 0.3 + layer * 0.6, bz, 1, 0.6, 0.5);
        kit.studs(c, x + layer * 0.25 - 0.5, bz - 0.25, x + layer * 0.25 + 0.5, bz + 0.25, y + 0.6 + layer * 0.6);
      }
      dress(lot, y, { treeCount: 2, bushCount: 4, flowerCount: 2 });
    } else if (b.type === 'shops' || b.type === 'towers') {
      // Paved squares: a few trees in brick planters.
      for (const [u, v] of [[0.15, 0.5], [0.85, 0.5], [0.5, 0.15], [0.5, 0.85]]) {
        const x = lot.x0 + (lot.x1 - lot.x0) * u;
        const z = lot.z0 + (lot.z1 - lot.z0) * v;
        if (blocked(x, z, 1.4)) continue;
        kit.box(kit.plastic(0x8d4b3a, { look: 'bricks' }), x, y + 0.3, z, 1.8, 0.6, 1.8);
        trees.push({ x, y: y + 0.6, z, s: 0.75, kind: 'round' });
      }
    }
  }

  // --- trees round the outside, and along the lake ---
  for (let n = 0; n < 230; n++) {
    const side = n % 4;
    const out = 4 + rand() * 60;
    const along = -30 + rand() * (SIZE + 60);
    let x;
    let z;
    if (side === 0) { x = along; z = -out; }
    else if (side === 1) { x = along; z = SIZE + out; }
    else if (side === 2) { x = -out; z = along; }
    else { x = SIZE + out; z = along; }
    if (z > SIZE + 22 && x > -48 && x < SIZE + 48) continue; // that's the lake
    trees.push({ x, y: 0, z, s: 1 + rand() * 0.8, kind: rand() < 0.55 ? 'pine' : 'round' });
    if (rand() < 0.5) bushes.push({ x: x + 2.5 * (rand() - 0.5) * 2, y: 0, z: z + 2.5 * (rand() - 0.5) * 2, s: 0.8 + rand() * 0.6 });
  }

  // --- lamp posts along the sidewalks, bollards at the corners ---
  const pole = kit.plastic(0x546e7a);
  const lampGlow = kit.glow(0xfff59d);
  // No lamp in the race gate's way or in front of the pizza shop's door.
  const inTheWay = (x, z) => (Math.abs(z - RACE_GATE.z) < 4 && Math.abs(x - RACE_GATE.x) < ROAD) || Math.hypot(x - MISSION_RING.x, z - MISSION_RING.z) < 11;
  function lamp(x, z, dx, dz) {
    if (inTheWay(x, z)) return;
    const y = TOP.sidewalk;
    kit.cylinder(pole, x, y + 2.5, z, 0.09, 0.13, 5, 8);
    kit.box(pole, x + dx * 0.55, y + 4.95, z + dz * 0.55, dx ? 1.3 : 0.16, 0.14, dz ? 1.3 : 0.16);
    kit.box(dark, x + dx * 1.15, y + 4.85, z + dz * 1.15, 0.6, 0.22, 0.6);
    kit.box(lampGlow, x + dx * 1.15, y + 4.72, z + dz * 1.15, 0.46, 0.06, 0.46);
  }
  for (const b of BLOCKS) {
    if (b.type === 'garage') continue;
    const { x0, z0, x1, z1 } = b.rect;
    for (const u of [6, 18, 30]) {
      lamp(x0 + u, z0 + 0.7, 0, -1);
      lamp(x0 + u, z1 - 0.7, 0, 1);
      lamp(x0 + 0.7, z0 + u, -1, 0);
      lamp(x1 - 0.7, z0 + u, 1, 0);
    }
    for (const [cx, cz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1]]) {
      for (const [ox, oz] of [[0.6, 2.2], [2.2, 0.6]]) {
        const bx = cx + sx * ox;
        const bz = cz + sz * oz;
        kit.cylinder(dark, bx, TOP.sidewalk + 0.45, bz, 0.15, 0.15, 0.9, 10);
        kit.cylinder(yellow, bx, TOP.sidewalk + 0.72, bz, 0.155, 0.155, 0.14, 10);
      }
    }
  }

  // --- traffic lights: a black housing for each direction, with red, amber and green lamps ---
  const amberDim = kit.plastic(0x7a5a00);
  const lit = { red: kit.glow(0xff1744), green: kit.glow(0x00e676) };
  const dim = { red: kit.plastic(0x4a1010), green: kit.plastic(0x0d3b20) };
  const lampShape = own(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 12));
  const lampsAt = { x: { red: [], green: [] }, z: { red: [], green: [] } };
  for (const p of INTERSECTIONS) {
    const px = p.x + ROAD / 2 + 0.6;
    const pz = p.z + ROAD / 2 + 0.6;
    kit.cylinder(dark, px, 2.45, pz, 0.12, 0.14, 4.9, 8);
    // X-traffic housing sits on the pole's north side and faces along x; Z-traffic housing on its west side, facing along z.
    kit.box(dark, px, 4.2, pz - 0.45, 0.38, 1.3, 0.5);
    kit.box(dark, px - 0.45, 4.2, pz, 0.5, 1.3, 0.38);
    kit.cylinder(amberDim, px, 4.2, pz - 0.45, 0.13, 0.13, 0.5, 12, Math.PI / 2);
    kit.cylinder(amberDim, px - 0.45, 4.2, pz, 0.13, 0.13, 0.5, 12, 0, Math.PI / 2);
    lampsAt.x.red.push([px, 4.6, pz - 0.45]);
    lampsAt.x.green.push([px, 3.8, pz - 0.45]);
    lampsAt.z.red.push([px - 0.45, 4.6, pz]);
    lampsAt.z.green.push([px - 0.45, 3.8, pz]);
  }
  const m4 = new THREE.Matrix4();
  const turn = { x: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), z: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) };
  const one = new THREE.Vector3(1, 1, 1);
  const lights = {};
  for (const axis of ['x', 'z']) {
    lights[axis] = {};
    for (const color of ['red', 'green']) {
      const spots = lampsAt[axis][color];
      const mesh = own(new THREE.InstancedMesh(lampShape, dim[color], spots.length));
      spots.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), turn[axis], one)));
      mesh.computeBoundingSphere();
      scene.add(mesh);
      lights[axis][color] = mesh;
    }
  }

  // --- instanced trees, bushes and flowers ---
  const trunkGeometry = own(new THREE.CylinderGeometry(0.22, 0.26, 1.8, 10).translate(0, 0.9, 0));
  const crownGeometry = own(new THREE.IcosahedronGeometry(1.5, 1).translate(0, 2.9, 0));
  const pineParts = [[1.7, 1.5, 1.4], [1.35, 1.4, 2.4], [1.0, 1.3, 3.3], [0.6, 1.1, 4.1]].map(([r, h, y]) => new THREE.ConeGeometry(r, h, 8).translate(0, y, 0));
  const pineGeometry = own(kit.merge(pineParts));
  const bushGeometry = own(new THREE.IcosahedronGeometry(0.8, 0).translate(0, 0.5, 0));
  const flowerGeometry = own(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 8).translate(0, 0.1, 0));
  const centreGeometry = own(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 8).translate(0, 0.155, 0));
  const leaves = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, flatShading: true }));
  const pineLeaves = own(new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.4, flatShading: true }));
  const petals = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
  const color = new THREE.Color();
  const q = new THREE.Quaternion();
  function instanced(geometry, material, list, { shadow = true, tint = null, spin = false } = {}) {
    const mesh = own(new THREE.InstancedMesh(geometry, material, list.length));
    list.forEach((t, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, spin ? (i * 2.39996) % (Math.PI * 2) : 0);
      mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s ?? 1, t.s ?? 1, t.s ?? 1)));
      if (tint) mesh.setColorAt(i, color.setHex(tint(t, i)));
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  const round = trees.filter(t => t.kind === 'round');
  const pines = trees.filter(t => t.kind === 'pine');
  instanced(trunkGeometry, kit.plastic(0x6d4c41), trees);
  instanced(crownGeometry, leaves, round, { tint: (t, i) => LEAF_COLORS[i % LEAF_COLORS.length], spin: true });
  instanced(pineGeometry, pineLeaves, pines, { spin: true });
  instanced(bushGeometry, leaves, bushes, { tint: (t, i) => LEAF_COLORS[(i + 1) % LEAF_COLORS.length], spin: true });
  instanced(flowerGeometry, petals, flowers, { shadow: false, tint: f => f.c });
  instanced(centreGeometry, kit.plastic(0xfdd835), flowers.filter(f => f.c !== 0xfdd835), { shadow: false });

  return {
    // Light the lamps for whichever axis has green.
    setGreen(axis) {
      for (const a of ['x', 'z']) {
        lights[a].green.material = a === axis ? lit.green : dim.green;
        lights[a].red.material = a === axis ? dim.red : lit.red;
      }
    },
  };
}
