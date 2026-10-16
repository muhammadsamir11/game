import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createVehicle } from '../js/vehiclePhysics.js';
import { MODELS, modelToBricks } from '../js/instructions.js';

const STEP = 1 / 60;

function makeWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  ground.aabbNeedsUpdate = true; // cannon-es caches bounds at construction; rotating the plane makes them stale
  world.addBody(ground);
  return world;
}

function drive(world, car, input, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    car.applyInput(input);
    car.update(STEP, input);
    world.step(STEP);
  }
}

function settledCar(bricks = modelToBricks(MODELS.raceCar)) {
  const world = makeWorld();
  const car = createVehicle(world, bricks, { position: { x: 0, y: 1.2, z: 0 }, heading: 0 });
  drive(world, car, {}, 1.5);
  return { world, car };
}

const upsideDown = car => car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI);

test('a car settles upright on its wheels', () => {
  const { car } = settledCar();
  const y = car.body.position.y;
  assert.ok(car.upY() > 0.95, `upY=${car.upY()}`);
  assert.ok(y > 0.2 && y < 1.2, `y=${y}`);
});

test('GO drives the car forward (+z) in a straight line', () => {
  const { world, car } = settledCar();
  drive(world, car, { throttle: 1 }, 3);
  const p = car.body.position;
  assert.ok(p.z > 8, `z=${p.z}`);
  assert.ok(Math.abs(p.x) < 1.5, `x=${p.x}`);
  assert.ok(car.pose().speed > 5);
});

test('steering left (positive) turns toward +x', () => {
  const { world, car } = settledCar();
  drive(world, car, { throttle: 1, steer: 1 }, 3);
  assert.ok(car.body.position.x > 2, `x=${car.body.position.x}`);
});

test('the car reaches but does not run away past its top speed', () => {
  const { world, car } = settledCar();
  drive(world, car, { throttle: 1 }, 12);
  const v = car.forwardSpeed();
  assert.ok(v > car.stats.topSpeed * 0.8, `v=${v}`);
  assert.ok(v <= car.stats.topSpeed + 1.5, `v=${v}`);
});

test('STOP while moving brakes hard', () => {
  const { world, car } = settledCar();
  drive(world, car, { throttle: 1 }, 3);
  const before = car.forwardSpeed();
  drive(world, car, { brake: 1 }, 1);
  assert.ok(car.forwardSpeed() < before * 0.4, `before=${before} after=${car.forwardSpeed()}`);
});

test('STOP while standing still reverses', () => {
  const { world, car } = settledCar();
  drive(world, car, { brake: 1 }, 2);
  assert.ok(car.body.position.z < -1, `z=${car.body.position.z}`);
});

test('hold keeps the car still (race countdown)', () => {
  const { world, car } = settledCar();
  drive(world, car, { hold: true }, 2);
  assert.ok(car.body.velocity.length() < 0.2);
});

test('flip() puts an upside-down car back on its wheels, lifted up', () => {
  const { car } = settledCar();
  upsideDown(car);
  const y0 = car.body.position.y;
  car.flip();
  assert.ok(car.upY() > 0.99);
  assert.ok(car.body.position.y > y0 + 1);
});

test('a car stuck on its roof rights itself after about 2 seconds', () => {
  const { world, car } = settledCar();
  upsideDown(car);
  car.body.position.y = 1.5;
  drive(world, car, {}, 4);
  assert.ok(car.upY() > 0.9, `upY=${car.upY()}`);
});

test('resetTo places the car at a spot facing a heading', () => {
  const { car } = settledCar();
  car.resetTo({ x: 10, y: 2, z: -5 }, Math.PI / 2);
  const pose = car.pose();
  assert.deepEqual([pose.x, pose.y, pose.z], [10, 2, -5]);
  assert.ok(Math.abs(pose.heading - Math.PI / 2) < 1e-6);
  assert.equal(car.body.velocity.length(), 0);
});

for (const key of Object.keys(MODELS)) {
  test(`${key} drives forward`, () => {
    const { world, car } = settledCar(modelToBricks(MODELS[key]));
    drive(world, car, { throttle: 1 }, 3);
    assert.ok(car.body.position.z > 6, `z=${car.body.position.z}`);
    assert.ok(car.upY() > 0.9);
  });
}

test('a six-wheel car drives forward', () => {
  const bricks = [...modelToBricks(MODELS.raceCar),
    { type: 'wheelSmall', color: 'black', x: -3, y: 0, z: -1, r: 0 },
    { type: 'wheelSmall', color: 'black', x: 2, y: 0, z: -1, r: 0 }];
  const { world, car } = settledCar(bricks);
  assert.equal(car.vehicle.wheelInfos.length, 6);
  drive(world, car, { throttle: 1 }, 3);
  assert.ok(car.body.position.z > 6);
});

test('a very tall tower car still drives forward', () => {
  const tower = Array.from({ length: 10 }, (_, k) => ({ type: 'brick22', color: 'red', x: -1, y: 7 + 3 * k, z: -4, r: 0 }));
  const { world, car } = settledCar([...modelToBricks(MODELS.raceCar), ...tower]);
  drive(world, car, { throttle: 1 }, 3);
  assert.ok(car.body.position.z > 5, `z=${car.body.position.z}`);
});

test('boost makes the car faster than the same car without it', () => {
  const plain = settledCar();
  const boosted = settledCar();
  drive(plain.world, plain.car, { throttle: 1 }, 4);
  drive(boosted.world, boosted.car, { throttle: 1, boost: true }, 4);
  assert.ok(boosted.car.forwardSpeed() > plain.car.forwardSpeed() + 2, `${boosted.car.forwardSpeed()} vs ${plain.car.forwardSpeed()}`);
  assert.ok(boosted.car.forwardSpeed() <= boosted.car.stats.topSpeed * 1.4 + 1.5);
});
