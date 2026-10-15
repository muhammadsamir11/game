import { BRICK_TYPES } from './bricks.js';

// The baseplate area a car may use (max values are exclusive).
export const BOUNDS = { minX: -6, maxX: 6, minY: 0, maxY: 24, minZ: -8, maxZ: 8 };

// Wheels clip onto the sides of the 4×8 chassis: front, middle and back on each side.
export const WHEEL_SLOTS = [
  { x: -3, z: 2 }, { x: 2, z: 2 },
  { x: -3, z: -1 }, { x: 2, z: -1 },
  { x: -3, z: -4 }, { x: 2, z: -4 },
];

export function footprint(type, r = 0) {
  const t = BRICK_TYPES[type];
  return r % 2 === 0 ? { w: t.w, d: t.d, h: t.h } : { w: t.d, d: t.w, h: t.h };
}

export function cellsOf(brick) {
  const { w, d, h } = footprint(brick.type, brick.r);
  const cells = [];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      for (let k = 0; k < d; k++) cells.push(`${brick.x + i},${brick.y + j},${brick.z + k}`);
    }
  }
  return cells;
}

function occupancy(bricks) {
  const map = new Map();
  for (const b of bricks) for (const cell of cellsOf(b)) map.set(cell, b);
  return map;
}

export function canPlace(bricks, cand) {
  const t = BRICK_TYPES[cand.type];
  if (!t) return { ok: false, reason: 'unknown' };
  if (t.kind === 'wheel' && (cand.y !== 0 || !WHEEL_SLOTS.some(s => s.x === cand.x && s.z === cand.z))) {
    return { ok: false, reason: 'wheelSlot' };
  }
  const { w, d, h } = footprint(cand.type, cand.r);
  if (cand.x < BOUNDS.minX || cand.x + w > BOUNDS.maxX || cand.y < BOUNDS.minY || cand.y + h > BOUNDS.maxY
    || cand.z < BOUNDS.minZ || cand.z + d > BOUNDS.maxZ) {
    return { ok: false, reason: 'outOfBounds' };
  }
  const occupied = occupancy(bricks);
  if (cellsOf(cand).some(cell => occupied.has(cell))) return { ok: false, reason: 'overlap' };
  if (t.kind !== 'wheel' && cand.type !== 'chassis') {
    let supported = false;
    for (let i = 0; i < w && !supported; i++) {
      for (let k = 0; k < d && !supported; k++) {
        const below = occupied.get(`${cand.x + i},${cand.y - 1},${cand.z + k}`);
        supported = !!below && BRICK_TYPES[below.type].kind !== 'wheel';
      }
    }
    if (!supported) return { ok: false, reason: 'floating' };
  }
  return { ok: true };
}

// `cell` is the empty grid cell next to the tapped face; `normal` is that face's direction rounded to -1/0/1.
// Top faces centre the brick on the tapped stud; side and bottom faces put it flush against the face.
export function candidateFromHit(type, r, cell, normal) {
  const { w, d, h } = footprint(type, r);
  let x = cell.x - Math.floor((w - 1) / 2);
  let z = cell.z - Math.floor((d - 1) / 2);
  let y = cell.y;
  if (normal.x > 0.5) x = cell.x;
  else if (normal.x < -0.5) x = cell.x - w + 1;
  if (normal.z > 0.5) z = cell.z;
  else if (normal.z < -0.5) z = cell.z - d + 1;
  if (normal.y < -0.5) y = cell.y - h + 1;
  return { type, r, x, y, z };
}

// gx/gz are grid-space coordinates (metres / STUD) of where the player tapped.
export function nearestWheelSlot(gx, gz) {
  let best = WHEEL_SLOTS[0];
  let bestDist = Infinity;
  for (const slot of WHEEL_SLOTS) {
    const dist = (slot.x + 0.5 - gx) ** 2 + (slot.z + 1 - gz) ** 2;
    if (dist < bestDist) { bestDist = dist; best = slot; }
  }
  return { x: best.x, y: 0, z: best.z };
}
