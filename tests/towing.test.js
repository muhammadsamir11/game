import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createVehicle } from '../js/vehiclePhysics.js';
import { MODELS, modelToBricks } from '../js/instructions.js';
import { makeChassis } from '../js/bricks.js';
import { trailerPhysicsFromBricks, createTowedVehicle, createParkedBody, hitch, straighten, setFrozen, rectClear, carSpotClear, pointsAlong } from '../js/towPhysics.js';
import { articulation, trailerSteer, ART_LIMIT } from '../js/hitch.js';

const STEP = 1 / 60;
const wheel = (x, z) => ({ type: 'wheelLarge', color: 'black', x, y: 0, z, r: 0 });
const trailerBricks = () => [makeChassis('trailer'), wheel(-3, -5), wheel(2, -5), wheel(-3, -7), wheel(2, -7), { type: 'crate', color: 'white', x: -1, y: 1, z: 0, r: 0 }];

function makeWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  ground.aabbNeedsUpdate = true;
  world.addBody(ground);
  return world;
}

// A Big Rig at the origin facing +z, with a brick trailer hooked behind it, settled on the ground.
function rig({ steering = true } = {}) {
  const world = makeWorld();
  const truck = createVehicle(world, modelToBricks(MODELS.bigRig), { position: { x: 0, y: 1.2, z: 0 }, heading: 0 }, { tightTurns: true });
  const spec = trailerPhysicsFromBricks(trailerBricks());
  const towed = createTowedVehicle(world, spec, { x: 0, y: spec.rideHeight + 0.3, z: -10, heading: 0 });
  const link = hitch(world, truck, towed, spec);
  const run = (input, seconds, each = () => {}) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      truck.applyInput(input);
      const angle = articulation(truck.pose().heading, towed.origin().heading);
      towed.update({ steer: steering && truck.forwardSpeed() > 0.5 ? trailerSteer(angle) : 0, brake: input.brake ? 20 : 0, truck: truck.body });
      world.step(STEP);
      each();
    }
  };
  run({}, 1.5);
  return { world, truck, towed, spec, link, run };
}

const gap = ({ link, towed }) => {
  const a = link.hookWorld();
  const b = towed.ringWorld();
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
};
const upright = body => body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y;

test('a hooked trailer settles on its wheels with its ring on the hook', () => {
  const r = rig();
  assert.ok(gap(r) < 0.05, `gap ${gap(r)}`);
  assert.ok(upright(r.towed.body) > 0.97);
});

test('a towed trailer follows the truck down the road and stays on', () => {
  const r = rig();
  const start = r.towed.origin().z;
  r.run({ throttle: 1 }, 4);
  assert.ok(r.towed.origin().z - start > 8, `moved ${r.towed.origin().z - start}`);
  assert.ok(gap(r) < 0.1, `gap ${gap(r)}`);
  assert.ok(upright(r.truck.body) > 0.95 && upright(r.towed.body) > 0.95);
  assert.ok(Math.abs(r.truck.body.position.y) < 2, 'nothing flew');
});

test('steering trailer wheels keep the trailer closer to the truck\'s path round a bend', () => {
  const offTrack = steering => {
    const r = rig({ steering });
    const path = [];
    let sum = 0;
    let n = 0;
    r.run({ throttle: 0.6, steer: 1 }, 7, () => {
      const hook = r.link.hookWorld();
      path.push({ x: hook.x, z: hook.z });
      const o = r.towed.origin();
      const axle = r.spec.wheels.reduce((sum, w) => sum + w.z, 0) / r.spec.wheels.length;
      const back = { x: o.x + Math.sin(o.heading) * axle, z: o.z + Math.cos(o.heading) * axle }; // the trailer's back wheels
      if (path.length > 240) {
        sum += Math.min(...path.map(p => Math.hypot(p.x - back.x, p.z - back.z)));
        n++;
      }
    });
    return sum / n;
  };
  const free = offTrack(false);
  const steered = offTrack(true);
  assert.ok(steered < free, `steered ${steered.toFixed(2)} vs free ${free.toFixed(2)}`);
});

test('a full-lock turn from a standstill never folds the trailer up or stalls the truck', () => {
  const r = rig();
  let worst = 0;
  r.run({ throttle: 1, steer: 1 }, 8, () => {
    worst = Math.max(worst, Math.abs(articulation(r.truck.pose().heading, r.towed.origin().heading)));
  });
  assert.ok(worst < ART_LIMIT + 0.15, `folded to ${worst.toFixed(2)}`);
  assert.ok(r.truck.forwardSpeed() > 3, `speed ${r.truck.forwardSpeed().toFixed(1)}`);
  assert.ok(gap(r) < 0.1 && upright(r.truck.body) > 0.9 && upright(r.towed.body) > 0.9);
});

test('a jack-knifed trailer straightens out behind the truck, still hooked', () => {
  const r = rig();
  const o = r.towed.origin();
  r.towed.setOrigin({ ...o, heading: 1.3 });
  straighten(r.truck, r.towed, r.spec, r.link);
  assert.ok(Math.abs(articulation(r.truck.pose().heading, r.towed.origin().heading)) < 1e-6);
  assert.ok(gap(r) < 0.05, `gap ${gap(r)}`);
  r.run({}, 1);
  assert.ok(gap(r) < 0.1 && upright(r.towed.body) > 0.95);
});

test('unhooked, a trailer stands still and level where it was left', () => {
  const r = rig();
  const at = r.towed.origin();
  r.link.remove();
  r.towed.remove();
  const body = createParkedBody(r.world, r.spec, { ...at, y: r.spec.rideHeight });
  assert.equal(body.type, CANNON.Body.STATIC);
  assert.ok(upright(body) > 0.999);
  assert.ok(Math.hypot(body.position.x - at.x, body.position.z - at.z) < 1e-6);
});

test('a truck pulls harder while towing', () => {
  const r = rig();
  assert.ok(r.truck.towScale() > 1);
  r.link.remove();
  assert.equal(r.truck.towScale(), 1);
});

test('a parked rig with nobody in it is frozen in place, and drives off again once unfrozen', () => {
  const r = rig();
  setFrozen(r.truck.body, true);
  setFrozen(r.towed.body, true);
  const at = r.truck.pose();
  const trailerAt = r.towed.origin();
  r.run({ hold: true }, 10);
  assert.ok(Math.hypot(r.truck.pose().x - at.x, r.truck.pose().z - at.z) < 1e-6, 'the truck crept');
  assert.ok(Math.hypot(r.towed.origin().x - trailerAt.x, r.towed.origin().z - trailerAt.z) < 1e-6, 'the trailer crept');
  setFrozen(r.truck.body, false);
  setFrozen(r.towed.body, false);
  r.run({ throttle: 1 }, 2);
  assert.ok(r.truck.pose().z - at.z > 2, 'drives off');
  assert.ok(gap(r) < 0.1);
});

// A wall across the road behind the truck (the truck faces +z with its hook at z ≈ -3.3).
function wallAt(world, z) {
  const wall = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(12, 2.5, 0.25)) });
  wall.position.set(0, 2.5, z - 0.25);
  wall.aabbNeedsUpdate = true;
  world.addBody(wall);
  return wall;
}
const fastest = r => Math.max(r.truck.body.velocity.length(), r.towed.body.velocity.length());

test('a clear spot is clear, and a wall across it is not', () => {
  const r = rig();
  const rect = { x0: -1.5, x1: 1.5, z0: -2, z1: 2 };
  assert.equal(rectClear(r.world, { x: 0, y: 0.4, z: -20, heading: 0 }, rect), true);
  wallAt(r.world, -19);
  assert.equal(rectClear(r.world, { x: 0, y: 0.4, z: -20, heading: 0 }, rect), false);
  assert.equal(rectClear(r.world, { x: 0, y: 0.4, z: -20, heading: 0 }, rect, [r.towed.body]), false);
});

// Fold the trailer to heading h with its ring on the hook (about 70° for h = 1.22, the truck facing +z).
function foldOnHook(r, h) {
  const hook = r.link.hookWorld();
  r.towed.setOrigin({ x: hook.x - Math.sin(h) * r.spec.ring.z, y: hook.y - r.spec.ring.y, z: hook.z - Math.cos(h) * r.spec.ring.z, heading: h });
}

test('Flip me! never puts the trailer through a wall: it stays folded but upright, and nothing is flung', () => {
  const r = rig();
  foldOnHook(r, 1.22);
  r.run({}, 0.5);
  wallAt(r.world, -8); // straight behind would be through this
  const result = straighten(r.truck, r.towed, r.spec, r.link, r.world);
  assert.notEqual(result, 'straight');
  let worst = 0;
  r.run({}, 1, () => { worst = Math.max(worst, fastest(r)); });
  assert.ok(worst < 5, `flung at ${worst.toFixed(1)} m/s`);
  assert.ok(upright(r.truck.body) > 0.9 && upright(r.towed.body) > 0.9);
  assert.ok(gap(r) < 0.1);
});

test('with no room at all, Flip me! leaves the trailer where it is', () => {
  const r = rig();
  foldOnHook(r, 1.22);
  r.run({}, 0.5);
  const before = r.towed.origin();
  wallAt(r.world, -5.5); // through both the straight and the folded spots
  assert.equal(straighten(r.truck, r.towed, r.spec, r.link, r.world), 'stuck');
  const after = r.towed.origin();
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 1e-9);
});

test('a car is only put down where there is room for it', () => {
  const r = rig();
  const size = { length: 4, width: 3, height: 1.6 };
  const spot = { x: 0, y: 0, z: -25, heading: Math.PI };
  assert.equal(carSpotClear(r.world, spot, size), true);
  wallAt(r.world, -24);
  assert.equal(carSpotClear(r.world, spot, size), false);
});

test('traffic sees the whole length of a trailer, a point every few metres', () => {
  const points = pointsAlong({ x: 10, y: 0, z: 5, heading: Math.PI / 2 }, -3.5, 19.5);
  assert.ok(points.length >= 8);
  assert.deepEqual([points[0].x, points[0].z], [6.5, 5]);
  assert.ok(Math.abs(points.at(-1).x - 29.5) < 1e-9);
  for (let i = 1; i < points.length; i++) assert.ok(Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z) <= 3 + 1e-9);
});
