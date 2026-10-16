// How a toy figure's legs, arms and body move as he walks, runs, stands about and jumps.
// Pure maths (no three.js), so it can be checked by tests. Angles are radians; a positive leg or arm
// angle swings it forward, a positive lean tips the body forward.

const RUN_FROM = 1.6; // m/s where a walk starts turning into a run
const RUN_AT = 3.6; // m/s of a full run
const MOVING = 0.15; // m/s below this he is standing still

const lerp = (a, b, k) => a + (b - a) * k;
const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

// One step is half a cycle; a step is longer the faster he goes.
export const stepLength = speed => 0.35 + 0.1 * speed;

export function createGait(phase = 0) {
  return { phase, time: phase, move: 0, run: 0, air: 0, land: 0 };
}

// distance: how far he really moved over the ground this frame (so feet never skate and a wall stops his legs).
export function stepGait(gait, { distance = 0, dt = 1 / 60, grounded = true } = {}) {
  const speed = dt > 0 ? distance / dt : 0;
  gait.time += dt;
  gait.phase += (distance / stepLength(speed)) * Math.PI;
  gait.move += ((speed > MOVING ? 1 : 0) - gait.move) * ease(dt, 10);
  gait.run += (smoothstep(RUN_FROM, RUN_AT, speed) - gait.run) * ease(dt, 6);
  const wasFlying = gait.air > 0.5;
  gait.air += ((grounded ? 0 : 1) - gait.air) * ease(dt, grounded ? 14 : 8);
  if (grounded && wasFlying && gait.air <= 0.5) gait.land = 0.18;
  gait.land = Math.max(0, gait.land - dt);
  return gaitPose(gait);
}

export function gaitPose(gait) {
  const { phase, time, move, run, air, land } = gait;
  const s = Math.sin(phase);
  const passing = 0.5 + 0.5 * Math.cos(2 * phase); // 1 when his legs pass each other, 0 mid-stride
  const still = 1 - move;
  const legSwing = lerp(0.5, 0.85, run) * move;
  const armSwing = lerp(0.45, 0.8, run) * move;
  const armBend = 0.35 * run * move; // running arms are held forward
  const sway = Math.sin(time * 1.1) * 0.035 * still;
  const ground = {
    legL: s * legSwing,
    legR: -s * legSwing,
    armL: -s * armSwing + armBend + sway,
    armR: s * armSwing + armBend - sway,
    bob: passing * lerp(0.02, 0.05, run) * move + Math.sin(time * 2.2) * 0.004 * still,
    lean: (0.04 + 0.12 * run) * move,
    twist: -s * lerp(0.08, 0.12, run) * move,
    spread: 0.12,
  };
  const flying = { legL: 0.55, legR: -0.4, armL: 1.1, armR: 1.1, bob: 0, lean: -0.05, twist: 0, spread: 0.45 };
  const pose = {};
  for (const key of Object.keys(ground)) pose[key] = lerp(ground[key], flying[key], air);
  pose.bob -= Math.sin((land / 0.18) * Math.PI) * 0.05; // a little squash as he lands
  pose.headTilt = -pose.lean * 0.6; // keeps his eyes on where he is going
  return pose;
}
