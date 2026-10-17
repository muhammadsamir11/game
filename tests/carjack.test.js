import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { nearestTraffic, launchDirection, createTumble } from '../js/carjack.js';

// The traffic's drivers and walkers paint their faces on a canvas: a do-nothing one is enough here.
const anything = new Proxy(function () {}, { get: (t, key) => (key === Symbol.toPrimitive ? () => 0 : anything), apply: () => anything, set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => anything }) };
const { createCityTraffic } = await import('../js/cityTraffic.js');

const car = (x, z, over = {}) => ({ mesh: { position: { x, z } }, halfLength: 2, taken: false, ...over });

test('the nearest traffic car within reach is the one to kick out of', () => {
  const near = car(2, 0);
  const cars = [car(3, 0), near, car(0, 10)];
  assert.equal(nearestTraffic(cars, { x: 0, z: 0 }, 3.5), near);
  assert.equal(nearestTraffic([car(5, 0)], { x: 0, z: 0 }, 3.5), null, 'too far');
  assert.equal(nearestTraffic([car(1, 0, { taken: true })], { x: 0, z: 0 }, 3.5), null, 'already borrowed');
  assert.ok(nearestTraffic([car(5, 0, { halfLength: 4 })], { x: 0, z: 0 }, 3.5), 'a long car counts from near its end');
});

test('the driver flies out of the side away from him', () => {
  const heading = 0; // facing +z, so its left-hand side is +x
  assert.deepEqual(launchDirection({ x: 0, z: 0 }, heading, { x: -2, z: 0 }), { x: 1, z: -0 });
  const other = launchDirection({ x: 0, z: 0 }, heading, { x: 2, z: 0 });
  assert.equal(other.x, -1);
});

test('a kicked-out driver flies, bounces, sits dazed, runs off and is gone', () => {
  const tumble = createTumble({ x: 0, z: 0, dir: { x: 1, z: 0 } });
  const phases = [];
  let top = 0;
  let landings = 0;
  let s;
  for (let i = 0; i < 60 * 10; i++) {
    s = tumble.step(1 / 60);
    assert.ok(s.y >= 0, 'never below the road');
    top = Math.max(top, s.y);
    if (s.landed) landings++;
    if (phases.at(-1) !== s.phase) phases.push(s.phase);
    if (s.phase === 'gone') break;
  }
  assert.deepEqual(phases, ['fly', 'dazed', 'run', 'gone']);
  assert.ok(top > 1.5, 'up into the air');
  assert.equal(landings, 1, 'one bump (for one "Hey!")');
  assert.ok(s.x > 10, 'ran away from the car');
  assert.equal(Math.abs(s.z), 0);
});

test('a taken traffic car leaves the road and comes back where it was', () => {
  const world = new CANNON.World();
  const scene = new THREE.Scene();
  const traffic = createCityTraffic(scene, world);
  const [car, other] = traffic.cars;
  const bodies = world.bodies.length;

  traffic.freeze(car);
  const frozenAt = { ...car.mesh.position };
  traffic.update(1, 0.5, null);
  assert.equal(car.mesh.position.x, frozenAt.x, 'a frozen car does not move');
  assert.equal(car.mesh.position.z, frozenAt.z);

  traffic.take(car);
  assert.equal(world.bodies.length, bodies - 1);
  assert.equal(car.mesh.visible, false);
  const before = { ...other.mesh.position };
  traffic.update(0.2, 0.5, null);
  assert.equal(car.mesh.position.x, frozenAt.x, 'a taken car stays off its loop');
  assert.notDeepEqual({ ...other.mesh.position }, before, 'the rest drive on');

  traffic.giveBack(car);
  assert.equal(world.bodies.length, bodies);
  assert.equal(car.mesh.visible, true);
  assert.equal(car.taken, false);
  traffic.update(0.5, 0.5, null);
  assert.notEqual(Math.hypot(car.mesh.position.x - frozenAt.x, car.mesh.position.z - frozenAt.z), 0, 'driving its loop again');
  traffic.dispose();
});
