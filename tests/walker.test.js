import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createWalker, stickToWorld, WALK_SPEED, SURFACE_MATERIAL } from '../js/walker.js';
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
});
