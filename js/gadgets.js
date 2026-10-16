import { BRICK_TYPES } from './bricks.js';

export const GADGET_ORDER = ['boost', 'horn', 'siren', 'confetti'];
export const BOOST = { duration: 2, recharge: 6, force: 1.6, topSpeed: 1.4 };

// Which race buttons a car gets, from the gadgets built onto it.
export function gadgetsOf(bricks) {
  const found = new Set(bricks.map(b => BRICK_TYPES[b.type]?.action).filter(Boolean));
  return GADGET_ORDER.filter(action => found.has(action));
}

export function createCooldown(seconds) {
  let left = 0;
  return {
    trigger() {
      if (left > 0) return false;
      left = seconds;
      return true;
    },
    update(dt) { left = Math.max(0, left - dt); },
    get ready() { return left <= 0; },
  };
}

// Boost runs for BOOST.duration seconds, then needs BOOST.recharge seconds before it can run again.
export function createBoost() {
  let active = 0;
  let charging = 0;
  return {
    trigger() {
      if (active > 0 || charging > 0) return false;
      active = BOOST.duration;
      return true;
    },
    update(dt) {
      if (active > 0) {
        active -= dt;
        if (active <= 0) {
          active = 0;
          charging = BOOST.recharge;
        }
      } else if (charging > 0) {
        charging = Math.max(0, charging - dt);
      }
    },
    get active() { return active > 0; },
    get ready() { return active <= 0 && charging <= 0; },
    get charge() { return active > 0 ? 0 : 1 - charging / BOOST.recharge; },
  };
}
