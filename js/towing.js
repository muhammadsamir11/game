// A trailer in the city: parked, it is a still picture on one static body (like a parked car); hooked, it rolls
// on its own wheels behind a truck (towPhysics.js). Brick trailers and the car truck's trailer both work this way.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCarMesh, createWheelMesh } from './brickMesh.js';
import { disposeMerged } from './meshMerge.js';
import { trailerPhysicsFromBricks, createParkedBody, createTowedVehicle, hitch, straighten, frameToWorld, setFrozen, footprintOf, pointsAlong } from './towPhysics.js';
import { HOOK, articulation, trailerSteer } from './hitch.js';

// spec (towPhysics.js), plus body: the trailer drawn in its own frame without wheels, and its size.
export function trailerSpecFromBricks(bricks) {
  const body = createCarMesh(bricks, { includeWheels: false, emptySeat: true, merge: true });
  return withSize({ ...trailerPhysicsFromBricks(bricks), body });
}

// halfWidth, halfLength, height and length, from the drawn body (towbar included).
export function withSize(spec) {
  const size = new THREE.Box3().setFromObject(spec.body).getSize(new THREE.Vector3());
  return { ...spec, halfWidth: size.x / 2, halfLength: size.z / 2, height: size.y, length: size.z };
}

// Where a truck's hook is in the world (car: a createVehicle).
export function hookWorld(car) {
  const c = car.stats.centerOfMass;
  return car.body.pointToWorldFrame(new CANNON.Vec3(-c.x, HOOK.y - c.y, HOOK.z - c.z));
}

const DOWN = new CANNON.Vec3(0, -1, 0);

// pose: where the trailer's frame origin stands on the ground, { x, z, heading } (y is found from the ground).
export function createTrailer({ world, scene, spec, pose }) {
  const group = new THREE.Group();
  group.add(spec.body);
  scene.add(group);
  const wheels = spec.wheels.map(w => {
    const mesh = createWheelMesh(w.type ?? 'wheelLarge', w.color ?? 'black');
    mesh.userData.at = w;
    return mesh;
  });
  let parkedAt = null; // the origin while parked
  let parkedBody = null;
  let towed = null;
  let link = null;
  const trailer = { spec, mesh: group, hookedTo: null };
  const footprint = footprintOf(spec);

  // Stand it level on the ground below where it is (its legs down), as a still picture.
  function park(at) {
    const ray = new CANNON.RaycastResult();
    world.raycastClosest(new CANNON.Vec3(at.x, at.y + 3, at.z), new CANNON.Vec3(at.x, at.y - 10, at.z), { skipBackfaces: true }, ray);
    parkedAt = { x: at.x, y: (ray.hasHit ? ray.hitPointWorld.y : 0) + spec.rideHeight, z: at.z, heading: at.heading };
    parkedBody = createParkedBody(world, spec, parkedAt);
    group.position.set(parkedAt.x, parkedAt.y, parkedAt.z);
    group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), parkedAt.heading);
    for (const wheel of wheels) {
      const w = wheel.userData.at;
      wheel.position.set(w.x, w.y, w.z);
      wheel.quaternion.identity();
      group.add(wheel);
    }
  }

  const com = new THREE.Vector3(spec.com.x, spec.com.y, spec.com.z);
  const offset = new THREE.Vector3();
  function sync() {
    group.quaternion.copy(towed.body.quaternion);
    offset.copy(com).applyQuaternion(group.quaternion);
    group.position.copy(towed.body.position).sub(offset);
    towed.vehicle.wheelInfos.forEach((info, i) => {
      towed.vehicle.updateWheelTransform(i);
      wheels[i].position.copy(info.worldTransform.position);
      wheels[i].quaternion.copy(info.worldTransform.quaternion);
    });
  }

  Object.assign(trailer, {
    origin: () => (towed ? towed.origin() : { ...parkedAt }),
    speed: () => (towed ? towed.speed() : 0),
    ringWorld: () => (towed ? towed.ringWorld() : frameToWorld(parkedAt, spec.ring)),
    // Where traffic should stop for it: all along it, from its back to its towbar.
    obstaclePoints: () => pointsAlong(trailer.origin(), footprint.z0, spec.ring.z),
    // entry: the city's truck entry, which must be driven (have .driven).
    hook(entry) {
      const at = trailer.origin();
      world.removeBody(parkedBody);
      parkedBody = null;
      towed = createTowedVehicle(world, spec, { ...at, y: at.y + 0.05 });
      link = hitch(world, entry.driven.car, towed, spec);
      for (const wheel of wheels) scene.add(wheel); // from now on they follow their own suspension
      trailer.hookedTo = entry;
      entry.trailer = trailer;
      sync();
    },
    unhook() {
      const entry = trailer.hookedTo;
      const at = towed.origin();
      link.remove();
      towed.remove();
      link = null;
      towed = null;
      trailer.hookedTo = null;
      entry.trailer = null;
      park(at);
    },
    // Each frame before the world steps. driving: he is at the wheel of its truck; input: his pad.
    update({ driving = false, input = {} } = {}) {
      if (!towed) return;
      const car = trailer.hookedTo.driven.car;
      const speed = car.forwardSpeed();
      const angle = articulation(car.pose().heading, towed.origin().heading);
      const braking = !driving ? car.stats.brakeForce * 2 : (input.brake > 0 && speed > 1 ? car.stats.brakeForce * input.brake : 0);
      towed.update({ steer: speed > 0.5 ? trailerSteer(angle) : 0, brake: braking * (spec.mass / car.stats.mass), truck: car.body });
    },
    // Each frame after the world steps.
    sync() {
      if (towed) sync();
    },
    // While its truck stands parked with nobody in it (see city.js).
    setFrozen(frozen) {
      if (towed) setFrozen(towed.body, frozen);
    },
    // Flip me! (or a zap): straight behind the truck, upright and still, still hooked; or folded as it was if
    // something is in the way. Returns 'straight', 'folded' or 'stuck' (no room: left where it is).
    straighten() {
      if (!towed) return 'straight';
      const result = straighten(trailer.hookedTo.driven.car, towed, spec, link, world);
      sync();
      return result;
    },
    remove() {
      if (towed) {
        link.remove();
        towed.remove();
      }
      if (parkedBody) world.removeBody(parkedBody);
      scene.remove(group);
      for (const wheel of wheels) scene.remove(wheel);
      disposeMerged(group);
    },
  });

  park({ x: pose.x, y: 0, z: pose.z, heading: pose.heading });
  return trailer;
}
