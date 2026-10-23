import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKind, isValidBrick, BRICK_TYPES, TRAY_GROUPS } from '../js/bricks.js';
import { canPlace } from '../js/snapping.js';
import { buildReadiness, computeStats } from '../js/carStats.js';
import { busBricks } from '../js/schoolBus.js';
import { resolveRider } from '../js/riders.js';

test('the 1×1 brick is a brick in the Bricks tab', () => {
  assert.deepEqual({ ...BRICK_TYPES.brick11 }, { name: 'Brick 1×1', w: 1, d: 1, h: 3, mass: 2, kind: 'brick' });
  assert.ok(TRAY_GROUPS.find(g => g.key === 'bricks').types.includes('brick11'));
});

test('the school bus is a truck that could be built brick by brick', () => {
  const bus = busBricks();
  assert.equal(buildKind(bus), 'truck');
  for (const b of bus) assert.ok(isValidBrick(b), JSON.stringify(b));
  bus.slice(1).forEach((b, i) => assert.deepEqual(canPlace(bus.slice(0, i + 1), b), { ok: true }, JSON.stringify(b)));
  assert.equal(buildReadiness(bus).ready, true);
  assert.ok(computeStats(bus).topSpeed > 0);
});

test('two classmates ride the bus: his first two friends, or a classmate and the teacher', () => {
  const riders = bricks => bricks.filter(b => b.type === 'passengerSeat').map(b => b.rider);
  assert.deepEqual(riders(busBricks()), ['preset:classmate', 'preset:teacher']);
  assert.deepEqual(riders(busBricks([{ id: 'a' }])), ['friend:a', 'preset:classmate']);
  assert.deepEqual(riders(busBricks([{ id: 'a' }, { id: 'b' }, { id: 'c' }])), ['friend:a', 'friend:b']);
  assert.equal(resolveRider('preset:classmate').name, 'Classmate');
  assert.equal(resolveRider('preset:teacher').name, 'Teacher');
});
