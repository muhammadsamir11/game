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

// Width of the circle a car drives at walking pace with full steering.
function turningCircle(options) {
  const world = makeWorld();
  const car = createVehicle(world, modelToBricks(MODELS.raceCar), { position: { x: 0, y: 1.2, z: 0 }, heading: 0 }, options);
  drive(world, car, {}, 1);
  const xs = [];
  for (let i = 0; i < 60 * 14; i++) {
    const throttle = car.forwardSpeed() < 2.5 ? 0.6 : 0;
    car.applyInput({ steer: 1, throttle });
    world.step(STEP);
    if (i > 300) xs.push(car.body.position.x);
  }
  return Math.max(...xs) - Math.min(...xs);
}

test('tight turns (city parking) make the slow turning circle much smaller', () => {
  const normal = turningCircle();
  const tight = turningCircle({ tightTurns: true });
  assert.ok(normal > 10, `normal=${normal}`);
  assert.ok(tight < 8, `tight=${tight}`);
});

test('flipLift sets how far Flip me! lifts the car (default 1.5 m)', () => {
  for (const [options, lift] of [[undefined, 1.5], [{ flipLift: 0.5 }, 0.5]]) {
    const world = makeWorld();
    const car = createVehicle(world, modelToBricks(MODELS.raceCar), { position: { x: 0, y: 1.2, z: 0 }, heading: 0 }, options);
    drive(world, car, {}, 1.5);
    const y = car.body.position.y;
    car.flip();
    assert.ok(Math.abs(car.body.position.y - y - lift) < 1e-6, `lift=${car.body.position.y - y}`);
  }
});

// A settled car thrown high into the air (8 m up, rising and moving forward).
function launchedCar(options) {
  const world = makeWorld();
  const car = createVehicle(world, modelToBricks(MODELS.raceCar), { position: { x: 0, y: 1.2, z: 0 }, heading: 0 }, options);
  drive(world, car, {}, 1.5);
  car.body.position.y += 8;
  car.body.velocity.set(0, 8, 6);
  world.step(STEP);
  return { world, car };
}
const localSpin = car => car.body.quaternion.conjugate().vmult(car.body.angularVelocity);
function turnInAir(world, car, input, seconds) {
  let pitch = 0;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    car.applyInput(input);
    world.step(STEP);
    pitch += localSpin(car).x * STEP;
  }
  return pitch;
}

test('air control: holding GO in the air flips the car forward (nose down)', () => {
  const { world, car } = launchedCar({ airControl: true });
  const pitch = turnInAir(world, car, { throttle: 1 }, 1.2);
  assert.ok(pitch >= (300 * Math.PI) / 180, `pitch=${pitch}`);
});

test('air control: holding STOP flips it backward, ◀ spins it left', () => {
  const back = launchedCar({ airControl: true });
  assert.ok(turnInAir(back.world, back.car, { brake: 1 }, 1.2) <= -(300 * Math.PI) / 180);
  const spin = launchedCar({ airControl: true });
  const h0 = spin.car.pose().heading;
  for (let i = 0; i < 20; i++) {
    spin.car.applyInput({ steer: 1 });
    spin.world.step(STEP);
  }
  assert.ok(spin.car.pose().heading - h0 > 0.5, 'turned toward the left');
});

test('air control: nothing held levels a tilted car in the air', () => {
  const { world, car } = launchedCar({ airControl: true });
  car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -(40 * Math.PI) / 180);
  car.body.angularVelocity.setZero();
  const before = car.upY();
  turnInAir(world, car, {}, 0.6);
  assert.ok(car.upY() - before >= 0.1, `upY ${before} → ${car.upY()}`);
});

test('air control does nothing with wheels on the ground', () => {
  const a = settledCar();
  const worldB = makeWorld();
  const b = createVehicle(worldB, modelToBricks(MODELS.raceCar), { position: { x: 0, y: 1.2, z: 0 }, heading: 0 }, { airControl: true });
  drive(worldB, b, {}, 1.5);
  drive(a.world, a.car, { throttle: 1, steer: 1 }, 1);
  drive(worldB, b, { throttle: 1, steer: 1 }, 1);
  const pa = a.car.pose();
  const pb = b.pose();
  assert.ok(Math.hypot(pa.x - pb.x, pa.z - pb.z) < 1e-6 && Math.abs(pa.heading - pb.heading) < 1e-6);
});

test('races (no air control) never turn in the air', () => {
  const { world, car } = launchedCar();
  assert.ok(Math.abs(turnInAir(world, car, { throttle: 1 }, 1)) < Math.PI / 3);
});

test('wheelsDown counts the wheels touching the ground', () => {
  const { car } = settledCar();
  assert.equal(car.wheelsDown(), car.stats.wheels.length);
  const flying = launchedCar();
  assert.equal(flying.car.wheelsDown(), 0);
});

test('wheelsDown survives the wheel-mesh sync (updateWheelTransform clears isInContact)', () => {
  const { car } = settledCar();
  car.vehicle.wheelInfos.forEach((_, i) => car.vehicle.updateWheelTransform(i)); // what drivenCar.sync does every frame
  assert.equal(car.wheelsDown(), car.stats.wheels.length);
});

test('air control: a button already held when the car left the ground does not turn it (kids hold GO all the time)', () => {
  const world = makeWorld();
  const car = createVehicle(world, modelToBricks(MODELS.raceCar), { position: { x: 0, y: 1.2, z: 0 }, heading: 0 }, { airControl: true });
  drive(world, car, {}, 1.5);
  for (let i = 0; i < 30; i++) { car.applyInput({ throttle: 1, steer: 1 }); world.step(STEP); } // holding GO and ◀ on the ground
  car.body.position.y += 8;
  car.body.velocity.set(0, 8, 6);
  const h0 = car.pose().heading;
  const pitch = turnInAir(world, car, { throttle: 1, steer: 1 }, 1);
  assert.ok(Math.abs(pitch) < Math.PI / 3, `pitch=${pitch}`);
  assert.ok(Math.abs(car.pose().heading - h0) < Math.PI / 3, 'no spin either');
});

test('air control: let go and press again in the air, and it flips', () => {
  const world = makeWorld();
  const car = createVehicle(world, modelToBricks(MODELS.raceCar), { position: { x: 0, y: 1.2, z: 0 }, heading: 0 }, { airControl: true });
  drive(world, car, {}, 1.5);
  for (let i = 0; i < 30; i++) { car.applyInput({ throttle: 1 }); world.step(STEP); }
  car.body.position.y += 8;
  car.body.velocity.set(0, 8, 6);
  turnInAir(world, car, { throttle: 1 }, 0.1);
  turnInAir(world, car, {}, 0.05); // let go
  assert.ok(turnInAir(world, car, { throttle: 1 }, 1.2) >= (300 * Math.PI) / 180);
});

test('a car on its roof is not "in the air": GO does not cartwheel it, and it still rights itself', () => {
  const { world, car } = (() => {
    const w = makeWorld();
    const c = createVehicle(w, modelToBricks(MODELS.raceCar), { position: { x: 0, y: 1.5, z: 0 }, heading: 0 }, { airControl: true });
    c.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI);
    for (let i = 0; i < 90; i++) w.step(STEP); // settle on its roof
    return { world: w, car: c };
  })();
  assert.equal(car.inAir(), false);
  const start = car.body.position.clone();
  let righted = false;
  for (let i = 0; i < 180; i++) {
    car.applyInput({ throttle: 1 });
    if (car.update(STEP, {})) righted = true;
    world.step(STEP);
    if (righted) break;
  }
  const moved = Math.hypot(car.body.position.x - start.x, car.body.position.z - start.z);
  assert.ok(righted, 'the 2 s auto-right still fires');
  assert.ok(moved < 2, `moved ${moved} m`);
});

test('inAir: true only with no wheel down and nothing touching the body', () => {
  const { car } = settledCar();
  assert.equal(car.inAir(), false);
  const flying = launchedCar({ airControl: true });
  assert.equal(flying.car.inAir(), true);
});

test('air control: a short tap of GO in the air finishes a whole flip', () => {
  const { world, car } = launchedCar({ airControl: true });
  let pitch = turnInAir(world, car, { throttle: 1 }, 0.1);
  pitch += turnInAir(world, car, {}, 1.0);
  assert.ok(pitch >= (300 * Math.PI) / 180 && pitch <= (420 * Math.PI) / 180, `pitch=${pitch}`);
});
