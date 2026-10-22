// Hooking a trailer onto a truck: where the hook and towbar are, when they're close enough to join, and how a
// towed trailer steers. Pure maths (no three.js), so it can be checked by tests. Heading h means forward (sin h, cos h).
import { clamp, wrapAngle } from './math.js';

// A truck's hook pin, in its brick space (metres): just behind the 6 m chassis's back edge, at plate height.
export const HOOK = { y: 0.1, z: -3.3 };
// A brick trailer's towbar ring: 1.5 m in front of the 8 m chassis's front edge.
export const RING = { y: 0.1, z: 5.5 };

export const HOOK_REACH = 1.6; // m between hook and ring
export const HOOK_ANGLE = (70 * Math.PI) / 180; // how crooked the truck may be to the trailer
export const HOOK_SPEED = 1.5; // m/s: reversing up gently

export const articulation = (truckHeading, trailerHeading) => wrapAngle(truckHeading - trailerHeading);
export const ART_LIMIT = 1.25; // rad (about 72°): a trailer never folds further than this against its truck

// hook, ring: world positions {x, y, z}; speed: the truck's.
export function canHook({ hook, ring, truckHeading, trailerHeading, speed }) {
  return Math.hypot(hook.x - ring.x, hook.z - ring.z) <= HOOK_REACH
    && Math.abs(hook.y - ring.y) < 0.8
    && Math.abs(articulation(truckHeading, trailerHeading)) <= HOOK_ANGLE
    && Math.abs(speed) < HOOK_SPEED;
}

// Long trailers steer their back wheels against the bend, like real ones, so they follow the truck round
// corners instead of cutting across them into buildings.
export const TRAILER_STEER = 0.6;
export const MAX_TRAILER_STEER = 0.5;
export const TRAILER_STEER_SIGN = -1;
export const trailerSteer = angle => clamp(TRAILER_STEER_SIGN * TRAILER_STEER * angle, -MAX_TRAILER_STEER, MAX_TRAILER_STEER);

// A towing truck can't turn as sharply as on its own: the longer the trailer (hook to back wheels, metres),
// the gentler, or the trailer would drag sideways like an anchor in a tight turn.
export const towSteerCap = ringToAxle => clamp(3.6 / ringToAxle, 0.3, 0.5);

// A towing truck pulls (and brakes) harder, so a heavy trailer doesn't make it crawl.
export const towScale = (truckMass, trailerMass) => Math.min(2.5, 1 + trailerMass / truckMass);

// The trailer's origin, ringToOrigin metres straight behind the hook, facing the same way as the truck.
export function poseBehind(hookWorld, heading, ringToOrigin) {
  return { x: hookWorld.x - Math.sin(heading) * ringToOrigin, z: hookWorld.z - Math.cos(heading) * ringToOrigin, heading };
}
