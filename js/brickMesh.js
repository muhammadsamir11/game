import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRICK_TYPES, COLORS, STUD, LAYER } from './bricks.js';
import { footprint } from './snapping.js';

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

export function createBrickMesh(brick, { ghost = null } = {}) {
  const t = BRICK_TYPES[brick.type];
  const { w, d } = footprint(brick.type, brick.r);
  const group = new THREE.Group();
  const paint = colorMaterial(brick.color);
  const pick = material => (ghost === null ? material : ghostMaterial(ghost));
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, pick(material));
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = ghost === null;
    group.add(mesh);
    return mesh;
  };
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
      add(geo('driver:body', () => box(0.4, 0.32, 0.24)), fixed('shirt', { color: 0x1e88e5, roughness: 0.6 }), 0, LAYER + 0.16, 0);
      add(geo('driver:head', () => new THREE.CylinderGeometry(0.12, 0.12, 0.2, 16)), fixed('skin', { color: 0xffd23f, roughness: 0.5 }), 0, LAYER + 0.43, 0);
      add(geo('driver:helmet', () => new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), paint, 0, LAYER + 0.5, 0);
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
  }

  // Bricks are built around their own centre, then moved to their grid spot and turned.
  group.position.set((brick.x + w / 2) * STUD, brick.y * LAYER, (brick.z + d / 2) * STUD);
  group.rotation.y = (brick.r * Math.PI) / 2;
  group.traverse(node => { node.userData.brick = brick; });
  return group;
}

export function createCarMesh(bricks, { includeWheels = true } = {}) {
  const car = new THREE.Group();
  for (const b of bricks) {
    if (includeWheels || BRICK_TYPES[b.type]?.kind !== 'wheel') car.add(createBrickMesh(b));
  }
  return car;
}

// Wheels are centred half a layer up, so a car must be lifted by (biggest radius - LAYER/2) to stand on y = 0.
export function carLift(bricks) {
  const radii = bricks.filter(b => BRICK_TYPES[b.type]?.kind === 'wheel').map(b => BRICK_TYPES[b.type].radius);
  return Math.max(0.35, ...radii) - LAYER / 2;
}
