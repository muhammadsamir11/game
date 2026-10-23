// His school, Modern School of Egypt 2000, and its football pitch next door. Drawn from the school's own photos:
// sandstone wings with white balconies, a tall blue glass hall in the middle, lamp posts and palms out front.
// The pitch has a big ball he can push into the goals with his car (it lives in the physics world, so it bounces).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SCHOOL, FOOTBALL, HERO_NAME, blockRect } from './cityMap.js';
import { SURFACE_MATERIAL } from './walker.js';
import { TOP } from './cityGround.js';

const SAND_STONE = 0xdca66c;
const DARK_STONE = 0xbf8549;
const MAROON = '#6b1f3f';
const GREEN = '#1f8a3b';
const LOGO = 'icons/school/mse-logo.png'; // the school's own logo, from mse.edu.eg
const FONT = 'Fredoka, Arial Rounded MT Bold, sans-serif';
const RESET_AFTER_GOAL = 2.2;
const LOST = 70; // a ball pushed this far from the pitch comes back by itself
const KICK_MAX = 45; // m/s: faster than any car, so the ball always gets away

// The school's round badge: a maroon disc in a green ring, MSE in big letters over an open green book.
function drawEmblem(g, size) {
  const c = size / 2;
  g.clearRect(0, 0, size, size);
  g.fillStyle = GREEN;
  g.beginPath();
  g.arc(c, c, c - 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = MAROON;
  g.beginPath();
  g.arc(c, c, c * 0.8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(size * 0.27)}px ${FONT}`;
  g.fillText('MSE', c, c * 0.92);
  g.fillStyle = '#7bd389';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(c, c * 1.32);
    g.quadraticCurveTo(c + s * size * 0.12, c * 1.18, c + s * size * 0.24, c * 1.26);
    g.lineTo(c + s * size * 0.24, c * 1.46);
    g.quadraticCurveTo(c + s * size * 0.12, c * 1.38, c, c * 1.52);
    g.fill();
  }
  // "Today's Learners, Tomorrow's Leaders" round the ring, like the real badge.
  g.font = `bold ${Math.round(size * 0.07)}px ${FONT}`;
  g.fillStyle = '#ffffff';
  const ring = (text, start, dir) => {
    const step = 0.13 * dir;
    [...text].forEach((ch, i) => {
      const a = start + i * step;
      g.save();
      g.translate(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9);
      g.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      g.fillText(ch, 0, 0);
      g.restore();
    });
  };
  ring("TODAY'S LEARNERS", -Math.PI / 2 - 0.13 * 7.5, 1);
  ring("TOMORROW'S LEADERS", Math.PI / 2 + 0.13 * 8.5, -1);
}

// The sign board: the real logo once it has loaded; until then (or offline without it) the same thing drawn here.
function drawSignBoard(g, w, h, logo) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  if (logo) {
    const scale = Math.min((w - 40) / logo.width, (h - 24) / logo.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(logo, (w - logo.width * scale) / 2, (h - logo.height * scale) / 2, logo.width * scale, logo.height * scale);
  } else {
    const emblem = document.createElement('canvas');
    emblem.width = emblem.height = 256;
    drawEmblem(emblem.getContext('2d'), 256);
    g.drawImage(emblem, 16, 12, h - 24, h - 24);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(h * 0.34)}px ${FONT}`;
    g.fillStyle = MAROON;
    const words = 'MODERN SCHOOL OF EGYPT ';
    g.fillText(words, h + 4, h / 2);
    g.fillStyle = GREEN;
    g.fillText('2000', h + 4 + g.measureText(words).width, h / 2);
  }
  g.strokeStyle = MAROON;
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
}

// A football: white with black patches, on a sphere.
function drawBall(g, w, h) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#212121';
  const patch = (x, y, r) => {
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.fill();
  };
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 5; k++) patch(((k + (row % 2) * 0.5) / 5) * w, ((row + 0.5) / 3) * h, h * 0.1);
  }
}

// staticBox, canvasTexture and solid are cityWorld's: physics boxes (drawn if given a colour), canvas pictures,
// and buildings that also go on the maps. occupied: footprints the ground and props keep clear of.
export function createSchool({ kit, scene, world, own, staticBox, canvasTexture, solid, occupied }) {
  const stone = kit.plastic(SAND_STONE, { look: 'bricks' });
  const darkStone = kit.plastic(DARK_STONE);
  const white = kit.plastic(0xf5f5f5);
  const dark = kit.plastic(0x263238);
  const glass = kit.glass();
  const blueGlass = kit.plastic(0x3fa9e0, { roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.88 });
  const paving = kit.plastic(0xe9d3b0);
  const lift = TOP.lot;

  function addSign(texture, w, h, x, y, z, rotY = 0) {
    const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45 })));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    return mesh;
  }

  // --- the school building ---
  {
    const { wings: w, hall } = SCHOOL;
    const rect = blockRect(SCHOOL.block.bx, SCHOOL.block.bz);
    kit.span(paving, rect.x0 + 3, TOP.road, rect.z0 + 3, rect.x1 - 3, lift + 0.01, rect.z1 - 3); // a sandy stone forecourt
    solid(w.x0, w.z0, w.x1, w.z1, w.h, SAND_STONE);
    solid(hall.x0, hall.z0, hall.x1, hall.z1, hall.h, 0x3fa9e0);
    occupied.push({ x0: w.x0 - 1.5, z0: w.z0 - 0.5, x1: w.x1 + 0.5, z1: hall.z1 + 3 });
    kit.span(stone, w.x0, 0, w.z0, w.x1, w.h, w.z1);
    kit.span(dark, w.x0 - 0.12, 0, w.z0 - 0.12, w.x1 + 0.12, 0.3, w.z1 + 0.12);
    // A flat roof with a studded sandstone parapet.
    kit.span(darkStone, w.x0 - 0.3, w.h, w.z0 - 0.3, w.x1 + 0.3, w.h + 0.5, w.z1 + 0.3);
    kit.studs(darkStone, w.x0 - 0.3, w.z0 - 0.3, w.x1 + 0.3, w.z0 + 0.5, w.h + 0.5);
    kit.studs(darkStone, w.x0 - 0.3, w.z1 - 0.5, w.x1 + 0.3, w.z1 + 0.3, w.h + 0.5);
    // Three floors: on the front a white balcony along each floor with windows behind it and stone piers between;
    // windows round the back and the ends.
    const FLOOR = 3.5;
    for (let f = 0; f < 3; f++) {
      const y = f * FLOOR;
      for (const [x0, x1] of [[w.x0, hall.x0], [hall.x1, w.x1]]) {
        for (let x = x0 + 1.6; x < x1 - 1; x += 2.6) {
          kit.box(glass, x, y + 1.8, w.z1 + 0.06, 1.7, 1.9, 0.12);
          kit.box(white, x, y + 0.82, w.z1 + 0.1, 1.9, 0.1, 0.2);
          kit.box(darkStone, x + 1.3, y + FLOOR / 2, w.z1 + 0.15, 0.5, FLOOR, 0.3);
        }
        if (f === 0) continue;
        // The balcony: a white slab, a white wall at the front and railings on top.
        kit.span(white, x0 + 0.2, y - 0.1, w.z1, x1 - 0.2, y + 0.15, w.z1 + 1.2);
        kit.span(white, x0 + 0.2, y + 0.15, w.z1 + 1, x1 - 0.2, y + 0.75, w.z1 + 1.2);
        for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.6) kit.box(white, x, y + 1, w.z1 + 1.1, 0.08, 0.5, 0.08);
        kit.span(white, x0 + 0.2, y + 1.2, w.z1 + 1.02, x1 - 0.2, y + 1.3, w.z1 + 1.18);
      }
      for (let x = w.x0 + 1.6; x < w.x1 - 1; x += 2.6) {
        if (x > hall.x0 - 0.5 && x < hall.x1 + 0.5) continue;
        kit.box(glass, x, y + 1.8, w.z0 - 0.06, 1.7, 1.9, 0.12);
      }
      for (const x of [w.x0 - 0.06, w.x1 + 0.06]) {
        for (const z of [w.z0 + 3, w.z0 + 6, w.z0 + 9]) kit.box(glass, x, y + 1.8, z, 0.12, 1.9, 1.7);
      }
    }
    // The blue glass hall: white mullions in a grid, a sandstone crown, the school badge high on the front,
    // and glass doors under a canopy.
    kit.span(blueGlass, hall.x0, 0, hall.z0, hall.x1, hall.h, hall.z1);
    for (let y = 2.5; y < hall.h; y += 2.5) {
      kit.span(white, hall.x0 - 0.08, y - 0.08, hall.z0 - 0.08, hall.x1 + 0.08, y + 0.08, hall.z1 + 0.08);
    }
    for (let x = hall.x0; x <= hall.x1 + 1e-6; x += 2) kit.box(white, x, hall.h / 2, hall.z1 + 0.06, 0.14, hall.h, 0.14);
    for (const x of [hall.x0, hall.x1]) for (let z = hall.z0; z <= hall.z1 + 1e-6; z += 2.5) kit.box(white, x, hall.h / 2, z, 0.14, hall.h, 0.14);
    kit.span(darkStone, hall.x0 - 0.4, hall.h, hall.z0 - 0.4, hall.x1 + 0.4, hall.h + 0.8, hall.z1 + 0.4);
    kit.studs(darkStone, hall.x0 - 0.4, hall.z0 - 0.4, hall.x1 + 0.4, hall.z1 + 0.4, hall.h + 0.8);
    const emblem = canvasTexture(256, 256, g => drawEmblem(g, 256));
    const badge = new THREE.Mesh(own(new THREE.CircleGeometry(2.6, 40)), own(new THREE.MeshStandardMaterial({ map: emblem, roughness: 0.4, transparent: true })));
    badge.position.set((hall.x0 + hall.x1) / 2, hall.h - 3.2, hall.z1 + 0.2);
    scene.add(badge);
    const mid = (hall.x0 + hall.x1) / 2;
    kit.box(dark, mid, 1.3, hall.z1 + 0.1, 3.2, 2.6, 0.12);
    kit.box(glass, mid - 0.78, 1.25, hall.z1 + 0.18, 1.4, 2.4, 0.08);
    kit.box(glass, mid + 0.78, 1.25, hall.z1 + 0.18, 1.4, 2.4, 0.08);
    kit.box(kit.plastic(0x6b1f3f), mid, 2.95, hall.z1 + 1, 5, 0.3, 2);
    // Wide steps up to the doors (only for looks: they are a few centimetres high).
    for (let k = 0; k < 3; k++) kit.span(paving, mid - 5 + k * 0.4, lift, hall.z1, mid + 5 - k * 0.4, lift + 0.12 * (3 - k), hall.z1 + 2.4 - k * 0.7);
    // Black lantern posts either side, like the ones by the school's steps.
    for (const s of [-1, 1]) {
      const x = mid + s * 6;
      const z = hall.z1 + 2.2;
      kit.cylinder(dark, x, 0.25, z, 0.35, 0.4, 0.5, 10);
      kit.cylinder(dark, x, 2.2, z, 0.09, 0.12, 3.8, 8);
      for (const dx of [-0.45, 0.45]) {
        kit.box(dark, x + dx / 2, 3.9, z, 0.5, 0.08, 0.08);
        kit.add(kit.glow(0xfff8e1), new THREE.SphereGeometry(0.24, 12, 8), x + dx, 4.05, z);
      }
      kit.add(kit.glow(0xfff8e1), new THREE.SphereGeometry(0.28, 12, 8), x, 4.4, z);
    }
    // A notice board by the doors. Read it closely...
    const notice = canvasTexture(256, 160, g => {
      g.fillStyle = '#8d6e63';
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#fff8e1';
      g.fillRect(12, 12, 232, 136);
      g.fillStyle = MAROON;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold 30px ${FONT}`;
      g.fillText('⭐ STAR PUPIL ⭐', 128, 52);
      g.fillStyle = GREEN;
      g.font = `bold 44px ${FONT}`;
      g.fillText(HERO_NAME.toUpperCase(), 128, 108);
    });
    addSign(notice, 1.6, 1, mid - 3.2, 1.5, hall.z1 + 0.12);
  }

  // --- the forecourt: the school sign, the flag of Egypt, palm trees and the yellow school bus ---
  {
    const { sign, flag, bus } = SCHOOL;
    // The sign stands on two maroon posts by the pavement, facing the road.
    const maroon = kit.plastic(0x6b1f3f);
    for (const s of [-1, 1]) kit.box(maroon, sign.x + s * 5.6, 1.6, sign.z, 0.4, 3.2, 0.4);
    kit.box(white, sign.x, 2.15, sign.z - 0.08, 11.2, 2.3, 0.12);
    staticBox({ cx: sign.x, cy: 1.6, cz: sign.z, hx: 5.8, hy: 1.6, hz: 0.25 });
    const boardCanvas = { w: 1024, h: 200 };
    const board = canvasTexture(boardCanvas.w, boardCanvas.h, g => drawSignBoard(g, boardCanvas.w, boardCanvas.h, null));
    board.anisotropy = 8;
    addSign(board, 10.8, 2.1, sign.x, 2.15, sign.z + 0.01);
    if (typeof Image !== 'undefined') {
      const logo = new Image();
      logo.onload = () => {
        drawSignBoard(board.image.getContext('2d'), boardCanvas.w, boardCanvas.h, logo);
        board.needsUpdate = true;
      };
      logo.src = LOGO;
    }

    kit.cylinder(kit.plastic(0xcfd8dc, { metalness: 0.6, roughness: 0.3 }), flag.x, 4.5, flag.z, 0.08, 0.12, 9, 8);
    kit.add(kit.plastic(0xffc107, { metalness: 0.5, roughness: 0.3 }), new THREE.SphereGeometry(0.18, 10, 8), flag.x, 9.05, flag.z);
    kit.cylinder(dark, flag.x, 0.2, flag.z, 0.5, 0.6, 0.4, 10);
    const egypt = canvasTexture(150, 100, g => {
      for (const [k, color] of ['#ce1126', '#ffffff', '#111111'].entries()) {
        g.fillStyle = color;
        g.fillRect(0, (k * 100) / 3, 150, 100 / 3 + 1);
      }
      // The golden eagle in the middle, simply.
      g.fillStyle = '#c09300';
      g.beginPath();
      g.moveTo(75, 38);
      g.lineTo(84, 44);
      g.lineTo(92, 40);
      g.lineTo(86, 56);
      g.lineTo(75, 62);
      g.lineTo(64, 56);
      g.lineTo(58, 40);
      g.lineTo(66, 44);
      g.fill();
    });
    const flagMesh = new THREE.Mesh(own(new THREE.PlaneGeometry(2.7, 1.8)), own(new THREE.MeshStandardMaterial({ map: egypt, roughness: 0.6, side: THREE.DoubleSide })));
    flagMesh.position.set(flag.x + 1.42, 8, flag.z);
    scene.add(flagMesh);

    // Palm trees: a ringed trunk leaning a little, and a crown of long green fronds.
    const trunk = kit.plastic(0x8d6e63);
    const ring = kit.plastic(0x6d4c41);
    const fronds = kit.plastic(0x43a047);
    const palm = (x, z, h) => {
      for (let y = 0; y < h; y += 0.5) kit.cylinder(y % 1 ? ring : trunk, x, y + 0.25, z, 0.22, 0.27, 0.5, 8);
      kit.add(fronds, new THREE.SphereGeometry(0.45, 8, 6), x, h + 0.1, z);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const droop = 0.4;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(droop, a, 0, 'YXZ')); // tip down, then turn
        const reach = 1.35;
        kit.boxQ(fronds, new THREE.Vector3(x + Math.sin(a) * reach * Math.cos(droop), h - Math.sin(droop) * reach, z + Math.cos(a) * reach * Math.cos(droop)), 0.55, 0.12, 2.8, q);
      }
    };
    const rect = blockRect(SCHOOL.block.bx, SCHOOL.block.bz);
    for (const [x, z, h] of [[rect.x0 + 5.5, rect.z1 - 13, 6.5], [rect.x0 + 9, rect.z1 - 5, 5.5], [rect.x1 - 4.5, rect.z0 + 5, 6], [rect.x0 + 4.5, rect.z0 + 4.5, 7]]) palm(x, z, h);

    // The school bus: yellow, with a black window band, a sign on each side, and six wheels.
    const yellow = kit.plastic(0xfdd835);
    const { x, z, w: bw, l } = bus;
    const nose = Math.cos(bus.heading) < 0 ? -1 : 1; // which way along z it points
    kit.box(yellow, x, 1.75, z, bw, 2.5, l);
    kit.box(yellow, x, 3.05, z, bw - 0.2, 0.1, l - 0.2);
    kit.box(dark, x, 0.5, z, bw + 0.04, 0.3, l + 0.1);
    kit.box(glass, x, 2.35, z - nose * 0.4, bw + 0.04, 0.9, l - 1.8);
    kit.box(glass, x, 2.25, z + nose * (l / 2 + 0.02), bw - 0.4, 1.1, 0.06);
    for (const s of [-1, 1]) {
      kit.box(kit.glow(0xfff59d), x + s * 0.85, 1.1, z + nose * (l / 2 + 0.03), 0.4, 0.3, 0.06);
      kit.box(kit.glow(0xff1744), x + s * 0.95, 1.2, z - nose * (l / 2 + 0.03), 0.3, 0.4, 0.06);
      kit.box(dark, x + s * 0.2, 1.2, z - nose * (l / 2 + 0.02), 0.05, 0.05, 0.02);
      for (const along of [l / 2 - 1.7, -l / 2 + 1.5, -l / 2 + 2.9]) {
        kit.cylinder(dark, x + s * (bw / 2 - 0.15), 0.5, z + nose * along, 0.5, 0.5, 0.4, 14, Math.PI / 2);
        kit.cylinder(kit.plastic(0xb0bec5), x + s * (bw / 2 + 0.06), 0.5, z + nose * along, 0.25, 0.25, 0.04, 12, Math.PI / 2);
      }
    }
    const busName = canvasTexture(512, 96, g => {
      g.fillStyle = '#fdd835';
      g.fillRect(0, 0, 512, 96);
      g.fillStyle = '#212121';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold 60px ${FONT}`;
      g.fillText('SCHOOL BUS', 256, 52);
    });
    for (const s of [-1, 1]) addSign(busName, 5, 0.9, x + s * (bw / 2 + 0.03), 1.2, z, s * Math.PI / 2);
    staticBox({ cx: x, cy: 1.6, cz: z, hx: bw / 2, hy: 1.6, hz: l / 2 });
    occupied.push({ x0: x - bw / 2 - 0.5, z0: z - l / 2 - 0.5, x1: x + bw / 2 + 0.5, z1: z + l / 2 + 0.5 });
  }

  // --- the football pitch: stripes, white lines, two goals with nets, a little stand and the ball ---
  const { field, goals } = FOOTBALL;
  {
    const greens = [kit.plastic(0x43a047), kit.plastic(0x388e3c)];
    const top = lift + 0.02;
    const stripes = 8;
    const sw = (field.x1 - field.x0) / stripes;
    for (let k = 0; k < stripes; k++) kit.span(greens[k % 2], field.x0 + k * sw, lift, field.z0 - 1, field.x0 + (k + 1) * sw, top, field.z1 + 1);
    const line = (x0, z0, x1, z1) => kit.span(white, x0, top, z0, x1, top + 0.012, z1);
    const t = 0.15;
    line(field.x0, field.z0, field.x1, field.z0 + t);
    line(field.x0, field.z1 - t, field.x1, field.z1);
    line(field.x0, field.z0, field.x0 + t, field.z1);
    line(field.x1 - t, field.z0, field.x1, field.z1);
    const cx = (field.x0 + field.x1) / 2;
    const cz = (field.z0 + field.z1) / 2;
    line(cx - t / 2, field.z0, cx + t / 2, field.z1);
    kit.add(white, new THREE.RingGeometry(3.6, 3.75, 40).rotateX(-Math.PI / 2), cx, top + 0.006, cz);
    kit.add(white, new THREE.CircleGeometry(0.25, 16).rotateX(-Math.PI / 2), cx, top + 0.008, cz);
    for (const goal of goals) {
      const into = -goal.out; // from the end line into the field
      const boxX0 = Math.min(goal.x, goal.x + into * 4);
      line(boxX0, goal.z - 6, boxX0 + 4, goal.z - 6 + t);
      line(boxX0, goal.z + 6 - t, boxX0 + 4, goal.z + 6);
      const front = goal.x + into * 4;
      line(front - t / 2, goal.z - 6, front + t / 2, goal.z + 6);
    }
    occupied.push({ x0: field.x0 - 1, z0: field.z0 - 1.5, x1: field.x1 + 1, z1: field.z1 + 1.5 });

    // Goals: white posts and a crossbar, a see-through net, and invisible walls so the ball stays in the net.
    const net = kit.plastic(0xffffff, { transparent: true, opacity: 0.35 });
    for (const goal of goals) {
      const back = goal.x + goal.out * goal.depth;
      const midX = (goal.x + back) / 2;
      for (const s of [-1, 1]) {
        const z = goal.z + s * goal.width / 2;
        kit.cylinder(white, goal.x, goal.height / 2, z, 0.12, 0.12, goal.height, 10);
        kit.box(net, midX, goal.height / 2, z, goal.depth, goal.height, 0.04);
        staticBox({ cx: goal.x, cy: goal.height / 2, cz: z, hx: 0.14, hy: goal.height / 2, hz: 0.14 });
        staticBox({ cx: midX, cy: goal.height / 2, cz: z + s * 0.5, hx: goal.depth / 2, hy: goal.height / 2, hz: 0.5 }); // thick, so a fast ball can't slip through
      }
      kit.cylinder(white, goal.x, goal.height, goal.z, 0.12, 0.12, goal.width + 0.24, 10, 0, Math.PI / 2);
      kit.box(net, back, goal.height / 2, goal.z, 0.04, goal.height, goal.width);
      kit.box(net, midX, goal.height, goal.z, goal.depth, 0.04, goal.width);
      staticBox({ cx: back + goal.out * 0.45, cy: goal.height / 2, cz: goal.z, hx: 0.45, hy: goal.height / 2, hz: goal.width / 2 + 1 });
      staticBox({ cx: midX, cy: goal.height + 0.1, cz: goal.z, hx: goal.depth / 2, hy: 0.1, hz: goal.width / 2 });
      occupied.push({ x0: Math.min(goal.x, back) - 0.5, z0: goal.z - goal.width / 2 - 0.5, x1: Math.max(goal.x, back) + 0.5, z1: goal.z + goal.width / 2 + 0.5 });
    }

    // A little stand of benches along the north side, in the school's colours.
    const seats = [kit.plastic(0x6b1f3f), kit.plastic(0x1f8a3b)];
    for (let k = 0; k < 3; k++) {
      kit.span(kit.plastic(0xb0bec5), field.x0 + 3, 0, field.z0 - 3.6 + k * 0.6, field.x1 - 3, 0.3 + k * 0.35, field.z0 - 3 + k * 0.6);
      kit.span(seats[k % 2], field.x0 + 3, 0.3 + k * 0.35, field.z0 - 3.6 + k * 0.6, field.x1 - 3, 0.42 + k * 0.35, field.z0 - 3.2 + k * 0.6);
    }
  }

  // The ball: light and bouncy, so a car sends it flying.
  const home = FOOTBALL.ball;
  const ballBody = new CANNON.Body({ mass: 4, shape: new CANNON.Sphere(home.radius), material: SURFACE_MATERIAL, linearDamping: 0.1, angularDamping: 0.1 });
  world.addBody(ballBody);
  // A bump from a car (or from him on foot) kicks it away, faster than it was hit and a little up, so it flies
  // instead of getting wedged under the car's nose. Applied after the physics step, so the solver can't undo it.
  let kick = null;
  ballBody.addEventListener('collide', ({ body }) => {
    if (body.type !== CANNON.Body.DYNAMIC) return;
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    if (speed < 0.8) return;
    const dx = ballBody.position.x - body.position.x;
    const dz = ballBody.position.z - body.position.z;
    const d = Math.hypot(dx, dz) || 1;
    kick = { x: dx / d, z: dz / d, speed: Math.min(KICK_MAX, speed * 1.4 + 1.5) };
  });
  const ballMesh = new THREE.Mesh(own(new THREE.SphereGeometry(home.radius, 24, 16)), own(new THREE.MeshStandardMaterial({ map: canvasTexture(256, 128, g => drawBall(g, 256, 128)), roughness: 0.4 })));
  ballMesh.castShadow = true;
  scene.add(ballMesh);
  function resetBall() {
    ballBody.position.set(home.x, home.radius + 0.05, home.z);
    ballBody.velocity.setZero();
    ballBody.angularVelocity.setZero();
    ballBody.quaternion.set(0, 0, 0, 1);
  }
  resetBall();

  const inGoal = p => goals.find(g => (p.x - g.x) * g.out > home.radius * 0.6 && (p.x - g.x) * g.out < g.depth && Math.abs(p.z - g.z) < g.width / 2 && p.y < g.height);
  let scoredAt = null;
  const football = {
    ball: ballBody,
    onGoal: null, // set by the city: (where, which goal) => cheer
    reset: resetBall,
    update(time) {
      if (kick) {
        ballBody.velocity.set(kick.x * kick.speed, Math.min(4, 1 + kick.speed * 0.08), kick.z * kick.speed); // low, under the bar
        // Already spinning as if rolling, or landing would scrub a third of its speed off and the car would catch it.
        ballBody.angularVelocity.set(ballBody.velocity.z / home.radius, 0, -ballBody.velocity.x / home.radius);
        kick = null;
      }
      ballMesh.position.copy(ballBody.position);
      ballMesh.quaternion.copy(ballBody.quaternion);
      const p = ballBody.position;
      if (scoredAt !== null) {
        if (time - scoredAt > RESET_AFTER_GOAL) {
          scoredAt = null;
          resetBall();
        }
        return;
      }
      const goal = inGoal(p);
      if (goal) {
        scoredAt = time;
        football.onGoal?.({ x: p.x, y: p.y, z: p.z }, goals.indexOf(goal));
      } else if (Math.hypot(p.x - home.x, p.z - home.z) > LOST || p.y < -2) {
        resetBall();
      }
    },
  };
  return { football };
}
