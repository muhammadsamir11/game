import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TRAFFIC_LOOPS, PEDESTRIAN_PATHS } from './cityMap.js';
import { createLoopMover, shouldStop, dodgeVector, TRAFFIC_SPEED, PEDESTRIAN_SPEED } from './traffic.js';
import { createCarMesh, carLift } from './brickMesh.js';
import { disposeMerged } from './meshMerge.js';
import { createFigureMesh, mergeFigure, applyPose } from './figureMesh.js';
import { createGait, stepGait } from './walkCycle.js';
import { wrapAngle } from './math.js';
import { MODELS, modelToBricks } from './instructions.js';
import { randomFigure } from './figures.js';
import { sfx } from './audio.js';

const TRAFFIC_MODELS = [
  ['raceCar', { red: 'green' }],
  ['monsterTruck', { blue: 'orange' }],
  ['buggy', { green: 'red' }],
  ['policeCar', {}],
  ['fireTruck', {}],
  ['raceCar', { red: 'purple' }],
];

export function createCityTraffic(scene, world) {
  // Toy cars on fixed loops. Kinematic bodies: they nudge his car but can never be pushed or knocked over.
  const cars = TRAFFIC_LOOPS.map((loop, i) => {
    const [model, recolor] = TRAFFIC_MODELS[i % TRAFFIC_MODELS.length];
    const bricks = modelToBricks(MODELS[model], recolor);
    const driver = randomFigure(500 + i * 13, 'Driver');
    const mesh = createCarMesh(bricks, { driver, merge: true });
    const lift = carLift(bricks);
    const bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)), new CANNON.Vec3(center.x, center.y + lift, center.z));
    world.addBody(body);
    scene.add(mesh);
    // taken: he kicked the driver out and is borrowing it; frozen: about to be (the kick is mid-swing).
    return { index: i, bricks, driver, mover: createLoopMover(loop.corners, loop.start), mesh, body, lift, halfWidth: size.x / 2, halfLength: size.z / 2, taken: false, frozen: false };
  });

  // People stroll round sidewalks; they have no physics, so nothing can hit them.
  const people = PEDESTRIAN_PATHS.flatMap((path, p) => [0, 0.5].map((start, k) => {
    const mesh = mergeFigure(createFigureMesh(randomFigure(900 + p * 7 + k, 'Walker')));
    mesh.scale.setScalar(1.25);
    scene.add(mesh);
    const mover = createLoopMover(path.corners, start);
    // Each one starts mid-stride at a different point, so they don't march in step.
    return { mover, mesh, offset: { x: 0, z: 0 }, dodge: null, hop: 0, nextWhoa: 0, gait: createGait(p * 1.9 + k * 2.6), heading: mover.pose().heading, last: null };
  }));

  function placeCar(car, dt) {
    const { x: bx, z: bz } = car.body.position; // where it was
    const pose = car.mover.pose();
    car.mesh.position.set(pose.x, car.lift, pose.z);
    car.mesh.rotation.y = pose.heading;
    car.body.position.set(pose.x, 0, pose.z);
    car.body.quaternion.setFromEuler(0, pose.heading, 0);
    if (dt > 0) car.body.velocity.set((pose.x - bx) / dt, 0, (pose.z - bz) / dt);
  }
  for (const car of cars) placeCar(car, 0);
  const others = [];

  return {
    cars,
    people,
    update(dt, time, player, obstacles = []) {
      for (const car of cars) {
        if (car.taken) continue;
        // Everything it must not drive into (one list, refilled each frame, so no garbage piles up).
        others.length = 0;
        for (const o of obstacles) others.push(o);
        for (const p of people) others.push(p.mesh.position);
        for (const c of cars) if (c !== car && !c.taken) others.push(c.mesh.position);
        if (!car.frozen && !shouldStop(car.mover.pose(), time, others)) car.mover.advance(TRAFFIC_SPEED * dt);
        placeCar(car, dt);
      }
      for (const person of people) {
        const path = person.mover.pose();
        if (person.dodge) {
          person.dodge.t += dt;
          const k = Math.min(1, person.dodge.t / 0.5);
          person.offset.x = person.dodge.dir.x * 1.6 * k;
          person.offset.z = person.dodge.dir.z * 1.6 * k;
          person.hop = Math.sin(k * Math.PI) * 0.6;
          if (person.dodge.t > 1.2) person.dodge = null;
        } else {
          const dir = player ? dodgeVector({ x: path.x + person.offset.x, z: path.z + person.offset.z }, player) : null;
          if (dir) {
            person.dodge = { t: 0, dir };
            if (time > person.nextWhoa) {
              sfx.whoa();
              person.nextWhoa = time + 3;
            }
          } else {
            // Drift back onto the path and walk on.
            const back = Math.max(0, 1 - dt * 1.5);
            person.offset.x *= back;
            person.offset.z *= back;
            person.mover.advance(PEDESTRIAN_SPEED * dt);
          }
          person.hop = 0;
        }
        const pose = person.mover.pose();
        const x = pose.x + person.offset.x;
        const z = pose.z + person.offset.z;
        // The mesh is 1.25× a figure, so its legs cover more ground per swing.
        const distance = person.last ? Math.hypot(x - person.last.x, z - person.last.z) / 1.25 : 0;
        person.last ??= { x, z };
        person.last.x = x;
        person.last.z = z;
        applyPose(person.mesh, stepGait(person.gait, { distance, dt, grounded: !person.dodge }));
        person.mesh.position.set(x, person.hop, z);
        person.heading = wrapAngle(person.heading + wrapAngle(pose.heading - person.heading) * (1 - Math.exp(-dt * 8))); // turn the corner, don't snap
        person.mesh.rotation.y = person.heading;
      }
    },
    // Stops dead where it is, still to be seen (the moment before the kick lands).
    freeze(car) {
      car.frozen = true;
    },
    // Off the road: a real driven car takes its place.
    take(car) {
      car.taken = true;
      car.frozen = false;
      car.mesh.visible = false;
      world.removeBody(car.body);
    },
    // Back on its loop, driver and all, from where it was taken.
    giveBack(car) {
      car.taken = false;
      car.mesh.visible = true;
      world.addBody(car.body);
      placeCar(car, 0);
    },
    dispose() {
      for (const car of cars) {
        if (!car.taken) world.removeBody(car.body);
        scene.remove(car.mesh);
        disposeMerged(car.mesh);
      }
      for (const person of people) scene.remove(person.mesh);
    },
  };
}
