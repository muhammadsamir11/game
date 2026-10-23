import test from 'node:test';
import assert from 'node:assert/strict';
import { BRICK_TYPES, TRAY_GROUPS, TRAY_ORDER, groupOf, makeChassis, isValidBrick, isPrizePart } from '../js/bricks.js';
import { canPlace } from '../js/snapping.js';
import { raceReadiness } from '../js/carStats.js';

const NEW_PARTS = ['passengerSeat', 'dog', 'cat', 'parrot', 'bunny', 'rocket', 'wings', 'propeller', 'siren', 'horn', 'exhaust', 'flag', 'ladder', 'toolbox', 'crate', 'trophy', 'cannon', 'windshield'];
const FIXED = ['dog', 'cat', 'parrot', 'bunny', 'siren', 'horn', 'exhaust', 'ladder', 'crate', 'trophy', 'windshield', 'badge', 'namePlate',
  'battery', 'eMotor', 'glassRoof', 'grille', 'ornament', 'starRoof', 'spareWheel', 'sidePipe', 'discoPanel'];
const part = (type, x, y, z, extra = {}) => ({ type, color: 'red', x, y, z, r: 0, ...extra });

test('all 18 new parts exist with whole-number sizes and a weight', () => {
  for (const key of NEW_PARTS) {
    const t = BRICK_TYPES[key];
    assert.ok(t, key);
    for (const n of [t.w, t.d, t.h]) assert.ok(Number.isInteger(n) && n > 0, `${key} size`);
    assert.ok(t.mass > 0, `${key} mass`);
  }
});

test('every part except the chassis and prize parts is in exactly one tray tab', () => {
  const keys = Object.keys(BRICK_TYPES).filter(k => !BRICK_TYPES[k].chassis && !BRICK_TYPES[k].prize);
  for (const key of keys) assert.equal(TRAY_GROUPS.filter(g => g.types.includes(key)).length, 1, key);
  assert.equal(TRAY_ORDER.length, keys.length);
  assert.deepEqual(TRAY_GROUPS.map(g => g.key), ['bricks', 'wheels', 'supercar', 'tesla', 'people', 'gadgets', 'extras']);
  assert.equal(groupOf('dog'), 'people');
  assert.equal(groupOf('rocket'), 'gadgets');
  assert.equal(groupOf('crate'), 'extras');
  assert.equal(groupOf('chassis'), null);
  assert.equal(groupOf('truckChassis'), null);
});

test('exactly the natural-coloured parts ignore the colour choice', () => {
  const fixed = Object.keys(BRICK_TYPES).filter(k => BRICK_TYPES[k].fixedColor);
  assert.deepEqual(fixed.sort(), [...FIXED].sort());
});

test('four gadgets do something in races', () => {
  const actions = Object.fromEntries(Object.entries(BRICK_TYPES).filter(([, t]) => t.action).map(([k, t]) => [k, t.action]));
  assert.deepEqual(actions, { rocket: 'boost', horn: 'horn', siren: 'siren', cannon: 'confetti' });
});

test('wings may stick out one stud past each side of the car', () => {
  const chassis = makeChassis();
  assert.deepEqual(canPlace([chassis], part('wings', -3, 1, -2)), { ok: true });
  const frontWheel = part('wheelSmall', -3, 0, 2, { color: 'black' });
  assert.equal(canPlace([chassis, frontWheel], part('wings', -3, 1, 2)).reason, 'overlap');
  assert.equal(canPlace([chassis], part('wings', 1, 1, 0)).reason, 'outOfBounds'); // x 1..6 runs past the edge at 6
});

test('tall and long extras follow the normal rules', () => {
  const chassis = makeChassis();
  assert.deepEqual(canPlace([chassis], part('flag', 1, 1, -4)), { ok: true });
  assert.deepEqual(canPlace([chassis], part('ladder', -1, 1, -4)), { ok: true });
  assert.equal(canPlace([chassis], part('trophy', 0, 4, 0)).reason, 'floating');
});

test('passengers and animals do not make a car race-ready', () => {
  const car = [makeChassis(), part('passengerSeat', -1, 1, 0), part('dog', 0, 1, -2)];
  assert.equal(raceReadiness(car).seat, false);
});

test('a brick may carry a rider name; anything else there is rejected', () => {
  assert.equal(isValidBrick(part('passengerSeat', 0, 1, 0, { rider: 'preset:pirate' })), true);
  assert.equal(isValidBrick(part('passengerSeat', 0, 1, 0)), true);
  assert.equal(isValidBrick(part('passengerSeat', 0, 1, 0, { rider: 42 })), false);
});

test('prize parts are in no tray tab', () => {
  const prize = ['grille', 'ornament', 'coachDoor', 'starRoof', 'wheelOffroad', 'spareWheel', 'sidePipe', 'limoPlate', 'discoPanel'];
  for (const key of prize) {
    assert.ok(BRICK_TYPES[key]?.prize, key);
    assert.ok(isPrizePart(key), key);
    assert.equal(groupOf(key), null, key);
    const t = BRICK_TYPES[key];
    for (const n of [t.w, t.d, t.h]) assert.ok(Number.isInteger(n) && n > 0, `${key} size`);
    assert.ok(t.mass > 0, `${key} mass`);
  }
  assert.equal(isPrizePart('brick12'), false);
  assert.equal(BRICK_TYPES.spareWheel.kind, 'spare'); // decoration, never a physics wheel
  assert.equal(BRICK_TYPES.wheelOffroad.kind, 'wheel');
  assert.equal(BRICK_TYPES.wheelOffroad.radius, 0.5);
});
