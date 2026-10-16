import test from 'node:test';
import assert from 'node:assert/strict';
import { stickToWorld } from '../js/walker.js';
import { dragLook, TILT_LIMIT } from '../js/cameraDrag.js';

test('dragging right turns the view to the screen\'s right', () => {
  const { yaw } = dragLook({ yaw: 0, pitch: 0 }, 100, 0, 1000, 800);
  const ahead = stickToWorld({ x: 0, y: 1 }, yaw);
  const right = stickToWorld({ x: 1, y: 0 }, 0);
  assert.ok(ahead.x * right.x + ahead.z * right.z > 0);
});

test('a full screen width is half a turn, on any screen', () => {
  assert.ok(Math.abs(Math.abs(dragLook({ yaw: 0, pitch: 0 }, 1000, 0, 1000, 800).yaw) - Math.PI) < 1e-9);
  assert.ok(Math.abs(Math.abs(dragLook({ yaw: 0, pitch: 0 }, 2000, 0, 2000, 800).yaw) - Math.PI) < 1e-9);
});

test('dragging down tilts the view down, up tilts it up', () => {
  assert.ok(dragLook({ yaw: 0, pitch: 0 }, 0, 100, 1000, 800).pitch > 0);
  assert.ok(dragLook({ yaw: 0, pitch: 0 }, 0, -100, 1000, 800).pitch < 0);
});

test('tilt stops at its limits', () => {
  assert.equal(dragLook({ yaw: 0, pitch: 0 }, 0, 99999, 1000, 800).pitch, TILT_LIMIT.up);
  assert.equal(dragLook({ yaw: 0, pitch: 0 }, 0, -99999, 1000, 800).pitch, TILT_LIMIT.down);
});

test('a sideways drag does not tilt', () => {
  assert.equal(dragLook({ yaw: 0, pitch: 0.3 }, 250, 0, 1000, 800).pitch, 0.3);
});
