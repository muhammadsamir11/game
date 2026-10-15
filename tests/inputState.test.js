import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlState, toDriveInput } from '../js/inputState.js';

test('nothing pressed means coast straight', () => {
  assert.deepEqual(toDriveInput(createControlState()), { steer: 0, throttle: 0, brake: 0 });
});

test('steering and gas work together with two fingers', () => {
  const s = createControlState();
  s.press(1, 'left');
  s.press(2, 'go');
  assert.deepEqual(toDriveInput(s), { steer: 1, throttle: 1, brake: 0 });
});

test('lifting one finger keeps the other control held', () => {
  const s = createControlState();
  s.press(1, 'right');
  s.press(2, 'go');
  s.release(1);
  assert.deepEqual(toDriveInput(s), { steer: 0, throttle: 1, brake: 0 });
});

test('sliding a finger from one button to another switches control', () => {
  const s = createControlState();
  s.press(1, 'left');
  s.press(1, 'right');
  assert.equal(toDriveInput(s).steer, -1);
});

test('a cancelled touch or app switch lets go of everything', () => {
  const s = createControlState();
  s.press(1, 'go');
  s.press('key:ArrowLeft', 'left');
  s.releaseAll();
  assert.deepEqual(toDriveInput(s), { steer: 0, throttle: 0, brake: 0 });
});

test('left and right together cancel out', () => {
  const s = createControlState();
  s.press(1, 'left');
  s.press(2, 'right');
  assert.equal(toDriveInput(s).steer, 0);
});

test('STOP is reported as brake', () => {
  const s = createControlState();
  s.press(7, 'stop');
  assert.equal(toDriveInput(s).brake, 1);
});
