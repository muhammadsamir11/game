import * as CANNON from 'cannon-es';
import { wrapAngle } from './math.js';

export const WALK_SPEED = 4;
// cannon-es only lets a pair of bodies skip friction when BOTH have materials, so the ground, buildings and
// garage carry SURFACE_MATERIAL; walker-vs-surface contact is frictionless (we set his speed ourselves),
// while cars (no material) keep the world's normal friction.
export const SURFACE_MATERIAL = new CANNON.Material('surface');
export const WALKER_MATERIAL = new CANNON.Material('walker');
const RADIUS = 0.4;
const DEAD_ZONE = 0.05;
const SPEED_UP = 0.12; // seconds to close most of the gap to the speed the stick asks for
const SLOW_DOWN = 0.08;
const TURN_RATE = 12; // rad/s
const MIN_SPEED = 0.3; // a barely pushed stick still walks, slowly

// How fast a stick push walks him: a light push strolls, a full push runs.
export const stickSpeed = strength => (strength < DEAD_ZONE ? 0 : WALK_SPEED * (MIN_SPEED + (1 - MIN_SPEED) * Math.min(1, strength) ** 1.5));

// Stick up walks where the camera looks (yaw); stick right walks to the screen's right.
export function stickToWorld({ x, y }, yaw) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return { x: fx * y - fz * x, z: fz * y + fx * x };
}

// He is a ball that never rolls: we set its sideways speed, physics does gravity, ramps and walls.
export function createWalker(world, { position = { x: 0, y: 1, z: 0 }, heading = 0 } = {}) {
  if (!world.getContactMaterial(WALKER_MATERIAL, SURFACE_MATERIAL)) {
    world.addContactMaterial(new CANNON.ContactMaterial(WALKER_MATERIAL, SURFACE_MATERIAL, { friction: 0, restitution: 0 }));
  }
  const at = new CANNON.Vec3(position.x, position.y, position.z);
  // Given at birth (not set after) so his drawn spot starts there too, not at the world's middle.
  const body = new CANNON.Body({ mass: 60, shape: new CANNON.Sphere(RADIUS), fixedRotation: true, material: WALKER_MATERIAL, position: at });
  world.addBody(body);
  let facing = heading;
  let dir = { x: Math.sin(heading), z: Math.cos(heading) };
  return {
    body,
    get heading() { return facing; },
    // Where to draw him. Physics steps 60 times a second but iPad screens draw 120, so his body only moves
    // on every other frame; this slides smoothly between steps, so his legs and the camera see a steady walk.
    get shown() { return body.interpolatedPosition; },
    // How fast he is really moving over the ground (zero against a wall), and whether his feet are on something.
    get speed() { return Math.hypot(body.velocity.x, body.velocity.z); },
    get grounded() { return Math.abs(body.velocity.y) < 1.5; },
    move(stick, yaw, dt = 1 / 60) {
      const strength = Math.min(1, Math.hypot(stick.x, stick.y));
      const target = stickSpeed(strength);
      if (target > 0) dir = stickToWorld({ x: stick.x / strength, y: stick.y / strength }, yaw);
      // Ease his speed toward the stick's, along the way he is going: no instant starts or dead stops. Never
      // more than a run: a shove from a car's edge kept and fed back each frame would fling him off the map.
      const along = Math.min(WALK_SPEED, body.velocity.x * dir.x + body.velocity.z * dir.z);
      const k = 1 - Math.exp(-dt / (target > Math.max(0, along) ? SPEED_UP : SLOW_DOWN));
      const speed = Math.max(0, along) + (target - Math.max(0, along)) * k;
      body.velocity.x = dir.x * (speed < 0.02 ? 0 : speed);
      body.velocity.z = dir.z * (speed < 0.02 ? 0 : speed);
      if (target > 0) {
        const turn = wrapAngle(Math.atan2(dir.x, dir.z) - facing);
        const step = TURN_RATE * dt;
        facing = wrapAngle(facing + Math.max(-step, Math.min(step, turn)));
      }
    },
    teleport(p, h = facing) {
      for (const v of [body.position, body.previousPosition, body.interpolatedPosition]) v.set(p.x, p.y, p.z);
      body.velocity.setZero();
      facing = h;
      dir = { x: Math.sin(h), z: Math.cos(h) };
    },
    remove() {
      world.removeBody(body);
    },
  };
}

// Where he steps out of a car (x, y, z = the car's middle): the driver's right, else left, else behind it.
// A side counts only if the way there is clear at knee and waist height and there is floor to stand on.
export function findExit(world, { car, x, y, z, heading, halfWidth, halfLength }) {
  const ray = (from, to) => {
    const result = new CANNON.RaycastResult();
    world.raycastClosest(new CANNON.Vec3(from.x, from.y, from.z), new CANNON.Vec3(to.x, to.y, to.z), { skipBackfaces: true }, result);
    return result;
  };
  car.collisionResponse = false; // rays skip his own car
  const below = ray({ x, y, z }, { x, y: y - 5, z });
  const floorY = below.hasHit ? below.hitPointWorld.y : y - 1;
  const rightX = -Math.cos(heading);
  const rightZ = Math.sin(heading);
  const side = halfWidth + 0.9;
  const back = halfLength + 0.9;
  const doors = [
    { x: x + rightX * side, z: z + rightZ * side },
    { x: x - rightX * side, z: z - rightZ * side },
    { x: x - Math.sin(heading) * back, z: z - Math.cos(heading) * back },
  ];
  const free = d => {
    const len = Math.hypot(d.x - x, d.z - z);
    const reach = { x: x + ((d.x - x) * (len + RADIUS)) / len, z: z + ((d.z - z) * (len + RADIUS)) / len }; // his far edge
    return [0.3, 0.9].every(h => !ray({ x, y: floorY + h, z }, { x: reach.x, y: floorY + h, z: reach.z }).hasHit)
      && ray({ x: d.x, y: floorY + 0.5, z: d.z }, { x: d.x, y: floorY - 0.6, z: d.z }).hasHit;
  };
  const door = doors.find(free) ?? doors[0];
  car.collisionResponse = true;
  return { x: door.x, y: floorY + RADIUS + 0.1, z: door.z };
}
