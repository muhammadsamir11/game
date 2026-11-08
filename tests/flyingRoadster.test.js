import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { BRICK_TYPES } from '../js/bricks.js';
import { raceReadiness, isElectric } from '../js/carStats.js';
import { gadgetsOf, createFlight, FLY } from '../js/gadgets.js';
import { createVehicle } from '../js/vehiclePhysics.js';
import { MODELS, modelToBricks } from '../js/instructions.js';
import { packState, unpackState, FX_KINDS } from '../js/net/protocol.js';

const STEP = 1 / 60;
const bricks = () => modelToBricks(MODELS.teslaRoadsterFlying);

function makeWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  ground.aabbNeedsUpdate = true;
  world.addBody(ground);
  return world;
}
// steps: physics steps per frame (a slow tablet runs two for each input).
function drive(world, car, input, seconds, steps = 1) {
  for (let i = 0; i < Math.round(seconds / STEP / steps); i++) {
    car.applyInput(input);
    car.update(STEP * steps, input);
    for (let k = 0; k < steps; k++) world.step(STEP);
  }
}
function parked() {
  const world = makeWorld();
  const car = createVehicle(world, bricks(), { position: { x: 0, y: 1.2, z: 0 }, heading: 0 });
  drive(world, car, {}, 1.5);
  return { world, car, groundY: car.body.position.y };
}

test('the flying Roadster: a white Tesla with SpaceX thrusters, electric and ready to race', () => {
  const m = MODELS.teslaRoadsterFlying;
  assert.deepEqual([m.name, m.brand, m.electric, m.realTopSpeed], ['Tesla Roadster Flying Car', 'tesla', true, 400]);
  assert.ok(m.steps.length <= 16);
  assert.equal(m.steps.filter(s => s.type === 'thrusters').length, 2);
  assert.ok(isElectric(bricks()));
  assert.ok(raceReadiness(bricks()).ready);
  assert.deepEqual(gadgetsOf(bricks()), ['fly', 'boost']);
  assert.equal(BRICK_TYPES.thrusters.action, 'fly');
});

test('a flight goes up, then floats down, then recharges', () => {
  const f = createFlight();
  assert.equal(f.mode, null);
  assert.ok(f.trigger());
  assert.equal(f.mode, 'up');
  assert.ok(!f.trigger(), 'no second take-off mid-flight');
  f.update(FLY.flight + 0.1);
  assert.equal(f.mode, 'land');
  f.update(FLY.landing);
  assert.equal(f.mode, null);
  assert.ok(f.charge < 0.1 && !f.trigger(), 'charging');
  f.update(FLY.recharge);
  assert.equal(f.charge, 1);
  assert.ok(f.trigger());
});

for (const steps of [1, 2]) {
  test(`it lifts off, hovers about ${FLY.height} m up, flies forward and turns, then lands on its wheels (${steps} step${steps > 1 ? 's' : ''} a frame)`, () => {
    const { world, car, groundY } = parked();
    drive(world, car, { fly: 'up' }, 4, steps);
    const hover = car.body.position.y - groundY;
    assert.ok(Math.abs(hover - FLY.height) < 0.5, `hovering ${hover.toFixed(2)} m up`);
    assert.ok(car.inAir() && car.upY() > 0.95, 'level, in the air');
    const z0 = car.body.position.z;
    drive(world, car, { fly: 'up', throttle: 1 }, 2, steps);
    assert.ok(car.body.position.z - z0 > 5, 'GO flies it forward');
    assert.ok(Math.abs(car.body.position.y - groundY - FLY.height) < 0.8, 'and it stays up');
    const h0 = car.pose().heading;
    drive(world, car, { fly: 'up', steer: 1 }, 1, steps);
    assert.ok(Math.abs(car.pose().heading - h0) > 1, '◀ turns it');
    let fastest = 0;
    for (let t = 0; t < FLY.landing; t += 0.1) {
      drive(world, car, { fly: 'land' }, 0.1, steps);
      fastest = Math.min(fastest, car.body.velocity.y);
    }
    assert.ok(fastest > -3, `floats down gently (${fastest.toFixed(2)} m/s)`);
    assert.ok(car.wheelsDown() === 4 && car.upY() > 0.95, 'back on its wheels');
    drive(world, car, {}, 1, steps);
    assert.ok(Math.abs(car.body.position.y - groundY) < 0.1, 'parked again');
  });
}

test('if nobody drives it, the thrusters stop and it comes down', () => {
  const { world, car, groundY } = parked();
  drive(world, car, { fly: 'up' }, 3);
  for (let i = 0; i < 180; i++) world.step(STEP); // he got out: no more input
  assert.ok(car.body.position.y - groundY < 0.3);
});

test('friends see the flying: the fly flag and the fly sound go over the network', () => {
  assert.ok(unpackState(packState({ p: { x: 0, y: 0, z: 0 }, fly: true })).fly);
  assert.ok(!unpackState(packState({ p: { x: 0, y: 0, z: 0 }, boost: true })).fly);
  assert.ok(FX_KINDS.includes('fly'));
});
