import { BRICK_TYPES, STUD, LAYER, buildKind, isChassis } from './bricks.js';
import { footprint, BUILD_AREAS } from './snapping.js';
import { clamp } from './math.js';

// Every race-ready car must stay drivable, however it was built.
export const LIMITS = { minTopSpeed: 12, maxTopSpeed: 24, minEngineForce: 500, maxEngineForce: 1400 };
export const TRUCK_TOP_SPEED = 17; // m/s: trucks are a bit slower than cars
const CORNER_SLOTS = [[-3, 2], [2, 2], [-3, -4], [2, -4]];

const kindOf = b => BRICK_TYPES[b.type]?.kind;
// How many engines a part is worth (a V12 counts as two).
const power = b => BRICK_TYPES[b.type]?.power ?? (kindOf(b) === 'engine' ? 1 : 0);
const V12_BONUS = 2.5; // m/s of top speed per V12, for up to two

const wheelAt = (bricks, x, z) => bricks.some(b => kindOf(b) === 'wheel' && b.x === x && b.z === z);

// A car needs its 4 corners; a truck all 6 of its places; a trailer one pair side by side at the back.
function wheelsReady(bricks, kind) {
  if (kind === 'car') return CORNER_SLOTS.every(([x, z]) => wheelAt(bricks, x, z));
  const slots = BUILD_AREAS[kind].wheelSlots;
  if (kind === 'truck') return slots.every(s => wheelAt(bricks, s.x, s.z));
  return [...new Set(slots.map(s => s.z))].some(z => slots.filter(s => s.z === z).every(s => wheelAt(bricks, s.x, s.z)));
}

// Cars and trucks race; trailers never do (no engine or seat needed, and none counts).
export function raceReadiness(bricks) {
  const kind = buildKind(bricks);
  const checks = {
    chassis: bricks.some(b => isChassis(b.type)),
    wheels: wheelsReady(bricks, kind),
    engine: kind !== 'trailer' && bricks.some(b => power(b) > 0),
    seat: kind !== 'trailer' && bricks.some(b => kindOf(b) === 'seat'),
  };
  return { ...checks, ready: Object.values(checks).every(Boolean) };
}

// The builder's checklist: what this kind of build still needs before it's done.
export function buildReadiness(bricks) {
  const kind = buildKind(bricks);
  if (kind === 'trailer') {
    const checks = { wheels: wheelsReady(bricks, kind) };
    return { kind, checks, ready: bricks.some(b => isChassis(b.type)) && checks.wheels };
  }
  const { chassis, wheels, engine, seat, ready } = raceReadiness(bricks);
  return { kind, checks: { wheels, engine, seat }, ready: chassis && ready };
}

export function brickBox(b) {
  const { w, d, h } = footprint(b.type, b.r);
  return {
    cx: (b.x + w / 2) * STUD, cy: (b.y + h / 2) * LAYER, cz: (b.z + d / 2) * STUD,
    hx: (w * STUD) / 2, hy: (h * LAYER) / 2, hz: (d * STUD) / 2,
  };
}

export function computeStats(bricks) {
  let mass = 0, mx = 0, my = 0, mz = 0, engines = 0, spoilers = 0, v12s = 0;
  const boxes = [];
  const wheels = [];
  for (const b of bricks) {
    const t = BRICK_TYPES[b.type];
    if (!t) continue;
    const box = brickBox(b);
    mass += t.mass;
    mx += box.cx * t.mass;
    my += box.cy * t.mass;
    mz += box.cz * t.mass;
    if (t.kind === 'wheel') {
      wheels.push({ type: b.type, color: b.color, radius: t.radius, x: box.cx, y: LAYER / 2, z: box.cz, front: box.cz > 0.01 });
    } else {
      boxes.push(box);
    }
    engines += power(b);
    if (b.type === 'v12') v12s++;
    if (t.kind === 'spoiler') spoilers++;
  }
  const centerOfMass = mass > 0 ? { x: mx / mass, y: my / mass, z: mz / mass } : { x: 0, y: 0, z: 0 };
  const e = Math.min(engines, 3);
  const topSpeed = clamp(14 + 3 * (e - 1) + V12_BONUS * Math.min(v12s, 2) - Math.max(0, mass - 130) / 25, LIMITS.minTopSpeed, LIMITS.maxTopSpeed);
  return {
    mass,
    centerOfMass,
    boxes,
    wheels,
    engines,
    v12s,
    engineForce: clamp(450 + 300 * e, LIMITS.minEngineForce, LIMITS.maxEngineForce),
    topSpeed: buildKind(bricks) === 'truck' ? Math.min(topSpeed, TRUCK_TOP_SPEED) : topSpeed,
    frictionSlip: clamp(3 + 0.25 * Math.max(0, wheels.length - 4) + 0.2 * Math.min(spoilers, 2), 2.5, 4.5),
    brakeForce: mass * 0.05,
  };
}
