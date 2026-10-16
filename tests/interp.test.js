import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrail, pushSnap, sampleTrail, nlerpQuat, INTERP_DELAY, MAX_EXTRAPOLATE } from '../js/net/interp.js';

const Q = { x: 0, y: 0, z: 0, w: 1 };
const snap = (x, { vx = 0, h = 0, foot = false } = {}) => ({ p: { x, y: 0, z: 0 }, q: Q, v: { x: vx, y: 0, z: 0 }, h, foot });

test('nothing to draw before the first position arrives', () => {
  assert.equal(sampleTrail(createTrail(), 1), null);
});

test('slides between two positions, a little in the past', () => {
  const trail = createTrail();
  pushSnap(trail, snap(0), 1);
  pushSnap(trail, snap(2), 1.1);
  const s = sampleTrail(trail, 1.05 + INTERP_DELAY);
  assert.ok(Math.abs(s.p.x - 1) < 1e-9);
});

test('keeps going a short way when positions stop, then waits', () => {
  const trail = createTrail();
  pushSnap(trail, snap(0, { vx: 10 }), 1);
  pushSnap(trail, snap(1, { vx: 10 }), 1.1);
  const soon = sampleTrail(trail, 1.1 + INTERP_DELAY + 0.1);
  assert.ok(Math.abs(soon.p.x - 2) < 1e-9);
  const later = sampleTrail(trail, 1.1 + INTERP_DELAY + 5);
  assert.ok(Math.abs(later.p.x - (1 + 10 * MAX_EXTRAPOLATE)) < 1e-9);
  assert.equal(later.stale, true);
});

test('a big jump snaps instead of sliding across the city', () => {
  const trail = createTrail();
  pushSnap(trail, snap(0), 1);
  pushSnap(trail, snap(50), 1.1);
  assert.equal(trail.snaps.length, 1);
  assert.equal(sampleTrail(trail, 1.15).p.x, 50);
});

test('getting out of a car snaps too', () => {
  const trail = createTrail();
  pushSnap(trail, snap(0), 1);
  pushSnap(trail, snap(1, { foot: true }), 1.1);
  assert.equal(trail.snaps.length, 1);
});

test('heading turns the short way round', () => {
  const trail = createTrail();
  pushSnap(trail, snap(0, { h: 3.1 }), 1);
  pushSnap(trail, snap(0, { h: -3.1 }), 1.1);
  const s = sampleTrail(trail, 1.05 + INTERP_DELAY);
  assert.ok(Math.abs(Math.abs(s.h) - Math.PI) < 0.05);
});

test('old positions arriving late are ignored', () => {
  const trail = createTrail();
  pushSnap(trail, snap(0), 2);
  pushSnap(trail, snap(5), 1);
  assert.equal(trail.snaps.length, 1);
});

test('quaternion blend stays a unit quaternion and takes the short way', () => {
  const a = Q;
  const b = { x: 0, y: -Math.SQRT1_2, z: 0, w: -Math.SQRT1_2 }; // same as +90° about y, with flipped sign
  const q = nlerpQuat(a, b, 0.5);
  assert.ok(Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-9);
  assert.ok(q.w > 0.9);
});
