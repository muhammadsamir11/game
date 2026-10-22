import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis, buildKind, isValidBrick } from '../js/bricks.js';
import { canPlace, nearestWheelSlot } from '../js/snapping.js';
import { buildReadiness, raceReadiness, computeStats, TRUCK_TOP_SPEED } from '../js/carStats.js';
import { canHook, poseBehind, trailerSteer, towScale, MAX_TRAILER_STEER, TRAILER_STEER_SIGN } from '../js/hitch.js';
import { MODELS, modelToBricks } from '../js/instructions.js';

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

const readyTruck = () => [
  makeChassis('truck'),
  ...[3, -3, -5].flatMap(z => [wheel(-3, z), wheel(2, z)]),
  part('engine', -1, 1, 3),
  part('seat', -1, 1, 0),
];

test('a truck needs all 6 wheels, an engine and a seat', () => {
  const truck = readyTruck();
  assert.equal(buildReadiness(truck).ready, true);
  assert.equal(raceReadiness(truck).ready, true);
  assert.equal(buildReadiness(truck.filter(b => !(b.type === 'wheelLarge' && b.z === -5 && b.x === 2))).checks.wheels, false);
});

test('a trailer needs only a pair of back wheels, and never races', () => {
  const trailer = [makeChassis('trailer'), wheel(-3, -7), wheel(2, -7)];
  assert.deepEqual(buildReadiness(trailer), { kind: 'trailer', checks: { wheels: true }, ready: true });
  assert.equal(buildReadiness([makeChassis('trailer'), wheel(-3, -7)]).ready, false);
  assert.equal(raceReadiness(trailer).ready, false);
});

test('trucks are slower than the fastest car', () => {
  assert.ok(computeStats(readyTruck()).topSpeed <= TRUCK_TOP_SPEED);
  assert.ok(TRUCK_TOP_SPEED < computeStats(modelToBricks(MODELS.chiron)).topSpeed);
});

test('hook on only when close, lined up and slow', () => {
  const base = { hook: { x: 0, y: 0.5, z: 0 }, ring: { x: 1, y: 0.5, z: 0.5 }, truckHeading: 0, trailerHeading: 0.3, speed: 0.4 };
  assert.equal(canHook(base), true);
  assert.equal(canHook({ ...base, ring: { x: 2, y: 0.5, z: 0 } }), false);
  assert.equal(canHook({ ...base, trailerHeading: 1.5 }), false);
  assert.equal(canHook({ ...base, speed: 3 }), false);
});

test('a trailer straightens out right behind the hook', () => {
  const p = poseBehind({ x: 10, z: 10 }, Math.PI / 2, 5.5); // truck facing +x
  assert.ok(Math.abs(p.x - 4.5) < 1e-9 && Math.abs(p.z - 10) < 1e-9 && p.heading === Math.PI / 2);
  assert.equal(trailerSteer(10), MAX_TRAILER_STEER * Math.sign(TRAILER_STEER_SIGN));
  assert.equal(towScale(100, 1000), 2.5);
});
