import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis, buildKind, isValidBrick } from '../js/bricks.js';
import { canPlace, nearestWheelSlot } from '../js/snapping.js';

const part = (type, x, y, z, extra = {}) => ({ type, color: 'red', x, y, z, r: 0, ...extra });
const wheel = (x, z, type = 'wheelLarge') => ({ type, color: 'black', x, y: 0, z, r: 0 });

test('a build is a car, a truck or a trailer, from its chassis', () => {
  assert.equal(buildKind([makeChassis()]), 'car');
  assert.equal(buildKind([makeChassis('truck')]), 'truck');
  assert.equal(buildKind([makeChassis('trailer')]), 'trailer');
  assert.equal(buildKind([]), 'car');
  for (const kind of ['car', 'truck', 'trailer']) assert.ok(isValidBrick(makeChassis(kind)), kind);
});

test('truck wheels go at the front and two pairs at the back', () => {
  const truck = [makeChassis('truck')];
  for (const z of [3, -3, -5]) for (const x of [-3, 2]) assert.deepEqual(canPlace(truck, wheel(x, z)), { ok: true }, `${x},${z}`);
  assert.equal(canPlace(truck, wheel(-3, 0)).reason, 'wheelSlot');
});

test('trailer wheels go at the back only', () => {
  const trailer = [makeChassis('trailer')];
  for (const z of [-5, -7]) assert.deepEqual(canPlace(trailer, wheel(2, z)), { ok: true });
  assert.equal(canPlace(trailer, wheel(2, 3)).reason, 'wheelSlot');
});

test('nothing may poke past the hook end', () => {
  // a 2×4 brick lying across the back edge of the truck, and across the front edge of the trailer
  assert.equal(canPlace([makeChassis('truck')], part('brick24', -1, 1, -7)).reason, 'hookClear');
  assert.equal(canPlace([makeChassis('trailer')], part('brick24', -1, 1, 6)).reason, 'hookClear');
  assert.equal(canPlace([makeChassis('truck')], part('brick24', 5, 1, 0)).reason, 'outOfBounds');
});

test('nearestWheelSlot snaps to the right chassis', () => {
  assert.deepEqual(nearestWheelSlot(2.5, -2, 'truck'), { x: 2, y: 0, z: -3 });
  assert.deepEqual(nearestWheelSlot(-2.5, -6, 'trailer'), { x: -3, y: 0, z: -7 });
});
