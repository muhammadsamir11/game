import * as THREE from 'three';
import { createVehicle } from './vehiclePhysics.js';
import { createCarMesh, createWheelMesh } from './brickMesh.js';

// Parts that move on their own: propellers, flags, rocket flames, siren domes, cannon muzzles, and the
// prize cars' trick parts (carTricks.js): flying lady, coach doors, roof stars, disco lights, side-pipe puffs.
export function collectFx(object) {
  const fx = { spinners: [], flags: [], flames: [], sirens: [], muzzles: [], ornaments: [], coachDoors: [], stars: [], discos: [], puffs: [] };
  object.traverse(node => {
    if (node.userData.ornament) fx.ornaments.push(node);
    if (node.userData.coachDoor) fx.coachDoors.push(node);
    if (node.userData.stars !== undefined) fx.stars.push(node);
    if (node.userData.disco) fx.discos.push(node);
    if (node.userData.puff) fx.puffs.push(node);
    if (node.userData.spin) fx.spinners.push(node);
    if (node.userData.flag) fx.flags.push(node);
    if (node.userData.flame) fx.flames.push(node);
    if (node.userData.sirenLight) fx.sirens.push(node);
    if (node.userData.muzzle) fx.muzzles.push(node);
  });
  return fx;
}

// A drivable brick car: physics vehicle + body mesh + spinning wheel meshes.
export function createDrivenCar({ world, scene, bricks, pose, driver = null, vehicle = {} }) {
  const car = createVehicle(world, bricks, pose, vehicle);
  const mesh = new THREE.Group();
  const body = createCarMesh(bricks, { includeWheels: false, driver });
  const com = car.stats.centerOfMass;
  body.position.set(-com.x, -com.y, -com.z);
  mesh.add(body);
  scene.add(mesh);
  const wheels = car.stats.wheels.map(w => {
    const wheel = createWheelMesh(w.type, w.color);
    scene.add(wheel);
    return wheel;
  });
  const fx = collectFx(body);
  const drivers = [];
  body.traverse(node => { if (node.userData.driver) drivers.push(node); });
  function sync() {
    mesh.position.copy(car.body.position);
    mesh.quaternion.copy(car.body.quaternion);
    car.vehicle.wheelInfos.forEach((info, i) => {
      car.vehicle.updateWheelTransform(i);
      wheels[i].position.copy(info.worldTransform.position);
      wheels[i].quaternion.copy(info.worldTransform.quaternion);
    });
  }
  function remove() {
    car.vehicle.removeFromWorld(world);
    scene.remove(mesh);
    for (const wheel of wheels) scene.remove(wheel);
  }
  // The city hides the driver while he is out on foot.
  function showDriver(on) {
    for (const d of drivers) d.visible = on;
  }
  sync();
  return { car, mesh, wheels, fx, sync, remove, showDriver };
}
