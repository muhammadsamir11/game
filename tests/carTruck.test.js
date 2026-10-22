import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_TRUCK, carSize, planLoad, inLoadZone, groundPoseBehind, cabBricks } from '../js/carTruck.js';
import { MODELS, modelToBricks } from '../js/instructions.js';
import { PRIZE_CARS, prizeBricks } from '../js/prizeCars.js';
import { buildKind } from '../js/bricks.js';
import { buildReadiness } from '../js/carStats.js';
import { TRUCK_YARD } from '../js/cityMap.js';
import { HOOK } from '../js/hitch.js';

const sizeOf = key => carSize(modelToBricks(MODELS[key]));

test('every ready-made, super and prize car fits on an empty car truck', () => {
  for (const key of Object.keys(MODELS).filter(k => !MODELS[k].kind)) assert.equal(planLoad([], sizeOf(key)).ok, true, key);
  for (const { key } of PRIZE_CARS) assert.equal(planLoad([], carSize(prizeBricks(key))).ok, true, key);
});

test('8 ordinary cars fill it: bottom deck first, front to back, then the top; the 9th is told it is full', () => {
  const loaded = [];
  for (let i = 0; i < 8; i++) {
    const r = planLoad(loaded, sizeOf('raceCar'));
    assert.equal(r.ok, true);
    assert.equal(r.deck, i < 4 ? 0 : 1);
    if (i % 4) assert.ok(r.z0 > loaded[i - 1].z0);
    loaded.push(r);
  }
  assert.deepEqual(planLoad(loaded, sizeOf('raceCar')), { ok: false, reason: 'full' });
});

test('a deck never holds more than its length (the limo is long)', () => {
  const limo = carSize(prizeBricks('limo'));
  const loaded = [planLoad([], limo)];
  while (loaded.length < 8) {
    const r = planLoad(loaded, sizeOf('raceCar'));
    if (!r.ok) break;
    loaded.push(r);
  }
  for (const deck of [0, 1]) assert.ok(Math.max(0, ...loaded.filter(s => s.deck === deck).map(s => s.z1)) <= CAR_TRUCK.deckLength);
});

test('a car wider than the deck is too big', () => {
  assert.deepEqual(planLoad([], { length: 4, width: 4.5, height: 1.5 }), { ok: false, reason: 'tooBig' });
});

test('the G-Wagon fits under the top deck', () => {
  assert.equal(planLoad([], carSize(prizeBricks('gwagon'))).deck, 0);
});

test('a car too tall for the bottom deck goes on top', () => {
  const tall = { length: 4, width: 3, height: CAR_TRUCK.bottomRoom + 0.2 };
  assert.equal(planLoad([], tall).deck, 1);
});

test('the car truck cab is a ready truck', () => {
  assert.equal(buildKind(cabBricks()), 'truck');
  assert.equal(buildReadiness(cabBricks()).ready, true);
});

test('the load zone is the pad, the ramp and the deck\'s back edge', () => {
  assert.equal(inLoadZone({ x: 0, z: -5 }), true);
  assert.equal(inLoadZone({ x: 0, z: 5 }), false);
  assert.equal(inLoadZone({ x: 3, z: -2 }), false);
});

test('an unloaded car is put down behind the ramp, facing away from the truck', () => {
  const p = groundPoseBehind({ x: 0, z: 0, heading: 0 }); // the trailer faces +z, so its ramp is toward -z
  assert.ok(Math.abs(p.x) < 1e-9);
  assert.ok(p.z < -CAR_TRUCK.ramp);
  assert.ok(Math.abs(Math.abs(p.heading) - Math.PI) < 1e-9);
});

test('an unloaded car is put down outside the loading zone, so it doesn\'t ride straight back up', () => {
  const p = groundPoseBehind({ x: 0, z: 0, heading: 0 });
  assert.equal(inLoadZone({ x: p.x, z: p.z }), false);
});

test('the car truck fits in its bay with the ramp inside the yard\'s block', () => {
  const hookX = TRUCK_YARD.carTruck.x + HOOK.z; // the cab faces +x
  const rampFoot = hookX - CAR_TRUCK.ringAhead - CAR_TRUCK.deckLength - CAR_TRUCK.ramp;
  assert.ok(rampFoot >= TRUCK_YARD.rect.x0, `ramp foot at ${rampFoot}`);
});
