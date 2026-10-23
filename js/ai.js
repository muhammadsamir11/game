import { clamp, wrapAngle } from './math.js';

export function nearestIndex(line, x, z, fromIdx = 0, ahead = 40) {
  const n = line.length;
  let best = ((fromIdx % n) + n) % n;
  let bestDist = Infinity;
  for (let k = -5; k <= ahead; k++) {
    const i = (((fromIdx + k) % n) + n) % n;
    const dist = (line[i].x - x) ** 2 + (line[i].z - z) ** 2;
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

// Aim at a point further down the racing line the faster we go; slow down for sharp turns.
// Points marked `full` (a jump's run-up and ramps) are driven flat out, whatever the pace: too slow and you fall short.
export function aiControl(car, line, prevIdx, speedFactor = 1) {
  const idx = nearestIndex(line, car.x, car.z, prevIdx);
  const look = Math.round(5 + Math.max(0, car.speed) * 0.5);
  const target = line[(idx + look) % line.length];
  const turn = wrapAngle(Math.atan2(target.x - car.x, target.z - car.z) - car.heading);
  const targetSpeed = line[idx].full ? car.topSpeed : car.topSpeed * speedFactor * (Math.abs(turn) > 0.5 ? 0.6 : 1);
  return {
    idx,
    input: {
      steer: clamp(turn * 2.5, -1, 1),
      throttle: car.speed < targetSpeed ? 1 : 0,
      brake: car.speed > targetSpeed + 3 ? 1 : 0,
    },
  };
}

// Keeps races close: leaders ease off, cars that fall behind get a small boost.
export function rubberBand(gap) {
  if (gap > 2) return 0.8;
  if (gap > 0) return 0.92;
  if (gap < -2) return 1.1;
  return 1;
}

// When an AI car is nose-first against a wall, pressing the gas forever won't help: back up for a moment.
// memory = { slowFor, reverseFor } in seconds; while reverseFor > 0 the driver should reverse.
export function unstick(memory, speed, dt) {
  if (memory.reverseFor > 0) return { slowFor: 0, reverseFor: Math.max(0, memory.reverseFor - dt) };
  const slowFor = Math.abs(speed) < 1 ? memory.slowFor + dt : 0;
  return slowFor > 1.5 ? { slowFor: 0, reverseFor: 1.2 } : { slowFor, reverseFor: 0 };
}
