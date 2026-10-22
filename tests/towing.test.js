import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createVehicle } from '../js/vehiclePhysics.js';
import { MODELS, modelToBricks } from '../js/instructions.js';
import { makeChassis } from '../js/bricks.js';
import { trailerPhysicsFromBricks, createTowedVehicle, createParkedBody, hitch, straighten } from '../js/towPhysics.js';
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
