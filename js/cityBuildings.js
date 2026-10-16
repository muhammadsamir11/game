// What the city's buildings look like: brick walls, framed windows, doors, stepped roofs, awnings.
// Only looks — cityWorld.js gives every building the same physics box as before.
import { seededRandom, BRICK_H } from './legoKit.js';

const WHITE = 0xf5f5f5;
const DARK = 0x37474f;
const ROOF_COLORS = [0xb71c1c, 0x5d4037, 0x1565c0, 0x37474f, 0x2e7d32];
const AWNING_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0x00acc1];
export const SHOP_NAMES = ['TOYS', 'BAKERY', 'ICE CREAM', 'BOOKS', 'BIKES', 'PETS', 'FLOWERS', 'SWEETS', 'MUSIC', 'SPORTS', 'CAFE', 'BRICKS'];

// A wall of a box x0..x1, z0..z1: where it starts, which way it runs (a) and which way it faces (n).
function face(b, side) {
  switch (side) {
    case 'north': return { ox: b.x0, oz: b.z0, ax: 1, az: 0, nx: 0, nz: -1, len: b.x1 - b.x0 };
    case 'south': return { ox: b.x0, oz: b.z1, ax: 1, az: 0, nx: 0, nz: 1, len: b.x1 - b.x0 };
    case 'west': return { ox: b.x0, oz: b.z0, ax: 0, az: 1, nx: -1, nz: 0, len: b.z1 - b.z0 };
    default: return { ox: b.x1, oz: b.z0, ax: 0, az: 1, nx: 1, nz: 0, len: b.z1 - b.z0 }; // east
  }
}
const SIDES = ['north', 'south', 'west', 'east'];

export function createBuildings(kit, { sign, addMesh }) {
  const white = kit.plastic(WHITE);
  const dark = kit.plastic(DARK);
  const glass = kit.glass();
  const bricks = hex => kit.plastic(hex, { look: 'bricks' });
  const occupied = []; // footprints, so the ground leaves studs out from under the buildings

  // A box stuck on a wall: u along it, y up, `proud` how far its front stands out from the wall.
  function onWall(material, f, u, y, w, h, depth, proud) {
    const out = proud - depth / 2;
    kit.box(material, f.ox + f.ax * u + f.nx * out, y, f.oz + f.az * u + f.nz * out, f.ax ? w : depth, h, f.ax ? depth : w);
  }
  const wallPoint = (f, u, out) => ({ x: f.ox + f.ax * u + f.nx * out, z: f.oz + f.az * u + f.nz * out });

  function windowPiece(f, u, y, { w = 1.5, h = 1.7, shutters = null, flowers = null } = {}) {
    onWall(white, f, u, y, w, h, 0.2, 0.12);
    onWall(glass, f, u, y, w - 0.26, h - 0.26, 0.2, 0.14);
    onWall(white, f, u, y, 0.08, h - 0.26, 0.2, 0.16);
    onWall(white, f, u, y + 0.15, w - 0.26, 0.08, 0.2, 0.16);
    onWall(white, f, u, y - h / 2 - 0.05, w + 0.2, 0.1, 0.32, 0.28);
    if (shutters !== null) {
      const m = kit.plastic(shutters);
      for (const s of [-1, 1]) onWall(m, f, u + s * (w / 2 + 0.22), y, 0.36, h, 0.1, 0.1);
    }
    if (flowers !== null) {
      onWall(kit.plastic(0x6d4c41), f, u, y - h / 2 - 0.28, w, 0.3, 0.36, 0.4);
      for (let k = 0; k < 3; k++) {
        const p = wallPoint(f, u - w / 3 + (k * w) / 3, 0.22);
        kit.stud(kit.plastic(flowers[k % flowers.length]), p.x, y - h / 2 - 0.13, p.z);
      }
    }
  }

  function doorPiece(f, u, color, { w = 1.3, h = 2.3 } = {}) {
    onWall(white, f, u, h / 2 + 0.1, w + 0.24, h + 0.12, 0.2, 0.12);
    onWall(kit.plastic(color), f, u, h / 2 + 0.06, w, h, 0.2, 0.16);
    onWall(kit.plastic(0xffc107, { metalness: 0.5, roughness: 0.25 }), f, u + w * 0.32, h * 0.48, 0.1, 0.1, 0.1, 0.24);
    onWall(kit.plastic(0x9e9e9e), f, u, 0.06, w + 0.6, 0.12, 0.9, 0.9); // a step
  }

  // Walls in bricks, a dark base course, and corner columns standing a little proud.
  function shell(b, h, color, trim) {
    kit.span(bricks(color), b.x0, 0, b.z0, b.x1, h, b.z1);
    kit.span(dark, b.x0 - 0.12, 0, b.z0 - 0.12, b.x1 + 0.12, BRICK_H * 0.5, b.z1 + 0.12);
    const t = kit.plastic(trim);
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) kit.box(t, x, h / 2, z, 0.62, h, 0.62);
    occupied.push({ x0: b.x0 - 0.5, z0: b.z0 - 0.5, x1: b.x1 + 0.5, z1: b.z1 + 0.5 });
  }

  // A flat roof: a plate with a studded rim all round, like a toy building's top.
  function flatRoof(b, h, color = 0xb0bec5) {
    const m = kit.plastic(color);
    const o = 0.4;
    kit.span(m, b.x0 - o, h, b.z0 - o, b.x1 + o, h + 0.4, b.z1 + o);
    const top = h + 0.4;
    kit.studs(m, b.x0 - o, b.z0 - o, b.x1 + o, b.z0 + 0.6, top);
    kit.studs(m, b.x0 - o, b.z1 - 0.6, b.x1 + o, b.z1 + o, top);
    kit.studs(m, b.x0 - o, b.z0 + 0.6, b.x0 + 0.6, b.z1 - 0.6, top);
    kit.studs(m, b.x1 - 0.6, b.z0 + 0.6, b.x1 + o, b.z1 - 0.6, top);
    return top;
  }

  return {
    occupied,

    // A house on a 10 × 10 lot: brick walls, a stepped roof, a chimney, windows and a front door facing the street.
    house(b, h, color, front, seed) {
      const rand = seededRandom(seed);
      const trim = rand() < 0.5 ? WHITE : 0xfff3e0;
      shell(b, h, color, trim);
      const shutters = [0x2e7d32, 0x1565c0, 0x5d4037, null][Math.floor(rand() * 4)];
      const flowers = [[0xe53935, 0xfdd835, 0xffffff], [0xf06292, 0xffffff], [0xfdd835, 0xfb8c00]][Math.floor(rand() * 3)];
      for (const side of SIDES) {
        const f = face(b, side);
        if (side === front) {
          doorPiece(f, f.len / 2, [0x8d6e63, 0x1e88e5, 0xe53935, 0x43a047][Math.floor(rand() * 4)]);
          windowPiece(f, f.len * 0.2, 1.6, { shutters, flowers });
          windowPiece(f, f.len * 0.8, 1.6, { shutters, flowers });
          for (const u of [0.2, 0.5, 0.8]) windowPiece(f, f.len * u, Math.min(h - 1.3, 4.1), { shutters });
        } else {
          for (const u of [0.3, 0.7]) {
            windowPiece(f, f.len * u, 1.6, { shutters });
            windowPiece(f, f.len * u, Math.min(h - 1.3, 4.1), { shutters });
          }
        }
      }
      // Stepped roof: plates that narrow toward the ridge, the classic toy-brick slope.
      const roof = kit.plastic(ROOF_COLORS[Math.floor(rand() * ROOF_COLORS.length)]);
      const o = 0.45;
      const alongX = front === 'north' || front === 'south'; // ridge runs along the street
      const span = alongX ? b.z1 - b.z0 : b.x1 - b.x0;
      const steps = Math.floor((span / 2 + o) / 0.7);
      for (let k = 0; k < steps; k++) {
        const y = h + k * 0.4;
        const inset = k * 0.7;
        if (alongX) kit.span(roof, b.x0 - o, y, b.z0 - o + inset, b.x1 + o, y + 0.4, b.z1 + o - inset);
        else kit.span(roof, b.x0 - o + inset, y, b.z0 - o, b.x1 + o - inset, y + 0.4, b.z1 + o);
      }
      const ridgeY = h + steps * 0.4;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      if (alongX) kit.span(dark, b.x0 - o, ridgeY, cz - 0.3, b.x1 + o, ridgeY + 0.15, cz + 0.3);
      else kit.span(dark, cx - 0.3, ridgeY, b.z0 - o, cx + 0.3, ridgeY + 0.15, b.z1 + o);
      const chimney = bricks(0x8d4b3a);
      const chx = alongX ? b.x1 - 2.2 : cx + 1.6;
      const chz = alongX ? cz + 1.6 : b.z1 - 2.2;
      kit.span(chimney, chx - 0.5, h, chz - 0.5, chx + 0.5, ridgeY + 0.9, chz + 0.5);
      kit.span(dark, chx - 0.6, ridgeY + 0.9, chz - 0.6, chx + 0.6, ridgeY + 1.1, chz + 0.6);
    },

    // A row of three shopfronts: big windows, doors, striped awnings and a name board each.
    shops(b, h, color, front, seed) {
      const rand = seededRandom(seed);
      shell(b, h, color, WHITE);
      flatRoof(b, h);
      const f = face(b, front);
      const back = face(b, { north: 'south', south: 'north', west: 'east', east: 'west' }[front]);
      const unit = f.len / 3;
      for (let s = 0; s < 3; s++) {
        const u0 = s * unit;
        const awning = kit.plastic(AWNING_COLORS[Math.floor(rand() * AWNING_COLORS.length)]);
        doorPiece(f, u0 + unit * 0.5, 0x546e7a, { w: 1.4, h: 2.4 });
        for (const k of [0.2, 0.8]) windowPiece(f, u0 + unit * k, 1.55, { w: 2.6, h: 2.2 });
        // Awning in three stepped layers, striped white and colour.
        for (let layer = 0; layer < 3; layer++) {
          for (let u = u0 + 0.4; u < u0 + unit - 0.4; u += 0.5) {
            const m = Math.round((u - u0) / 0.5) % 2 ? white : awning;
            onWall(m, f, u + 0.25, 3.15 + layer * 0.16, 0.5, 0.16, 1.7 - layer * 0.5, 1.7 - layer * 0.5);
          }
        }
        const name = SHOP_NAMES[Math.floor(rand() * SHOP_NAMES.length)];
        const p = wallPoint(f, u0 + unit / 2, 0.08);
        addMesh(sign(name, '#' + awning.color.getHexString(), '#ffffff', { w: unit * 0.6, h: 1.1 }), p.x, 4.2, p.z, Math.atan2(f.nx, f.nz));
        for (let u = u0 + unit * 0.2; u < u0 + unit; u += unit * 0.3) windowPiece(f, u, h - 1.7, { w: 1.4, h: 1.5 });
      }
      for (let u = 2; u < back.len - 1; u += 3.5) {
        windowPiece(back, u, 1.7, { w: 1.4, h: 1.5 });
        windowPiece(back, u, h - 1.7, { w: 1.4, h: 1.5 });
      }
      for (const side of SIDES.filter(s => face(b, s).len < 15)) {
        const e = face(b, side);
        for (const u of [e.len * 0.3, e.len * 0.7]) windowPiece(e, u, h - 1.7, { w: 1.4, h: 1.5 });
      }
    },

    // An office tower: glass bands with white mullions, ledges every floor, a studded roof with a water tank and an aerial.
    tower(b, h, color, seed) {
      const rand = seededRandom(seed);
      shell(b, h, color, WHITE);
      const floor = 3;
      for (let y = floor; y < h - 0.5; y += floor) kit.span(white, b.x0 - 0.15, y - 0.15, b.z0 - 0.15, b.x1 + 0.15, y + 0.15, b.z1 + 0.15);
      for (const side of SIDES) {
        const f = face(b, side);
        for (let y = floor; y < h - 1; y += floor) {
          onWall(glass, f, f.len / 2, y + 1.5, f.len - 1.6, 1.9, 0.2, 0.1);
          for (let u = 0.8; u <= f.len - 0.8 + 1e-6; u += (f.len - 1.6) / 12) onWall(white, f, u, y + 1.5, 0.1, 1.9, 0.2, 0.14);
        }
        // A glass entrance with a canopy on the ground floor.
        onWall(glass, f, f.len / 2, 1.3, 4, 2.4, 0.2, 0.12);
        onWall(white, f, f.len / 2, 1.3, 0.1, 2.4, 0.2, 0.15);
        onWall(kit.plastic(color), f, f.len / 2, 2.75, 5, 0.25, 1.6, 1.6);
        for (const u of [f.len * 0.18, f.len * 0.82]) windowPiece(f, u, 1.4, { w: 2.4, h: 1.8 });
      }
      const top = flatRoof(b, h, 0x90a4ae);
      const cx = (b.x0 + b.x1) / 2 + (rand() - 0.5) * 6;
      const cz = (b.z0 + b.z1) / 2 + (rand() - 0.5) * 6;
      const wood = kit.plastic(0x8d6e63);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.box(dark, cx + dx * 1.1, top + 1, cz + dz * 1.1, 0.2, 2, 0.2);
      kit.cylinder(wood, cx, top + 3, cz, 1.6, 1.6, 2.2, 16);
      kit.cylinder(dark, cx, top + 4.4, cz, 0.3, 1.8, 0.6, 16);
      kit.box(kit.plastic(0xcfd8dc), b.x0 + 4, top + 0.6, b.z1 - 4, 2.4, 1.2, 1.6);
      kit.box(kit.plastic(0xcfd8dc), b.x0 + 7.5, top + 0.6, b.z1 - 4, 2.4, 1.2, 1.6);
      kit.cylinder(dark, b.x1 - 3, top + 3, b.z0 + 3, 0.08, 0.12, 6, 6);
      kit.cylinder(kit.glow(0xff1744), b.x1 - 3, top + 6.1, b.z0 + 3, 0.2, 0.2, 0.25, 8);
    },

    // A shop building with one front (pizza shop, shop coming soon).
    store(b, h, color, front, { trim = 0xe53935, awning = 0xe53935 } = {}) {
      shell(b, h, color, trim);
      flatRoof(b, h, trim);
      const f = face(b, front);
      const t = kit.plastic(awning);
      doorPiece(f, f.len / 2, 0x6d4c41, { w: 1.6, h: 2.5 });
      for (const k of [0.15, 0.32, 0.68, 0.85]) windowPiece(f, f.len * k, 1.6, { w: 2.4, h: 2.2 });
      for (let layer = 0; layer < 3; layer++) {
        for (let u = 0.5; u < f.len - 0.5; u += 0.5) {
          onWall(Math.round(u / 0.5) % 2 ? white : t, f, u + 0.25, 3.2 + layer * 0.16, 0.5, 0.16, 1.8 - layer * 0.55, 1.8 - layer * 0.55);
        }
      }
      for (let u = 2; u < f.len - 1; u += 3) windowPiece(f, u, h - 1.6, { w: 1.4, h: 1.4 });
      for (const side of SIDES.filter(s => s !== front)) {
        const e = face(b, side);
        for (let u = 2.5; u < e.len - 1; u += 4) windowPiece(e, u, h - 1.6, { w: 1.4, h: 1.4 });
      }
    },

    // Scaffolding on the front of the shop that's coming soon, so it looks like a building site.
    scaffold(b, h, front) {
      const f = face(b, front);
      const pole = kit.plastic(0x9e9e9e);
      const plank = kit.plastic(0x8d6e63);
      for (let u = 1; u <= f.len - 1; u += 3.5) {
        const p = wallPoint(f, u, 1.6);
        kit.box(pole, p.x, h / 2 + 0.6, p.z, 0.14, h + 1.2, 0.14);
      }
      for (let y = 2.4; y < h; y += 2.4) {
        onWall(plank, f, f.len / 2, y, f.len - 1.6, 0.12, 1.4, 1.8);
        onWall(kit.plastic(0xfdd835), f, f.len / 2, y + 0.9, f.len - 1.6, 0.1, 0.1, 1.8);
      }
    },
  };
}
