// Farouk Kitchen: a restaurant across the road from his school. Cream brick walls, red and white awnings and a giant
// chef's hat on the roof. Inside, a dining room with gingham tables, and through the middle door a big kitchen with
// every machine a chef uses, each with its name on a sign: fridge, freezer, stove, oven, fryer, grill, hood, sink,
// dishwasher, microwave, mixer and more. Pots steam, burners and the bread oven flicker, the chimney smokes.
// The walls, rooms and doors are cityMap.js's RESTAURANT; this file is how it looks (and the furniture's physics).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RESTAURANT, HERO_NAME, blockRect } from './cityMap.js';
import { TOP } from './cityGround.js';
import { createFigureMesh, mergeFigure } from './figureMesh.js';
import { disposeMerged } from './meshMerge.js';
import { resolveRider } from './riders.js';

const FONT = 'Fredoka, Arial Rounded MT Bold, sans-serif';
const GREEN = '#2e7d32';
const RED = '#c62828';
const NAME = 'FAROUK KITCHEN';
const COUNTER = 0.7; // worktop height, for figures about a metre tall

// The labels share one picture (an atlas of 2 × 16 slots, each 4:1), so they draw in a single call.
const SLOT_W = 512;
const SLOT_H = 128;
const ATLAS_ROWS = 16;

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawTag(g, x, y, text, bg) {
  g.fillStyle = '#ffffff';
  roundRect(g, x + 2, y + 2, SLOT_W - 4, SLOT_H - 4, 26);
  g.fill();
  g.fillStyle = bg;
  roundRect(g, x + 10, y + 10, SLOT_W - 20, SLOT_H - 20, 20);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 64px ${FONT}`;
  const fit = Math.min(64, Math.floor((64 * (SLOT_W - 50)) / g.measureText(text).width));
  g.font = `bold ${fit}px ${FONT}`;
  g.fillText(text, x + SLOT_W / 2, y + SLOT_H * 0.54);
}

function drawShopSign(g, w, h) {
  g.fillStyle = GREEN;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffd54f';
  g.lineWidth = 10;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.5)}px ${FONT}`;
  g.fillText(`👨‍🍳 ${NAME} 🍳`, w / 2, h * 0.54, w - 60);
}

function drawMenu(g, w, h) {
  g.fillStyle = '#6d4c41';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#263238';
  g.fillRect(16, 16, w - 32, h - 32);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd54f';
  g.font = `bold 64px ${FONT}`;
  g.fillText('⭐ MENU ⭐', w / 2, 70);
  const dishes = [['🍔', 'Burger'], ['🍟', 'Chips'], ['🧆', 'Falafel'], ['🍝', 'Koshari'], ['🍗', 'Chicken'], ['🥗', 'Salad'], ['🍰', 'Cake'], ['🥤', 'Juice']];
  g.font = `bold 40px ${FONT}`;
  dishes.forEach(([emoji, name], k) => {
    const x = k < 4 ? w * 0.27 : w * 0.73;
    const y = 150 + (k % 4) * 62;
    g.fillStyle = '#ffffff';
    g.fillText(`${emoji} ${name}`, x, y);
  });
}

function drawReserved(g, w, h) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = RED;
  g.lineWidth = 8;
  g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = GREEN;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.26)}px ${FONT}`;
  g.fillText('RESERVED FOR', w / 2, h * 0.32);
  g.fillStyle = RED;
  g.font = `bold ${Math.round(h * 0.36)}px ${FONT}`;
  g.fillText(`⭐ ${HERO_NAME} ⭐`, w / 2, h * 0.68, w - 20);
}

function drawToday(g, w, h) {
  g.fillStyle = '#263238';
  g.fillRect(0, 0, w, h);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd54f';
  g.font = `bold ${Math.round(h * 0.16)}px ${FONT}`;
  g.fillText('TODAY', w / 2, h * 0.2);
  g.fillStyle = '#ffffff';
  g.font = `bold ${Math.round(h * 0.18)}px ${FONT}`;
  g.fillText('🍝 Koshari', w / 2, h * 0.48);
  g.fillText('🍰 Cake', w / 2, h * 0.76);
}

export function createRestaurant({ kit, scene, own, staticBox, canvasTexture, onMap, occupied }) {
  const R = RESTAURANT;
  const { building: b, rooms: { dining: D, kitchen: K }, divider, door, kitchenDoor, hatches, ceiling, wall } = R;
  const mid = (b.x0 + b.x1) / 2;
  const lift = TOP.lot;
  const top = lift + 0.03; // the floors inside

  // --- materials ---
  const cream = kit.plastic(0xffe0b2, { look: 'bricks' });
  const green = kit.plastic(0x2e7d32);
  const red = kit.plastic(0xe53935);
  const white = kit.plastic(0xf5f5f5);
  const dark = kit.plastic(0x263238);
  const black = kit.plastic(0x111111);
  const steel = kit.plastic(0xcfd8dc, { metalness: 0.6, roughness: 0.25 });
  const darkSteel = kit.plastic(0x90a4ae, { metalness: 0.6, roughness: 0.3 });
  const wood = kit.plastic(0xc8915a);
  const darkWood = kit.plastic(0x8d5a3b);
  const glass = kit.glass();
  const clearGlass = kit.plastic(0xd6f0ff, { transparent: true, opacity: 0.3, roughness: 0.05 });
  const daylight = kit.glow(0xd6f0ff);
  const lamp = kit.glow(0xfffde7);
  const fireGlow = kit.glow(0xff7043);
  const leaves = kit.plastic(0x43a047);
  const gold = kit.plastic(0xffc107, { metalness: 0.5, roughness: 0.3 });

  // A piece of furniture he bumps into (and the car does too): an invisible box from the floor up to h.
  const solid = (x0, z0, x1, z1, h) => staticBox({ cx: (x0 + x1) / 2, cy: h / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hy: h / 2, hz: (z1 - z0) / 2 });
  const wallBox = (w, material) => {
    staticBox({ cx: (w.x0 + w.x1) / 2, cy: (w.y0 + w.y1) / 2, cz: (w.z0 + w.z1) / 2, hx: (w.x1 - w.x0) / 2, hy: (w.y1 - w.y0) / 2, hz: (w.z1 - w.z0) / 2 });
    kit.span(material, w.x0, w.y0, w.z0, w.x1, w.y1, w.z1);
  };
  function picture(texture, w, h, x, y, z, rotY = 0) {
    const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45 })));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    return mesh;
  }
  // Name signs (4:1), gathered here and drawn together at the end. rotY: 0 faces +z (south), PI north,
  // PI / 2 east, -PI / 2 west.
  const tags = [];
  const tag = (text, bg, w, x, y, z, rotY) => tags.push({ text, bg, w, x, y, z, rotY });
  const figures = [];
  function person(figure, x, z, heading, { sit = false, y = top } = {}) {
    const mesh = mergeFigure(createFigureMesh(figure, { pose: sit ? 'sit' : 'stand' }), { moving: [] });
    mesh.position.set(x, y, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    figures.push(mesh);
    if (!sit) solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 1.2);
    return mesh;
  }
  const plant = (x, z, s = 1) => {
    kit.cylinder(kit.plastic(0x8d4b3a), x, 0.25 * s, z, 0.28 * s, 0.2 * s, 0.5 * s, 12);
    kit.add(leaves, new THREE.IcosahedronGeometry(0.5 * s, 1), x, 0.85 * s, z);
    solid(x - 0.3 * s, z - 0.3 * s, x + 0.3 * s, z + 0.3 * s, 0.6 * s);
  };

  const shopSign = canvasTexture(1024, 160, g => drawShopSign(g, 1024, 160));

  // --- outside ---
  {
    const rect = blockRect(R.block.bx, R.block.bz);
    onMap(b.x0, b.z0, b.x1, b.z1, 0xffb74d);
    occupied.push({ x0: b.x0 - 0.5, z0: b.z0 - 0.5, x1: b.x1 + 0.5, z1: b.z1 + 0.5 });
    // A terracotta-tiled terrace out front, from the sidewalk to the door.
    kit.span(kit.plastic(0xd7a27a, { look: 'road' }), rect.x0 + 3, TOP.road, rect.z0 + 3, rect.x1 - 3, lift + 0.012, b.z0);
    for (const w of R.walls) {
      if (w.y0 === ceiling) continue; // the roof, drawn below
      const outer = w.z1 <= b.z0 + wall + 1e-6 || w.z0 >= b.z1 - wall - 1e-6 || w.x1 <= b.x0 + wall + 1e-6 || w.x0 >= b.x1 - wall - 1e-6;
      wallBox(w, outer ? cream : white);
    }
    const roof = R.walls.find(w => w.y0 === ceiling);
    staticBox({ cx: (roof.x0 + roof.x1) / 2, cy: (roof.y0 + roof.y1) / 2, cz: (roof.z0 + roof.z1) / 2, hx: (roof.x1 - roof.x0) / 2, hy: (roof.y1 - roof.y0) / 2, hz: (roof.z1 - roof.z0) / 2 });
    kit.span(cream, b.x0, ceiling, b.z0, b.x1, b.h, b.z1);
    // A green base course, green corner columns and a studded green parapet.
    kit.span(green, b.x0 - 0.1, 0, b.z0 - 0.1, b.x1 + 0.1, 0.3, b.z0);
    kit.span(green, b.x0 - 0.1, 0, b.z1, b.x1 + 0.1, 0.3, b.z1 + 0.1);
    kit.span(green, b.x0 - 0.1, 0, b.z0, b.x0, 0.3, b.z1);
    kit.span(green, b.x1, 0, b.z0, b.x1 + 0.1, 0.3, b.z1);
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) kit.box(green, x, b.h / 2, z, 0.6, b.h, 0.6);
    const p = 0.35;
    kit.span(green, b.x0 - p, b.h, b.z0 - p, b.x1 + p, b.h + 0.4, b.z0 + 0.4);
    kit.span(green, b.x0 - p, b.h, b.z1 - 0.4, b.x1 + p, b.h + 0.4, b.z1 + p);
    kit.span(green, b.x0 - p, b.h, b.z0 + 0.4, b.x0 + 0.4, b.h + 0.4, b.z1 - 0.4);
    kit.span(green, b.x1 - 0.4, b.h, b.z0 + 0.4, b.x1 + p, b.h + 0.4, b.z1 - 0.4);
    kit.studs(green, b.x0 - p, b.z0 - p, b.x1 + p, b.z0 + 0.4, b.h + 0.4);
    kit.studs(green, b.x0 - p, b.z1 - 0.4, b.x1 + p, b.z1 + p, b.h + 0.4);
    kit.span(kit.plastic(0xb0bec5), b.x0 + 0.4, b.h, b.z0 + 0.4, b.x1 - 0.4, b.h + 0.1, b.z1 - 0.4);

    // A giant chef's hat on the roof, so he can spot it from the school.
    const hat = { x: mid + 6, z: (b.z0 + b.z1) / 2 + 2, y: b.h + 0.1 };
    kit.cylinder(white, hat.x, hat.y + 0.8, hat.z, 1.25, 1.25, 1.6, 24);
    kit.cylinder(kit.plastic(0xe0e0e0), hat.x, hat.y + 0.2, hat.z, 1.3, 1.3, 0.4, 24);
    for (const [dx, dz, r] of [[0, 0, 1.3], [-0.9, 0.2, 0.9], [0.9, -0.2, 0.9], [0.1, 0.9, 0.85], [-0.1, -0.9, 0.85]]) {
      kit.add(white, new THREE.SphereGeometry(r, 16, 12), hat.x + dx, hat.y + 2.2, hat.z + dz);
    }
    staticBox({ cx: hat.x, cy: hat.y + 1.4, cz: hat.z, hx: 1.3, hy: 1.4, hz: 1.3 });

    // The front: two big windows under striped awnings, open glass doors with a green frame, and the name.
    const windows = [[b.x0 + 1.6, mid - 2.4], [mid + 2.4, b.x1 - 1.6]];
    const fz = b.z0;
    for (const [x0, x1] of windows) {
      kit.span(white, x0 - 0.12, 0.62, fz - 0.14, x1 + 0.12, 2.52, fz);
      kit.span(glass, x0, 0.74, fz - 0.17, x1, 2.4, fz - 0.1);
      for (let x = x0 + 2; x < x1 - 0.5; x += 2) kit.box(white, x, 1.57, fz - 0.18, 0.08, 1.66, 0.06);
      kit.span(white, x0 - 0.2, 0.55, fz - 0.4, x1 + 0.2, 0.65, fz); // sill
      // The awning: red and white stripes sloping out from the wall.
      const stripes = Math.round((x1 - x0 + 0.4) / 0.5);
      const sw = (x1 - x0 + 0.4) / stripes;
      for (let k = 0; k < stripes; k++) kit.box(k % 2 ? white : red, x0 - 0.2 + sw * (k + 0.5), 2.75, fz - 0.6, sw, 0.08, 1.3, 0, -0.45);
      kit.span(red, x0 - 0.2, 2.35, fz - 1.2, x1 + 0.2, 2.55, fz - 1.15); // the valance
    }
    // Side and back windows (just looks: the furniture inside stands against these walls).
    for (const z of [b.z0 + 3, b.z0 + 6.5]) for (const x of [b.x0 - 0.06, b.x1 + 0.06]) kit.box(glass, x, 1.6, z, 0.12, 1.5, 2);
    kit.span(green, door.x0 - 0.15, 0, fz - 0.14, door.x0, door.h + 0.15, fz + 0.02);
    kit.span(green, door.x1, 0, fz - 0.14, door.x1 + 0.15, door.h + 0.15, fz + 0.02);
    kit.span(green, door.x0 - 0.15, door.h, fz - 0.14, door.x1 + 0.15, door.h + 0.15, fz + 0.02);
    const half = (door.x1 - door.x0) / 2;
    for (const x of [door.x0 + 0.05, door.x1 - 0.05]) kit.box(clearGlass, x, door.h / 2, fz + wall + half / 2, 0.06, door.h - 0.1, half); // swung open
    kit.box(red, mid, door.h + 0.35, fz - 0.7, 3.4, 0.12, 1.4); // a little canopy over the door
    picture(shopSign, 8, 1.25, mid, 3.75, fz - 0.16, Math.PI);
    // Out on the terrace: two tables under umbrellas, plants by the door and a board with today's dish.
    for (const x of [b.x0 + 3.5, b.x1 - 3.5]) {
      const z = rect.z0 + 4.8;
      kit.cylinder(white, x, 0.55, z, 0.55, 0.55, 0.06, 16);
      kit.cylinder(dark, x, 0.27, z, 0.05, 0.08, 0.54, 8);
      kit.cylinder(dark, x, 1.2, z, 0.035, 0.035, 1.3, 6);
      kit.add(kit.plastic(0x2e7d32), new THREE.ConeGeometry(1.25, 0.45, 8), x, 2, z);
      for (const s of [-1, 1]) kit.cylinder(red, x + s * 0.85, 0.33, z, 0.22, 0.22, 0.06, 12);
      solid(x - 0.55, z - 0.55, x + 0.55, z + 0.55, 0.6);
    }
    plant(door.x0 - 1, fz - 0.7, 1.2);
    plant(door.x1 + 1, fz - 0.7, 1.2);
    const board = { x: mid + 3.2, z: fz - 2.2 };
    for (const s of [-1, 1]) kit.box(darkWood, board.x, 0.55, board.z + s * 0.15, 0.8, 1.1, 0.05, 0, -s * 0.25);
    picture(canvasTexture(256, 320, g => drawToday(g, 256, 320)), 0.66, 0.84, board.x, 0.6, board.z - 0.21, Math.PI).rotation.x = 0.25;
  }

  // --- inside: floors, walls, ceilings ---
  {
    // Warm wooden boards in the dining room; black and white tiles in the kitchen.
    kit.span(wood, D.x0, lift, D.z0, D.x1, top, D.z1);
    kit.span(wood, door.x0, lift, b.z0, door.x1, top, b.z0 + wall);
    const tileWhite = kit.plastic(0xfafafa);
    const tileBlack = kit.plastic(0x37474f);
    kit.span(tileWhite, kitchenDoor.x0, lift, divider.z0, kitchenDoor.x1, top, divider.z1);
    const tile = 1.05;
    for (let x = K.x0, i = 0; x < K.x1 - 1e-6; x += tile, i++) {
      for (let z = K.z0, j = 0; z < K.z1 - 1e-6; z += tile, j++) {
        kit.span((i + j) % 2 ? tileBlack : tileWhite, x, lift, z, Math.min(x + tile, K.x1), top, Math.min(z + tile, K.z1));
      }
    }
    // Painted walls in the dining room, white tiles in the kitchen; white ceilings with lights.
    const plaster = kit.plastic(0xfff3c4);
    const tiles = kit.plastic(0xffffff, { look: 'bricks' });
    const ceilingWhite = kit.plastic(0xffffff, { emissive: 0xfffdf5, emissiveIntensity: 0.45 }); // lit by its lamps, not left grey in the roof's shadow
    for (const [room, paint] of [[D, plaster], [K, tiles]]) {
      kit.span(paint, room.x0, top, room.z0, room.x0 + 0.02, ceiling, room.z1);
      kit.span(paint, room.x1 - 0.02, top, room.z0, room.x1, ceiling, room.z1);
      kit.span(ceilingWhite, room.x0, ceiling - 0.03, room.z0, room.x1, ceiling, room.z1);
    }
    kit.span(plaster, D.x0, top, D.z0, door.x0, ceiling, D.z0 + 0.02); // front, round the door
    kit.span(plaster, door.x1, top, D.z0, D.x1, ceiling, D.z0 + 0.02);
    kit.span(plaster, door.x0, door.h, D.z0, door.x1, ceiling, D.z0 + 0.02);
    kit.span(tiles, K.x0, top, K.z1 - 0.02, K.x1, ceiling, K.z1);
    // Daylight in the front windows, seen from inside.
    for (const [x0, x1] of [[b.x0 + 1.6, mid - 2.4], [mid + 2.4, b.x1 - 1.6]]) kit.span(daylight, x0, 0.74, D.z0 + 0.02, x1, 2.4, D.z0 + 0.04);
    // Strip lights in the kitchen.
    for (let x = K.x0 + 3; x < K.x1 - 2; x += 5) for (const z of [K.z0 + 3, K.z1 - 4]) kit.box(lamp, x, ceiling - 0.05, z, 2, 0.04, 0.3);
    // Round the serving hatches: a wooden ledge on the dining side, a steel shelf on the kitchen side, and the
    // heat lamps that keep the food warm.
    for (const h of hatches) {
      kit.span(darkWood, h.x0, h.y0 - 0.05, divider.z0 - 0.3, h.x1, h.y0, divider.z1);
      kit.span(steel, h.x0, h.y0 - 0.05, divider.z1, h.x1, h.y0, divider.z1 + 0.7);
      kit.span(steel, h.x0, 0, divider.z1, h.x1, h.y0 - 0.05, divider.z1 + 0.68);
      solid(h.x0, divider.z1, h.x1, divider.z1 + 0.7, h.y0);
      kit.span(steel, h.x0 + 0.2, h.y1 - 0.02, divider.z1, h.x1 - 0.2, h.y1 + 0.06, divider.z1 + 0.35);
      kit.span(fireGlow, h.x0 + 0.3, h.y1 - 0.05, divider.z1 + 0.1, h.x1 - 0.3, h.y1 - 0.02, divider.z1 + 0.3);
    }
    tag('👨‍🍳 KITCHEN', GREEN, 2, mid, kitchenDoor.h + 0.4, divider.z0 - 0.01, Math.PI);
    tag('🍽️ DINING ROOM', '#8d5a3b', 2, mid, kitchenDoor.h + 0.4, divider.z1 + 0.01, 0);
  }

  // --- the dining room: gingham tables, green chairs, lamps over each table, the menu and two hungry diners ---
  {
    const tableTop = 0.5;
    const seat = 0.32;
    const chair = kit.plastic(0x43a047);
    const check = [red, white];
    const tables = [];
    for (const x of [D.x0 + 4.2, D.x0 + 8, D.x1 - 8, D.x1 - 4.2]) for (const z of [D.z0 + 2.8, D.z0 + 6.2]) tables.push({ x, z });
    for (const t of tables) {
      // A gingham cloth: 4 × 4 red and white checks.
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        kit.box(check[(i + j) % 2], t.x - 0.36 + i * 0.24, tableTop, t.z - 0.36 + j * 0.24, 0.24, 0.05, 0.24);
      }
      kit.cylinder(dark, t.x, tableTop / 2, t.z, 0.06, 0.06, tableTop, 8);
      kit.cylinder(dark, t.x, 0.02, t.z, 0.3, 0.3, 0.04, 12);
      solid(t.x - 0.48, t.z - 0.48, t.x + 0.48, t.z + 0.48, tableTop + 0.03);
      for (const s of [-1, 1]) {
        const cx = t.x + s * 0.75;
        kit.span(chair, cx - 0.2, seat - 0.05, t.z - 0.2, cx + 0.2, seat, t.z + 0.2);
        kit.span(chair, cx + s * 0.17, seat, t.z - 0.2, cx + s * 0.22, seat + 0.45, t.z + 0.2);
        for (const dx of [-0.16, 0.16]) for (const dz of [-0.16, 0.16]) kit.box(dark, cx + dx, (seat - 0.05) / 2, t.z + dz, 0.04, seat - 0.05, 0.04);
        solid(cx - 0.22, t.z - 0.22, cx + 0.22, t.z + 0.22, seat + 0.45);
        // A plate, a fork and a glass at each place.
        kit.cylinder(white, t.x + s * 0.24, tableTop + 0.035, t.z, 0.14, 0.14, 0.02, 16);
        kit.box(darkSteel, t.x + s * 0.24, tableTop + 0.03, t.z + 0.2, 0.02, 0.01, 0.16);
        kit.cylinder(clearGlass, t.x + s * 0.24, tableTop + 0.09, t.z - 0.2, 0.045, 0.04, 0.13, 10);
      }
      // A pendant lamp over the table.
      kit.box(dark, t.x, (ceiling + 2.1) / 2, t.z, 0.02, ceiling - 2.1, 0.02);
      kit.add(green, new THREE.ConeGeometry(0.3, 0.25, 16, 1, true), t.x, 2.0, t.z);
      kit.add(lamp, new THREE.SphereGeometry(0.1, 10, 8), t.x, 1.92, t.z);
    }
    // Food on two of the tables: a burger and chips, and a bowl of koshari.
    const burgerAt = (x, y, z) => {
      kit.cylinder(kit.plastic(0xe0a050), x, y + 0.02, z, 0.08, 0.08, 0.03, 12);
      kit.cylinder(kit.plastic(0x5d4037), x, y + 0.05, z, 0.085, 0.085, 0.03, 12);
      kit.cylinder(kit.plastic(0x7cb342), x, y + 0.07, z, 0.09, 0.09, 0.01, 12);
      kit.add(kit.plastic(0xe0a050), new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), x, y + 0.075, z);
    };
    const chipsAt = (x, y, z) => {
      for (let k = 0; k < 6; k++) kit.box(kit.plastic(0xffca28), x - 0.05 + (k % 3) * 0.05, y + 0.02, z - 0.03 + Math.floor(k / 3) * 0.06, 0.02, 0.02, 0.09, k * 0.5);
    };
    const koshariAt = (x, y, z) => {
      kit.cylinder(white, x, y + 0.04, z, 0.12, 0.07, 0.08, 14);
      kit.cylinder(kit.plastic(0xd84315), x, y + 0.08, z, 0.11, 0.11, 0.01, 14); // tomato sauce
      for (const [dx, dz] of [[0.03, 0.02], [-0.04, 0], [0, -0.04]]) kit.box(kit.plastic(0x6d4c41), x + dx, y + 0.09, z + dz, 0.04, 0.015, 0.02); // crispy onions
    };
    const t1 = tables[2];
    const t2 = tables[5];
    burgerAt(t1.x - 0.24, tableTop + 0.04, t1.z);
    chipsAt(t1.x - 0.24, tableTop + 0.04, t1.z + 0.08);
    koshariAt(t2.x + 0.24, tableTop + 0.04, t2.z);
    person({ head: 'cap', headColor: 'blue', face: 'grin', skin: 'tan', shirt: 'orange', print: 'star', pants: 'blue' }, t1.x - 0.75, t1.z, Math.PI / 2, { sit: true, y: seat });
    person({ head: 'long', headColor: 'black', face: 'happy', skin: 'brown', shirt: 'purple', print: 'plain', pants: 'black' }, t2.x + 0.75, t2.z, -Math.PI / 2, { sit: true, y: seat });
    // A table reserved for someone special...
    const reserved = tables[6];
    const card = own(new THREE.MeshStandardMaterial({ map: canvasTexture(256, 128, g => drawReserved(g, 256, 128)), roughness: 0.45 }));
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(0.3, 0.15)), card);
      m.position.set(reserved.x + s * 0.03, tableTop + 0.1, reserved.z);
      m.rotation.set(0, (s * Math.PI) / 2, s * 0); // one face each way
      m.rotation.order = 'YXZ';
      m.rotation.x = -0.2;
      scene.add(m);
    }
    // The waiter, with a tray, in the aisle.
    person({ head: 'spiky', headColor: 'black', face: 'happy', skin: 'light', shirt: 'black', print: 'plain', pants: 'black' }, mid + 1.4, D.z0 + 4.4, Math.PI);
    kit.cylinder(darkSteel, mid + 1.62, 0.66, D.z0 + 4.15, 0.22, 0.22, 0.02, 16);
    kit.cylinder(kit.plastic(0xff9800, { transparent: true, opacity: 0.8 }), mid + 1.62, 0.73, D.z0 + 4.15, 0.04, 0.035, 0.12, 10); // orange juice
    // The menu on the west wall, the name on the east wall, plants in the corners.
    picture(canvasTexture(512, 400, g => drawMenu(g, 512, 400)), 2.8, 2.2, D.x0 + 0.04, 2.1, (D.z0 + D.z1) / 2, Math.PI / 2);
    picture(shopSign, 5, 0.78, D.x1 - 0.04, 2.9, (D.z0 + D.z1) / 2, -Math.PI / 2);
    plant(D.x0 + 0.6, D.z1 - 0.6);
    plant(D.x1 - 0.6, D.z1 - 0.6);
    plant(D.x0 + 0.6, D.z0 + 0.6);
    plant(D.x1 - 0.6, D.z0 + 0.6);
  }

  // --- the kitchen ---
  const flames = []; // { x, y, z, s, phase }, flickered in update
  const steam = []; // { x, y, z, rise, phase, size }: puffs that rise and fade
  {
    const wx = K.x0; // west wall
    const ex = K.x1; // east wall
    const bz = K.z1; // back wall
    const worktop = (x0, z0, x1, z1, h = COUNTER, body = white) => {
      kit.span(body, x0, 0, z0, x1, h - 0.05, z1);
      kit.span(steel, x0 - 0.02, h - 0.05, z0 - 0.02, x1 + 0.02, h, z1 + 0.02);
      solid(x0, z0, x1, z1, h);
    };
    const knob = (x, y, z) => kit.cylinder(black, x, y, z, 0.03, 0.03, 0.03, 10, 0, Math.PI / 2);

    // West wall: the fridge (one door open: milk, cheese, juice, eggs and a cake inside), the freezer, and the
    // pantry shelves.
    {
      const z0 = K.z0 + 0.9;
      const z1 = z0 + 1.6;
      const zm = (z0 + z1) / 2;
      const front = wx + 0.75;
      const H = 1.8;
      kit.span(steel, wx, 0, z0, front, 0.05, z1); // floor of the cabinet
      kit.span(steel, wx, H - 0.05, z0, front, H, z1);
      kit.span(steel, wx, 0, z0, front, H, z0 + 0.05);
      kit.span(steel, wx, 0, z1 - 0.05, front, H, z1);
      kit.span(steel, wx, 0, z0, wx + 0.05, H, z1);
      kit.span(steel, wx, 0, zm - 0.03, front, H, zm + 0.03);
      kit.span(steel, front, 0.02, z0, front + 0.06, H - 0.02, zm); // the closed left door
      kit.box(darkSteel, front + 0.09, 1.0, zm - 0.12, 0.04, 0.6, 0.04); // its handle
      kit.span(lamp, wx + 0.05, H - 0.1, zm + 0.03, front - 0.1, H - 0.06, z1 - 0.05); // the light inside
      kit.span(kit.plastic(0xf1f8ff), wx + 0.05, 0.05, zm + 0.03, wx + 0.07, H - 0.05, z1 - 0.05);
      for (const y of [0.45, 0.85, 1.25]) kit.span(clearGlass, wx + 0.05, y - 0.01, zm + 0.03, front - 0.02, y + 0.01, z1 - 0.05);
      // On the shelves, from the bottom: vegetables, then milk and juice, then eggs, cheese and a cake.
      const shelfFront = front - 0.25;
      kit.add(kit.plastic(0x7cb342), new THREE.SphereGeometry(0.1, 10, 8), shelfFront, 0.16, zm + 0.25); // a lettuce
      for (let k = 0; k < 3; k++) kit.cylinder(kit.plastic(0xff7043), shelfFront - 0.1, 0.1 + k * 0.001, zm + 0.5 + k * 0.08, 0.02, 0.01, 0.16, 6, Math.PI / 2); // carrots
      kit.add(red, new THREE.SphereGeometry(0.06, 10, 8), shelfFront + 0.05, 0.12, zm + 0.62); // a tomato
      kit.cylinder(white, shelfFront, 0.58, zm + 0.2, 0.06, 0.06, 0.22, 10); // milk
      kit.cylinder(kit.plastic(0x1e88e5), shelfFront, 0.71, zm + 0.2, 0.03, 0.03, 0.04, 8);
      kit.span(kit.plastic(0xff9800), shelfFront - 0.06, 0.46, zm + 0.42, shelfFront + 0.06, 0.72, zm + 0.54); // juice
      kit.span(kit.plastic(0xffe082), shelfFront - 0.08, 0.86, zm + 0.12, shelfFront + 0.08, 0.92, zm + 0.42); // an egg box
      for (let k = 0; k < 3; k++) kit.add(kit.plastic(0xfff8e1), new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1.3, 1), shelfFront, 0.95, zm + 0.17 + k * 0.1);
      kit.add(kit.plastic(0xffd54f), new THREE.CylinderGeometry(0.1, 0.1, 0.08, 3), shelfFront, 0.9, zm + 0.62); // a wedge of cheese
      kit.cylinder(kit.plastic(0xf8bbd0), shelfFront, 1.33, zm + 0.4, 0.13, 0.13, 0.14, 16); // a pink cake
      kit.add(red, new THREE.SphereGeometry(0.03, 8, 6), shelfFront, 1.42, zm + 0.4);
      // The open right door, swung out into the room, with bottles in its door shelves.
      const hinge = { x: front, z: z1 };
      const angle = 1.75; // how far it's swung open (radians from shut)
      const dir = { x: Math.sin(angle), z: -Math.cos(angle) }; // from the hinge to the door's free edge
      const rotY = Math.atan2(dir.x, dir.z);
      const dw = zm - z0;
      const c = { x: hinge.x + (dir.x * dw) / 2, z: hinge.z + (dir.z * dw) / 2 };
      const inner = { x: -Math.cos(angle), z: -Math.sin(angle) }; // the way the door's inside faces
      kit.box(steel, c.x, H / 2, c.z, 0.06, H - 0.04, dw, rotY);
      for (const y of [0.5, 1.1]) kit.box(clearGlass, c.x + inner.x * 0.08, y, c.z + inner.z * 0.08, 0.1, 0.12, dw - 0.15, rotY);
      for (const [t, hex] of [[0.3, 0x43a047], [0.5, 0xe53935], [0.7, 0xfdd835]]) {
        kit.cylinder(kit.plastic(hex), hinge.x + dir.x * dw * t + inner.x * 0.08, 1.2, hinge.z + dir.z * dw * t + inner.z * 0.08, 0.03, 0.03, 0.18, 8);
      }
      solid(wx, z0, front + 0.1, z1, H);
      solid(Math.min(hinge.x, hinge.x + dir.x * dw) - 0.05, Math.min(hinge.z, hinge.z + dir.z * dw) - 0.05, Math.max(hinge.x, hinge.x + dir.x * dw) + 0.05, Math.max(hinge.z, hinge.z + dir.z * dw) + 0.05, H);
      tag('🧊 FRIDGE', '#1e88e5', 1.2, wx + 0.01, H + 0.35, zm, Math.PI / 2);

      // The freezer: frosty blue, two shut doors, a thermometer showing how cold it is.
      const f0 = z1 + 0.35;
      const f1 = f0 + 1.5;
      const fm = (f0 + f1) / 2;
      const frost = kit.plastic(0xb3e5fc, { metalness: 0.3, roughness: 0.25 });
      kit.span(frost, wx, 0, f0, front, H, f1);
      kit.span(white, front, 0.02, f0 + 0.02, front + 0.04, H - 0.02, fm - 0.01);
      kit.span(white, front, 0.02, fm + 0.01, front + 0.04, H - 0.02, f1 - 0.02);
      for (const dz of [-0.1, 0.1]) kit.box(darkSteel, front + 0.07, 1.0, fm + dz, 0.04, 0.6, 0.04);
      kit.span(kit.plastic(0x0d47a1), front + 0.04, 1.45, fm + 0.25, front + 0.05, 1.65, fm + 0.55); // the little display
      kit.span(kit.glow(0x80d8ff), front + 0.05, 1.5, fm + 0.3, front + 0.06, 1.6, fm + 0.5);
      solid(wx, f0, front + 0.1, f1, H);
      tag('❄️ FREEZER', '#0288d1', 1.2, wx + 0.01, H + 0.35, fm, Math.PI / 2);

      // The pantry: shelves of sacks, jars and tins.
      const p0 = f1 + 0.4;
      const p1 = p0 + 3.2;
      kit.span(darkWood, wx, 0, p0, wx + 0.05, 1.9, p1);
      for (const z of [p0, p1 - 0.05]) kit.span(darkWood, wx, 0, z, wx + 0.55, 1.9, z + 0.05);
      const jarColors = [0xe53935, 0xfdd835, 0x43a047, 0xfb8c00, 0x8e24aa, 0x6d4c41];
      [0.05, 0.6, 1.15, 1.7].forEach((y, row) => {
        kit.span(darkWood, wx, y, p0, wx + 0.55, y + 0.04, p1);
        if (row === 3) return;
        for (let z = p0 + 0.25, k = 0; z < p1 - 0.2; z += row === 0 ? 0.5 : 0.24, k++) {
          if (row === 0) { // sacks of rice and flour
            kit.box(kit.plastic(k % 2 ? 0xf5f5dc : 0xd7ccc8, { roughness: 0.9 }), wx + 0.28, y + 0.24, z, 0.38, 0.4, 0.38);
            kit.box(kit.plastic(0x8d6e63), wx + 0.28, y + 0.46, z, 0.2, 0.06, 0.2);
          } else if (row === 1) { // jars with coloured lids
            kit.cylinder(clearGlass, wx + 0.28, y + 0.14, z, 0.08, 0.08, 0.2, 10);
            kit.cylinder(kit.plastic(jarColors[k % jarColors.length]), wx + 0.28, y + 0.1, z, 0.07, 0.07, 0.12, 10);
            kit.cylinder(kit.plastic(jarColors[(k + 2) % jarColors.length]), wx + 0.28, y + 0.26, z, 0.085, 0.085, 0.04, 10);
          } else { // tins
            kit.cylinder(darkSteel, wx + 0.28, y + 0.12, z, 0.07, 0.07, 0.2, 10);
            kit.cylinder(kit.plastic(jarColors[(k + 3) % jarColors.length]), wx + 0.28, y + 0.12, z, 0.072, 0.072, 0.1, 10);
          }
        }
      });
      solid(wx, p0, wx + 0.55, p1, 1.9);
      tag('🥫 PANTRY', '#6d4c41', 1.2, wx + 0.01, 2.25, (p0 + p1) / 2, Math.PI / 2);
    }

    // The back corner: a domed brick bread oven with a fire inside, and its chimney up through the roof.
    const oven = { x: wx + 1.5, z: bz - 1.5, r: 1.1, base: 0.6 };
    {
      const brick = kit.plastic(0xbf5b30, { look: 'bricks' });
      kit.span(brick, wx, 0, bz - 2.9, wx + 2.9, oven.base, bz);
      kit.add(brick, new THREE.SphereGeometry(oven.r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), oven.x, oven.base, oven.z);
      const mouth = { z: oven.z - oven.r + 0.05 };
      kit.box(kit.plastic(0x8d3a1a), oven.x, oven.base + 0.38, mouth.z - 0.06, 0.95, 0.75, 0.16); // the arch round the mouth
      kit.box(black, oven.x, oven.base + 0.3, mouth.z - 0.15, 0.62, 0.48, 0.04);
      kit.span(fireGlow, oven.x - 0.25, oven.base, mouth.z - 0.2, oven.x + 0.25, oven.base + 0.04, mouth.z - 0.16); // embers
      for (let k = 0; k < 5; k++) flames.push({ x: oven.x - 0.2 + k * 0.1, y: oven.base + 0.12, z: mouth.z - 0.19, s: k % 2 ? 0.7 : 1, phase: k * 1.3 });
      // Logs stacked under the oven's front.
      for (let k = 0; k < 3; k++) kit.cylinder(kit.plastic(0x6d4c41), wx + 3.1, 0.07 + k * 0.13, bz - 0.5 - (k % 2) * 0.15, 0.065, 0.065, 0.7, 8, 0, Math.PI / 2);
      // A wooden peel leaning on it.
      kit.box(wood, wx + 2.95, 1.1, bz - 1.6, 0.04, 1, 0.05);
      kit.box(wood, wx + 2.95, 0.45, bz - 1.6, 0.03, 0.3, 0.35);
      solid(wx, bz - 2.9, wx + 2.9, bz, oven.base + oven.r);
      // The chimney: from the dome's top up through the ceiling and out of the roof.
      const ch = { x: oven.x, z: oven.z + 0.4 };
      kit.span(brick, ch.x - 0.3, oven.base + oven.r - 0.2, ch.z - 0.3, ch.x + 0.3, b.h + 1.6, ch.z + 0.3);
      kit.span(dark, ch.x - 0.36, b.h + 1.6, ch.z - 0.36, ch.x + 0.36, b.h + 1.75, ch.z + 0.36);
      staticBox({ cx: ch.x, cy: (b.h + b.h + 1.75) / 2, cz: ch.z, hx: 0.36, hy: 0.875, hz: 0.36 });
      for (let k = 0; k < 6; k++) steam.push({ x: ch.x, y: b.h + 1.8, z: ch.z, rise: 2.6, phase: k / 6, size: 0.55, smoke: true });
      tag('🍞 BREAD OVEN', '#bf5b30', 1.3, ch.x, 2.35, ch.z - 0.31, Math.PI);
    }

    // Along the back wall, under a big steel hood: the fryer, the stove with its oven, and the grill.
    const line = { z0: bz - 0.8, z1: bz };
    const fryer = { x0: wx + 3.4, x1: wx + 4.4 };
    const stove = { x0: fryer.x1 + 0.05, x1: fryer.x1 + 2.45 };
    const grill = { x0: stove.x1 + 0.05, x1: stove.x1 + 1.45 };
    {
      // The fryer: two baskets in hot oil, one lifted out full of chips.
      worktop(fryer.x0, line.z0, fryer.x1, line.z1, COUNTER, steel);
      for (const s of [-1, 1]) {
        const x = (fryer.x0 + fryer.x1) / 2 + s * 0.24;
        kit.span(kit.plastic(0xffb300, { emissive: 0xff8f00, emissiveIntensity: 0.25 }), x - 0.18, COUNTER, line.z0 + 0.15, x + 0.18, COUNTER + 0.01, line.z1 - 0.15);
        kit.box(darkSteel, x, COUNTER + 0.07, line.z0 + 0.12, 0.03, 0.14, 0.03);
      }
      const bx = (fryer.x0 + fryer.x1) / 2 + 0.24;
      kit.span(darkSteel, bx - 0.16, COUNTER + 0.2, line.z0 + 0.2, bx + 0.16, COUNTER + 0.22, line.z1 - 0.2);
      for (let k = 0; k < 8; k++) kit.box(kit.plastic(0xffca28), bx - 0.11 + (k % 4) * 0.07, COUNTER + 0.26, line.z0 + 0.3 + Math.floor(k / 4) * 0.12, 0.025, 0.025, 0.14, k * 0.4);
      kit.box(black, bx, COUNTER + 0.3, line.z0 + 0.05, 0.04, 0.04, 0.3); // the basket's handle
      for (let k = 0; k < 4; k++) steam.push({ x: (fryer.x0 + fryer.x1) / 2 - 0.24, y: COUNTER + 0.05, z: (line.z0 + line.z1) / 2, rise: 0.6, phase: k / 4, size: 0.12 });

      // The stove: six burners (blue flames under the pots), the oven under it with a glowing window and a
      // roast chicken inside.
      kit.span(steel, stove.x0, 0, line.z0, stove.x1, COUNTER - 0.04, line.z1);
      kit.span(black, stove.x0, COUNTER - 0.04, line.z0, stove.x1, COUNTER, line.z1);
      solid(stove.x0, line.z0, stove.x1, line.z1, COUNTER);
      const burners = [];
      for (const fx of [0.4, 1.2, 2.0]) for (const fz of [0.22, 0.56]) burners.push({ x: stove.x0 + fx, z: line.z0 + fz });
      for (const p of burners) kit.cylinder(darkSteel, p.x, COUNTER + 0.01, p.z, 0.12, 0.12, 0.02, 14);
      for (let k = 0; k < 6; k++) knob(stove.x0 + 0.3 + k * 0.36, COUNTER - 0.1, line.z0 - 0.02);
      kit.span(dark, stove.x0 + 0.15, 0.1, line.z0 - 0.02, stove.x1 - 0.15, COUNTER - 0.18, line.z0);
      kit.span(kit.glow(0xffab40), stove.x0 + 0.5, 0.2, line.z0 - 0.03, stove.x1 - 0.5, COUNTER - 0.28, line.z0 - 0.02);
      kit.box(darkSteel, (stove.x0 + stove.x1) / 2, COUNTER - 0.22, line.z0 - 0.07, 1.6, 0.03, 0.03); // the oven handle
      kit.add(kit.plastic(0xa1622f), new THREE.SphereGeometry(0.12, 12, 8).scale(1.3, 0.8, 1), (stove.x0 + stove.x1) / 2, 0.3, line.z0 + 0.2); // a roast chicken
      // A big soup pot, a red saucepan and a frying pan with eggs.
      const [b0, , b2, b3, b4, b5] = burners;
      kit.cylinder(darkSteel, b3.x, COUNTER + 0.24, b3.z, 0.24, 0.22, 0.46, 18);
      kit.cylinder(kit.plastic(0xfb8c00), b3.x, COUNTER + 0.46, b3.z, 0.21, 0.21, 0.01, 18); // the soup
      kit.cylinder(red, b5.x, COUNTER + 0.12, b5.z, 0.15, 0.14, 0.22, 16);
      kit.box(black, b5.x + 0.28, COUNTER + 0.2, b5.z, 0.3, 0.03, 0.04);
      kit.cylinder(black, b0.x, COUNTER + 0.04, b0.z, 0.17, 0.14, 0.05, 16);
      kit.box(black, b0.x - 0.05, COUNTER + 0.06, b0.z - 0.32, 0.04, 0.03, 0.32);
      for (const dx of [-0.06, 0.07]) {
        kit.cylinder(white, b0.x + dx, COUNTER + 0.07, b0.z, 0.06, 0.06, 0.01, 12);
        kit.add(kit.plastic(0xffb300), new THREE.SphereGeometry(0.025, 8, 6), b0.x + dx, COUNTER + 0.08, b0.z);
      }
      for (const p of [b0, b2, b3, b4, b5]) for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + p.x;
        flames.push({ x: p.x + Math.cos(a) * 0.09, y: COUNTER + 0.02, z: p.z + Math.sin(a) * 0.09, s: 0.35, phase: k + p.z * 5, blue: true });
      }
      for (let k = 0; k < 5; k++) steam.push({ x: b3.x, y: COUNTER + 0.48, z: b3.z, rise: 1.1, phase: k / 5, size: 0.2 });
      for (let k = 0; k < 3; k++) steam.push({ x: b5.x, y: COUNTER + 0.24, z: b5.z, rise: 0.8, phase: k / 3, size: 0.13 });

      // The grill: a hot black griddle with burgers and sausages sizzling.
      worktop(grill.x0, line.z0, grill.x1, line.z1, COUNTER, steel);
      kit.span(black, grill.x0 + 0.05, COUNTER, line.z0 + 0.05, grill.x1 - 0.05, COUNTER + 0.03, line.z1 - 0.05);
      kit.span(fireGlow, grill.x0 + 0.1, COUNTER - 0.12, line.z0 - 0.025, grill.x1 - 0.1, COUNTER - 0.08, line.z0 - 0.01);
      for (const [dx, dz] of [[0.3, 0.25], [0.7, 0.25], [0.3, 0.55]]) kit.cylinder(kit.plastic(0x5d4037), grill.x0 + dx, COUNTER + 0.05, line.z0 + dz, 0.12, 0.12, 0.04, 14);
      for (const dz of [0.45, 0.6]) kit.cylinder(kit.plastic(0xa1522f), grill.x0 + 1.0, COUNTER + 0.06, line.z0 + dz, 0.035, 0.035, 0.3, 8, Math.PI / 2);
      kit.box(darkSteel, grill.x0 + 0.95, COUNTER + 0.06, line.z0 + 0.25, 0.25, 0.01, 0.15); // the spatula
      kit.box(black, grill.x0 + 1.12, COUNTER + 0.07, line.z0 + 0.12, 0.2, 0.025, 0.03);
      for (let k = 0; k < 3; k++) steam.push({ x: grill.x0 + 0.5, y: COUNTER + 0.06, z: line.z0 + 0.4, rise: 0.7, phase: k / 3, size: 0.14 });

      // The hood over all three, with lights underneath and a duct up into the ceiling.
      const hood = { x0: fryer.x0 - 0.2, x1: grill.x1 + 0.2, z0: line.z0 - 0.3, y0: 2.1, y1: 2.6 };
      kit.span(steel, hood.x0, hood.y0, hood.z0, hood.x1, hood.y1, bz);
      kit.span(lamp, hood.x0 + 0.2, hood.y0 - 0.02, hood.z0 + 0.2, hood.x1 - 0.2, hood.y0, bz - 0.3);
      const duct = { x: (stove.x0 + stove.x1) / 2 };
      kit.span(steel, duct.x - 0.5, hood.y1, bz - 0.7, duct.x + 0.5, ceiling, bz);
      tag('🍟 FRYER', '#f9a825', 1, (fryer.x0 + fryer.x1) / 2, hood.y0 + 0.25, hood.z0 - 0.01, Math.PI);
      tag('🔥 STOVE & OVEN', RED, 1.4, (stove.x0 + stove.x1) / 2, hood.y0 + 0.25, hood.z0 - 0.01, Math.PI);
      tag('🍔 GRILL', '#5d4037', 1, (grill.x0 + grill.x1) / 2, hood.y0 + 0.25, hood.z0 - 0.01, Math.PI);
      tag('💨 HOOD', '#546e7a', 1, duct.x, 3.35, bz - 0.71, Math.PI);
    }

    // The back counter: a coffee machine, a kettle, a toaster and a blender, with the spice shelves above.
    const counter = { x0: grill.x1 + 0.15, x1: grill.x1 + 8.6, z0: bz - 0.7 };
    {
      worktop(counter.x0, counter.z0, counter.x1, bz);
      for (let x = counter.x0 + 0.6; x < counter.x1; x += 1.2) kit.box(darkSteel, x, COUNTER - 0.15, counter.z0 - 0.02, 0.3, 0.03, 0.03);
      const at = k => counter.x0 + 0.7 + k * 1.3;
      const cz = counter.z0 + 0.35;
      // Coffee machine: a black box with a spout and a cup.
      kit.span(black, at(0) - 0.25, COUNTER, cz - 0.15, at(0) + 0.25, COUNTER + 0.55, cz + 0.3);
      kit.span(darkSteel, at(0) - 0.15, COUNTER + 0.35, cz - 0.25, at(0) + 0.15, COUNTER + 0.42, cz - 0.15);
      kit.cylinder(white, at(0), COUNTER + 0.05, cz - 0.2, 0.05, 0.04, 0.09, 10);
      kit.span(kit.glow(0x69f0ae), at(0) - 0.08, COUNTER + 0.47, cz - 0.16, at(0) + 0.08, COUNTER + 0.5, cz - 0.15);
      // Kettle: red, with a spout and a handle.
      kit.cylinder(red, at(1), COUNTER + 0.14, cz, 0.12, 0.14, 0.26, 14);
      kit.cylinder(red, at(1) - 0.16, COUNTER + 0.18, cz, 0.025, 0.035, 0.16, 8, 0.8);
      kit.box(black, at(1) + 0.15, COUNTER + 0.2, cz, 0.04, 0.2, 0.04);
      for (let k = 0; k < 3; k++) steam.push({ x: at(1) - 0.24, y: COUNTER + 0.26, z: cz, rise: 0.5, phase: k / 3, size: 0.08 });
      // Toaster: two slices popping up.
      kit.span(steel, at(2) - 0.18, COUNTER, cz - 0.12, at(2) + 0.18, COUNTER + 0.2, cz + 0.12);
      for (const dz of [-0.05, 0.05]) kit.box(kit.plastic(0xd7a056), at(2), COUNTER + 0.25, cz + dz, 0.22, 0.14, 0.02);
      kit.box(black, at(2) + 0.2, COUNTER + 0.12, cz, 0.03, 0.04, 0.05);
      // Blender: a jug of strawberry smoothie on a base.
      kit.span(dark, at(3) - 0.11, COUNTER, cz - 0.11, at(3) + 0.11, COUNTER + 0.14, cz + 0.11);
      kit.cylinder(kit.plastic(0xf06292, { transparent: true, opacity: 0.85 }), at(3), COUNTER + 0.3, cz, 0.1, 0.08, 0.32, 12);
      kit.cylinder(black, at(3), COUNTER + 0.48, cz, 0.1, 0.1, 0.04, 12);
      // Spice shelves on the wall, rows of little coloured jars.
      const spices = [0xd84315, 0xfdd835, 0x6d4c41, 0x43a047, 0xfb8c00, 0xb71c1c, 0x8d6e63, 0xf5f5f5];
      for (const y of [1.35, 1.75]) {
        kit.span(darkWood, at(0) - 0.4, y - 0.03, bz - 0.25, at(3) + 0.4, y, bz);
        for (let x = at(0) - 0.3, k = 0; x < at(3) + 0.35; x += 0.16, k++) {
          kit.cylinder(clearGlass, x, y + 0.07, bz - 0.12, 0.05, 0.05, 0.13, 8);
          kit.cylinder(kit.plastic(spices[(k + (y > 1.5 ? 3 : 0)) % spices.length]), x, y + 0.05, bz - 0.12, 0.045, 0.045, 0.09, 8);
          kit.cylinder(black, x, y + 0.15, bz - 0.12, 0.05, 0.05, 0.03, 8);
        }
      }
      tag('☕ COFFEE', '#5d4037', 0.9, at(0), 1.08, bz - 0.01, Math.PI);
      tag('🫖 KETTLE', RED, 0.9, at(1), 1.08, bz - 0.01, Math.PI);
      tag('🍞 TOASTER', '#f57c00', 0.9, at(2), 1.08, bz - 0.01, Math.PI);
      tag('🥤 BLENDER', '#d81b60', 0.9, at(3), 1.08, bz - 0.01, Math.PI);
      tag('🌶️ SPICES', '#bf360c', 1.2, (at(1) + at(2)) / 2, 2.25, bz - 0.01, Math.PI);
    }

    // The washing-up: the dishwasher (door down, a rack of plates), a big double sink with a tall tap, and
    // a rack of clean plates drying. Bins in the corner.
    {
      const x0 = counter.x1 + 0.2;
      const x1 = ex - 1.6;
      const z0 = bz - 0.75;
      const dish = { x0, x1: x0 + 1 };
      kit.span(steel, dish.x0, 0, z0 + 0.05, dish.x1, COUNTER - 0.05, bz);
      kit.span(steel, dish.x0, COUNTER - 0.05, z0 - 0.02, x1, COUNTER, bz); // the worktop
      kit.box(steel, (dish.x0 + dish.x1) / 2, 0.12, z0 - 0.3, 0.95, 0.04, 0.65); // its door, folded down
      kit.span(darkSteel, dish.x0 + 0.08, 0.2, z0 + 0.1, dish.x1 - 0.08, 0.23, bz - 0.1); // the rack, pulled out a bit
      for (let k = 0; k < 6; k++) kit.cylinder(white, dish.x0 + 0.2 + k * 0.12, 0.38, (z0 + bz) / 2, 0.14, 0.14, 0.015, 14, Math.PI / 2);
      kit.span(kit.glow(0x4fc3f7), dish.x1 - 0.3, COUNTER - 0.14, z0 - 0.02, dish.x1 - 0.1, COUNTER - 0.1, z0 - 0.01);
      solid(dish.x0, z0, dish.x1, bz, COUNTER);
      const sink = { x0: dish.x1 + 0.2, x1: dish.x1 + 2.2 };
      kit.span(white, sink.x0 - 0.2, 0, z0 + 0.03, x1, COUNTER - 0.05, bz);
      solid(sink.x0 - 0.2, z0, x1, bz, COUNTER);
      for (const s of [0, 1]) {
        const sx0 = sink.x0 + 0.1 + s * 0.95;
        kit.span(kit.plastic(0x78909c, { metalness: 0.6, roughness: 0.3 }), sx0, COUNTER - 0.02, z0 + 0.12, sx0 + 0.8, COUNTER + 0.005, bz - 0.15);
        kit.span(kit.plastic(0x4fc3f7, { transparent: true, opacity: 0.6 }), sx0 + 0.05, COUNTER + 0.006, z0 + 0.17, sx0 + 0.75, COUNTER + 0.012, bz - 0.2); // water
      }
      const tap = { x: sink.x0 + 1.05, z: bz - 0.08 };
      kit.cylinder(darkSteel, tap.x, COUNTER + 0.25, tap.z, 0.025, 0.03, 0.5, 8);
      kit.box(darkSteel, tap.x, COUNTER + 0.5, tap.z - 0.18, 0.04, 0.04, 0.36);
      kit.cylinder(darkSteel, tap.x, COUNTER + 0.45, tap.z - 0.34, 0.02, 0.02, 0.1, 8);
      kit.add(kit.plastic(0xfdd835, { roughness: 0.9 }), new THREE.BoxGeometry(0.12, 0.05, 0.08), sink.x0 + 0.05, COUNTER + 0.03, bz - 0.12); // a sponge
      kit.cylinder(kit.plastic(0x43a047), sink.x0 + 0.05, COUNTER + 0.1, bz - 0.25, 0.04, 0.04, 0.2, 8); // washing-up liquid
      // A rack of clean plates drying.
      const rackX = sink.x1 + 0.35;
      kit.span(darkSteel, rackX - 0.25, COUNTER, z0 + 0.15, rackX + 0.25, COUNTER + 0.03, bz - 0.15);
      for (let k = 0; k < 5; k++) kit.cylinder(white, rackX - 0.2 + k * 0.1, COUNTER + 0.16, (z0 + bz) / 2, 0.15, 0.15, 0.015, 14, Math.PI / 2);
      tag('🍽️ DISHWASHER', '#00838f', 1.1, (dish.x0 + dish.x1) / 2, 1.2, bz - 0.01, Math.PI);
      tag('🚰 SINK', '#0277bd', 0.9, (sink.x0 + sink.x1) / 2, 1.45, bz - 0.01, Math.PI);
      // Bins: green for rubbish, blue for recycling.
      for (const [dx, hex] of [[0.35, 0x2e7d32], [1.05, 0x1565c0]]) {
        kit.cylinder(kit.plastic(hex), ex - 1.6 + dx + 0.1, 0.3, bz - 0.4, 0.27, 0.23, 0.6, 14);
        kit.cylinder(kit.plastic(hex), ex - 1.6 + dx + 0.1, 0.62, bz - 0.4, 0.29, 0.29, 0.05, 14);
      }
      solid(ex - 1.5, bz - 0.7, ex, bz, 0.65);
      tag('♻️ BINS', '#1565c0', 0.9, ex - 0.8, 1.05, bz - 0.01, Math.PI);
    }

    // East wall: shelves of plates, bowls and cups; the fire extinguisher by the door.
    {
      const z0 = K.z0 + 6.6;
      const z1 = z0 + 3;
      const depth = 0.5;
      kit.span(steel, ex - depth, 0, z0, ex, 0.03, z1);
      for (const z of [z0, z1 - 0.04]) kit.span(darkSteel, ex - depth, 0, z, ex - depth + 0.04, 1.9, z + 0.04);
      [0.35, 0.8, 1.25, 1.7].forEach((y, row) => {
        kit.span(steel, ex - depth, y - 0.03, z0, ex, y, z1);
        for (let z = z0 + 0.3, k = 0; z < z1 - 0.2; z += 0.45, k++) {
          if (row < 2) for (let n = 0; n < 6; n++) kit.cylinder(white, ex - depth / 2, y + 0.01 + n * 0.025, z, 0.17, 0.15, 0.02, 14); // stacks of plates
          else if (row === 2) kit.cylinder(kit.plastic([0xfdd835, 0x4fc3f7, 0xef5350][k % 3]), ex - depth / 2, y + 0.07, z, 0.12, 0.07, 0.13, 12); // bowls
          else for (const dz of [-0.08, 0.08]) kit.cylinder(white, ex - depth / 2, y + 0.06, z + dz, 0.05, 0.045, 0.11, 10); // cups
        }
      });
      solid(ex - depth, z0, ex, z1, 1.9);
      tag('🍽️ PLATES', '#00897b', 1.1, ex - 0.01, 2.2, (z0 + z1) / 2, -Math.PI / 2);
      // Fire extinguisher on its bracket.
      const fe = { z: K.z0 + 1.6 };
      kit.cylinder(red, ex - 0.14, 0.75, fe.z, 0.1, 0.1, 0.5, 12);
      kit.add(red, new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), ex - 0.14, 1.0, fe.z);
      kit.box(black, ex - 0.14, 1.12, fe.z, 0.05, 0.08, 0.05);
      kit.box(black, ex - 0.22, 1.1, fe.z, 0.12, 0.03, 0.03);
      kit.cylinder(black, ex - 0.26, 0.85, fe.z, 0.015, 0.015, 0.45, 6);
      kit.span(dark, ex - 0.03, 0.55, fe.z - 0.08, ex, 1.0, fe.z + 0.08);
      tag('🧯 FIRE', RED, 0.8, ex - 0.01, 1.4, fe.z, -Math.PI / 2);
      // The microwave on its counter, beside the serving hatch.
      const mw = { x0: hatches[1].x1 + 0.3, x1: ex, z0: K.z0, z1: K.z0 + 0.7 };
      worktop(mw.x0, mw.z0, mw.x1, mw.z1);
      const mx = (mw.x0 + mw.x1) / 2 - 0.2;
      kit.span(white, mx - 0.35, COUNTER, mw.z0 + 0.05, mx + 0.35, COUNTER + 0.4, mw.z1 - 0.1);
      kit.span(black, mx - 0.3, COUNTER + 0.05, mw.z1 - 0.1, mx + 0.12, COUNTER + 0.35, mw.z1 - 0.09);
      kit.span(kit.glow(0xffe082), mx - 0.26, COUNTER + 0.08, mw.z1 - 0.09, mx + 0.08, COUNTER + 0.32, mw.z1 - 0.085); // lit up, cooking
      kit.span(kit.glow(0x69f0ae), mx + 0.17, COUNTER + 0.28, mw.z1 - 0.1, mx + 0.3, COUNTER + 0.33, mw.z1 - 0.09);
      for (const y of [0.12, 0.2]) knob(mx + 0.23, COUNTER + y, mw.z1 - 0.08);
      tag('⚡ MICROWAVE', '#6a1b9a', 1.2, mx, COUNTER + 0.75, K.z0 + 0.01, 0);
    }

    // On the kitchen side of the hatches: dinners ready to go out, and the bell to say so.
    {
      const [h1, h2] = hatches;
      const y = h1.y0;
      const z = divider.z1 + 0.35;
      const plateAt = x => kit.cylinder(white, x, y + 0.015, z, 0.17, 0.15, 0.02, 16);
      const sx = [h1.x0 + 0.8, h1.x0 + 2.2, h1.x1 - 1.2];
      sx.forEach(plateAt);
      kit.add(kit.plastic(0xffca28), new THREE.SphereGeometry(0.11, 12, 8).scale(1, 0.5, 1), sx[0], y + 0.05, z); // an omelette
      kit.cylinder(kit.plastic(0xe0a050), sx[1], y + 0.06, z, 0.13, 0.13, 0.04, 16); // a pizza, for his pizza-shop friends
      kit.cylinder(red, sx[1], y + 0.085, z, 0.11, 0.11, 0.01, 16);
      for (const [dx, dz] of [[-0.05, 0.03], [0.05, -0.04], [0.02, 0.06]]) kit.cylinder(kit.plastic(0xfff59d), sx[1] + dx, y + 0.095, z + dz, 0.025, 0.025, 0.01, 8);
      for (const [dx, dz] of [[-0.05, 0], [0.04, -0.03], [0.03, 0.05]]) kit.add(kit.plastic(0x6d4c41), new THREE.SphereGeometry(0.04, 8, 6), sx[2] + dx, y + 0.06, z + dz); // falafel
      kit.add(kit.plastic(0x7cb342), new THREE.SphereGeometry(0.06, 8, 6).scale(1, 0.4, 1), sx[2] - 0.08, y + 0.04, z + 0.07);
      kit.add(gold, new THREE.SphereGeometry(0.07, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), h2.x0 + 0.5, y, z);
      kit.box(black, h2.x0 + 0.5, y + 0.08, z, 0.02, 0.03, 0.02);
      for (const x of [h2.x0 + 1.4, h2.x1 - 1.4]) plateAt(x);
      kit.cylinder(kit.plastic(0xf8bbd0), h2.x0 + 1.4, y + 0.08, z, 0.1, 0.1, 0.12, 14); // a slice of cake, nearly
      for (const dx of [-0.07, 0, 0.07]) kit.cylinder(kit.plastic(0xa1522f), h2.x1 - 1.4 + dx, y + 0.04, z, 0.025, 0.025, 0.22, 8, Math.PI / 2); // kebab skewers
    }

    // Two islands down the middle: the prep table (a chopping board, a knife, vegetables and a salad bowl) under
    // a rack of hanging pots and pans, and the baking table (a stand mixer, dough, a rolling pin and cupcakes).
    const islandZ = { z0: K.z0 + 5, z1: K.z0 + 6.4 };
    const prep = { x0: mid - 8.5, x1: mid - 3.5 };
    const bake = { x0: mid + 3.5, x1: mid + 8.5 };
    {
      for (const isl of [prep, bake]) {
        kit.span(steel, isl.x0, COUNTER - 0.05, islandZ.z0, isl.x1, COUNTER, islandZ.z1);
        kit.span(steel, isl.x0 + 0.1, 0.15, islandZ.z0 + 0.1, isl.x1 - 0.1, 0.18, islandZ.z1 - 0.1); // a low shelf
        for (const x of [isl.x0 + 0.05, isl.x1 - 0.05]) for (const z of [islandZ.z0 + 0.05, islandZ.z1 - 0.05]) kit.box(darkSteel, x, (COUNTER - 0.05) / 2, z, 0.05, COUNTER - 0.05, 0.05);
        solid(isl.x0, islandZ.z0, isl.x1, islandZ.z1, COUNTER);
      }
      const zc = (islandZ.z0 + islandZ.z1) / 2;
      // Prep: the board with a tomato cut in half, cucumber slices and a knife; carrots, a lettuce, a salad bowl.
      const bx = prep.x0 + 1.5;
      kit.span(wood, bx - 0.4, COUNTER, zc - 0.25, bx + 0.4, COUNTER + 0.04, zc + 0.25);
      kit.add(red, new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bx - 0.2, COUNTER + 0.04, zc - 0.05);
      kit.add(red, new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bx - 0.05, COUNTER + 0.04, zc + 0.08);
      for (let k = 0; k < 4; k++) kit.cylinder(kit.plastic(0xc5e1a5), bx + 0.12 + k * 0.05, COUNTER + 0.05, zc - 0.05, 0.035, 0.035, 0.015, 10);
      kit.box(kit.plastic(0xeceff1, { metalness: 0.7, roughness: 0.2 }), bx + 0.15, COUNTER + 0.05, zc + 0.15, 0.3, 0.008, 0.05, 0.3);
      kit.box(black, bx - 0.04, COUNTER + 0.055, zc + 0.22, 0.14, 0.02, 0.035, 0.3);
      kit.cylinder(kit.plastic(0x388e3c), bx + 0.3, COUNTER + 0.06, zc + 0.05, 0.03, 0.03, 0.22, 8, Math.PI / 2); // a cucumber
      for (let k = 0; k < 3; k++) kit.cylinder(kit.plastic(0xff7043), prep.x0 + 2.6, COUNTER + 0.03, zc - 0.2 + k * 0.1, 0.025, 0.012, 0.22, 6, Math.PI / 2);
      kit.add(kit.plastic(0x8bc34a), new THREE.IcosahedronGeometry(0.13, 1), prep.x0 + 3.2, COUNTER + 0.1, zc + 0.15);
      kit.cylinder(white, prep.x1 - 0.9, COUNTER + 0.07, zc, 0.2, 0.12, 0.14, 16);
      kit.add(kit.plastic(0x7cb342), new THREE.SphereGeometry(0.17, 12, 8).scale(1, 0.4, 1), prep.x1 - 0.9, COUNTER + 0.14, zc); // salad
      for (const [dx, dz] of [[0.05, 0.05], [-0.06, 0.02], [0.02, -0.07]]) kit.add(red, new THREE.SphereGeometry(0.03, 8, 6), prep.x1 - 0.9 + dx, COUNTER + 0.18, zc + dz);
      // Pots on the shelf underneath.
      for (const [dx, hex] of [[0.6, 0x90a4ae], [1.5, 0xe53935], [3.4, 0x90a4ae]]) kit.cylinder(kit.plastic(hex, { metalness: 0.4, roughness: 0.3 }), prep.x0 + dx, 0.3, zc, 0.2, 0.18, 0.24, 14);
      // The rack of pots and pans, hanging from the ceiling.
      const rackY = 3.1; // high enough that the camera passes under the pans
      kit.span(dark, prep.x0 + 0.5, rackY, islandZ.z0 + 0.15, prep.x1 - 0.5, rackY + 0.05, islandZ.z0 + 0.2);
      kit.span(dark, prep.x0 + 0.5, rackY, islandZ.z1 - 0.2, prep.x1 - 0.5, rackY + 0.05, islandZ.z1 - 0.15);
      for (const x of [prep.x0 + 0.5, prep.x1 - 0.5]) {
        kit.span(dark, x - 0.025, rackY, islandZ.z0 + 0.15, x + 0.025, rackY + 0.05, islandZ.z1 - 0.15);
        kit.box(dark, x, (rackY + ceiling) / 2, zc, 0.02, ceiling - rackY, 0.02);
      }
      for (let k = 0; k < 7; k++) {
        const x = prep.x0 + 0.9 + k * 0.53;
        const z = k % 2 ? islandZ.z1 - 0.18 : islandZ.z0 + 0.18;
        kit.box(dark, x, rackY - 0.08, z, 0.015, 0.16, 0.015); // the hook
        if (k % 3 === 1) { // a ladle
          kit.box(darkSteel, x, rackY - 0.3, z, 0.02, 0.3, 0.02);
          kit.add(darkSteel, new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), x, rackY - 0.42, z);
        } else { // a frying pan or a saucepan, hanging by its handle
          const copper = k % 2 ? kit.plastic(0xd87a3c, { metalness: 0.6, roughness: 0.3 }) : black;
          kit.box(copper, x, rackY - 0.25, z, 0.03, 0.2, 0.02);
          kit.cylinder(copper, x, rackY - 0.5, z, 0.15, 0.15, 0.04, 16, 0, Math.PI / 2);
        }
      }
      tag('🍳 POTS & PANS', '#37474f', 1.3, (prep.x0 + prep.x1) / 2, rackY + 0.32, islandZ.z0 + 0.12, Math.PI);
      tag('🔪 CHOPPING', '#558b2f', 1.1, (prep.x0 + prep.x1) / 2, 0.42, islandZ.z0 - 0.01, Math.PI);

      // Baking: a red stand mixer with its bowl, a ball of dough and a rolling pin on a floury patch, a cake
      // on a stand and a tray of cupcakes.
      const mx = bake.x0 + 1;
      kit.span(red, mx - 0.15, COUNTER, zc - 0.12, mx + 0.15, COUNTER + 0.06, zc + 0.2);
      kit.span(red, mx - 0.08, COUNTER + 0.06, zc + 0.08, mx + 0.08, COUNTER + 0.42, zc + 0.2);
      kit.span(red, mx - 0.1, COUNTER + 0.36, zc - 0.18, mx + 0.1, COUNTER + 0.5, zc + 0.2);
      kit.cylinder(darkSteel, mx, COUNTER + 0.15, zc - 0.02, 0.12, 0.08, 0.17, 14);
      kit.cylinder(kit.plastic(0xfff8e1), mx, COUNTER + 0.2, zc - 0.02, 0.1, 0.1, 0.02, 14);
      kit.cylinder(darkSteel, mx, COUNTER + 0.3, zc - 0.05, 0.015, 0.015, 0.14, 6);
      const fx = bake.x0 + 2.4;
      kit.span(white, fx - 0.4, COUNTER, zc - 0.3, fx + 0.4, COUNTER + 0.005, zc + 0.3); // flour
      kit.add(kit.plastic(0xffecb3), new THREE.SphereGeometry(0.13, 12, 8).scale(1, 0.6, 1), fx - 0.1, COUNTER + 0.06, zc);
      kit.cylinder(wood, fx + 0.2, COUNTER + 0.04, zc, 0.04, 0.04, 0.4, 10, 0, Math.PI / 2);
      for (const s of [-1, 1]) kit.cylinder(darkWood, fx + 0.2, COUNTER + 0.04, zc + s * 0.26, 0.02, 0.02, 0.1, 8, 0, Math.PI / 2);
      kit.box(kit.plastic(0xd7ccc8, { roughness: 0.9 }), fx + 0.65, COUNTER + 0.18, zc + 0.15, 0.25, 0.36, 0.18); // a bag of flour
      const cx = bake.x1 - 1.4;
      kit.cylinder(white, cx, COUNTER + 0.08, zc, 0.04, 0.08, 0.16, 10);
      kit.cylinder(white, cx, COUNTER + 0.17, zc, 0.24, 0.24, 0.02, 20);
      kit.cylinder(kit.plastic(0x6d4c41), cx, COUNTER + 0.27, zc, 0.2, 0.2, 0.18, 20); // a chocolate cake
      kit.cylinder(kit.plastic(0xfff8e1), cx, COUNTER + 0.37, zc, 0.2, 0.2, 0.02, 20);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        kit.add(red, new THREE.SphereGeometry(0.025, 8, 6), cx + Math.cos(a) * 0.13, COUNTER + 0.4, zc + Math.sin(a) * 0.13);
      }
      kit.span(darkSteel, bake.x1 - 0.85, COUNTER, zc - 0.25, bake.x1 - 0.2, COUNTER + 0.02, zc + 0.25);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const x = bake.x1 - 0.7 + i * 0.17;
        const z = zc - 0.1 + j * 0.2;
        kit.cylinder(kit.plastic([0x4fc3f7, 0xf06292, 0xfdd835][i]), x, COUNTER + 0.06, z, 0.06, 0.045, 0.08, 10);
        kit.add(kit.plastic([0xfff8e1, 0xf8bbd0][j]), new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), x, COUNTER + 0.1, z);
      }
      tag('🥣 MIXER', RED, 0.9, mx, COUNTER + 0.85, zc, Math.PI);
      tag('🧁 BAKING', '#ad1457', 1.1, (bake.x0 + bake.x1) / 2, 0.42, islandZ.z0 - 0.01, Math.PI);
      kit.box(dark, mx, (COUNTER + 0.96 + ceiling) / 2, zc + 0.01, 0.01, ceiling - COUNTER - 0.96, 0.01); // the mixer's sign hangs on a wire
    }

    // The cooks: the chef chopping at the prep table, facing the door, and a cook at the stove.
    person(resolveRider('preset:chef'), (prep.x0 + prep.x1) / 2 + 0.2, islandZ.z1 + 0.5, Math.PI);
    person({ head: 'chefHat', face: 'grin', skin: 'light', shirt: 'white', print: 'plain', pants: 'blue' }, (stove.x0 + stove.x1) / 2, line.z0 - 0.6, 0);
    person({ head: 'chefHat', face: 'happy', skin: 'tan', shirt: 'white', print: 'stripe', pants: 'black' }, (bake.x0 + bake.x1) / 2 + 0.3, islandZ.z1 + 0.5, Math.PI);
  }

  // --- the name signs: one picture for all of them, one mesh ---
  {
    if (tags.length > 2 * ATLAS_ROWS) throw new Error(`too many restaurant signs: ${tags.length}`);
    const texture = canvasTexture(2 * SLOT_W, ATLAS_ROWS * SLOT_H, g => tags.forEach((t, i) => drawTag(g, (i % 2) * SLOT_W, Math.floor(i / 2) * SLOT_H, t.text, t.bg)));
    texture.anisotropy = 4;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const parts = tags.map((t, i) => {
      const geometry = new THREE.PlaneGeometry(t.w, t.w / 4);
      const uv = geometry.attributes.uv;
      const col = i % 2;
      const row = Math.floor(i / 2);
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / 2, 1 - (row + 1 - uv.getY(k)) / ATLAS_ROWS);
      return geometry.applyMatrix4(m4.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.rotY), new THREE.Vector3(1, 1, 1)));
    });
    const mesh = new THREE.Mesh(own(mergeGeometries(parts)), own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45 })));
    for (const p of parts) p.dispose();
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }

  // --- the moving bits: flames that flicker, steam and smoke that rise and fade ---
  const flameMesh = own(new THREE.InstancedMesh(own(new THREE.ConeGeometry(0.06, 0.2, 6).translate(0, 0.1, 0)), own(new THREE.MeshBasicMaterial({ color: 0xffffff })), flames.length));
  const color = new THREE.Color();
  flames.forEach((f, i) => flameMesh.setColorAt(i, color.setHex(f.blue ? 0x42a5f5 : 0xffa726)));
  const puffMesh = own(new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(1, 1)), own(new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false })), steam.length));
  steam.forEach((s, i) => puffMesh.setColorAt(i, color.setHex(s.smoke ? 0x9e9e9e : 0xffffff)));
  for (const m of [flameMesh, puffMesh]) {
    m.frustumCulled = false; // they move about; there are only a few
    m.castShadow = false;
    scene.add(m);
  }
  own({ dispose: () => figures.forEach(f => { scene.remove(f); disposeMerged(f); }) });

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const noTurn = new THREE.Quaternion();
  return {
    update(time) {
      flames.forEach((f, i) => {
        const flicker = 0.75 + 0.4 * Math.abs(Math.sin(time * 11 + f.phase)) + 0.15 * Math.sin(time * 23 + f.phase * 3);
        scale.set(f.s, f.s * flicker, f.s);
        flameMesh.setMatrixAt(i, m4.compose(pos.set(f.x, f.y, f.z), noTurn, scale));
      });
      flameMesh.instanceMatrix.needsUpdate = true;
      steam.forEach((s, i) => {
        const t = (time * (s.smoke ? 0.25 : 0.45) + s.phase) % 1; // 0 → 1 as the puff rises
        const size = s.size * Math.sin(t * Math.PI) * (0.6 + t);
        const drift = s.smoke ? t * 1.2 : 0;
        pos.set(s.x + Math.sin(time * 1.3 + i) * 0.04 * (1 + t * 3) + drift, s.y + t * s.rise, s.z + Math.cos(time * 1.1 + i) * 0.04 * (1 + t * 3));
        puffMesh.setMatrixAt(i, m4.compose(pos, noTurn, scale.setScalar(Math.max(0.001, size))));
      });
      puffMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
