import { BRICK_TYPES } from './bricks.js';

export const GADGET_ORDER = ['fly', 'boost', 'horn', 'siren', 'confetti'];
export const BOOST = { duration: 2, recharge: 6, force: 1.6, topSpeed: 1.4 };
// Flying (SpaceX thrusters): up for `flight` seconds, then `landing` seconds floating down, then a recharge.
// height: how far above the take-off spot it hovers (m).
export const FLY = { flight: 6, landing: 4, recharge: 5, height: 4 };

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

// A flight: 'up' while flying, 'land' while floating back down, then null until it's charged again.
export function createFlight() {
  let left = 0; // seconds left of the flight and landing together
  let charging = 0;
  return {
    trigger() {
      if (left > 0 || charging > 0) return false;
      left = FLY.flight + FLY.landing;
      return true;
    },
    update(dt) {
      if (left > 0) {
        left -= dt;
        if (left <= 0) {
          left = 0;
          charging = FLY.recharge;
        }
      } else if (charging > 0) {
        charging = Math.max(0, charging - dt);
      }
    },
    get mode() { return left <= 0 ? null : left > FLY.landing ? 'up' : 'land'; },
    get charge() { return left > 0 ? 0 : 1 - charging / FLY.recharge; },
  };
}
