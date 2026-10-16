import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRICK_TYPES, COLORS, STUD, LAYER } from './bricks.js';
import { footprint } from './snapping.js';
import { createFigureMesh } from './figureMesh.js';
import { DEFAULT_FIGURE } from './figures.js';
import { resolveRider } from './riders.js';

const GAP = 0.012; // tiny gap so neighbouring bricks read as separate pieces
const STUD_RADIUS = STUD * 0.3;
const STUD_HEIGHT = LAYER * 0.45;

// Geometries and materials are shared by every brick and never disposed.
const geometries = new Map();
const materials = new Map();
const cached = (map, key, make) => {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
};
const geo = (key, make) => cached(geometries, key, make);
const fixed = (key, options) => cached(materials, `fixed:${key}`, () => new THREE.MeshStandardMaterial(options));
const chrome = () => fixed('chrome', { color: 0xdddddd, roughness: 0.2, metalness: 0.9 });
const dark = () => fixed('dark', { color: 0x263238, roughness: 0.6 });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// The figure who drives every seat unless a car brings its own driver (AI cars do).
let driverFigure = DEFAULT_FIGURE;
let driverVersion = 0;
export function setDriverFigure(figure) {
  driverFigure = figure ?? DEFAULT_FIGURE;
  driverVersion++;
}
export const getDriverVersion = () => driverVersion;

// Who sits in a passenger seat; main.js swaps this for one that also knows the friend figures.
let riderResolver = rider => resolveRider(rider);
export function setRiderResolver(fn) {
  riderResolver = fn;
  driverVersion++;
}

export function colorMaterial(color) {
  return cached(materials, `color:${color}`, () => new THREE.MeshStandardMaterial({ color: COLORS[color].hex, roughness: 0.35, metalness: 0.05 }));
}

export function ghostMaterial(hex) {
  return cached(materials, `ghost:${hex}`, () => new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: 0.4, transparent: true, opacity: 0.5, depthWrite: false,
  }));
}

// A w×d×h block standing on y = 0 with studs on top; slopes drop to one layer at the +z end and keep studs on the back row.
function blockGeometry(w, d, h, { slope = false } = {}) {
  const W = w * STUD - GAP;
  const D = d * STUD - GAP;
  const H = h * LAYER;
  const body = box(W, H, D);
  body.translate(0, H / 2, 0);
  if (slope) {
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > H / 2 && pos.getZ(i) > 0) pos.setY(i, LAYER);
    body.computeVertexNormals();
  }
  const parts = [body];
  for (let i = 0; i < w; i++) {
    for (let k = 0; k < d; k++) {
      if (slope && k > 0) continue;
      const stud = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 14);
      stud.translate((i - (w - 1) / 2) * STUD, H + STUD_HEIGHT / 2, (k - (d - 1) / 2) * STUD);
      parts.push(stud);
    }
  }
  return mergeGeometries(parts);
}

export function createWheelMesh(type, color, pick = m => m) {
  const r = BRICK_TYPES[type].radius;
  const wheel = new THREE.Group();
  const parts = [
    [geo(`tire:${r}`, () => new THREE.CylinderGeometry(r, r, 0.4, 24).rotateZ(Math.PI / 2)), fixed('tire', { color: 0x1b1b1b, roughness: 0.9 })],
    [geo(`hub:${r}`, () => new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.42, 16).rotateZ(Math.PI / 2)), colorMaterial(color)],
    [geo(`spoke:${r}`, () => box(0.44, r * 0.18, r * 1.05)), chrome()],
  ];
  for (const [g, m] of parts) {
    const mesh = new THREE.Mesh(g, pick(m));
    mesh.castShadow = true;
    wheel.add(mesh);
  }
  return wheel;
}

export function createBrickMesh(brick, { ghost = null, driver = null } = {}) {
  const t = BRICK_TYPES[brick.type];
  const { w, d } = footprint(brick.type, brick.r);
  const group = new THREE.Group();
  const paint = colorMaterial(brick.color);
  const pick = material => (ghost === null ? material : ghostMaterial(ghost));
  const add = (geometry, material, x = 0, y = 0, z = 0, parent = group) => {
    const mesh = new THREE.Mesh(geometry, pick(material));
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = ghost === null;
    parent.add(mesh);
    return mesh;
  };
  const twoSided = color => cached(materials, `color2:${color}`, () => new THREE.MeshStandardMaterial({ color: COLORS[color].hex, roughness: 0.4, side: THREE.DoubleSide }));
  const W = t.w * STUD - GAP;
  const D = t.d * STUD - GAP;
  const H = t.h * LAYER;

  switch (t.kind) {
    case 'plate':
    case 'brick':
      add(geo(`block:${t.w}:${t.d}:${t.h}`, () => blockGeometry(t.w, t.d, t.h)), paint);
      break;
    case 'slope':
      add(geo(`slope:${t.w}:${t.d}:${t.h}`, () => blockGeometry(t.w, t.d, t.h, { slope: true })), paint);
      break;
    case 'wheel': {
      const wheel = createWheelMesh(brick.type, brick.color, pick);
      wheel.position.y = LAYER / 2;
      group.add(wheel);
      break;
    }
    case 'engine':
      add(geo('engine:base', () => box(W, LAYER * 2, D)), paint, 0, LAYER, 0);
      add(geo('engine:block', () => box(W * 0.7, LAYER, D * 0.7)), fixed('metal', { color: 0x78909c, roughness: 0.4, metalness: 0.6 }), 0, LAYER * 2.5, 0);
      for (const x of [-0.15, 0.15]) add(geo('engine:pipe', () => new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10)), chrome(), x, H + 0.1, -0.25);
      break;
    case 'seat':
      add(geo('seat:base', () => box(W, LAYER, D)), paint, 0, LAYER / 2, 0);
      add(geo('seat:back', () => box(W, H, LAYER)), paint, 0, H / 2, -D / 2 + LAYER / 2);
      {
        const figure = createFigureMesh(driver ?? driverFigure, { pose: 'sit', pick });
        figure.position.set(0, LAYER, 0.02);
        if (ghost !== null) figure.traverse(node => { node.castShadow = false; });
        group.add(figure);
      }
      break;
    case 'steering': {
      add(geo('steering:post', () => new THREE.CylinderGeometry(0.03, 0.03, H * 0.8, 8)), dark(), 0, H * 0.4, 0);
      const ring = add(geo('steering:ring', () => new THREE.TorusGeometry(0.15, 0.035, 8, 24)), paint, 0, H * 0.85, -0.03);
      ring.rotation.x = -0.5;
      break;
    }
    case 'spoiler': {
      for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) add(geo('spoiler:post', () => new THREE.CylinderGeometry(0.04, 0.04, H * 0.75, 8)), dark(), x, H * 0.375, 0);
      const wing = add(geo('spoiler:wing', () => box(W, 0.06, D * 1.6)), paint, 0, H * 0.8, 0);
      wing.rotation.x = 0.15;
      break;
    }
    case 'lights':
      add(geo('lights:body', () => box(W, H, D)), paint, 0, H / 2, 0);
      for (const x of [-0.22, 0.22]) {
        add(geo('lights:lamp', () => box(0.3, 0.16, 0.04)), fixed('lamp', { color: 0xfff6c0, emissive: 0xffe680, emissiveIntensity: 0.9 }), x, H / 2, D / 2 + 0.01);
      }
      break;
    case 'passenger': {
      add(geo('seat:base', () => box(W, LAYER, D)), paint, 0, LAYER / 2, 0);
      add(geo('seat:back', () => box(W, H, LAYER)), paint, 0, H / 2, -D / 2 + LAYER / 2);
      const rider = createFigureMesh(riderResolver(brick.rider), { pose: 'sit', pick });
      rider.position.set(0, LAYER, 0.02);
      if (ghost !== null) rider.traverse(node => { node.castShadow = false; });
      group.add(rider);
      break;
    }
    case 'dog': {
      const brown = fixed('dogBrown', { color: 0x8d5a3b, roughness: 0.7 });
      const white = fixed('furWhite', { color: 0xf5f5f5, roughness: 0.7 });
      add(geo('dog:body', () => box(0.26, 0.2, 0.5)), brown, 0, 0.2, -0.1);
      add(geo('dog:head', () => box(0.22, 0.2, 0.2)), brown, 0, 0.33, 0.23);
      add(geo('dog:snout', () => box(0.12, 0.09, 0.1)), white, 0, 0.29, 0.37);
      add(geo('dog:nose', () => box(0.05, 0.04, 0.03)), dark(), 0, 0.32, 0.43);
      for (const x of [-0.05, 0.05]) add(geo('dog:eye', () => box(0.03, 0.03, 0.01)), dark(), x, 0.37, 0.335);
      for (const x of [-0.125, 0.125]) add(geo('dog:ear', () => box(0.04, 0.13, 0.08)), dark(), x, 0.33, 0.21);
      for (const [x, z] of [[-0.08, 0.08], [0.08, 0.08], [-0.08, -0.28], [0.08, -0.28]]) add(geo('dog:leg', () => box(0.07, 0.12, 0.07)), brown, x, 0.06, z);
      const tail = add(geo('dog:tail', () => new THREE.CylinderGeometry(0.02, 0.03, 0.16, 6)), brown, 0, 0.32, -0.38);
      tail.rotation.x = -0.7;
      break;
    }
    case 'cat': {
      const orange = fixed('catOrange', { color: 0xf39c3d, roughness: 0.7 });
      add(geo('cat:body', () => box(0.2, 0.18, 0.3)), orange, 0, 0.12, -0.03);
      add(geo('cat:head', () => box(0.18, 0.16, 0.15)), orange, 0, 0.29, 0.1);
      for (const x of [-0.055, 0.055]) add(geo('cat:ear', () => new THREE.ConeGeometry(0.035, 0.07, 4)), orange, x, 0.4, 0.1);
      for (const x of [-0.04, 0.04]) add(geo('cat:eye', () => box(0.025, 0.025, 0.01)), dark(), x, 0.31, 0.18);
      const tail = add(geo('cat:tail', () => new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6)), orange, 0, 0.25, -0.2);
      tail.rotation.x = -0.4;
      break;
    }
    case 'parrot': {
      add(geo('parrot:perch', () => new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6)), dark(), 0, 0.15, 0);
      add(geo('parrot:bar', () => new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6).rotateZ(Math.PI / 2)), dark(), 0, 0.3, 0);
      const body = add(geo('parrot:body', () => new THREE.SphereGeometry(0.08, 12, 8)), fixed('parrotGreen', { color: 0x2e9d48, roughness: 0.5 }), 0, 0.4, 0);
      body.scale.set(1, 1.4, 1);
      add(geo('parrot:head', () => new THREE.SphereGeometry(0.06, 12, 8)), fixed('parrotRed', { color: 0xe53935, roughness: 0.5 }), 0, 0.53, 0.03);
      const beak = add(geo('parrot:beak', () => new THREE.ConeGeometry(0.025, 0.06, 6)), fixed('beak', { color: 0xfdd835, roughness: 0.5 }), 0, 0.52, 0.1);
      beak.rotation.x = Math.PI / 2;
      const tail = add(geo('parrot:tail', () => box(0.06, 0.18, 0.02)), fixed('parrotBlue', { color: 0x1e88e5, roughness: 0.5 }), 0, 0.3, -0.07);
      tail.rotation.x = 0.3;
      break;
    }
    case 'bunny': {
      const white = fixed('furWhite', { color: 0xf5f5f5, roughness: 0.7 });
      add(geo('bunny:body', () => new THREE.SphereGeometry(0.12, 12, 8)), white, 0, 0.12, -0.03);
      add(geo('bunny:head', () => new THREE.SphereGeometry(0.08, 12, 8)), white, 0, 0.27, 0.08);
      for (const x of [-0.035, 0.035]) add(geo('bunny:ear', () => new THREE.CylinderGeometry(0.02, 0.025, 0.16, 6)), white, x, 0.4, 0.06);
      add(geo('bunny:nose', () => new THREE.SphereGeometry(0.015, 6, 4)), fixed('pink', { color: 0xf48fb1, roughness: 0.6 }), 0, 0.27, 0.16);
      for (const x of [-0.03, 0.03]) add(geo('bunny:eye', () => box(0.02, 0.02, 0.01)), dark(), x, 0.3, 0.155);
      break;
    }
    case 'rocket': {
      add(geo('rocket:tube', () => new THREE.CylinderGeometry(0.17, 0.17, 0.6, 16).rotateX(Math.PI / 2)), paint, 0, 0.2, 0);
      add(geo('rocket:nose', () => new THREE.ConeGeometry(0.17, 0.25, 16).rotateX(Math.PI / 2)), fixed('rocketNose', { color: 0xf5f5f5, roughness: 0.4 }), 0, 0.2, 0.42);
      add(geo('rocket:nozzle', () => new THREE.CylinderGeometry(0.12, 0.17, 0.12, 16).rotateX(Math.PI / 2)), dark(), 0, 0.2, -0.36);
      for (const x of [-0.17, 0.17]) add(geo('rocket:fin', () => box(0.02, 0.14, 0.18)), dark(), x, 0.2, -0.22);
      if (ghost === null) {
        const flame = new THREE.Mesh(geo('rocket:flame', () => new THREE.ConeGeometry(0.13, 0.5, 12).rotateX(-Math.PI / 2)),
          fixed('flame', { color: 0xff9800, emissive: 0xff5722, emissiveIntensity: 1.5, transparent: true, opacity: 0.85 }));
        flame.position.set(0, 0.2, -0.65);
        flame.visible = false;
        flame.userData.flame = true;
        group.add(flame);
      }
      break;
    }
    case 'wings':
      add(geo('wings:main', () => box(W, 0.06, D * 0.8)), paint, 0, 0.05, 0);
      for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) add(geo('wings:tip', () => box(0.04, 0.16, D * 0.6)), paint, x, 0.13, 0);
      break;
    case 'propeller': {
      add(geo('prop:mount', () => box(0.12, 0.2, 0.12)), dark(), 0, 0.1, -0.05);
      const spinner = new THREE.Group();
      spinner.position.set(0, 0.24, 0.05);
      spinner.userData.spin = true;
      group.add(spinner);
      add(geo('prop:hub', () => new THREE.ConeGeometry(0.05, 0.08, 10).rotateX(Math.PI / 2)), chrome(), 0, 0, 0.04, spinner);
      add(geo('prop:blade', () => box(0.06, 0.4, 0.015)), paint, 0, 0, 0, spinner);
      break;
    }
    case 'siren':
      add(geo('siren:base', () => box(W * 0.9, 0.08, D * 0.8)), dark(), 0, 0.04, 0);
      for (const [x, color] of [[-0.22, 0xe53935], [0.22, 0x1e88e5]]) {
        // Each dome gets its own material so the race can flash them.
        const dome = add(geo('siren:dome', () => new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.3 }), x, 0.08, 0);
        dome.userData.sirenLight = color;
      }
      break;
    case 'horn':
      add(geo('horn:base', () => box(0.1, 0.06, 0.1)), dark(), 0, 0.03, -0.05);
      add(geo('horn:bell', () => new THREE.ConeGeometry(0.09, 0.24, 14, 1, true).rotateX(-Math.PI / 2)),
        fixed('chromeTwoSided', { color: 0xdddddd, roughness: 0.2, metalness: 0.9, side: THREE.DoubleSide }), 0, 0.12, 0.04);
      break;
    case 'exhaust':
      for (const x of [-0.08, 0.08]) {
        add(geo('exhaust:pipe', () => new THREE.CylinderGeometry(0.05, 0.05, H, 12)), chrome(), x, H / 2, 0);
        add(geo('exhaust:tip', () => new THREE.CylinderGeometry(0.056, 0.056, 0.03, 12)), dark(), x, H, 0);
      }
      break;
    case 'flag': {
      add(geo('flag:pole', () => new THREE.CylinderGeometry(0.02, 0.02, H, 8)), fixed('pole', { color: 0xb0bec5, metalness: 0.6, roughness: 0.3 }), 0, H / 2, 0);
      const cloth = add(geo('flag:cloth', () => new THREE.PlaneGeometry(0.4, 0.26).rotateY(Math.PI / 2).translate(0, 0, -0.2)), twoSided(brick.color), 0, H - 0.14, 0);
      cloth.userData.flag = true;
      break;
    }
    case 'ladder': {
      const silver = fixed('silver', { color: 0xcfd8dc, metalness: 0.7, roughness: 0.3 });
      for (const x of [-0.18, 0.18]) add(geo('ladder:rail', () => box(0.04, 0.06, D)), silver, x, 0.1, 0);
      for (let i = 0; i < 6; i++) add(geo('ladder:rung', () => new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6).rotateZ(Math.PI / 2)), silver, 0, 0.1, -D / 2 + 0.25 + i * 0.5);
      break;
    }
    case 'toolbox':
      add(geo('toolbox:box', () => box(W * 0.95, H * 0.75, D * 0.9)), paint, 0, H * 0.375, 0);
      add(geo('toolbox:lid', () => box(W * 0.97, 0.03, D * 0.92)), dark(), 0, H * 0.76, 0);
      add(geo('toolbox:handle', () => new THREE.TorusGeometry(0.1, 0.015, 6, 12, Math.PI)), chrome(), 0, H * 0.78, 0);
      break;
    case 'crate': {
      const wood = fixed('wood', { color: 0xb07a43, roughness: 0.8 });
      const plank = fixed('woodDark', { color: 0x7a4f26, roughness: 0.8 });
      add(geo('crate:box', () => box(W * 0.96, H * 0.96, D * 0.96)), wood, 0, H / 2, 0);
      for (const y of [0.04, H - 0.04]) for (const z of [-1, 1]) add(geo('crate:strip', () => box(W * 0.98, 0.06, 0.02)), plank, 0, y, z * D * 0.49);
      for (const z of [-1, 1]) {
        const brace = add(geo('crate:brace', () => box(Math.hypot(W, H) * 0.85, 0.05, 0.02)), plank, 0, H / 2, z * D * 0.49);
        brace.rotation.z = Math.atan2(H, W);
      }
      break;
    }
    case 'trophy': {
      const gold = fixed('gold', { color: 0xffc107, metalness: 0.8, roughness: 0.25 });
      add(geo('trophy:base', () => box(0.22, 0.08, 0.22)), dark(), 0, 0.04, 0);
      add(geo('trophy:stem', () => new THREE.CylinderGeometry(0.025, 0.04, 0.2, 10)), gold, 0, 0.18, 0);
      add(geo('trophy:cup', () => new THREE.CylinderGeometry(0.13, 0.06, 0.2, 16)), gold, 0, 0.38, 0);
      for (const x of [-0.14, 0.14]) add(geo('trophy:handle', () => new THREE.TorusGeometry(0.05, 0.012, 6, 12)), gold, x, 0.4, 0);
      break;
    }
    case 'cannon': {
      const barrel = add(geo('cannon:barrel', () => new THREE.CylinderGeometry(0.08, 0.1, 0.7, 14).rotateX(Math.PI / 2)), paint, 0, 0.24, 0.1);
      barrel.userData.muzzle = true;
      add(geo('cannon:ring', () => new THREE.TorusGeometry(0.085, 0.015, 6, 14)), fixed('gold', { color: 0xffc107, metalness: 0.8, roughness: 0.25 }), 0, 0.24, 0.44);
      for (const x of [-0.13, 0.13]) add(geo('cannon:wheel', () => new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14).rotateZ(Math.PI / 2)), fixed('wood', { color: 0xb07a43, roughness: 0.8 }), x, 0.11, -0.05);
      break;
    }
    case 'windshield': {
      const glass = add(geo('windshield:glass', () => box(W * 0.95, H, 0.03)), fixed('glass', { color: 0xbfe6ff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 }), 0, H / 2, 0);
      glass.rotation.x = -0.35; // leans back toward the driver
      add(geo('windshield:frame', () => box(W * 0.97, 0.04, 0.06)), dark(), 0, 0.02, 0);
      break;
    }
  }

  // Bricks are built around their own centre, then moved to their grid spot and turned.
  group.position.set((brick.x + w / 2) * STUD, brick.y * LAYER, (brick.z + d / 2) * STUD);
  group.rotation.y = (brick.r * Math.PI) / 2;
  group.traverse(node => { node.userData.brick = brick; });
  return group;
}

export function createCarMesh(bricks, { includeWheels = true, driver = null } = {}) {
  const car = new THREE.Group();
  for (const b of bricks) {
    if (includeWheels || BRICK_TYPES[b.type]?.kind !== 'wheel') car.add(createBrickMesh(b, { driver }));
  }
  return car;
}

// Wheels are centred half a layer up, so a car must be lifted by (biggest radius - LAYER/2) to stand on y = 0.
export function carLift(bricks) {
  const radii = bricks.filter(b => BRICK_TYPES[b.type]?.kind === 'wheel').map(b => BRICK_TYPES[b.type].radius);
  return Math.max(0.35, ...radii) - LAYER / 2;
}
