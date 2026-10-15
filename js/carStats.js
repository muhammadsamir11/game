import { BRICK_TYPES, STUD, LAYER } from './bricks.js';
import { footprint } from './snapping.js';
import { clamp } from './math.js';

// Every race-ready car must stay drivable, however it was built.
export const LIMITS = { minTopSpeed: 12, maxTopSpeed: 24, minEngineForce: 500, maxEngineForce: 1400 };
const CORNER_SLOTS = [[-3, 2], [2, 2], [-3, -4], [2, -4]];

const kindOf = b => BRICK_TYPES[b.type]?.kind;

export function raceReadiness(bricks) {
  const checks = {
    chassis: bricks.some(b => b.type === 'chassis'),
    wheels: CORNER_SLOTS.every(([x, z]) => bricks.some(b => kindOf(b) === 'wheel' && b.x === x && b.z === z)),
    engine: bricks.some(b => kindOf(b) === 'engine'),
    seat: bricks.some(b => kindOf(b) === 'seat'),
  };
  return { ...checks, ready: Object.values(checks).every(Boolean) };
}

export function brickBox(b) {
  const { w, d, h } = footprint(b.type, b.r);
  return {
    cx: (b.x + w / 2) * STUD, cy: (b.y + h / 2) * LAYER, cz: (b.z + d / 2) * STUD,
    hx: (w * STUD) / 2, hy: (h * LAYER) / 2, hz: (d * STUD) / 2,
  };
}

export function computeStats(bricks) {
  let mass = 0, mx = 0, my = 0, mz = 0, engines = 0, spoilers = 0;
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
    if (t.kind === 'engine') engines++;
    if (t.kind === 'spoiler') spoilers++;
  }
  const centerOfMass = mass > 0 ? { x: mx / mass, y: my / mass, z: mz / mass } : { x: 0, y: 0, z: 0 };
  const e = Math.min(engines, 3);
  return {
    mass,
    centerOfMass,
    boxes,
    wheels,
    engines,
    engineForce: clamp(450 + 300 * e, LIMITS.minEngineForce, LIMITS.maxEngineForce),
    topSpeed: clamp(14 + 3 * (e - 1) - Math.max(0, mass - 130) / 25, LIMITS.minTopSpeed, LIMITS.maxTopSpeed),
    frictionSlip: clamp(3 + 0.25 * Math.max(0, wheels.length - 4) + 0.2 * Math.min(spoilers, 2), 2.5, 4.5),
    brakeForce: mass * 0.05,
  };
}
