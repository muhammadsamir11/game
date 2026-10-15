import * as CANNON from 'cannon-es';
import { computeStats } from './carStats.js';
import { clamp } from './math.js';

// The car drives along local +z with +x as its axle. cannon-es pushes each wheel along
// (surface normal × axle) = -z for a positive engine force, so forward needs a negative force.
export const ENGINE_SIGN = -1;
// Positive steering turns the front wheels from +z toward +x: the driver's left.
export const STEER_SIGN = 1;

const UP = new CANNON.Vec3(0, 1, 0);
const FORWARD = new CANNON.Vec3(0, 0, 1);
const REST_LENGTH = 0.3;
const REVERSE_SPEED = 6;
const TIPPED_SECONDS = 2;
const STUCK_SECONDS = 4;

export function createVehicle(world, bricks, { position = { x: 0, y: 1.5, z: 0 }, heading: startHeading = 0 } = {}) {
  const stats = computeStats(bricks);
  const com = stats.centerOfMass;
  const body = new CANNON.Body({ mass: stats.mass, angularDamping: 0.3, linearDamping: 0.02 });
  for (const b of stats.boxes) {
    body.addShape(new CANNON.Box(new CANNON.Vec3(b.hx, b.hy, b.hz)), new CANNON.Vec3(b.cx - com.x, b.cy - com.y, b.cz - com.z));
  }

  const vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
  for (const w of stats.wheels) {
    vehicle.addWheel({
      radius: w.radius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(1, 0, 0),
      // Mount the suspension one rest-length above where the wheel was built, so at rest it sits there.
      chassisConnectionPointLocal: new CANNON.Vec3(w.x - com.x, w.y + REST_LENGTH - com.y, w.z - com.z),
      suspensionRestLength: REST_LENGTH,
      suspensionStiffness: 30,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 1e5,
      maxSuspensionTravel: 0.3,
      rollInfluence: 0.02,
      frictionSlip: stats.frictionSlip,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    });
  }
  vehicle.addToWorld(world);

  const tmp = new CANNON.Vec3();
  let tippedFor = 0;
  let stuckFor = 0;

  function setPose(p, h) {
    body.position.set(p.x, p.y, p.z);
    body.quaternion.setFromAxisAngle(UP, h);
    body.velocity.setZero();
    body.angularVelocity.setZero();
    tippedFor = 0;
    stuckFor = 0;
  }

  function forwardSpeed() {
    body.quaternion.vmult(FORWARD, tmp);
    return body.velocity.dot(tmp);
  }

  function heading() {
    body.quaternion.vmult(FORWARD, tmp);
    return Math.atan2(tmp.x, tmp.z);
  }

  function upY() {
    body.quaternion.vmult(UP, tmp);
    return tmp.y;
  }

  function applyInput({ steer = 0, throttle = 0, brake = 0, hold = false } = {}) {
    const speed = forwardSpeed();
    let force = 0;
    let braking = 0;
    if (hold) braking = stats.brakeForce * 2;
    else if (brake > 0 && speed > 1) braking = stats.brakeForce * brake;
    else if (brake > 0 && throttle === 0) force = speed > -REVERSE_SPEED ? -0.6 * stats.engineForce * brake : 0;
    else if (throttle > 0) force = speed < stats.topSpeed ? stats.engineForce * throttle : 0;
    else braking = stats.mass * 0.004; // gentle rolling resistance when coasting

    const perWheel = (ENGINE_SIGN * force) / stats.wheels.length;
    const maxSteer = 0.5 - Math.min(0.25, Math.abs(speed) * 0.012); // less twitchy at speed
    stats.wheels.forEach((w, i) => {
      vehicle.applyEngineForce(perWheel, i);
      vehicle.setBrake(braking, i);
      vehicle.setSteeringValue(w.front ? STEER_SIGN * clamp(steer, -1, 1) * maxSteer : 0, i);
    });
  }

  function flip() {
    const p = body.position;
    setPose({ x: p.x, y: p.y + 1.5, z: p.z }, heading());
  }

  // Returns true when the car was flipped back over this frame (so the game can play a sound).
  function update(dt, input = {}) {
    tippedFor = upY() < 0.5 ? tippedFor + dt : 0;
    const trying = (input.throttle ?? 0) > 0 || (input.brake ?? 0) > 0;
    stuckFor = trying && body.velocity.length() < 0.3 ? stuckFor + dt : 0;
    if (tippedFor > TIPPED_SECONDS || stuckFor > STUCK_SECONDS) {
      flip();
      return true;
    }
    return false;
  }

  setPose(position, startHeading);

  return {
    body,
    vehicle,
    stats,
    applyInput,
    update,
    flip,
    resetTo: setPose,
    pose: () => ({ x: body.position.x, y: body.position.y, z: body.position.z, heading: heading(), speed: forwardSpeed() }),
    forwardSpeed,
    upY,
  };
}
