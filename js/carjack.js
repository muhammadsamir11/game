// Borrowing a car from the city's traffic: he kicks the driver out (cartoon style) and drives off in it.
// Pure maths (no three.js), so it can be checked by tests.

export const KICK_REACH = 4.5; // m: a bit more than Get in's, as traffic cars won't wait about
export const KICK_TIME = 0.3; // seconds his kick swings before the driver pops out
export const GIVE_BACK_DISTANCE = 70; // m: a left-behind borrowed car rejoins traffic once he is this far from it

const GRAVITY = 14; // a bit stronger than real: a quick, bouncy cartoon arc
const LAUNCH_SIDE = 5; // m/s out of the car
const LAUNCH_UP = 5.5; // m/s
const SEAT_HEIGHT = 1;
const BOUNCE = 0.4; // how much of his speed is left after the one bounce
const SPIN = 9; // rad/s he cartwheels while flying
const DAZED_TIME = 0.8;
const RUN_SPEED = 5;
const RUN_TIME = 3;

// His kick: right leg swung up high, leaning back, arms flung out (a walkCycle.js-shaped pose).
export const KICK_POSE = { legL: -0.15, legR: 1.5, armL: 0.5, armR: -0.4, bob: 0.06, lean: -0.35, twist: 0.15, spread: 1.0, headTilt: 0.2 };

// The traffic car he is near enough to kick the driver out of, or null. Long ones count from near their ends.
export function nearestTraffic(cars, p, reach) {
  let best = null;
  let bestDist = reach;
  for (const car of cars) {
    if (car.taken) continue;
    const q = car.mesh.position;
    const d = Math.hypot(q.x - p.x, q.z - p.z) - Math.max(0, car.halfLength - 2);
    if (d < bestDist) {
      best = car;
      bestDist = d;
    }
  }
  return best;
}

// Which way the driver flies: out of the side of the car away from him (heading: the car's).
export function launchDirection(car, heading, kicker) {
  const side = { x: Math.cos(heading), z: -Math.sin(heading) }; // the car's left-hand side
  const lateral = (kicker.x - car.x) * side.x + (kicker.z - car.z) * side.z;
  const k = lateral > 0 ? -1 : 1;
  return { x: side.x * k, z: side.z * k };
}

// The kicked-out driver: flies out spinning, bounces once, sits dazed, then runs off and is gone.
// dir: unit vector to fly along (launchDirection). step(dt) returns where he is and what he is doing.
export function createTumble({ x, z, dir }) {
  const state = { x, y: SEAT_HEIGHT, z, spin: 0, heading: Math.atan2(dir.x, dir.z), phase: 'fly', landed: false };
  let vx = dir.x * LAUNCH_SIDE;
  let vz = dir.z * LAUNCH_SIDE;
  let vy = LAUNCH_UP;
  let bounced = false;
  let t = 0; // seconds in the current phase
  return {
    state,
    step(dt) {
      state.landed = false;
      t += dt;
      if (state.phase === 'fly') {
        vy -= GRAVITY * dt;
        state.x += vx * dt;
        state.z += vz * dt;
        state.y += vy * dt;
        state.spin += SPIN * dt;
        if (state.y <= 0) {
          state.y = 0;
          if (!bounced) {
            bounced = true;
            vy = -vy * BOUNCE;
            vx *= BOUNCE;
            vz *= BOUNCE;
            state.landed = true; // the bump: time for a pop and a "Hey!"
          } else {
            state.phase = 'dazed';
            state.spin = 0;
            t = 0;
          }
        }
      } else if (state.phase === 'dazed') {
        if (t >= DAZED_TIME) {
          state.phase = 'run';
          t = 0;
        }
      } else if (state.phase === 'run') {
        state.x += dir.x * RUN_SPEED * dt;
        state.z += dir.z * RUN_SPEED * dt;
        if (t >= RUN_TIME) state.phase = 'gone';
      }
      return state;
    },
  };
}
