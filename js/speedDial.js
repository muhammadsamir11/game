import { LIMITS } from './carStats.js';
import { clamp } from './math.js';

// The speedometer's maths, shared by the city and races.
// Game speeds are small (m/s on a toy track), so they're scaled up: the fastest car there is
// (the Bugatti Chiron, LIMITS.maxTopSpeed) reads its real-life 420 km/h, and every slower car reads slower.
export const KMH_PER_MS = 420 / LIMITS.maxTopSpeed;
export const DIAL_MAX = 600; // km/h at the end of the dial: room for the Chiron on a boost
export const SWEEP = 240; // degrees the needle travels from 0 to DIAL_MAX

// The number on the dial, in km/h. Reversing counts as speed too.
export const shownSpeed = mps => Math.round(Math.abs(mps) * KMH_PER_MS);

// Needle angle in degrees, clockwise from straight up: -SWEEP/2 at 0, +SWEEP/2 at DIAL_MAX (and beyond).
export const needleAngle = kmh => (clamp(kmh / DIAL_MAX, 0, 1) - 0.5) * SWEEP;

// Eases the needle toward the car's speed, so physics wobbles don't make it jitter.
export const smoothToward = (current, target, dt, rate = 8) => target + (current - target) * Math.exp(-rate * dt);
