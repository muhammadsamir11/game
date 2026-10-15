import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis } from '../js/bricks.js';
import { raceReadiness, computeStats, LIMITS } from '../js/carStats.js';

const part = (type, x, y, z, color = 'black', r = 0) => ({ type, color, x, y, z, r });
const corners = (type = 'wheelSmall') => [part(type, -3, 0, 2), part(type, 2, 0, 2), part(type, -3, 0, -4), part(type, 2, 0, -4)];
const basicCar = () => [makeChassis(), ...corners(), part('engine', -1, 1, -4), part('seat', -1, 1, -1, 'white')];

test('a bare chassis is not ready to race', () => {
  assert.deepEqual(raceReadiness([makeChassis()]), { chassis: true, wheels: false, engine: false, seat: false, ready: false });
});

test('chassis + four corner wheels + engine + seat is race-ready', () => {
  assert.equal(raceReadiness(basicCar()).ready, true);
});

test('a missing corner wheel makes the car not ready', () => {
  const car = basicCar().filter(b => !(b.type === 'wheelSmall' && b.x === -3 && b.z === -4));
  const r = raceReadiness(car);
  assert.equal(r.wheels, false);
  assert.equal(r.ready, false);
});

test('middle wheels do not replace a back corner wheel', () => {
  const car = [makeChassis(), part('wheelSmall', -3, 0, 2), part('wheelSmall', 2, 0, 2),
    part('wheelSmall', -3, 0, -1), part('wheelSmall', 2, 0, -1), part('engine', -1, 1, -4), part('seat', -1, 1, -1)];
  assert.equal(raceReadiness(car).wheels, false);
});

test('computeStats adds up mass and separates wheels from body boxes', () => {
  const s = computeStats(basicCar());
  assert.equal(s.mass, 85);
  assert.equal(s.boxes.length, 3);
  assert.equal(s.wheels.length, 4);
  assert.equal(s.wheels.filter(w => w.front).length, 2);
  assert.deepEqual(s.wheels[0], { type: 'wheelSmall', color: 'black', radius: 0.35, x: -1.25, y: 0.1, z: 1.5, front: true });
  assert.equal(s.engines, 1);
  assert.equal(s.engineForce, 750);
  assert.equal(s.topSpeed, 14);
  assert.equal(s.frictionSlip, 3);
  assert.equal(s.brakeForce, 85 * 0.05);
});

test('centre of mass sits low and in the middle for a symmetric car', () => {
  const { x, y } = computeStats(basicCar()).centerOfMass;
  assert.ok(Math.abs(x) < 1e-9, `x=${x}`);
  assert.ok(Math.abs(y - 0.255) < 0.01, `y=${y}`);
});

test('brick boxes are in metres around the brick centre', () => {
  const s = computeStats([makeChassis()]);
  assert.deepEqual(s.boxes[0], { cx: 0, cy: 0.1, cz: 0, hx: 1, hy: 0.1, hz: 2 });
});

test('a very tall tower car stays drivable: speed clamps to the minimum', () => {
  const tower = Array.from({ length: 20 }, (_, k) => part('brick22', -1, 1 + 3 * k, 1, 'red'));
  const s = computeStats([...basicCar(), ...tower]);
  assert.equal(s.topSpeed, LIMITS.minTopSpeed);
  assert.equal(s.engineForce, 750);
  assert.ok(s.centerOfMass.y > 2);
});

test('extra engines stop helping after three', () => {
  const engines = [part('engine', -1, 1, 1), part('engine', -1, 4, 1), part('engine', -1, 7, 1), part('engine', -1, 10, 1)];
  const s = computeStats([...basicCar(), ...engines]);
  assert.equal(s.engines, 5);
  assert.equal(s.engineForce, 1350);
  assert.ok(s.topSpeed <= LIMITS.maxTopSpeed);
});

test('six wheels grip better than four', () => {
  const s = computeStats([...basicCar(), part('wheelSmall', -3, 0, -1), part('wheelSmall', 2, 0, -1)]);
  assert.equal(s.wheels.length, 6);
  assert.equal(s.frictionSlip, 3.5);
  assert.equal(s.wheels.filter(w => w.front).length, 2);
});
