import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestIndex, aiControl, rubberBand, unstick } from '../js/ai.js';

const straight = (x = 0) => Array.from({ length: 100 }, (_, i) => ({ x, z: i * 2 }));
const circle = Array.from({ length: 100 }, (_, i) => ({ x: Math.sin((i / 100) * Math.PI * 2) * 50, z: Math.cos((i / 100) * Math.PI * 2) * 50 }));
const car = (over = {}) => ({ x: 0, z: 0, heading: 0, speed: 5, topSpeed: 14, ...over });

test('drives straight down a straight line', () => {
  const { input } = aiControl(car(), straight(), 0);
  assert.ok(Math.abs(input.steer) < 0.01);
  assert.equal(input.throttle, 1);
  assert.equal(input.brake, 0);
});

test('steers left (positive) when the line is off to +x', () => {
  assert.ok(aiControl(car(), straight(10), 0).input.steer > 0.5);
});

test('steers right (negative) when facing +x and the line runs along +z', () => {
  assert.ok(aiControl(car({ heading: Math.PI / 2 }), straight(0), 0).input.steer < -0.5);
});

test('turns the short way round across the ±π seam', () => {
  // Facing heading 3.1 (almost -z); the target is at heading ≈ -3.14, only ~0.05 rad away the short way.
  const line = Array.from({ length: 20 }, () => ({ x: -0.5, z: -100 }));
  const { input } = aiControl(car({ heading: 3.1, speed: 0 }), line, 0);
  assert.ok(Math.abs(input.steer) < 0.3, `steer=${input.steer}`);
});

test('lifts off the gas above the target speed and brakes when far above it', () => {
  assert.equal(aiControl(car({ speed: 13 }), straight(), 0, 0.8).input.throttle, 0);
  assert.equal(aiControl(car({ speed: 16 }), straight(), 0, 0.8).input.brake, 1);
});

test('nearestIndex follows the car round the end of the loop', () => {
  const p = circle[1];
  assert.equal(nearestIndex(circle, p.x, p.z, 98), 1);
});

test('rubber band slows leaders and helps cars that are behind', () => {
  assert.equal(rubberBand(3), 0.8);
  assert.equal(rubberBand(1), 0.92);
  assert.equal(rubberBand(0), 1);
  assert.equal(rubberBand(-3), 1.1);
});

test('an AI car that stays stuck for 1.5 s backs up for 1.2 s, then tries again', () => {
  let memory = { slowFor: 0, reverseFor: 0 };
  for (let i = 0; i < 85; i++) memory = unstick(memory, 0.2, 1 / 60);
  assert.equal(memory.reverseFor, 0, 'not yet after ~1.4 s');
  for (let i = 0; i < 10; i++) memory = unstick(memory, 0.2, 1 / 60);
  assert.ok(memory.reverseFor > 0, 'reversing after ~1.6 s of being slow');
  let reversingFrames = 0;
  while (memory.reverseFor > 0) { memory = unstick(memory, 0.2, 1 / 60); reversingFrames++; }
  assert.ok(reversingFrames >= 60 && reversingFrames <= 73, `${reversingFrames} frames`);
  assert.deepEqual(unstick({ slowFor: 1.4, reverseFor: 0 }, 5, 1 / 60), { slowFor: 0, reverseFor: 0 }, 'moving again resets the timer');
});
