// His school, Modern School of Egypt 2000, and its football pitch next door. Drawn from the school's own photos:
// sandstone wings with white balconies, a tall blue glass hall in the middle, lamp posts and palms out front.
// The pitch has a big ball he can push into the goals with his car (it lives in the physics world, so it bounces).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SCHOOL, FOOTBALL, HERO_NAME, blockRect } from './cityMap.js';
import { SURFACE_MATERIAL } from './walker.js';
import { TOP } from './cityGround.js';
import { seededRandom } from './legoKit.js';
import { createFigureMesh } from './figureMesh.js';
import { resolveRider } from './riders.js';

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

// Big words on a coloured board (signs over doors, the welcome banner, posters).
function drawLabel(g, w, h, text, bg, fg = '#ffffff') {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.6)}px ${FONT}`;
  g.fillText(text, w / 2, h * 0.54, w * 0.92);
}

// Four shelves of books: spines in every colour, some taller than others.
function drawBooks(g, w, h, seed) {
  const random = seededRandom(seed);
  const colors = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#6b1f3f', '#00acc1', '#f5f5f5'];
  g.fillStyle = '#5d3a24';
  g.fillRect(0, 0, w, h);
  const row = h / 4;
  for (let r = 0; r < 4; r++) {
    const floor = (r + 1) * row - 6;
    for (let x = 6; x < w - 6;) {
      const bw = 10 + random() * 14;
      const bh = row * (0.62 + random() * 0.3);
      g.fillStyle = colors[Math.floor(random() * colors.length)];
      g.fillRect(x, floor - bh, Math.min(bw, w - 6 - x) - 2, bh);
      x += bw;
    }
    g.fillStyle = '#8d5a3b';
    g.fillRect(0, floor, w, 6);
  }
}

// The classroom's whiteboard: good morning, a sum, and a car drawn in marker.
function drawWhiteboard(g, w, h) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = '#1e88e5';
  g.font = `bold 52px ${FONT}`;
  g.fillText('Good morning! ☀️', 30, 60);
  g.fillStyle = '#e53935';
  g.font = `bold 64px ${FONT}`;
  g.fillText('3 + 4 = 7', 30, 160);
  g.fillStyle = '#43a047';
  g.font = `bold 40px ${FONT}`;
  g.fillText('Homework: build a car! 🚗', 30, 250);
  // The car: a body, a cab, two wheels.
  g.strokeStyle = '#212121';
  g.lineWidth = 6;
  g.strokeRect(w - 300, 130, 230, 60);
  g.strokeRect(w - 250, 85, 110, 45);
  for (const x of [w - 245, w - 110]) {
    g.beginPath();
    g.arc(x, 195, 26, 0, Math.PI * 2);
    g.stroke();
  }
}

// A desk's folded name card.
function drawNameCard(g, w, h) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = GREEN;
  g.lineWidth = 8;
  g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = MAROON;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.55)}px ${FONT}`;
  g.fillText(`⭐ ${HERO_NAME} ⭐`, w / 2, h * 0.54, w - 24);
}

// The bus's bay on the forecourt: a yellow outline and BUS at its front end.
function drawBusBay(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#fdd835';
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#fdd835';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(w * 0.3)}px ${FONT}`;
  g.fillText('BUS', w / 2, h * 0.8);
}

// SCHOOL BUS down both sides of the bus he drives. body: the driven bus's brick-space group (schoolBus.js).
// Returns a function that frees it again.
export function paintBusSides(body) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 112;
  const g = canvas.getContext('2d');
  g.fillStyle = '#212121';
  g.font = `bold 92px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('SCHOOL BUS', 512, 60, 1000);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const geometry = new THREE.PlaneGeometry(3.4, 0.37);
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(geometry, material);
    sign.position.set(side * 1.012, 0.5, -1); // along the lower course of yellow bricks, behind the front wheels
    sign.rotation.y = (side * Math.PI) / 2;
    body.add(sign);
  }
  return () => {
    texture.dispose();
    material.dispose();
    geometry.dispose();
  };
}

// staticBox, canvasTexture and onMap are cityWorld's: physics boxes (drawn if given a colour), canvas pictures,
// and building footprints for the maps. occupied: footprints the ground and props keep clear of.
export function createSchool({ kit, scene, world, own, staticBox, canvasTexture, onMap, occupied }) {
  const stone = kit.plastic(SAND_STONE, { look: 'bricks' });
  const darkStone = kit.plastic(DARK_STONE);
  const white = kit.plastic(0xf5f5f5);
  const dark = kit.plastic(0x263238);
  const glass = kit.glass();
  const blueGlass = kit.plastic(0x3fa9e0, { roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.88 });
  const paving = kit.plastic(0xe9d3b0);
  const lift = TOP.lot;
  const badgeMaterial = own(new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, g => drawEmblem(g, 256)), roughness: 0.4, transparent: true }));

  // A flat picture: a material (shared by pictures that look the same) on a w × h plane facing +z turned by rotY.
  function picture(material, w, h, x, y, z, rotY = 0) {
    const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    return mesh;
  }
  const pictureMaterial = texture => own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45 }));
  const addSign = (texture, w, h, x, y, z, rotY = 0) => picture(pictureMaterial(texture), w, h, x, y, z, rotY);

  // A wall from cityMap.js's SCHOOL.walls: a physics box, drawn.
  const wallBox = (b, material) => {
    staticBox({ cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, cz: (b.z0 + b.z1) / 2, hx: (b.x1 - b.x0) / 2, hy: (b.y1 - b.y0) / 2, hz: (b.z1 - b.z0) / 2 });
    kit.span(material, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
  };

  // --- the school building: hollow downstairs (the lobby, the library and his classroom are below) ---
  {
    const { wings: w, hall, floor: FLOOR, door } = SCHOOL;
    const rect = blockRect(SCHOOL.block.bx, SCHOOL.block.bz);
    kit.span(paving, rect.x0 + 3, TOP.road, rect.z0 + 3, rect.x1 - 3, lift + 0.01, rect.z1 - 3); // a sandy stone forecourt
    onMap(w.x0, w.z0, w.x1, w.z1, SAND_STONE);
    onMap(hall.x0, hall.z0, hall.x1, hall.z1, 0x3fa9e0);
    occupied.push({ x0: w.x0 - 1.5, z0: w.z0 - 0.5, x1: w.x1 + 0.5, z1: hall.z1 + 3 });
    for (const b of SCHOOL.walls.wings) wallBox(b, stone);
    // A dark plinth round the outside, and a flat roof with a studded sandstone parapet, on each wing.
    const wingSpans = [[w.x0, hall.x0], [hall.x1, w.x1]];
    for (const [x0, x1] of wingSpans) {
      kit.span(dark, x0, 0, w.z0 - 0.12, x1, 0.3, w.z0);
      kit.span(dark, x0, 0, w.z1, x1, 0.3, w.z1 + 0.12);
      const [px0, px1] = x0 === w.x0 ? [x0 - 0.3, x1] : [x0, x1 + 0.3];
      kit.span(darkStone, px0, w.h, w.z0 - 0.3, px1, w.h + 0.5, w.z1 + 0.3);
      kit.studs(darkStone, px0, w.z0 - 0.3, px1, w.z0 + 0.5, w.h + 0.5);
      kit.studs(darkStone, px0, w.z1 - 0.5, px1, w.z1 + 0.3, w.h + 0.5);
    }
    for (const x of [w.x0 - 0.12, w.x1]) kit.span(dark, x, 0, w.z0 - 0.12, x + 0.12, 0.3, w.z1 + 0.12);
    // Three floors: on the front a white balcony along each floor with windows behind it and stone piers between;
    // windows round the back and the ends.
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
    // The blue glass hall: glass walls (the doorways in cityMap.js), white mullions in a grid on the outside,
    // a sandstone crown, the school badge high on the front, and the glass doors standing open under a canopy.
    for (const b of SCHOOL.walls.hall) wallBox(b, blueGlass);
    for (let y = 2.5; y < hall.h; y += 2.5) {
      const band = (x0, z0, x1, z1) => kit.span(white, x0, y - 0.08, z0, x1, y + 0.08, z1);
      band(hall.x0 - 0.08, hall.z0 - 0.08, hall.x1 + 0.08, hall.z0);
      band(hall.x0 - 0.08, hall.z1, hall.x1 + 0.08, hall.z1 + 0.08);
      band(hall.x0 - 0.08, hall.z0, hall.x0, hall.z1);
      band(hall.x1, hall.z0, hall.x1 + 0.08, hall.z1);
    }
    for (let x = hall.x0; x <= hall.x1 + 1e-6; x += 2) {
      const y0 = x > door.x0 - 0.1 && x < door.x1 + 0.1 ? door.h : 0; // not across the doorway
      kit.box(white, x, (y0 + hall.h) / 2, hall.z1 + 0.06, 0.14, hall.h - y0, 0.14);
    }
    for (const x of [hall.x0, hall.x1]) for (let z = hall.z0; z <= hall.z1 + 1e-6; z += 2.5) kit.box(white, x, hall.h / 2, z, 0.14, hall.h, 0.14);
    kit.span(darkStone, hall.x0 - 0.4, hall.h, hall.z0 - 0.4, hall.x1 + 0.4, hall.h + 0.8, hall.z1 + 0.4);
    kit.studs(darkStone, hall.x0 - 0.4, hall.z0 - 0.4, hall.x1 + 0.4, hall.z1 + 0.4, hall.h + 0.8);
    const badge = new THREE.Mesh(own(new THREE.CircleGeometry(2.6, 40)), badgeMaterial);
    badge.position.set((hall.x0 + hall.x1) / 2, hall.h - 3.2, hall.z1 + 0.2);
    scene.add(badge);
    const mid = (hall.x0 + hall.x1) / 2;
    kit.span(dark, door.x0 - 0.15, 0, hall.z1 - 0.02, door.x0, door.h + 0.15, hall.z1 + 0.14);
    kit.span(dark, door.x1, 0, hall.z1 - 0.02, door.x1 + 0.15, door.h + 0.15, hall.z1 + 0.14);
    kit.span(dark, door.x0 - 0.15, door.h, hall.z1 - 0.02, door.x1 + 0.15, door.h + 0.15, hall.z1 + 0.14);
    const doorWidth = (door.x1 - door.x0) / 2;
    for (const x of [door.x0 + 0.05, door.x1 - 0.05]) kit.box(glass, x, door.h / 2, hall.z1 - SCHOOL.wall - doorWidth / 2, 0.06, door.h - 0.1, doorWidth);
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

  // --- inside: the lobby, the library and his classroom (the rooms and doorways are cityMap.js's) ---
  {
    const { rooms: { lobby, library, classroom }, hall, wings: w, floor: FLOOR, wall, door, sideDoor } = SCHOOL;
    const top = lift + 0.03; // the floors inside, just over the forecourt
    const mid = (hall.x0 + hall.x1) / 2;
    const doorZ = (sideDoor.z0 + sideDoor.z1) / 2;
    const wood = kit.plastic(0xc8915a);
    const darkWood = kit.plastic(0x8d5a3b);
    const maroon = kit.plastic(0x6b1f3f);
    const green = kit.plastic(0x1f8a3b);
    const leaves = kit.plastic(0x43a047);
    const gold = kit.plastic(0xffc107, { metalness: 0.5, roughness: 0.3 });
    const clearGlass = kit.plastic(0xd6f0ff, { transparent: true, opacity: 0.25, roughness: 0.05 });
    const daylight = kit.glow(0xd6f0ff); // the windows, seen from inside (the walls are solid)
    const lamp = kit.glow(0xfffde7);
    const furniture = (x0, z0, x1, z1, h) => staticBox({ cx: (x0 + x1) / 2, cy: h / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hy: h / 2, hz: (z1 - z0) / 2 });
    const plant = (x, z) => {
      kit.cylinder(maroon, x, 0.3, z, 0.3, 0.22, 0.6, 12);
      kit.add(leaves, new THREE.IcosahedronGeometry(0.55, 1), x, 1.05, z);
      furniture(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0.6);
    };
    const label = (text, bg, w, h, x, y, z, rotY) => {
      const ch = Math.round((512 * h) / w);
      addSign(canvasTexture(512, ch, g => drawLabel(g, 512, ch, text, bg)), w, h, x, y, z, rotY);
    };
    const person = (figure, x, z, heading) => {
      const mesh = createFigureMesh(figure);
      mesh.position.set(x, top, z);
      mesh.rotation.y = heading;
      scene.add(mesh);
      furniture(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1.6);
    };

    // Floors, the doorways' floors too.
    const tiles = kit.plastic(0xf1e4cc);
    kit.span(tiles, lobby.x0, lift, lobby.z0, lobby.x1, top, lobby.z1);
    kit.span(tiles, door.x0, lift, hall.z1 - wall, door.x1, top, hall.z1);
    for (const x0 of [hall.x0, hall.x1 - wall]) kit.span(tiles, x0, lift, sideDoor.z0, x0 + wall, top, sideDoor.z1);
    kit.span(wood, library.x0, lift, library.z0, library.x1, top, library.z1);
    kit.span(kit.plastic(0xdcb57e), classroom.x0, lift, classroom.z0, classroom.x1, top, classroom.z1);

    // The two low rooms: a white ceiling with lamps, painted walls, and daylight in the front windows.
    for (const [room, paint, wx0, wx1] of [[library, 0xe8f5e9, w.x0, hall.x0], [classroom, 0xfff3c4, hall.x1, w.x1]]) {
      const plaster = kit.plastic(paint);
      kit.span(white, room.x0, FLOOR - 0.03, room.z0, room.x1, FLOOR, room.z1);
      kit.span(plaster, room.x0, top, room.z0, room.x1, FLOOR, room.z0 + 0.02);
      kit.span(plaster, room.x0, top, room.z1 - 0.02, room.x1, FLOOR, room.z1);
      const endX = room === library ? room.x0 : room.x1 - 0.02;
      kit.span(plaster, endX, top, room.z0, endX + 0.02, FLOOR, room.z1);
      for (let x = room.x0 + 2; x < room.x1 - 1; x += 3) for (const z of [room.z0 + 3, room.z1 - 3]) kit.box(lamp, x, FLOOR - 0.05, z, 1.2, 0.04, 0.4);
      for (let x = wx0 + 1.6; x < wx1 - 1; x += 2.6) kit.box(daylight, x, 1.8, room.z1 - 0.03, 1.7, 1.9, 0.02);
    }

    // The lobby: the badge on the floor and up on the back wall, WELCOME, the front desk with a teacher behind
    // it, trophy cabinets, plants by the doors, benches, banners down the tall glass hall, and signs over the
    // side doors.
    const badgeOnFloor = new THREE.Mesh(own(new THREE.CircleGeometry(2.2, 40).rotateX(-Math.PI / 2)), badgeMaterial);
    badgeOnFloor.position.set(mid, top + 0.005, (lobby.z0 + lobby.z1) / 2 + 2);
    scene.add(badgeOnFloor);
    picture(badgeMaterial, 3.2, 3.2, mid, 5.2, lobby.z0 + 0.02).geometry = own(new THREE.CircleGeometry(1.6, 40));
    label('WELCOME! 👋', MAROON, 5, 0.9, mid, 3.1, lobby.z0 + 0.02, 0);
    const deskZ = lobby.z0 + 2.4;
    const counter = 0.75; // low enough to see the teacher over it
    kit.span(maroon, mid - 2, 0, deskZ - 0.4, mid + 2, counter, deskZ + 0.4);
    kit.span(green, mid - 2.01, 0.4, deskZ + 0.4, mid + 2.01, 0.52, deskZ + 0.41);
    kit.span(white, mid - 2.1, counter, deskZ - 0.5, mid + 2.1, counter + 0.08, deskZ + 0.5);
    kit.box(dark, mid + 1.1, counter + 0.33, deskZ - 0.25, 0.6, 0.4, 0.05); // a computer screen
    kit.add(gold, new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mid - 1.1, counter + 0.08, deskZ + 0.15); // a bell
    furniture(mid - 2.1, deskZ - 0.5, mid + 2.1, deskZ + 0.5, counter + 0.08);
    person({ head: 'long', headColor: 'black', face: 'happy', skin: 'tan', shirt: 'purple', print: 'plain', pants: 'black' }, mid - 0.3, deskZ - 1, 0);
    for (const x0 of [lobby.x0, lobby.x1 - 1.2]) {
      const [z0, z1] = [lobby.z0, lobby.z0 + 0.6];
      kit.span(darkWood, x0, 0, z0, x0 + 1.2, 0.5, z1);
      kit.span(darkWood, x0, 2.3, z0, x0 + 1.2, 2.4, z1);
      for (const x of [x0 + 0.03, x0 + 1.17]) kit.box(darkWood, x, 1.4, (z0 + z1) / 2, 0.06, 1.8, 0.6);
      kit.span(clearGlass, x0, 0.5, z1 - 0.03, x0 + 1.2, 2.3, z1);
      for (const y of [0.5, 1.15, 1.75]) {
        if (y > 0.5) kit.span(white, x0 + 0.06, y - 0.03, z0, x0 + 1.14, y, z1 - 0.04);
        for (const x of [x0 + 0.33, x0 + 0.87]) { // a gold cup on a stem
          kit.cylinder(gold, x, y + 0.12, (z0 + z1) / 2, 0.04, 0.08, 0.24, 10);
          kit.cylinder(gold, x, y + 0.34, (z0 + z1) / 2, 0.13, 0.06, 0.2, 12);
        }
      }
      furniture(x0, z0, x0 + 1.2, z1, 2.4);
    }
    plant(lobby.x0 + 0.6, lobby.z1 - 0.6);
    plant(lobby.x1 - 0.6, lobby.z1 - 0.6);
    for (const [x0, x1] of [[lobby.x0, lobby.x0 + 0.55], [lobby.x1 - 0.55, lobby.x1]]) {
      const [z0, z1] = [sideDoor.z1 + 1, lobby.z1 - 1.6];
      kit.span(darkWood, x0, 0.4, z0, x1, 0.48, z1);
      for (const z of [z0 + 0.2, z1 - 0.2]) kit.span(dark, x0 + 0.05, 0, z - 0.05, x1 - 0.05, 0.4, z + 0.05);
      furniture(x0, z0, x1, z1, 0.48);
    }
    for (const [dx, z, color] of [[-2, lobby.z0 + 5, maroon], [2, lobby.z0 + 5, green], [-2, lobby.z0 + 10, green], [2, lobby.z0 + 10, maroon]]) {
      kit.box(color, mid + dx, 11.8, z, 1.4, 5, 0.05);
      for (const y of [10, 13.6]) kit.box(white, mid + dx, y, z, 1.4, 0.25, 0.07);
      kit.box(dark, mid + dx, 14.65, z, 0.04, 0.7, 0.04);
    }
    for (const [x, rotY, s] of [[lobby.x0 + 0.01, Math.PI / 2, -1], [lobby.x1 - 0.01, -Math.PI / 2, 1]]) {
      const frameX = s < 0 ? lobby.x0 : lobby.x1 - 0.06;
      kit.span(maroon, frameX, 0, sideDoor.z0 - 0.12, frameX + 0.06, sideDoor.h + 0.12, sideDoor.z0);
      kit.span(maroon, frameX, 0, sideDoor.z1, frameX + 0.06, sideDoor.h + 0.12, sideDoor.z1 + 0.12);
      kit.span(maroon, frameX, sideDoor.h, sideDoor.z0 - 0.12, frameX + 0.06, sideDoor.h + 0.12, sideDoor.z1 + 0.12);
      label(s < 0 ? '📚 LIBRARY' : '✏️ CLASSROOM', s < 0 ? GREEN : MAROON, 2.6, 0.6, x + s * -0.05, sideDoor.h + 0.55, doorZ, rotY);
    }

    // The library: books along two walls, a green rug with beanbags, a reading table and a fish tank.
    const shelf = (x0, z0, x1, z1, facing) => {
      kit.span(darkWood, x0, 0, z0, x1, 2.2, z1);
      furniture(x0, z0, x1, z1, 2.2);
      const along = facing === 'x' ? z1 - z0 : x1 - x0;
      const n = Math.round(along / 2);
      for (let k = 0; k < n; k++) {
        const books = pictureMaterial(canvasTexture(256, 256, g => drawBooks(g, 256, 256, k + 7 * n)));
        const t = ((k + 0.5) / n) * along;
        if (facing === 'x') picture(books, along / n - 0.06, 2, x1 + 0.01, 1.1, z0 + t, Math.PI / 2);
        else picture(books, along / n - 0.06, 2, x0 + t, 1.1, z1 + 0.01);
      }
    };
    shelf(library.x0, library.z0 + 0.6, library.x0 + 0.45, library.z1 - 0.6, 'x');
    shelf(library.x0 + 0.6, library.z0, library.x1 - 0.6, library.z0 + 0.45, 'z');
    label('📖 READ, READ, READ!', GREEN, 4, 0.7, (library.x0 + library.x1) / 2, 2.9, library.z0 + 0.03, 0);
    const rug = { x0: library.x0 + 1.4, z0: library.z0 + 2.4, x1: library.x0 + 6.4, z1: library.z1 - 1.6 };
    kit.span(kit.plastic(0xfdd835), rug.x0 - 0.15, top, rug.z0 - 0.15, rug.x1 + 0.15, top + 0.012, rug.z1 + 0.15);
    kit.span(kit.plastic(0x2e7d32), rug.x0, top, rug.z0, rug.x1, top + 0.016, rug.z1);
    for (const [x, z, hex] of [[rug.x0 + 1, rug.z0 + 1, 0xe53935], [rug.x0 + 2.8, rug.z0 + 0.7, 0x1e88e5], [rug.x0 + 0.9, rug.z0 + 3.3, 0xfdd835]]) {
      kit.add(kit.plastic(hex, { roughness: 0.7 }), new THREE.SphereGeometry(0.62, 16, 10).scale(1, 0.55, 1), x, top + 0.3, z);
      furniture(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 0.6);
    }
    const table = { x: rug.x0 + 3.4, z: rug.z1 - 1.4 };
    kit.span(wood, table.x - 0.8, 0.7, table.z - 0.45, table.x + 0.8, 0.76, table.z + 0.45);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(darkWood, table.x + sx * 0.7, 0.35, table.z + sz * 0.37, 0.06, 0.7, 0.06);
    for (const [dx, dz] of [[-0.45, -0.75], [0.45, -0.75], [-0.45, 0.75], [0.45, 0.75]]) kit.cylinder(dx < 0 ? maroon : green, table.x + dx, 0.22, table.z + dz, 0.2, 0.2, 0.44, 12);
    kit.add(kit.plastic(0x1e88e5), new THREE.BoxGeometry(0.3, 0.05, 0.22), table.x - 0.2, 0.79, table.z, 0.3); // an open book, nearly
    furniture(table.x - 0.8, table.z - 0.95, table.x + 0.8, table.z + 0.95, 0.76);
    const tank = { x0: library.x0 + 5.3, x1: library.x0 + 7.3, z0: library.z1 - 0.75, z1: library.z1 - 0.1 };
    kit.span(darkWood, tank.x0, 0, tank.z0, tank.x1, 0.8, tank.z1);
    kit.span(kit.plastic(0xfdd835, { roughness: 0.9 }), tank.x0 + 0.05, 0.8, tank.z0 + 0.05, tank.x1 - 0.05, 0.9, tank.z1 - 0.05); // sand
    kit.span(kit.plastic(0x4fc3f7, { transparent: true, opacity: 0.22, roughness: 0.05 }), tank.x0, 0.8, tank.z0, tank.x1, 1.65, tank.z1);
    for (const x of [tank.x0 + 0.3, tank.x1 - 0.4]) kit.box(leaves, x, 1.15, (tank.z0 + tank.z1) / 2, 0.08, 0.5, 0.08);
    for (const [x, y, hex] of [[tank.x0 + 0.7, 1.3, 0xff7043], [tank.x0 + 1.3, 1.1, 0xfdd835], [tank.x0 + 1.05, 1.45, 0xff7043]]) {
      const fish = kit.plastic(hex, { emissive: hex, emissiveIntensity: 0.5 }); // bright through the water
      kit.box(fish, x, y, (tank.z0 + tank.z1) / 2 - 0.1, 0.18, 0.1, 0.05);
      kit.box(fish, x - 0.13, y, (tank.z0 + tank.z1) / 2 - 0.1, 0.08, 0.14, 0.04); // tail
    }
    furniture(tank.x0, tank.z0, tank.x1, tank.z1, 1.65);

    // His classroom: two rows of desks facing the whiteboard, the teacher by it, the teacher's desk with an apple
    // and a globe, an alphabet over the board, posters and a clock. One desk has a name card on it...
    const boardZ = (classroom.z0 + classroom.z1) / 2;
    const boardX = classroom.x1 - 0.03;
    kit.span(kit.plastic(0x9e9e9e), boardX - 0.04, 0.85, boardZ - 2.15, boardX + 0.02, 2.55, boardZ + 2.15);
    picture(pictureMaterial(canvasTexture(1024, 384, g => drawWhiteboard(g, 1024, 384))), 4.2, 1.575, boardX - 0.05, 1.7, boardZ, -Math.PI / 2);
    kit.span(kit.plastic(0x9e9e9e), boardX - 0.2, 0.82, boardZ - 2, boardX, 0.86, boardZ + 2);
    for (const [dz, hex] of [[-0.3, 0xe53935], [0, 0x1e88e5], [0.25, 0x43a047]]) kit.box(kit.plastic(hex), boardX - 0.1, 0.89, boardZ + dz, 0.04, 0.04, 0.16);
    label('A B C D E F G', '#1e88e5', 5, 0.45, boardX - 0.01, 2.95, boardZ, -Math.PI / 2);
    person(resolveRider('preset:teacher'), classroom.x1 - 1.1, boardZ - 2.9, -Math.PI / 2);
    const teacherDesk = { x: classroom.x1 - 2, z: boardZ + 3 };
    kit.span(darkWood, teacherDesk.x - 0.45, 0, teacherDesk.z - 0.85, teacherDesk.x + 0.45, 0.78, teacherDesk.z + 0.85);
    kit.add(kit.plastic(0xe53935), new THREE.SphereGeometry(0.09, 12, 8), teacherDesk.x, 0.87, teacherDesk.z - 0.5); // an apple for the teacher
    kit.cylinder(dark, teacherDesk.x, 0.88, teacherDesk.z + 0.4, 0.02, 0.08, 0.2, 8);
    kit.add(kit.plastic(0x1e88e5), new THREE.SphereGeometry(0.2, 16, 12), teacherDesk.x, 1.15, teacherDesk.z + 0.4); // a globe
    furniture(teacherDesk.x - 0.45, teacherDesk.z - 0.85, teacherDesk.x + 0.45, teacherDesk.z + 0.85, 0.78);
    const seats = [maroon, green];
    const nameCard = pictureMaterial(canvasTexture(256, 80, g => drawNameCard(g, 256, 80)));
    [classroom.x0 + 3, classroom.x0 + 5.2].forEach((x, col) => [0, 2.4, 4.8, 7.2].forEach((dz, row) => {
      const z = classroom.z0 + 1.9 + dz;
      kit.span(white, x - 0.35, 0.72, z - 0.6, x + 0.35, 0.78, z + 0.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(dark, x + sx * 0.3, 0.36, z + sz * 0.55, 0.05, 0.72, 0.05);
      const seat = seats[(col + row) % 2];
      kit.span(seat, x - 0.98, 0.42, z - 0.23, x - 0.52, 0.47, z + 0.23);
      kit.span(seat, x - 1, 0.47, z - 0.23, x - 0.95, 0.92, z + 0.23);
      for (const sx of [-0.95, -0.55]) for (const sz of [-0.2, 0.2]) kit.box(dark, x + sx, 0.21, z + sz, 0.04, 0.42, 0.04);
      kit.box(kit.plastic([0xe53935, 0x1e88e5, 0xfb8c00, 0x8e24aa][(col * 4 + row) % 4]), x - 0.05, 0.8, z - 0.25, 0.22, 0.04, 0.3); // an exercise book
      kit.box(kit.plastic(0xfdd835), x - 0.05, 0.8, z + 0.15, 0.03, 0.03, 0.3); // a pencil
      if (col === 1 && row === 1) for (const side of [-1, 1]) picture(nameCard, 0.48, 0.15, x + 0.1 + side * 0.006, 0.86, z + 0.1, (side * Math.PI) / 2);
      furniture(x - 1, z - 0.6, x + 0.35, z + 0.6, 0.78);
    }));
    label('🔤 A a  B b  C c', '#fb8c00', 1.6, 1, classroom.x0 + 2.4, 1.9, classroom.z0 + 0.03, 0);
    label('1 2 3 4 5 🔢', '#8e24aa', 1.6, 1, classroom.x0 + 5, 1.9, classroom.z0 + 0.03, 0);
    label('🌍 Our world', '#00acc1', 1.6, 1, classroom.x0 + 7.6, 1.9, classroom.z0 + 0.03, 0);
    const clock = pictureMaterial(canvasTexture(128, 128, g => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(64, 64, 60, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#212121';
      g.lineWidth = 6;
      g.stroke();
      g.beginPath();
      g.moveTo(64, 64);
      g.lineTo(64, 22); // 8 o'clock: time for school
      g.moveTo(64, 64);
      g.lineTo(34, 81);
      g.stroke();
    }));
    picture(clock, 0.5, 0.5, classroom.x1 - 1, 2.7, classroom.z1 - 0.03, Math.PI).geometry = own(new THREE.CircleGeometry(0.25, 24));
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

    // The school bus's bay: he can drive the bus (city.js); it's parked back here every visit.
    const bay = new THREE.Mesh(own(new THREE.PlaneGeometry(bus.w, bus.l).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({
      map: canvasTexture(180, 400, g => drawBusBay(g, 180, 400)),
      transparent: true,
    })));
    bay.position.set(bus.x, lift + 0.02, bus.z);
    bay.rotation.y = bus.heading; // BUS, in front of its nose, reads the right way up coming in from the road
    scene.add(bay);
    occupied.push({ x0: bus.x - bus.w / 2 - 0.5, z0: bus.z - bus.l / 2 - 0.5, x1: bus.x + bus.w / 2 + 0.5, z1: bus.z + bus.l / 2 + 0.5 });
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
