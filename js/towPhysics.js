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
      if (!truck || body.type !== CANNON.Body.DYNAMIC) return; // a frozen trailer stays exactly as it is
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

// The trailer's outline on the ground, in its own frame: its boxes and wheels (not the towbar, which reaches
// the truck's hook and may overlap the truck's back).
export function footprintOf(spec) {
  const parts = [...spec.boxes.map(b => ({ x: Math.abs(b.cx) + b.hx, z0: b.cz - b.hz, z1: b.cz + b.hz })),
    ...spec.wheels.map(w => ({ x: Math.abs(w.x) + 0.25, z0: w.z - w.radius, z1: w.z + w.radius }))];
  const half = Math.max(...parts.map(p => p.x));
  return { x0: -half, x1: half, z0: Math.min(...parts.map(p => p.z0)), z1: Math.max(...parts.map(p => p.z1)) };
}

const from = new CANNON.Vec3();
const to = new CANNON.Vec3();
// Is the rectangle rect ({ x0, x1, z0, z1 } in the frame at origin o) free of anything solid, apart from the
// bodies in ignore? It looks along its edges at two heights, and down onto it from high above (which also finds
// anything it would be wholly inside, such as a building).
export function rectClear(world, o, rect, ignore = []) {
  let clear = true;
  const look = (a, b) => {
    if (!clear) return;
    from.set(a.x, a.y, a.z);
    to.set(b.x, b.y, b.z);
    world.raycastAll(from, to, { skipBackfaces: true }, result => {
      if (ignore.includes(result.body)) return;
      clear = false;
      result.abort();
    });
  };
  const at = (x, y, z) => frameToWorld(o, { x, y, z });
  const corners = [[rect.x0, rect.z0], [rect.x1, rect.z0], [rect.x1, rect.z1], [rect.x0, rect.z1]];
  for (const y of [0.4, 1.2]) {
    corners.forEach(([x, z], i) => {
      const [nx, nz] = corners[(i + 1) % 4];
      look(at(x, y, z), at(nx, y, nz));
    });
  }
  const steps = Math.max(1, Math.ceil((rect.z1 - rect.z0) / 3));
  for (const x of [rect.x0, (rect.x0 + rect.x1) / 2, rect.x1]) {
    for (let k = 0; k <= steps; k++) {
      const z = rect.z0 + ((rect.z1 - rect.z0) * k) / steps;
      look(at(x, 30, z), at(x, 0.15, z));
    }
  }
  return clear;
}

// Flip me! with a trailer on: straight behind the truck, upright and still, ring on the hook. If something
// solid is in the way, it stays folded as it was (at most ART_LIMIT, upright) instead; if even that isn't free,
// it's left exactly where it is ('stuck'), since putting it inside something would fling the whole rig.
// world: to look for room (without it, straight behind is assumed to be free).
export function straighten(truck, towed, spec, link, world = null) {
  const heading = truck.pose().heading;
  const fold = Math.max(-ART_LIMIT, Math.min(ART_LIMIT, articulation(heading, towed.origin().heading)));
  const ignore = [truck.body, towed.body];
  const rect = footprintOf(spec);
  for (const [result, h] of [['straight', heading], ['folded', heading - fold]]) {
    const o = originOnHook(link.hookWorld(), spec, h);
    if (!world || rectClear(world, o, rect, ignore)) {
      towed.setOrigin(o);
      return result;
    }
  }
  return 'stuck';
}

// A truck and trailer left with nobody in them never quite stop creeping on raycast wheels, so once still they
// are frozen: a kinematic body stays exactly where it is, and nothing can push it. Unfrozen when he gets in.
export function setFrozen(body, frozen) {
  body.type = frozen ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
  body.velocity.setZero();
  body.angularVelocity.setZero();
  body.aabbNeedsUpdate = true;
}

// Is there room on the ground at pose (a car's middle and heading) for a car of size { length, width }?
export function carSpotClear(world, pose, size, ignore = []) {
  const rect = { x0: -size.width / 2, x1: size.width / 2, z0: -size.length / 2, z1: size.length / 2 };
  return rectClear(world, pose, rect, ignore);
}

// Points every 3 m or less down a trailer's middle, from z0 to z1 in its frame (at origin o): traffic stops for
// each one, so a car crossing in front of a long trailer stops instead of driving into its side.
export function pointsAlong(o, z0, z1) {
  const steps = Math.max(1, Math.ceil((z1 - z0) / 3));
  return Array.from({ length: steps + 1 }, (_, k) => frameToWorld(o, { x: 0, y: 0, z: z0 + ((z1 - z0) * k) / steps }));
}
