// A trailer's physics: parked, it is one still (static) body; hooked, it is a real body on its own wheels,
// pinned to a truck's hook by a ball joint. No three.js here, so it can be checked by tests.
//
// A trailer is described in its own frame (spec): for a brick trailer that's its brick space (y = 0 at the
// chassis's bottom); the car truck's trailer has its own (carTruck.js). An origin pose { x, y, z, heading }
// says where that frame's origin is in the world. Heading h means forward (sin h, cos h).
import * as CANNON from 'cannon-es';
import { computeStats } from './carStats.js';
import { LAYER } from './bricks.js';
import { HOOK, RING, ART_LIMIT, towScale, towSteerCap, articulation } from './hitch.js';

const UP = new CANNON.Vec3(0, 1, 0);
const FORWARD = new CANNON.Vec3(0, 0, 1);
const REST_LENGTH = 0.3; // the same suspension as cars (vehiclePhysics.js)

// spec: { boxes, wheels: [{ type, color, radius, x, y, z }], mass, com, ring, rideHeight } in the trailer's frame.
// rideHeight: how high the frame's origin stands above the ground when the trailer is level on its wheels.
export function trailerPhysicsFromBricks(bricks) {
  const stats = computeStats(bricks);
  return {
    boxes: stats.boxes,
    wheels: stats.wheels.map(w => ({ type: w.type, color: w.color, radius: w.radius, x: w.x, y: LAYER / 2, z: w.z })),
    mass: stats.mass,
    com: stats.centerOfMass,
    ring: { x: 0, y: RING.y, z: RING.z },
    rideHeight: Math.max(0.35, ...stats.wheels.map(w => w.radius)) - LAYER / 2, // as brickMesh.js carLift
  };
}

// Turn a point in the frame at origin o into world space.
export const frameToWorld = (o, p) => ({
  x: o.x + p.x * Math.cos(o.heading) + p.z * Math.sin(o.heading),
  y: o.y + p.y,
  z: o.z - p.x * Math.sin(o.heading) + p.z * Math.cos(o.heading),
});

function addBoxes(body, boxes, offset) {
  for (const b of boxes) {
    const turn = b.rotX ? new CANNON.Quaternion().setFromEuler(b.rotX, 0, 0) : undefined;
    body.addShape(new CANNON.Box(new CANNON.Vec3(b.hx, b.hy, b.hz)), new CANNON.Vec3(b.cx - offset.x, b.cy - offset.y, b.cz - offset.z), turn);
  }
}

// One box round all the wheels, so a parked trailer's wheels are something to bump into.
function wheelBlock(wheels) {
  if (!wheels.length) return [];
  const x0 = Math.min(...wheels.map(w => w.x)) - 0.25;
  const x1 = Math.max(...wheels.map(w => w.x)) + 0.25;
  const y0 = Math.min(...wheels.map(w => w.y - w.radius));
  const y1 = Math.max(...wheels.map(w => w.y + w.radius));
  const z0 = Math.min(...wheels.map(w => w.z - w.radius));
  const z1 = Math.max(...wheels.map(w => w.z + w.radius));
  return [{ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2 }];
}

// A parked trailer: still, level, standing on its legs at origin.
export function createParkedBody(world, spec, origin) {
  const body = new CANNON.Body({ type: CANNON.Body.STATIC });
  addBoxes(body, [...spec.boxes, ...wheelBlock(spec.wheels)], { x: 0, y: 0, z: 0 });
  body.position.set(origin.x, origin.y, origin.z);
  body.quaternion.setFromAxisAngle(UP, origin.heading);
  body.aabbNeedsUpdate = true;
  world.addBody(body);
  return body;
}

// A trailer on its own wheels, free to roll (and to be pinned to a hook).
export function createTowedVehicle(world, spec, origin) {
  const { com } = spec;
  const body = new CANNON.Body({ mass: spec.mass, angularDamping: 0.3, linearDamping: 0.02 });
  addBoxes(body, spec.boxes, com);
  const vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
  for (const w of spec.wheels) {
    vehicle.addWheel({
      radius: w.radius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(w.x - com.x, w.y + REST_LENGTH - com.y, w.z - com.z),
      suspensionRestLength: REST_LENGTH,
      suspensionStiffness: 30,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 1e5,
      maxSuspensionTravel: 0.3,
      rollInfluence: 0.02,
      frictionSlip: 3,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    });
  }
  vehicle.addToWorld(world);
  const tmp = new CANNON.Vec3();
  const ringLocal = new CANNON.Vec3(spec.ring.x - com.x, spec.ring.y - com.y, spec.ring.z - com.z);

  function heading() {
    body.quaternion.vmult(FORWARD, tmp);
    return Math.atan2(tmp.x, tmp.z);
  }

  const towed = {
    body,
    vehicle,
    // Where the frame's origin is now (the body's centre is its centre of mass, com along from there).
    origin() {
      const h = heading();
      const c = body.quaternion.vmult(new CANNON.Vec3(com.x, com.y, com.z));
      return { x: body.position.x - c.x, y: body.position.y - c.y, z: body.position.z - c.z, heading: h };
    },
    setOrigin(o) {
      const p = frameToWorld(o, com);
      body.position.set(p.x, p.y, p.z);
      body.quaternion.setFromAxisAngle(UP, o.heading);
      body.velocity.setZero();
      body.angularVelocity.setZero();
    },
    ringWorld: () => body.pointToWorldFrame(ringLocal),
    speed() {
      body.quaternion.vmult(FORWARD, tmp);
      return body.velocity.dot(tmp);
    },
    // steer: the back wheels' angle (hitch.js trailerSteer); brake: brake force on every wheel.
    // truck: the pulling truck's body, if any: the trailer never folds more than ART_LIMIT against it
    // (the two can pass through each other, so without this a sharp turn would fold them up and stick).
    update({ steer = 0, brake = 0, truck = null, limit = ART_LIMIT } = {}) {
      spec.wheels.forEach((w, i) => {
        vehicle.applyEngineForce(0, i);
        vehicle.setBrake(brake || spec.mass * 0.004, i); // a little rolling resistance, as cars have
        vehicle.setSteeringValue(steer, i);
      });
      if (!truck) return;
      truck.quaternion.vmult(FORWARD, tmp);
      const a = articulation(Math.atan2(tmp.x, tmp.z), heading());
      if (Math.abs(a) > limit) body.angularVelocity.y = truck.angularVelocity.y + (a - Math.sign(a) * limit) * 6;
    },
    remove() {
      vehicle.removeFromWorld(world);
    },
  };
  towed.setOrigin(origin);
  return towed;
}

// The trailer's origin with its ring right on the hook, facing heading.
function originOnHook(hook, spec, heading) {
  const r = spec.ring;
  return {
    x: hook.x - (r.x * Math.cos(heading) + r.z * Math.sin(heading)),
    y: hook.y - r.y,
    z: hook.z - (-r.x * Math.sin(heading) + r.z * Math.cos(heading)),
    heading,
  };
}

// Pin the trailer's ring to the truck's hook. The trailer first moves the last little bit so they meet
// (it keeps its heading); from then on the truck pulls harder and turns more gently.
export function hitch(world, truck, towed, spec) {
  const tc = truck.stats.centerOfMass;
  const pivotA = new CANNON.Vec3(0 - tc.x, HOOK.y - tc.y, HOOK.z - tc.z);
  const pivotB = new CANNON.Vec3(spec.ring.x - spec.com.x, spec.ring.y - spec.com.y, spec.ring.z - spec.com.z);
  const hookWorld = () => truck.body.pointToWorldFrame(pivotA);
  towed.setOrigin(originOnHook(hookWorld(), spec, towed.origin().heading));
  const constraint = new CANNON.PointToPointConstraint(truck.body, pivotA, towed.body, pivotB, 1e6);
  constraint.collideConnected = false; // the trailer's nose may swing round the truck's back without a fight
  world.addConstraint(constraint);
  const axle = spec.wheels.reduce((sum, w) => sum + w.z, 0) / Math.max(1, spec.wheels.length);
  truck.setTow(towScale(truck.stats.mass, spec.mass), towSteerCap(spec.ring.z - axle));
  return {
    constraint,
    hookWorld,
    remove() {
      world.removeConstraint(constraint);
      truck.setTow(1);
    },
  };
}

// Flip me! with a trailer on: straight behind the truck, upright and still, ring on the hook.
export function straighten(truck, towed, spec, link) {
  towed.setOrigin(originOnHook(link.hookWorld(), spec, truck.pose().heading));
}
