import test from 'node:test';
import assert from 'node:assert/strict';
import { shownSpeed, needleAngle, smoothToward, DIAL_MAX, SWEEP } from '../js/speedDial.js';
import { LIMITS, computeStats } from '../js/carStats.js';
import { BOOST } from '../js/gadgets.js';
import { MODELS, modelToBricks } from '../js/instructions.js';

test('the fastest car reads its real top speed, and reversing reads as speed too', () => {
  assert.equal(shownSpeed(LIMITS.maxTopSpeed), 420);
  assert.equal(shownSpeed(0), 0);
  assert.equal(shownSpeed(-10), shownSpeed(10));
});

test('a faster car reads faster: the Chiron beats every other supercar on the dial', () => {
  const top = key => shownSpeed(computeStats(modelToBricks(MODELS[key])).topSpeed);
  for (const key of ['aventador', 'huracan', 'sf90', 'laferrari', 'p1']) assert.ok(top('chiron') > top(key), key);
  assert.ok(shownSpeed(LIMITS.minTopSpeed) < shownSpeed(LIMITS.maxTopSpeed));
});

test('the needle sweeps from left to right and stops at the end of the dial', () => {
  assert.equal(needleAngle(0), -SWEEP / 2);
  assert.equal(needleAngle(DIAL_MAX / 2), 0);
  assert.equal(needleAngle(DIAL_MAX), SWEEP / 2);
  assert.equal(needleAngle(DIAL_MAX * 3), SWEEP / 2);
  assert.ok(needleAngle(200) < needleAngle(300));
});

test('the fastest car on a boost still fits on the dial', () => {
  assert.ok(shownSpeed(LIMITS.maxTopSpeed * BOOST.topSpeed) <= DIAL_MAX);
});

test('the needle eases toward the speed without overshooting', () => {
  assert.equal(smoothToward(5, 20, 0), 5);
  let v = 0;
  for (let i = 0; i < 60; i++) {
    const next = smoothToward(v, 20, 1 / 60);
    assert.ok(next > v && next <= 20);
    v = next;
  }
  assert.ok(v > 19.9, 'there within a second');
  assert.ok(smoothToward(20, 0, 1 / 60) < 20);
});
