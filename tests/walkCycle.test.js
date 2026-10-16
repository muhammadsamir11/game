import test from 'node:test';
import assert from 'node:assert/strict';
import { createGait, stepGait, stepLength } from '../js/walkCycle.js';

const DT = 1 / 60;
// Walk at `speed` m/s for `seconds`, returning the last pose.
function go(gait, speed, seconds, grounded = true) {
  let pose;
  for (let i = 0; i < Math.round(seconds / DT); i++) pose = stepGait(gait, { distance: speed * DT, dt: DT, grounded });
  return pose;
}

test('his legs swing opposite each other, and each arm swings against its own leg', () => {
  const gait = createGait();
  for (let i = 0; i < 40; i++) {
    const p = go(gait, 1.4, 0.05);
    assert.ok(Math.abs(p.legL + p.legR) < 1e-9);
    if (Math.abs(p.legL) > 0.1) assert.ok(Math.sign(p.armL - (p.armL + p.armR) / 2) === -Math.sign(p.legL), 'left arm against left leg');
  }
});

test('the stride follows the ground he covers, not the clock', () => {
  const a = createGait();
  go(a, 1, 1);
  const b = createGait();
  go(b, 2, 0.5); // the same distance in half the time, with longer steps
  assert.ok(b.phase < a.phase, 'faster means longer steps, so fewer of them over the same ground');
  const blocked = createGait();
  go(blocked, 0, 1);
  assert.equal(blocked.phase, 0, 'pushing against a wall does not move his legs');
  assert.ok(Math.abs(a.phase - (1 / stepLength(1)) * Math.PI) < 1e-9);
});

// The biggest leg swing over a second, once he has settled into the pace.
function peakSwing(speed) {
  const gait = createGait();
  go(gait, speed, 1);
  let peak = 0;
  for (let i = 0; i < 60; i++) peak = Math.max(peak, Math.abs(go(gait, speed, DT).legL));
  return peak;
}

test('running swings bigger and leans forward more than walking', () => {
  assert.ok(peakSwing(4) > peakSwing(1.2));
  assert.ok(go(createGait(), 4, 1).lean > go(createGait(), 1.2, 1).lean);
});

test('standing still eases back to rest', () => {
  const gait = createGait();
  go(gait, 4, 1);
  const p = go(gait, 0, 1);
  assert.ok(Math.abs(p.legL) < 0.01 && Math.abs(p.legR) < 0.01, `legs ${p.legL}`);
  assert.ok(Math.abs(p.lean) < 0.01);
  assert.ok(Math.abs(p.armL) < 0.06, 'only a little idle sway');
});

test('in the air he takes a jump pose, then lands back into his stride', () => {
  const gait = createGait();
  go(gait, 3, 0.5);
  const flying = go(gait, 3, 0.5, false);
  assert.ok(flying.armL > 0.9 && flying.armR > 0.9, 'arms up');
  assert.ok(flying.spread > 0.4);
  go(gait, 3, 0.05);
  assert.ok(gait.land > 0, 'a landing squash starts');
  const back = go(gait, 3, 1);
  assert.ok(back.spread < 0.15);
});
