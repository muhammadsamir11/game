import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createWalker, stickToWorld, findExit, stickSpeed, WALK_SPEED, SURFACE_MATERIAL } from '../js/walker.js';
import { stickVector } from '../js/joystick.js';

const STEP = 1 / 60;

function makeWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: SURFACE_MATERIAL });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  ground.aabbNeedsUpdate = true;
  world.addBody(ground);
  return world;
}

function staticBox(world, [cx, cy, cz], [hx, hy, hz], rotX = 0) {
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), material: SURFACE_MATERIAL });
  body.position.set(cx, cy, cz);
  body.quaternion.setFromEuler(rotX, 0, 0);
  body.aabbNeedsUpdate = true;
  world.addBody(body);
}

function walk(world, walker, stick, seconds, yaw = 0) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    walker.move(stick, yaw);
    world.step(STEP);
  }
}

test('stick up walks where the camera looks; stick right walks to the screen right', () => {
  const up = stickToWorld({ x: 0, y: 1 }, 0);
  assert.ok(Math.abs(up.x) < 1e-9 && Math.abs(up.z - 1) < 1e-9);
  const right = stickToWorld({ x: 1, y: 0 }, 0);
  assert.ok(Math.abs(right.x + 1) < 1e-9 && Math.abs(right.z) < 1e-9);
  const turned = stickToWorld({ x: 0, y: 1 }, Math.PI / 2);
  assert.ok(Math.abs(turned.x - 1) < 1e-9);
});

test('the joystick reading is clamped to the circle and y points up', () => {
  assert.deepEqual(stickVector(0, -50, 50), { x: 0, y: 1 });
  const far = stickVector(300, 0, 50);
  assert.ok(Math.abs(far.x - 1) < 1e-9 && far.y === 0);
  const v = stickVector(30, 40, 50);
  assert.ok(Math.abs(v.x - 0.6) < 1e-9 && Math.abs(v.y + 0.8) < 1e-9);
});

test('walking forward for a second covers about 4 m, then stops when the stick is let go', () => {
  const world = makeWorld();
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 } });
  walk(world, walker, { x: 0, y: 1 }, 1);
  assert.ok(walker.body.position.z > WALK_SPEED * 0.8, `z=${walker.body.position.z}`);
  walk(world, walker, { x: 0, y: 0 }, 0.3);
  assert.ok(Math.hypot(walker.body.velocity.x, walker.body.velocity.z) < 0.1);
  assert.ok(Math.abs(walker.heading) < 1e-9, 'faces where he walked');
});

test('he speeds up over a few frames instead of jumping to full speed', () => {
  const world = makeWorld();
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 } });
  walk(world, walker, { x: 0, y: 1 }, STEP);
  assert.ok(walker.speed > 0 && walker.speed < WALK_SPEED * 0.5, `first frame ${walker.speed}`);
  walk(world, walker, { x: 0, y: 1 }, 0.5);
  assert.ok(walker.speed > WALK_SPEED * 0.95, `after half a second ${walker.speed}`);
});

test('a light push walks, a full push runs', () => {
  assert.equal(stickSpeed(0), 0);
  assert.ok(stickSpeed(0.3) < WALK_SPEED * 0.5);
  assert.ok(stickSpeed(0.6) < stickSpeed(1));
  assert.equal(stickSpeed(1), WALK_SPEED);
});

test('he turns round smoothly, not in one frame', () => {
  const world = makeWorld();
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 }, heading: 0 });
  walk(world, walker, { x: -1, y: 0 }, STEP); // stick left: face +x
  assert.ok(walker.heading > 0 && walker.heading < 0.5, `after one frame ${walker.heading}`);
  walk(world, walker, { x: -1, y: 0 }, 0.5);
  assert.ok(Math.abs(walker.heading - Math.PI / 2) < 1e-6, `after half a second ${walker.heading}`);
});

test('a wall stops him', () => {
  const world = makeWorld();
  staticBox(world, [0, 2, 3], [5, 2, 0.5]);
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 } });
  walk(world, walker, { x: 0, y: 1 }, 2);
  assert.ok(walker.body.position.z < 2.3, `z=${walker.body.position.z}`);
});

test('he can walk up a garage ramp', () => {
  const world = makeWorld();
  const angle = Math.atan2(3, 20);
  staticBox(world, [0, 1.5 - 0.15, 12], [3, 0.15, Math.hypot(3, 20) / 2], -angle);
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 } });
  walk(world, walker, { x: 0, y: 1 }, 4); // ~16 m: well up the 20 m ramp, not off its top
  assert.ok(walker.body.position.y > 2, `y=${walker.body.position.y}`);
});

test('teleport moves him and stops him', () => {
  const world = makeWorld();
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 } });
  walk(world, walker, { x: 0, y: 1 }, 0.5);
  walker.teleport({ x: 10, y: 1, z: 10 }, Math.PI);
  assert.deepEqual([walker.body.position.x, walker.body.position.z], [10, 10]);
  assert.equal(walker.body.velocity.length(), 0);
  assert.equal(walker.heading, Math.PI);
  assert.deepEqual([walker.shown.x, walker.shown.z], [10, 10], 'he is drawn there straight away too');
});

test('on a 120 Hz screen he is drawn moving every frame, not standing still on every other one', () => {
  const world = makeWorld();
  const walker = createWalker(world, { position: { x: 0, y: 0.4, z: 0 } });
  assert.deepEqual([walker.shown.x, walker.shown.z], [0, 0], 'drawn where he starts, before physics has run');
  const dt = 1 / 120;
  let last = walker.shown.z;
  const perFrame = [];
  for (let i = 0; i < 120; i++) {
    walker.move({ x: 0, y: 1 }, 0, dt);
    world.step(STEP, dt, 3); // as city.js does: physics at 60 Hz, frames at the screen's rate
    perFrame.push(walker.shown.z - last);
    last = walker.shown.z;
  }
  const running = perFrame.slice(60); // at full speed by now
  const expected = WALK_SPEED * dt;
  for (const d of running) assert.ok(Math.abs(d - expected) < expected * 0.1, `moved ${d} in a frame, expected about ${expected}`);
});

// A car-sized box (2 m wide, 4 m long) facing +z, standing on the floor at y = 0.
function carBox(world) {
  const body = new CANNON.Body({ mass: 300, shape: new CANNON.Box(new CANNON.Vec3(1, 0.6, 2)) });
  body.position.set(0, 0.8, 0);
  world.addBody(body);
  return body;
}
const exitFor = (world, car) => findExit(world, { car, x: 0, y: 0.8, z: 0, heading: 0, halfWidth: 1, halfLength: 2 });

test('getting out on open floor: the driver\'s right side, on the floor', () => {
  const world = makeWorld();
  const exit = exitFor(world, carBox(world));
  assert.ok(Math.abs(exit.x + 1.9) < 1e-6 && Math.abs(exit.z) < 1e-6, JSON.stringify(exit));
  assert.ok(exit.y > 0.3 && exit.y < 0.7, `y=${exit.y}`);
});

test('getting out: a low curb on one side sends him out the other side', () => {
  const world = makeWorld();
  staticBox(world, [-2.3, 0.3, 0], [0.2, 0.3, 3]);
  assert.ok(exitFor(world, carBox(world)).x > 1.8);
});

test('getting out: no floor on one side (a ramp hole) sends him out the other side', () => {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  staticBox(world, [0.75, -0.15, 0], [2.25, 0.15, 6]); // floor only from x = -1.5 to x = 3
  assert.ok(exitFor(world, carBox(world)).x > 1.8);
});

test('getting out between two walls: behind the car, clear of its tail', () => {
  const world = makeWorld();
  staticBox(world, [-2.3, 1.5, 0], [0.2, 1.5, 3]);
  staticBox(world, [2.3, 1.5, 0], [0.2, 1.5, 3]);
  const exit = exitFor(world, carBox(world));
  assert.ok(Math.abs(exit.x) < 1e-6 && Math.abs(exit.z + 2.9) < 1e-6, JSON.stringify(exit));
});
