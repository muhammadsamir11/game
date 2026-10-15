import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis, isValidBrick } from '../js/bricks.js';
import { footprint, cellsOf, canPlace, candidateFromHit, nearestWheelSlot } from '../js/snapping.js';

const chassis = makeChassis();
const brick = (type, x, y, z, r = 0, color = 'red') => ({ type, color, x, y, z, r });

test('footprint swaps width and depth on a quarter turn', () => {
  assert.deepEqual(footprint('brick24', 0), { w: 2, d: 4, h: 3 });
  assert.deepEqual(footprint('brick24', 1), { w: 4, d: 2, h: 3 });
  assert.deepEqual(footprint('brick24', 2), { w: 2, d: 4, h: 3 });
});

test('cellsOf lists every grid cell a brick fills', () => {
  const cells = cellsOf(brick('brick12', 0, 1, 0));
  assert.equal(cells.length, 6);
  assert.ok(cells.includes('0,1,0'));
  assert.ok(cells.includes('0,3,1'));
});

test('a brick can sit on top of the chassis', () => {
  assert.deepEqual(canPlace([chassis], brick('brick24', -2, 1, -4)), { ok: true });
});

test('a brick cannot go where another brick already is', () => {
  const existing = brick('brick22', -2, 1, -4);
  assert.equal(canPlace([chassis, existing], brick('brick12', -1, 2, -3)).reason, 'overlap');
});

test('a brick needs something underneath it', () => {
  assert.equal(canPlace([chassis], brick('brick22', -2, 5, -4)).reason, 'floating');
});

test('a brick cannot leave the baseplate area', () => {
  assert.equal(canPlace([chassis], brick('brick24', 5, 1, 0)).reason, 'outOfBounds');
});

test('a brick may hang over the edge if one stud is supported', () => {
  assert.deepEqual(canPlace([chassis], brick('brick24', 1, 1, 0, 1)), { ok: true });
});

test('wheels only fit the wheel slots beside the chassis', () => {
  assert.deepEqual(canPlace([chassis], brick('wheelSmall', -3, 0, 2, 0, 'black')), { ok: true });
  assert.equal(canPlace([chassis], brick('wheelSmall', -3, 0, 0, 0, 'black')).reason, 'wheelSlot');
  assert.equal(canPlace([chassis], brick('wheelSmall', 0, 1, 0, 0, 'black')).reason, 'wheelSlot');
});

test('two wheels cannot share a slot', () => {
  const wheel = brick('wheelSmall', 2, 0, -4, 0, 'black');
  assert.equal(canPlace([chassis, wheel], brick('wheelLarge', 2, 0, -4, 0, 'black')).reason, 'overlap');
});

test('wheels do not hold bricks up', () => {
  const wheel = brick('wheelSmall', -3, 0, 2, 0, 'black');
  assert.equal(canPlace([chassis, wheel], brick('brick12', -3, 3, 2)).reason, 'floating');
});

test('unknown brick types are refused', () => {
  assert.equal(canPlace([chassis], brick('rocket', 0, 1, 0)).reason, 'unknown');
});

test('tapping a top face centres the brick on the tapped stud', () => {
  assert.deepEqual(candidateFromHit('brick24', 0, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }), { type: 'brick24', r: 0, x: 0, y: 1, z: -1 });
});

test('tapping a side face puts the brick beside that face', () => {
  assert.deepEqual(candidateFromHit('brick24', 0, { x: -3, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }), { type: 'brick24', r: 0, x: -4, y: 1, z: -1 });
  assert.deepEqual(candidateFromHit('brick22', 0, { x: 0, y: 1, z: 4 }, { x: 0, y: 0, z: 1 }), { type: 'brick22', r: 0, x: 0, y: 1, z: 4 });
});

test('nearestWheelSlot picks the closest corner', () => {
  assert.deepEqual(nearestWheelSlot(-2.6, 3.2), { x: -3, y: 0, z: 2 });
  assert.deepEqual(nearestWheelSlot(3, -3), { x: 2, y: 0, z: -4 });
});

test('isValidBrick rejects unknown types, colours and fractional positions', () => {
  assert.equal(isValidBrick(brick('brick22', 0, 1, 0)), true);
  assert.equal(isValidBrick(brick('rocket', 0, 1, 0)), false);
  assert.equal(isValidBrick(brick('brick22', 0, 1, 0, 0, 'gold')), false);
  assert.equal(isValidBrick(brick('brick22', 0.5, 1, 0)), false);
  assert.equal(isValidBrick(null), false);
});
