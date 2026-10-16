// Watches a car's jumps and calls out the stunts: big air, flips, rolls, spins and the ring of fire.
export const STUNTS = { BIG_AIR: 5, HUGE_AIR: 10, FLIP: 20, BARREL_ROLL: 20, SPIN: 15, RING: 10 };

const AIRBORNE_AFTER = 0.15; // seconds with no wheel down
const LANDING_WINDOW = 1; // seconds to end up on the wheels after touching down
const UPRIGHT = 0.7;
const FULL_FLIP = (300 * Math.PI) / 180;
const FULL_SPIN = (330 * Math.PI) / 180;

function score(air, pitch, roll, yaw) {
  const names = [];
  let coins = 0;
  const add = (name, value) => {
    names.push(name);
    coins += value;
  };
  if (air >= 1.4) add('HUGE AIR', STUNTS.HUGE_AIR);
  else if (air >= 0.7) add('BIG AIR', STUNTS.BIG_AIR);
  if (Math.abs(pitch) >= FULL_FLIP) add('FLIP', STUNTS.FLIP);
  if (Math.abs(roll) >= FULL_FLIP) add('BARREL ROLL', STUNTS.BARREL_ROLL);
  if (Math.abs(yaw) >= FULL_SPIN) add('360 SPIN', STUNTS.SPIN);
  return names.length ? { names, coins, oops: false } : null;
}

// frame: { dt, wheelsDown, upY, pitch, roll, yaw } — the angles are radians turned this frame
// around the car's right (pitch), forward (roll) and up (yaw) axes.
export function createStuntTracker() {
  let noWheels = 0; // seconds since the last wheel left the ground
  let airborne = false;
  let air = 0;
  let pitch = 0;
  let roll = 0;
  let yaw = 0;
  let landing = null; // seconds since touchdown, while waiting to be upright
  let armed = true; // false after a reset until the car is back on its wheels

  function clear() {
    noWheels = 0;
    airborne = false;
    air = pitch = roll = yaw = 0;
    landing = null;
  }

  return {
    get airborne() { return airborne; },
    // Flip me!, getting in or out: forget this jump, and don't count one until the wheels are down again.
    reset() {
      clear();
      armed = false;
    },
    update({ dt, wheelsDown, upY, pitch: dp = 0, roll: dr = 0, yaw: dy = 0 }) {
      if (!armed) {
        if (wheelsDown >= 2) armed = true;
        return null;
      }
      if (landing !== null) {
        landing += dt;
        if (upY > UPRIGHT) {
          const ev = score(air, pitch, roll, yaw);
          clear();
          return ev;
        }
        if (landing >= LANDING_WINDOW) {
          clear();
          return { names: [], coins: 0, oops: true };
        }
        return null;
      }
      if (wheelsDown === 0) {
        noWheels += dt;
        if (!airborne && noWheels > AIRBORNE_AFTER) airborne = true;
        air += dt;
        pitch += dp;
        roll += dr;
        yaw += dy;
        return null;
      }
      if (airborne && wheelsDown >= 2) {
        landing = 0;
        if (upY > UPRIGHT) {
          const ev = score(air, pitch, roll, yaw);
          clear();
          return ev;
        }
        return null;
      }
      if (!airborne) clear(); // a wheel touched before it counted as a jump
      return null;
    },
  };
}

// Did the car's centre pass through the hoop (an upright ring across the z axis) between two frames?
export function throughHoop(prev, cur, hoop) {
  const a = prev.z - hoop.z;
  const b = cur.z - hoop.z;
  if (a === b || (a > 0) === (b > 0)) return false;
  const t = a / (a - b);
  const x = prev.x + (cur.x - prev.x) * t;
  const y = prev.y + (cur.y - prev.y) * t;
  return Math.hypot(x - hoop.x, y - hoop.y) <= hoop.radius;
}

export const ringEvent = () => ({ names: ['RING OF FIRE'], coins: STUNTS.RING, oops: false });
