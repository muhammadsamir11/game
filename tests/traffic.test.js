import test from 'node:test';
import assert from 'node:assert/strict';
import { greenAxis, isGreen, obstacleAhead, shouldStop, createLoopMover, dodgeVector, LIGHT_PERIOD } from '../js/traffic.js';

const east = { x: 1, z: 0 };
const pose = (over = {}) => ({ x: 0, z: 0, dir: east, axis: 'x', distToCorner: 30, ...over });
const redForX = LIGHT_PERIOD + 1; // second phase: z is green

test('lights switch every 8 seconds and are never green both ways', () => {
  assert.equal(greenAxis(0), 'x');
  assert.equal(greenAxis(7.9), 'x');
  assert.equal(greenAxis(8), 'z');
  assert.equal(greenAxis(16.5), 'x');
  for (let t = 0; t < 40; t += 0.5) assert.notEqual(isGreen('x', t), isGreen('z', t));
});

test('something within 7 m ahead in the lane stops a car', () => {
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, [{ x: 5, z: 1 }]), true);
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, [{ x: 8, z: 0 }]), false, 'too far');
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, [{ x: -3, z: 0 }]), false, 'behind');
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, [{ x: 4, z: 6 }]), false, 'other lane');
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, []), false);
});

test('a red light stops cars just before the junction, not inside it', () => {
  assert.equal(shouldStop(pose({ distToCorner: 8 }), redForX, []), true);
  assert.equal(shouldStop(pose({ distToCorner: 8 }), 1, []), false, 'green');
  assert.equal(shouldStop(pose({ distToCorner: 3 }), redForX, []), false, 'already in the junction');
  assert.equal(shouldStop(pose({ distToCorner: 20 }), redForX, []), false, 'still far away');
  assert.equal(shouldStop(pose({ distToCorner: 20 }), 1, [{ x: 4, z: 0 }]), true, 'green but blocked');
});

test('the loop mover drives round the rectangle and wraps', () => {
  const m = createLoopMover([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 20 }, { x: 0, z: 20 }], 0);
  assert.equal(m.length, 60);
  assert.deepEqual([m.pose().x, m.pose().z, m.pose().axis], [0, 0, 'x']);
  assert.ok(Math.abs(m.pose().heading - Math.PI / 2) < 1e-9);
  m.advance(15);
  assert.deepEqual([m.pose().x, m.pose().z, m.pose().axis, m.pose().distToCorner], [10, 5, 'z', 15]);
  assert.ok(Math.abs(m.pose().heading) < 1e-9);
  m.advance(50);
  assert.deepEqual([m.pose().x, m.pose().z], [5, 0]);
  const half = createLoopMover([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 20 }, { x: 0, z: 20 }], 0.5);
  assert.deepEqual([half.pose().x, half.pose().z], [10, 20]);
});

test('a person dodges away only when the player is within 4 m', () => {
  const v = dodgeVector({ x: 0, z: 0 }, { x: 3, z: 0 });
  assert.deepEqual(v, { x: -1, z: 0 });
  assert.equal(dodgeVector({ x: 0, z: 0 }, { x: 5, z: 0 }), null);
  assert.deepEqual(dodgeVector({ x: 1, z: 1 }, { x: 1, z: 1 }), { x: 1, z: 0 });
});
