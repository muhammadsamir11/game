import * as CANNON from 'cannon-es';

export const WALK_SPEED = 4;
// cannon-es only lets a pair of bodies skip friction when BOTH have materials, so the ground, buildings and
// garage carry SURFACE_MATERIAL; walker-vs-surface contact is frictionless (we set his speed ourselves),
// while cars (no material) keep the world's normal friction.
export const SURFACE_MATERIAL = new CANNON.Material('surface');
export const WALKER_MATERIAL = new CANNON.Material('walker');
const RADIUS = 0.4;
const DEAD_ZONE = 0.05;

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
  const body = new CANNON.Body({ mass: 60, shape: new CANNON.Sphere(RADIUS), fixedRotation: true, material: WALKER_MATERIAL });
  body.position.set(position.x, position.y, position.z);
  world.addBody(body);
  let facing = heading;
  return {
    body,
    get heading() { return facing; },
    move(stick, yaw) {
      const strength = Math.min(1, Math.hypot(stick.x, stick.y));
      if (strength < DEAD_ZONE) {
        body.velocity.x = 0;
        body.velocity.z = 0;
        return;
      }
      const dir = stickToWorld(stick, yaw);
      body.velocity.x = dir.x * WALK_SPEED;
      body.velocity.z = dir.z * WALK_SPEED;
      facing = Math.atan2(dir.x, dir.z);
    },
    teleport(p, h = facing) {
      body.position.set(p.x, p.y, p.z);
      body.velocity.setZero();
      facing = h;
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
