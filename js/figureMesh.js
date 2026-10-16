import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from './bricks.js';
import { SKINS, normaliseFigure, headHex } from './figures.js';

// A toy minifigure: square legs with feet, a hip block, a sloped chest, bent arms with C-shaped hands,
// a round head with rounded edges and a hollow stud on top. Sizes in metres (a brick is 0.6 m tall, a stud 0.5 m wide).
export const FIGURE = { legH: 0.34, hipH: 0.08, torsoH: 0.32, headH: 0.2, headR: 0.125, width: 0.44, depth: 0.22 };

const geometries = new Map();
const materials = new Map();
const textures = new Map();
const cached = (map, key, make) => {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
};
const geo = (key, make) => cached(geometries, key, make);
// Shiny toy plastic, the same finish as the city and the race track (they reflect the sky through scene.environment).
const mat = (hex, extra = {}) => cached(materials, `${hex}:${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, ...extra }));
const css = hex => '#' + hex.toString(16).padStart(6, '0');
// Several pieces of one colour that move together, as one geometry (one draw call).
const merged = (key, make) => geo(key, () => {
  const parts = make();
  const geometry = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return geometry;
});

function canvasTexture(key, width, height, draw) {
  return cached(textures, key, () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  });
}

// The face wraps all the way round the head: the middle of the picture (x = 256) is the front, the top and bottom rows
// cover the rounded edges. Drawn at double size for crisp lines, in a 512 × 128 layout.
function faceTexture(face, skin) {
  return canvasTexture(`face:${face}:${skin}`, 1024, 256, g => {
    g.scale(2, 2);
    g.fillStyle = css(skin);
    g.fillRect(0, 0, 512, 128);
    // Dark skin gets light face lines so the face stays readable; sunglasses and eye patches stay black.
    const lum = (0.299 * ((skin >> 16) & 255) + 0.587 * ((skin >> 8) & 255) + 0.114 * (skin & 255)) / 255;
    const ink = lum < 0.45 ? '#fff3e8' : '#1b1b1b';
    const glint = lum < 0.45 ? css(skin) : '#ffffff';
    g.strokeStyle = ink;
    g.lineWidth = 4.5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const cx = 256;
    const ey = 56; // eye height
    const ex = 26; // eyes either side of the middle
    const oval = (x, y, rx, ry, color = ink) => { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
    const arc = (x, y, r, a0, a1) => { g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };
    const line = (...pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    // The classic toy face: tall black oval eyes with a white glint, and a thin smile.
    const eye = (x, s = 1) => { oval(x, ey, 5.5 * s, 8 * s); oval(x - 1.6 * s, ey - 3 * s, 1.8 * s, 2.2 * s, glint); };
    const eyes = (s = 1) => { eye(cx - ex, s); eye(cx + ex, s); };
    const smile = () => arc(cx, 62, 24, 0.22 * Math.PI, 0.78 * Math.PI);
    const smirk = () => arc(cx + 5, 60, 22, 0.2 * Math.PI, 0.7 * Math.PI);
    switch (face) {
      case 'grin': {
        eyes();
        const mouth = () => { g.beginPath(); g.moveTo(cx - 25, 72); g.quadraticCurveTo(cx, 110, cx + 25, 72); g.closePath(); };
        g.fillStyle = '#4a1414';
        mouth(); g.fill();
        g.save(); mouth(); g.clip();
        g.fillStyle = '#ffffff'; g.fillRect(cx - 26, 70, 52, 8);
        oval(cx, 96, 11, 7, '#e57373');
        g.restore();
        g.lineWidth = 3; mouth(); g.stroke();
        break;
      }
      case 'sunglasses':
        g.strokeStyle = '#1b1b1b';
        g.lineWidth = 3.5;
        line([cx - ex - 15, ey - 5], [cx - ex - 44, ey - 9]);
        line([cx + ex + 15, ey - 5], [cx + ex + 44, ey - 9]);
        line([cx - 12, ey - 4], [cx + 12, ey - 4]);
        for (const x of [cx - ex, cx + ex]) {
          g.fillStyle = '#1b1b1b';
          g.beginPath(); g.roundRect(x - 15, ey - 9, 30, 19, [4, 4, 10, 10]); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.75)';
          g.lineWidth = 2.5;
          line([x - 8, ey - 4], [x - 3, ey - 6]);
        }
        g.strokeStyle = ink;
        g.lineWidth = 4.5;
        smirk();
        break;
      case 'silly':
        eye(cx - ex);
        arc(cx + ex, ey + 4, 7, 1.15 * Math.PI, 1.85 * Math.PI); // a wink
        oval(cx + 6, 90, 7, 9, '#e53935');
        smile();
        break;
      case 'determined':
        line([cx - ex - 11, ey - 17], [cx - ex + 9, ey - 11]);
        line([cx + ex + 11, ey - 17], [cx + ex - 9, ey - 11]);
        eyes(0.9);
        line([cx - 15, 83], [cx + 15, 81]);
        break;
      case 'surprised':
        arc(cx - ex, ey - 6, 11, 1.2 * Math.PI, 1.8 * Math.PI);
        arc(cx + ex, ey - 6, 11, 1.2 * Math.PI, 1.8 * Math.PI);
        eyes(1.2);
        oval(cx, 86, 8, 10);
        oval(cx, 87, 5, 7, '#4a1414');
        break;
      case 'eyepatch':
        line([cx - ex - 10, ey - 15], [cx - ex + 9, ey - 13]);
        eye(cx - ex);
        g.strokeStyle = '#1b1b1b';
        g.lineWidth = 3;
        line([cx - 160, ey - 34], [cx + 160, ey + 26]); // the strap goes right round his head
        oval(cx + ex, ey, 12, 11, '#1b1b1b');
        g.strokeStyle = ink;
        g.lineWidth = 4.5;
        smirk();
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

// The chest: narrower at the shoulders than at the waist, a little thinner at the top, with softly chamfered edges.
// Group 0 is the front and back (the print shows on the front only), group 1 the sides.
function torsoGeometry() {
  const { width: W, torsoH: H, depth: D } = FIGURE;
  const b = 0.014; // chamfer
  const top = W * 0.8;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2 + b, b);
  shape.lineTo(W / 2 - b, b);
  shape.lineTo(top / 2 - b, H - b);
  shape.lineTo(-top / 2 + b, H - b);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: D - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, -H / 2, -(D - 2 * b) / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const caps = g.groups[0];
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + H / 2) / H;
    pos.setZ(i, pos.getZ(i) * (1 - 0.1 * t));
    if (i >= caps.start && i < caps.start + caps.count) {
      // The front shows the whole print; the back takes a plain corner of it.
      if (pos.getZ(i) > 0) uv.setXY(i, (pos.getX(i) + W / 2) / W, t);
      else uv.setXY(i, 0.01, 0.99);
    }
  }
  g.computeVertexNormals();
  return g;
}

// The head: a cylinder with rounded top and bottom edges. The face picture is laid on by height, so the rounded
// edges and the stud take its plain top and bottom rows.
function headGeometry() {
  const { headH: H, headR: R } = FIGURE;
  const c = 0.03; // edge rounding
  const points = [new THREE.Vector2(0, 0)];
  for (let k = 0; k <= 5; k++) {
    const a = -Math.PI / 2 + (k / 5) * (Math.PI / 2);
    points.push(new THREE.Vector2(R - c + Math.cos(a) * c, c + Math.sin(a) * c));
  }
  for (let k = 0; k <= 5; k++) {
    const a = (k / 5) * (Math.PI / 2);
    points.push(new THREE.Vector2(R - c + Math.cos(a) * c, H - c + Math.sin(a) * c));
  }
  points.push(new THREE.Vector2(0, H));
  // phiStart = π puts the picture's seam at the back, so its middle (the face) is at the front.
  const head = new THREE.LatheGeometry(points, 32, Math.PI);
  const pos = head.attributes.position;
  const uv = head.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, Math.min(1, Math.max(0, pos.getY(i) / H)));
  const stud = new THREE.CylinderGeometry(0.068, 0.068, 0.045, 20).translate(0, H + 0.0205, 0);
  const studUV = stud.attributes.uv;
  for (let i = 0; i < studUV.count; i++) studUV.setXY(i, 0, 1);
  const parts = [head.toNonIndexed(), stud.toNonIndexed()];
  head.dispose();
  stud.dispose();
  const geometry = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return geometry;
}

// Moulded hair: a dome over the top that stops just above the eyebrows, and a shell down the back of the head.
const hairDome = () => geo('hairDome', () => new THREE.SphereGeometry(FIGURE.headR + 0.024, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1));
const hairBack = (key, y0, spread) => geo(key, () => {
  const top = FIGURE.headH * 0.74;
  return new THREE.CylinderGeometry(FIGURE.headR + 0.024, FIGURE.headR + 0.024, top - y0, 24, 1, true, Math.PI * (1 - spread), Math.PI * 2 * spread)
    .translate(0, (top + y0) / 2, 0);
});

// A sphere with the front cut out, so the face shows through.
const openHelmet = (r, key) => geo(key, () => new THREE.SphereGeometry(r, 24, 14, 0.75 * Math.PI, 1.5 * Math.PI, 0, 0.62 * Math.PI));

function addHeadgear(head, f, add) {
  const hex = headHex(f);
  if (hex === null) return;
  const m = mat(hex);
  const shell = mat(hex, { side: THREE.DoubleSide });
  const H = FIGURE.headH;
  const R = FIGURE.headR;
  const hairline = H * 0.74;
  const hair = (back = 'short') => {
    add(head, hairDome(), m, 0, hairline, 0);
    if (back === 'short') add(head, hairBack('hairShort', 0.035, 0.4), shell);
    if (back === 'long') add(head, hairBack('hairLong', -0.07, 0.56), shell);
  };
  switch (f.head) {
    case 'spiky':
      hair();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spike = add(head, geo('spike', () => new THREE.ConeGeometry(0.045, 0.12, 8)), m, Math.sin(a) * 0.075, hairline + 0.085, Math.cos(a) * 0.075 - 0.01);
        spike.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      }
      add(head, geo('spike', () => new THREE.ConeGeometry(0.045, 0.12, 8)), m, 0, hairline + 0.13, 0);
      break;
    case 'long':
      hair('long');
      break;
    case 'ponytail': {
      hair();
      const tail = add(head, geo('tail', () => new THREE.CylinderGeometry(0.035, 0.05, 0.18, 10)), m, 0, H * 0.6, -R - 0.06);
      tail.rotation.x = 0.6;
      break;
    }
    case 'cap':
      add(head, geo('capTop', () => new THREE.SphereGeometry(R + 0.022, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, H * 0.75, 0);
      add(head, geo('capBrim', () => new THREE.BoxGeometry(0.2, 0.02, 0.14)), m, 0, H * 0.78, R + 0.04);
      break;
    case 'racing':
      add(head, openHelmet(0.165, 'racingHelmet'), shell, 0, H * 0.6, 0);
      add(head, geo('racingStripe', () => new THREE.BoxGeometry(0.04, 0.02, 0.3)), mat(0xffffff), 0, H * 0.6 + 0.165, -0.02);
      break;
    case 'astronaut':
      add(head, openHelmet(0.19, 'spaceHelmet'), shell, 0, H * 0.55, 0);
      add(head, geo('spaceVisor', () => new THREE.SphereGeometry(0.185, 20, 12, 0.25 * Math.PI, 0.5 * Math.PI, 0.15 * Math.PI, 0.5 * Math.PI)),
        mat(0x1e3a8a, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.05 }), 0, H * 0.55, 0);
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
    case 'policeCap':
      add(head, geo('policeTop', () => new THREE.CylinderGeometry(R + 0.035, R + 0.015, 0.1, 20)), m, 0, H + 0.01, 0);
      add(head, geo('policeBrim', () => new THREE.BoxGeometry(0.2, 0.015, 0.09)), mat(0x111111), 0, H * 0.79, R + 0.02);
      add(head, geo('policeBadge', () => new THREE.BoxGeometry(0.05, 0.04, 0.01)), mat(0xffc107, { metalness: 0.6, roughness: 0.3 }), 0, H * 0.86, R + 0.045);
      break;
    case 'fireHelmet':
      add(head, geo('fireDome', () => new THREE.SphereGeometry(R + 0.03, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, H * 0.7, 0);
      add(head, geo('fireBrim', () => new THREE.CylinderGeometry(R + 0.07, R + 0.07, 0.015, 24)), m, 0, H * 0.7, -0.02);
      add(head, geo('fireBadge', () => new THREE.BoxGeometry(0.06, 0.07, 0.01)), mat(0xffc107, { metalness: 0.6, roughness: 0.3 }), 0, H * 0.7 + 0.08, R + 0.035);
      break;
    case 'pirateHat':
      add(head, geo('pirateBrim', () => new THREE.CylinderGeometry(0.22, 0.22, 0.03, 3)), m, 0, H * 0.82, 0); // three corners, one pointing forward
      add(head, geo('pirateCrown', () => new THREE.CylinderGeometry(R - 0.01, R + 0.02, 0.1, 18)), m, 0, H * 0.82 + 0.06, 0);
      add(head, geo('pirateSkull', () => new THREE.SphereGeometry(0.025, 8, 6)), mat(0xffffff), 0, H * 0.82 + 0.06, R + 0.01);
      break;
    case 'chefHat': {
      add(head, geo('chefBand', () => new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.07, 20)), m, 0, H * 0.86, 0);
      const puff = add(head, geo('chefPuff', () => new THREE.SphereGeometry(R + 0.06, 18, 12)), m, 0, H * 0.86 + 0.12, 0);
      puff.scale.y = 0.8;
      break;
    }
  }
}

// Each leg turns on a round top hidden in the hips, so swinging it never opens a gap; the foot sticks out a little at the front.
const legGeometry = () => merged('leg', () => {
  const { legH: L } = FIGURE;
  return [
    new THREE.CylinderGeometry(0.1, 0.1, 0.196, 18).rotateZ(Math.PI / 2),
    new THREE.BoxGeometry(0.196, L - 0.06, 0.2).translate(0, -(L - 0.06) / 2, 0),
    new THREE.BoxGeometry(0.196, 0.06, 0.235).translate(0, -L + 0.03, 0.0175),
  ];
});
// The hip block, a touch deeper than the legs so its edge shows, with the little bar set back between the legs.
const hipGeometry = () => merged('hips', () => [
  new THREE.BoxGeometry(FIGURE.width, FIGURE.hipH, 0.212).translate(0, FIGURE.hipH / 2, 0),
  new THREE.BoxGeometry(0.016, 0.12, 0.12).translate(0, -0.06, -0.03),
]);
// Arms bend forward at the elbow.
const ELBOW = -0.6;
const upperArmGeometry = () => merged('upperArm', () => [
  new THREE.SphereGeometry(0.062, 14, 10),
  new THREE.CylinderGeometry(0.062, 0.056, 0.15, 14).translate(0, -0.075, 0),
]);
const forearmGeometry = () => merged('forearm', () => [
  new THREE.SphereGeometry(0.056, 14, 10),
  new THREE.CylinderGeometry(0.056, 0.05, 0.12, 14).translate(0, -0.06, 0),
]);
// The C-shaped hand on its wrist: tilted so that, with the arm hanging, it could hold an upright bar; the gap faces forward and down.
const handGeometry = () => merged('hand', () => {
  const r = 0.044;
  const tilt = -Math.atan2(0.6, 0.8);
  const back = new THREE.Vector3(0, 0.8, -0.6).multiplyScalar(r + 0.01);
  return [
    new THREE.CylinderGeometry(0.026, 0.026, 0.05, 10).translate(0, -0.13, 0),
    new THREE.TorusGeometry(r, 0.019, 8, 20, 1.6 * Math.PI).rotateZ(-0.3 * Math.PI).rotateX(tilt).translate(-back.x, -0.155 - back.y, -back.z),
  ];
});

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
  // body carries the walk bob; upper pivots at the hips so he can lean and twist while his legs swing.
  const body = new THREE.Group();
  root.add(body);
  const upper = new THREE.Group();
  upper.position.y = hipY;
  body.add(upper);

  // Legs hang from the hips; sitting swings them forward (+z).
  const legs = [-1, 1].map(side => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11, hipY, 0);
    add(leg, legGeometry(), pantsMat);
    if (sit) leg.rotation.x = -Math.PI / 2;
    body.add(leg);
    return leg;
  });
  add(upper, hipGeometry(), pantsMat);

  const torsoY = FIGURE.hipH; // from here on, heights are above the hips
  const printMat = cached(materials, `printMat:${f.print}:${f.shirt}`, () => new THREE.MeshStandardMaterial({ map: printTexture(f.print, COLORS[f.shirt].hex), roughness: 0.3 }));
  add(upper, geo('torso', torsoGeometry), [printMat, shirtMat], 0, torsoY + FIGURE.torsoH / 2, 0);

  // Arms hang from the shoulders; sitting reaches forward to the steering wheel.
  const arms = [-1, 1].map(side => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.2, torsoY + FIGURE.torsoH - 0.055, 0);
    add(arm, upperArmGeometry(), shirtMat);
    const forearm = new THREE.Group();
    forearm.position.y = -0.15;
    forearm.rotation.x = ELBOW;
    add(forearm, forearmGeometry(), shirtMat);
    add(forearm, handGeometry(), skinMat);
    arm.add(forearm);
    arm.rotation.z = side * 0.12;
    if (sit) arm.rotation.x = -0.7;
    upper.add(arm);
    return arm;
  });

  const neckY = torsoY + FIGURE.torsoH;
  add(upper, geo('neck', () => new THREE.CylinderGeometry(0.058, 0.064, 0.04, 16)), shirtMat, 0, neckY + 0.015, 0);
  const head = new THREE.Group();
  head.position.y = neckY + 0.032;
  head.userData.part = 'head';
  upper.add(head);
  root.userData.rig = { body, upper, legs, arms, head };
  const faceMat = cached(materials, `faceMat:${f.face}:${f.skin}`, () => new THREE.MeshStandardMaterial({ map: faceTexture(f.face, skin), roughness: 0.3 }));
  add(head, geo('head', headGeometry), faceMat);
  // The hole in the top of the stud.
  add(head, geo('studHole', () => new THREE.CircleGeometry(0.04, 18).rotateX(-Math.PI / 2)), mat(new THREE.Color(skin).multiplyScalar(0.62).getHex()), 0, FIGURE.headH + 0.0435, 0);
  addHeadgear(head, f, add);
  return root;
}

// Puts a standing figure into a walkCycle.js pose (forward-positive angles). Facing +z, side -1 (legs[0], arms[0]) is his right.
export function applyPose(figure, pose) {
  const { body, upper, legs, arms, head } = figure.userData.rig;
  body.position.y = pose.bob;
  upper.rotation.set(pose.lean, pose.twist, 0);
  legs[0].rotation.x = -pose.legR;
  legs[1].rotation.x = -pose.legL;
  arms[0].rotation.set(-pose.armR, 0, -pose.spread);
  arms[1].rotation.set(-pose.armL, 0, pose.spread);
  head.rotation.x = pose.headTilt;
}
