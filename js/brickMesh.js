import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRICK_TYPES, COLORS, STUD, LAYER } from './bricks.js';
import { footprint } from './snapping.js';
import { createFigureMesh, mergeFigure } from './figureMesh.js';
import { mergeMeshes } from './meshMerge.js';
import { DEFAULT_FIGURE } from './figures.js';
import { resolveRider } from './riders.js';
import { resolveBadge } from './brands.js';
import { drawBadge, drawNamePlate } from './badgeArt.js';
import { studGeometry } from './legoKit.js';
import { HOOK, RING } from './hitch.js';

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

// Badge and name-plate pictures, one per brand, drawn once.
const textures = new Map();
function artTexture(key, width, height, draw) {
  return cached(textures, key, () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  });
}
const badgeMaterial = key => cached(materials, `badge:${key}`, () => new THREE.MeshStandardMaterial({
  map: artTexture(`badge:${key}`, 256, 256, (g, w, h) => drawBadge(g, resolveBadge(key), w, h)), transparent: true, alphaTest: 0.4, roughness: 0.3, metalness: 0.2,
}));
const plateMaterial = key => cached(materials, `plate:${key}`, () => new THREE.MeshStandardMaterial({
  map: artTexture(`plate:${key}`, 512, 128, (g, w, h) => drawNamePlate(g, resolveBadge(key), w, h)), roughness: 0.35,
}));

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

// A w×d×h block standing on y = 0 with studs on top; slopes drop to `low` (one layer) at the +z end and keep studs on the back row.
function blockGeometry(w, d, h, { slope = false, low = LAYER } = {}) {
  const W = w * STUD - GAP;
  const D = d * STUD - GAP;
  const H = h * LAYER;
  const body = box(W, H, D);
  body.translate(0, H / 2, 0);
  if (slope) {
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > H / 2 && pos.getZ(i) > 0) pos.setY(i, low);
    body.computeVertexNormals();
  }
  const parts = [body];
  for (let i = 0; i < w; i++) {
    for (let k = 0; k < d; k++) {
      if (slope && k > 0) continue;
      const stud = studGeometry(STUD_RADIUS, STUD_HEIGHT, 10);
      stud.translate((i - (w - 1) / 2) * STUD, H, (k - (d - 1) / 2) * STUD);
      parts.push(stud);
    }
  }
  return mergeGeometries(parts);
}

export function createWheelMesh(type, color, pick = m => m) {
  const r = BRICK_TYPES[type].radius;
  const wheel = new THREE.Group();
  const parts = BRICK_TYPES[type].tread ? [
    // chunky off-road tyre: wide, with knobbly tread blocks round it and a dark steel hub
    [geo(`tire:${r}:wide`, () => new THREE.CylinderGeometry(r, r, 0.46, 24).rotateZ(Math.PI / 2)), fixed('tire', { color: 0x1b1b1b, roughness: 0.9 })],
    [geo(`tread:${r}`, () => mergeGeometries(Array.from({ length: 12 }, (_, k) => {
      const a = (k * Math.PI * 2) / 12;
      return box(0.48, 0.1, 0.14).rotateX(a).translate(0, Math.cos(a) * r, Math.sin(a) * r);
    }))), fixed('tire', { color: 0x1b1b1b, roughness: 0.9 })],
    [geo(`hub:${r}:steel`, () => new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.48, 12).rotateZ(Math.PI / 2)), dark()],
    [geo(`cap:${r}`, () => new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.5, 14).rotateZ(Math.PI / 2)), colorMaterial(color)],
  ] : BRICK_TYPES[type].rim ? [
    // low-profile tyre with a big chrome rim and a coloured centre cap
    [geo(`tire:${r}:low`, () => new THREE.CylinderGeometry(r, r, 0.36, 28).rotateZ(Math.PI / 2)), fixed('tire', { color: 0x1b1b1b, roughness: 0.9 })],
    [geo(`rim:${r}`, () => new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.38, 24).rotateZ(Math.PI / 2)), fixed('silver', { color: 0xe0e6ea, roughness: 0.25, metalness: 0.35 })],
    [geo(`rimSpokes:${r}`, () => mergeGeometries([0, 1, 2].map(k => box(0.4, r * 0.12, r * 1.3).rotateX((k * Math.PI) / 3)))), dark()],
    [geo(`cap:${r}`, () => new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.41, 14).rotateZ(Math.PI / 2)), colorMaterial(color)],
  ] : [
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

// driver / resolveRider: who sits inside, for cars that bring their own people (AI cars, friends' cars).
export function createBrickMesh(brick, { ghost = null, driver = null, emptySeat = false, resolveRider = null } = {}) {
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
    case 'truckChassis':
      // The long truck plate, with its tow hook sticking out at the back (hitch.js HOOK).
      add(geo(`block:${t.w}:${t.d}:${t.h}`, () => blockGeometry(t.w, t.d, t.h)), paint);
      add(geo('hook:bar', () => box(0.16, 0.12, 0.4)), dark(), 0, H / 2, HOOK.z + 0.2);
      add(geo('hook:pin', () => new THREE.CylinderGeometry(0.06, 0.06, 0.32, 10)), chrome(), 0, H / 2 + 0.06, HOOK.z);
      break;
    case 'trailerChassis': {
      // The long trailer plate, an A-frame towbar out to its ring at the front (hitch.js RING), and two
      // landing legs it stands on when nothing pulls it.
      add(geo(`block:${t.w}:${t.d}:${t.h}`, () => blockGeometry(t.w, t.d, t.h)), paint);
      const front = D / 2;
      for (const side of [-1, 1]) {
        const dx = side * 0.75;
        const len = Math.hypot(dx, RING.z - front);
        const bar = add(geo(`towbar:${len.toFixed(3)}`, () => box(0.1, 0.1, len)), dark(), dx / 2, H / 2, (front + RING.z) / 2);
        bar.rotation.y = Math.atan2(-dx, RING.z - front);
        add(geo('trailer:leg', () => box(0.12, 0.42, 0.12)), dark(), side * 0.7, -0.2, front - 0.6);
      }
      add(geo('towbar:ring', () => new THREE.TorusGeometry(0.12, 0.035, 8, 16).rotateX(Math.PI / 2)), chrome(), 0, H / 2, RING.z);
      break;
    }
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
      if (t.power > 1) {
        // V12: low block, two chrome cam covers and a row of intake trumpets
        add(geo(`v12:base:${t.h}`, () => box(W, H * 0.6, D)), paint, 0, H * 0.3, 0);
        for (const x of [-0.18, 0.18]) add(geo(`v12:cam:${t.h}`, () => box(0.16, H * 0.3, D * 0.85)), chrome(), x, H * 0.75, 0);
        for (let k = 0; k < 6; k++) add(geo('v12:trumpet', () => new THREE.CylinderGeometry(0.05, 0.035, 0.16, 10)), chrome(), 0, H * 0.75 + 0.06, -D / 2 + 0.12 + k * ((D - 0.24) / 5));
        break;
      }
      add(geo('engine:base', () => box(W, LAYER * 2, D)), paint, 0, LAYER, 0);
      add(geo('engine:block', () => box(W * 0.7, LAYER, D * 0.7)), fixed('metal', { color: 0x78909c, roughness: 0.4, metalness: 0.6 }), 0, LAYER * 2.5, 0);
      for (const x of [-0.15, 0.15]) add(geo('engine:pipe', () => new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10)), chrome(), x, H + 0.1, -0.25);
      break;
    case 'seat':
      add(geo('seat:base', () => box(W, LAYER, D)), paint, 0, LAYER / 2, 0);
      add(geo('seat:back', () => box(W, H, LAYER)), paint, 0, H / 2, -D / 2 + LAYER / 2);
      if (!emptySeat) {
        const figure = createFigureMesh(driver ?? driverFigure, { pose: 'sit', pick });
        figure.position.set(0, LAYER, 0.02);
        figure.userData.driver = true;
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
      for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) add(geo(`spoiler:post:${t.h}`, () => new THREE.CylinderGeometry(0.04, 0.04, H * 0.75, 8)), dark(), x, H * 0.375, 0);
      const wing = add(geo(`spoiler:wing:${t.w}:${t.d}`, () => box(W, 0.06, D * 1.6)), paint, 0, H * 0.8, 0);
      if (t.tall) for (const x of [-W / 2, W / 2]) add(geo(`spoiler:end:${t.h}`, () => box(0.05, 0.24, D * 1.6)), paint, x, H * 0.8, 0); // end plates
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
      const rider = createFigureMesh((resolveRider ?? riderResolver)(brick.rider), { pose: 'sit', pick });
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
    case 'wedge':
      add(geo(`wedge:${t.w}:${t.d}:${t.h}`, () => blockGeometry(t.w, t.d, t.h, { slope: true, low: 0.06 })), paint);
      break;
    case 'scoop':
      add(geo(`scoop:${t.w}:${t.d}:${t.h}`, () => box(W, H, D)), paint, 0, H / 2, 0);
      for (const x of [-W / 2 - 0.005, W / 2 + 0.005]) add(geo('scoop:intake', () => box(0.02, H * 0.55, D * 0.6)), dark(), x, H * 0.5, D * 0.1);
      break;
    case 'door': {
      // A scissor door, swung up from its front hinge.
      const hinge = new THREE.Group();
      hinge.position.set(0, H * 0.4, D / 2 - 0.05);
      hinge.rotation.x = 1.15; // back end up
      group.add(hinge);
      add(geo(`door:panel:${t.d}:${t.h}`, () => box(0.06, H * 0.8, D * 0.95)), paint, 0, 0, -D * 0.47, hinge);
      add(geo(`door:glass:${t.d}:${t.h}`, () => box(0.07, H * 0.32, D * 0.5)), fixed('glass', { color: 0xbfe6ff, transparent: true, opacity: 0.6, roughness: 0.1 }), 0, H * 0.2, -D * 0.5, hinge);
      add(geo('door:sill', () => box(W, LAYER * 0.5, D)), paint, 0, LAYER * 0.25, 0);
      break;
    }
    case 'badge': {
      add(geo('badge:base', () => box(W, H, D)), dark(), 0, H / 2, 0);
      const face = add(geo('badge:face', () => new THREE.PlaneGeometry(0.46, 0.46)), badgeMaterial(brick.badge), 0, H + 0.2, 0.03);
      face.castShadow = false;
      add(geo('badge:back', () => box(0.4, 0.4, 0.04)), dark(), 0, H + 0.2, 0);
      break;
    }
    case 'nameplate': {
      add(geo('plate:base', () => box(W, H, D)), dark(), 0, H / 2, 0);
      const face = add(geo('plate:face', () => new THREE.PlaneGeometry(W * 0.96, W * 0.24)), plateMaterial(brick.badge), 0, H + W * 0.12, -0.02);
      face.rotation.y = Math.PI; // reads from behind the car
      face.castShadow = false;
      add(geo('plate:back', () => box(W * 0.96, W * 0.24, 0.03)), dark(), 0, H + W * 0.12, 0.0);
      break;
    }
    // --- Prize parts (only on the showroom's prize cars) ---
    case 'grille': {
      // A tall chrome radiator: a chrome frame, dark inside, and upright chrome bars on the front.
      add(geo('grille:frame', () => box(W, H, D)), chrome(), 0, H / 2, 0);
      add(geo('grille:inside', () => box(W * 0.82, H * 0.82, 0.02)), dark(), 0, H / 2, D / 2 + 0.005);
      for (let k = 0; k < 7; k++) add(geo('grille:bar', () => box(0.03, H * 0.8, 0.03)), chrome(), -W * 0.36 + k * (W * 0.12), H / 2, D / 2 + 0.02);
      break;
    }
    case 'ornament': {
      // The flying lady: a little silver figure leaning forward with wings swept back. She rises when
      // someone drives and sinks into the grille when the car is parked (carTricks.js moves her).
      const silver = fixed('silver', { color: 0xe0e6ea, roughness: 0.2, metalness: 0.6 });
      add(geo('ornament:base', () => new THREE.CylinderGeometry(0.06, 0.08, 0.04, 12)), chrome(), 0, 0.02, 0);
      const lady = new THREE.Group();
      lady.userData.ornament = { low: -0.34, high: 0.04 };
      lady.position.y = lady.userData.ornament.high;
      group.add(lady);
      const body = add(geo('ornament:body', () => new THREE.ConeGeometry(0.04, 0.26, 10)), silver, 0, 0.13, 0.02, lady);
      body.rotation.x = 0.35;
      add(geo('ornament:head', () => new THREE.SphereGeometry(0.035, 10, 8)), silver, 0, 0.27, 0.07, lady);
      for (const side of [-1, 1]) {
        const wing = add(geo('ornament:wing', () => box(0.12, 0.1, 0.015)), silver, side * 0.06, 0.2, -0.02, lady);
        wing.rotation.set(0.6, side * 0.5, side * 0.3);
      }
      break;
    }
    case 'coachDoor': {
      // A coach door, hinged at its back edge so it swings open the "wrong" way (carTricks.js swings it).
      add(geo('coach:sill', () => box(W, LAYER * 0.5, D)), paint, 0, LAYER * 0.25, 0);
      const hinge = new THREE.Group();
      hinge.position.set(0, LAYER * 0.5, -D / 2);
      hinge.userData.coachDoor = { side: brick.x < 0 ? -1 : 1 };
      group.add(hinge);
      add(geo(`coach:panel:${t.d}:${t.h}`, () => box(0.08, H - LAYER * 0.5, D * 0.98)), paint, 0, (H - LAYER * 0.5) / 2, D * 0.49, hinge);
      add(geo(`coach:glass:${t.d}`, () => box(0.09, H * 0.3, D * 0.6)), fixed('glass', { color: 0xbfe6ff, transparent: true, opacity: 0.6, roughness: 0.1 }), 0, H * 0.62, D * 0.55, hinge);
      add(geo('coach:handle', () => box(0.1, 0.03, 0.12)), chrome(), 0, H * 0.35, D * 0.15, hinge);
      break;
    }
    case 'starRoof': {
      // A navy roof with tiny stars on it, like the real car's starlight headliner showing through.
      add(geo(`starRoof:${t.w}:${t.d}`, () => box(W, H, D)), fixed('starNavy', { color: 0x0d1b3e, roughness: 0.5 }), 0, H / 2, 0);
      const starGeo = geo('starRoof:star', () => box(0.035, 0.02, 0.035));
      const glow = fixed('starGlow', { color: 0xffffff, emissive: 0xfff8e1, emissiveIntensity: 1.2 });
      for (let k = 0; k < 18; k++) {
        // Scattered with a fixed pattern, so every Phantom has the same sky.
        const u = ((k * 37) % 100) / 100 - 0.5;
        const v = ((k * 61 + 13) % 100) / 100 - 0.5;
        const star = add(starGeo, glow, u * W * 0.9, H + 0.01, v * D * 0.9);
        star.castShadow = false;
        star.userData.stars = k;
      }
      break;
    }
    case 'spare': {
      // A spare wheel standing on the back of the car, facing backwards.
      const r = 0.42;
      add(geo('spare:mount', () => box(W * 0.5, H * 0.5, D * 0.6)), dark(), 0, H * 0.25, 0.05);
      const tyre = add(geo('spare:tyre', () => new THREE.CylinderGeometry(r, r, 0.3, 24).rotateX(Math.PI / 2)), fixed('tire', { color: 0x1b1b1b, roughness: 0.9 }), 0, r + 0.05, -D / 2 + 0.1);
      tyre.castShadow = true;
      add(geo('spare:hub', () => new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.32, 16).rotateX(Math.PI / 2)), chrome(), 0, r + 0.05, -D / 2 + 0.1);
      break;
    }
    case 'sidePipe': {
      // A chrome exhaust running along the sill; a hidden puff of smoke at its back end.
      add(geo(`sidePipe:${t.d}`, () => new THREE.CylinderGeometry(0.06, 0.06, D * 0.95, 12).rotateX(Math.PI / 2)), chrome(), 0, H * 0.45, 0);
      add(geo('sidePipe:tip', () => new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12).rotateX(Math.PI / 2)), dark(), 0, H * 0.45, -D / 2);
      const puff = add(geo('sidePipe:puff', () => new THREE.SphereGeometry(0.16, 10, 8)), fixed('puff', { color: 0xb0bec5, transparent: true, opacity: 0.7, roughness: 1 }), 0, H * 0.45, -D / 2 - 0.15);
      puff.castShadow = false;
      puff.visible = false;
      puff.userData.puff = true;
      break;
    }
    case 'disco': {
      // A strip of party lights along the limo's side window. Each strip has its own material so it can flash.
      add(geo(`disco:frame:${t.d}`, () => box(W, H, D)), dark(), 0, H / 2, 0);
      const lights = add(geo(`disco:lights:${t.d}`, () => box(W * 1.04, H * 0.6, D * 0.92)),
        new THREE.MeshStandardMaterial({ color: 0x4a148c, emissive: 0x7c4dff, emissiveIntensity: 0.4, roughness: 0.3 }), 0, H / 2, 0);
      lights.userData.disco = true;
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

// The Rolls-Royce's door umbrella, held in his right hand and opened over his head (a figure is ~1 m tall).
export function createUmbrellaMesh() {
  const umbrella = new THREE.Group();
  const canopy = fixed('umbrella', { color: 0x1b1b1b, roughness: 0.5, side: THREE.DoubleSide });
  const handle = new THREE.Mesh(geo('umbrella:shaft', () => new THREE.CylinderGeometry(0.015, 0.015, 0.9, 8)), chrome());
  handle.position.set(0.28, 0.85, 0.12);
  const hook = new THREE.Mesh(geo('umbrella:hook', () => new THREE.TorusGeometry(0.05, 0.015, 6, 12, Math.PI)), dark());
  hook.position.set(0.23, 0.4, 0.12);
  hook.rotation.z = Math.PI;
  const top = new THREE.Mesh(geo('umbrella:canopy', () => new THREE.ConeGeometry(0.62, 0.28, 16, 1, true)), canopy);
  top.position.set(0.2, 1.36, 0.08);
  top.rotation.z = 0.12;
  const tip = new THREE.Mesh(geo('umbrella:tip', () => new THREE.SphereGeometry(0.03, 8, 6)), chrome());
  tip.position.set(0.18, 1.52, 0.08);
  for (const m of [handle, hook, top, tip]) {
    m.castShadow = true;
    umbrella.add(m);
  }
  return umbrella;
}

// merge: bake the parts that never move into a few meshes (see mergeStaticParts). For cars that are only
// driven or looked at, not for the builder, which needs each brick on its own; free them with disposeMerged.
export function createCarMesh(bricks, { includeWheels = true, driver = null, emptySeat = false, resolveRider = null, merge = false } = {}) {
  const car = new THREE.Group();
  for (const b of bricks) {
    if (includeWheels || BRICK_TYPES[b.type]?.kind !== 'wheel') car.add(createBrickMesh(b, { driver, emptySeat, resolveRider }));
  }
  if (merge) mergeStaticParts(car);
  return car;
}

// Parts that move on their own (see collectFx in drivenCar.js) and figures (posed and hidden) stay separate.
const MOVING = ['spin', 'flag', 'flame', 'sirenLight', 'muzzle', 'ornament', 'coachDoor', 'stars', 'disco', 'puff', 'rig', 'driver'];
const moves = node => MOVING.some(key => node.userData[key] !== undefined);

// Every still part of a finished car, baked into one mesh per material: a car draws in about a dozen calls
// instead of fifty or more, which is what keeps the city and races smooth. Its people are merged limb by limb.
export function mergeStaticParts(root) {
  mergeMeshes(root, node => node !== root && moves(node));
  root.traverse(node => { if (node.userData.rig) mergeFigure(node); });
  return root;
}

// Wheels are centred half a layer up, so a car must be lifted by (biggest radius - LAYER/2) to stand on y = 0.
export function carLift(bricks) {
  const radii = bricks.filter(b => BRICK_TYPES[b.type]?.kind === 'wheel').map(b => BRICK_TYPES[b.type].radius);
  return Math.max(0.35, ...radii) - LAYER / 2;
}
