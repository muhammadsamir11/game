import * as THREE from 'three';
import { COLORS } from './bricks.js';
import { SKINS, normaliseFigure, headHex } from './figures.js';

// Figure sizes in metres (a brick is 0.6 m tall, a stud 0.5 m wide).
export const FIGURE = { legH: 0.36, hipH: 0.06, torsoH: 0.32, headH: 0.2, headR: 0.12, width: 0.44, depth: 0.22 };

const geometries = new Map();
const materials = new Map();
const textures = new Map();
const cached = (map, key, make) => {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
};
const geo = (key, make) => cached(geometries, key, make);
const mat = (hex, extra = {}) => cached(materials, `${hex}:${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4, ...extra }));
const css = hex => '#' + hex.toString(16).padStart(6, '0');

function canvasTexture(key, width, height, draw) {
  return cached(textures, key, () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

// The head is a cylinder whose texture wraps all the way round: the face is drawn in the middle (x = 256), which is the front.
function faceTexture(face, skin) {
  return canvasTexture(`face:${face}:${skin}`, 512, 128, g => {
    g.fillStyle = css(skin);
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#1b1b1b';
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 6;
    g.lineCap = 'round';
    const cx = 256;
    const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    const eyes = (r = 7) => { dot(cx - 18, 50, r); dot(cx + 18, 50, r); };
    const smile = () => { g.beginPath(); g.arc(cx, 64, 22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); };
    switch (face) {
      case 'grin':
        eyes();
        g.beginPath(); g.moveTo(cx - 26, 72); g.quadraticCurveTo(cx, 110, cx + 26, 72); g.closePath(); g.fill();
        g.fillStyle = '#ffffff'; g.fillRect(cx - 18, 74, 36, 7);
        break;
      case 'sunglasses':
        g.fillRect(cx - 36, 42, 72, 7);
        g.beginPath(); g.ellipse(cx - 18, 52, 15, 11, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(cx + 18, 52, 15, 11, 0, 0, Math.PI * 2); g.fill();
        smile();
        break;
      case 'silly':
        dot(cx - 18, 50, 7);
        g.beginPath(); g.moveTo(cx + 10, 50); g.lineTo(cx + 26, 50); g.stroke();
        smile();
        g.fillStyle = '#e53935'; g.beginPath(); g.ellipse(cx + 6, 92, 9, 12, 0, 0, Math.PI * 2); g.fill();
        break;
      case 'determined':
        eyes(6);
        g.beginPath(); g.moveTo(cx - 30, 32); g.lineTo(cx - 8, 40); g.moveTo(cx + 30, 32); g.lineTo(cx + 8, 40); g.stroke();
        g.beginPath(); g.moveTo(cx - 16, 84); g.lineTo(cx + 16, 84); g.stroke();
        break;
      case 'surprised':
        dot(cx - 18, 48, 10); dot(cx + 18, 48, 10);
        g.beginPath(); g.ellipse(cx, 88, 10, 13, 0, 0, Math.PI * 2); g.fill();
        break;
      default: // happy
        eyes();
        smile();
    }
  });
}

function star(g, x, y, outer, inner, points = 5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

// Drawn on the front of the torso.
function printTexture(print, shirt) {
  return canvasTexture(`print:${print}:${shirt}`, 128, 104, g => {
    g.fillStyle = css(shirt);
    g.fillRect(0, 0, 128, 104);
    switch (print) {
      case 'stripe':
        g.fillStyle = '#ffffff';
        g.fillRect(44, 0, 12, 104);
        g.fillRect(72, 0, 12, 104);
        break;
      case 'star':
        g.fillStyle = '#fdd835';
        star(g, 64, 52, 34, 14);
        break;
      case 'flame':
        g.fillStyle = '#fb8c00';
        g.beginPath(); g.moveTo(10, 104);
        for (const [x, y] of [[22, 50], [36, 80], [50, 30], [64, 76], [78, 24], [92, 78], [106, 46], [118, 104]]) g.lineTo(x, y);
        g.fill();
        g.fillStyle = '#fdd835';
        g.beginPath(); g.moveTo(30, 104);
        for (const [x, y] of [[44, 70], [56, 88], [66, 58], [76, 90], [90, 66], [100, 104]]) g.lineTo(x, y);
        g.fill();
        break;
      case 'badge':
        g.fillStyle = '#ffc107';
        g.beginPath(); g.moveTo(36, 22); g.lineTo(60, 22); g.lineTo(60, 44); g.quadraticCurveTo(48, 60, 36, 44); g.closePath(); g.fill();
        g.fillStyle = '#1e3a8a';
        star(g, 48, 36, 8, 3.5);
        break;
      case 'lightning':
        g.fillStyle = '#fdd835';
        g.beginPath();
        for (const [x, y] of [[74, 6], [40, 58], [62, 58], [50, 98], [90, 42], [68, 42], [84, 6]]) g.lineTo(x, y);
        g.closePath();
        g.fill();
        break;
      default: // plain
    }
  });
}

// A box whose top is a little narrower than its bottom, like a toy figure's chest.
function torsoGeometry() {
  const g = new THREE.BoxGeometry(FIGURE.width, FIGURE.torsoH, FIGURE.depth);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setX(i, pos.getX(i) * 0.8);
  g.computeVertexNormals();
  return g;
}

// A sphere with the front cut out, so the face shows through.
const openHelmet = (r, key) => geo(key, () => new THREE.SphereGeometry(r, 24, 14, 0.75 * Math.PI, 1.5 * Math.PI, 0, 0.62 * Math.PI));

function addHeadgear(head, f, add) {
  const hex = headHex(f);
  if (hex === null) return;
  const m = mat(hex);
  const H = FIGURE.headH;
  const R = FIGURE.headR;
  const cap = () => add(head, geo('hairCap', () => new THREE.SphereGeometry(R + 0.02, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, H * 0.72, 0);
  switch (f.head) {
    case 'spiky':
      cap();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spike = add(head, geo('spike', () => new THREE.ConeGeometry(0.045, 0.12, 8)), m, Math.sin(a) * 0.07, H * 0.72 + 0.09, Math.cos(a) * 0.07 - 0.01);
        spike.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      }
      add(head, geo('spike', () => new THREE.ConeGeometry(0.045, 0.12, 8)), m, 0, H * 0.72 + 0.13, 0);
      break;
    case 'long':
      cap();
      add(head, geo('longHair', () => new THREE.BoxGeometry(0.27, 0.27, 0.07)), m, 0, H * 0.45, -R + 0.01);
      break;
    case 'ponytail': {
      cap();
      const tail = add(head, geo('tail', () => new THREE.CylinderGeometry(0.035, 0.05, 0.18, 10)), m, 0, H * 0.55, -R - 0.06);
      tail.rotation.x = 0.6;
      break;
    }
    case 'cap':
      add(head, geo('capTop', () => new THREE.SphereGeometry(R + 0.022, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, H * 0.75, 0);
      add(head, geo('capBrim', () => new THREE.BoxGeometry(0.2, 0.02, 0.14)), m, 0, H * 0.78, R + 0.04);
      break;
    case 'racing':
      add(head, openHelmet(0.165, 'racingHelmet'), mat(hex, { side: THREE.DoubleSide }), 0, H * 0.6, 0);
      add(head, geo('racingStripe', () => new THREE.BoxGeometry(0.04, 0.02, 0.3)), mat(0xffffff), 0, H * 0.6 + 0.165, -0.02);
      break;
    case 'astronaut':
      add(head, openHelmet(0.19, 'spaceHelmet'), mat(hex, { side: THREE.DoubleSide }), 0, H * 0.55, 0);
      add(head, geo('spaceVisor', () => new THREE.SphereGeometry(0.185, 20, 12, 0.25 * Math.PI, 0.5 * Math.PI, 0.15 * Math.PI, 0.5 * Math.PI)),
        mat(0x1e3a8a, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }), 0, H * 0.55, 0);
      break;
    case 'cowboy':
      add(head, geo('cowboyBrim', () => new THREE.CylinderGeometry(0.26, 0.26, 0.02, 24)), m, 0, H * 0.82, 0);
      add(head, geo('cowboyTop', () => new THREE.CylinderGeometry(0.11, 0.13, 0.13, 20)), m, 0, H * 0.82 + 0.075, 0);
      break;
    case 'crown':
      add(head, geo('crownRing', () => new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.07, 20, 1, true)), mat(hex, { side: THREE.DoubleSide, metalness: 0.6, roughness: 0.3 }), 0, H + 0.02, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(head, geo('crownPoint', () => new THREE.ConeGeometry(0.025, 0.06, 6)), mat(hex, { metalness: 0.6, roughness: 0.3 }), Math.sin(a) * R, H + 0.08, Math.cos(a) * R);
      }
      break;
  }
}

export function createFigureMesh(raw, { pose = 'stand', pick = m => m } = {}) {
  const f = normaliseFigure(raw);
  const skin = SKINS[f.skin].hex;
  const shirtMat = mat(COLORS[f.shirt].hex);
  const pantsMat = mat(COLORS[f.pants].hex);
  const skinMat = mat(skin);
  const root = new THREE.Group();
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, Array.isArray(material) ? material.map(pick) : pick(material));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const sit = pose === 'sit';
  const hipY = sit ? 0 : FIGURE.legH;

  // Legs hang from the hips; sitting swings them forward (+z).
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11, hipY, 0);
    add(leg, geo('leg', () => new THREE.BoxGeometry(0.2, FIGURE.legH, FIGURE.depth)), pantsMat, 0, -FIGURE.legH / 2, 0);
    if (sit) leg.rotation.x = -Math.PI / 2;
    root.add(leg);
  }
  add(root, geo('hips', () => new THREE.BoxGeometry(FIGURE.width, FIGURE.hipH, FIGURE.depth)), pantsMat, 0, hipY + FIGURE.hipH / 2, 0);

  const torsoY = hipY + FIGURE.hipH;
  const printMat = cached(materials, `printMat:${f.print}:${f.shirt}`, () => new THREE.MeshStandardMaterial({ map: printTexture(f.print, COLORS[f.shirt].hex), roughness: 0.4 }));
  // BoxGeometry face order: +x, -x, +y, -y, +z (front), -z.
  add(root, geo('torso', torsoGeometry), [shirtMat, shirtMat, shirtMat, shirtMat, printMat, shirtMat], 0, torsoY + FIGURE.torsoH / 2, 0);

  // Arms hang from the shoulders; sitting reaches forward to the steering wheel.
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.235, torsoY + FIGURE.torsoH - 0.05, 0);
    add(arm, geo('arm', () => new THREE.CylinderGeometry(0.055, 0.06, 0.28, 10)), shirtMat, 0, -0.14, 0);
    add(arm, geo('hand', () => new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10)), skinMat, 0, -0.3, 0.02);
    arm.rotation.z = side * 0.12;
    if (sit) arm.rotation.x = -1.0;
    root.add(arm);
  }

  const neckY = torsoY + FIGURE.torsoH;
  add(root, geo('neck', () => new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10)), skinMat, 0, neckY + 0.015, 0);
  const head = new THREE.Group();
  head.position.y = neckY + 0.03;
  head.userData.part = 'head';
  root.add(head);
  const faceMat = cached(materials, `faceMat:${f.face}:${f.skin}`, () => new THREE.MeshStandardMaterial({ map: faceTexture(f.face, skin), roughness: 0.5 }));
  // thetaStart = π puts the texture seam at the back, so the middle of the texture (the face) is at the front.
  add(head, geo('head', () => new THREE.CylinderGeometry(FIGURE.headR, FIGURE.headR, FIGURE.headH, 24, 1, false, Math.PI)), [faceMat, skinMat, skinMat], 0, FIGURE.headH / 2, 0);
  add(head, geo('headStud', () => new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14)), skinMat, 0, FIGURE.headH + 0.025, 0);
  addHeadgear(head, f, add);
  return root;
}
