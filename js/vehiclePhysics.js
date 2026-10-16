import * as CANNON from 'cannon-es';
import { computeStats } from './carStats.js';
import { clamp } from './math.js';
import { BOOST } from './gadgets.js';

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
const AIR_SPIN = (2 * Math.PI) / 0.9; // one full flip in about 0.9 s
const AIR_YAW = (2 * Math.PI) / 0.55; // spins are quicker: a short jump is enough for a 360
const AIR_GRIP = 1 - Math.exp(-14 / 60); // how quickly the car takes up that spin each frame
const LEVEL_RATE = 3; // rad/s per unit of tilt, when nothing is held
const WORLD_UP = new CANNON.Vec3(0, 1, 0);

// tightTurns: steer harder at walking pace (city parking); at speed it drives like a race car.
// flipLift: how far Flip me! lifts the car (the city keeps it low, under garage ceilings).
// airControl: in the air the pad turns the car (GO nose down, STOP nose up, ◀ ▶ spin) and a helper levels it.
export function createVehicle(world, bricks, { position = { x: 0, y: 1.5, z: 0 }, heading: startHeading = 0 } = {}, { tightTurns = false, flipLift = 1.5, airControl = false } = {}) {
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

  let heldAtTakeOff = { go: false, stop: false, left: false, right: false };

  function wheelsDown() {
    // The last raycast, not isInContact: updateWheelTransform (the wheel-mesh sync) clears that flag.
    return vehicle.wheelInfos.filter(w => w.raycastResult.hasHit).length;
  }

  // Steer the spin of an airborne car toward what the pad asks for (in the car's own axes).
  function airTurn(steer, throttle, brake) {
    const q = body.quaternion;
    if (throttle > 0 || brake > 0 || steer !== 0) {
      const spin = q.conjugate().vmult(body.angularVelocity);
      const target = new CANNON.Vec3(clamp(throttle - brake, -1, 1) * AIR_SPIN, clamp(steer, -1, 1) * AIR_YAW, 0);
      spin.vadd(target.vsub(spin).scale(AIR_GRIP), spin);
      q.vmult(spin, body.angularVelocity);
    } else if (upY() > 0.5) {
      const level = q.vmult(UP).cross(WORLD_UP).scale(LEVEL_RATE);
      body.angularVelocity.vadd(level.vsub(body.angularVelocity).scale(AIR_GRIP), body.angularVelocity);
    }
  }

  function applyInput({ steer = 0, throttle = 0, brake = 0, hold = false, boost = false } = {}) {
    if (airControl) {
      // In the air a button only turns the car if it was pressed after take-off: kids hold GO through every jump.
      const keys = { go: throttle > 0, stop: brake > 0, left: steer > 0, right: steer < 0 };
      if (wheelsDown() > 0) heldAtTakeOff = keys;
      else {
        for (const k of Object.keys(keys)) if (!keys[k]) heldAtTakeOff[k] = false;
        const fresh = k => (keys[k] && !heldAtTakeOff[k] ? 1 : 0);
        airTurn(fresh('left') - fresh('right'), fresh('go'), fresh('stop'));
      }
    }
    const speed = forwardSpeed();
    const engineForce = stats.engineForce * (boost ? BOOST.force : 1);
    const topSpeed = stats.topSpeed * (boost ? BOOST.topSpeed : 1);
    let force = 0;
    let braking = 0;
    if (hold) braking = stats.brakeForce * 2;
    else if (brake > 0 && speed > 1) braking = stats.brakeForce * brake;
    else if (brake > 0 && throttle === 0) force = speed > -REVERSE_SPEED ? -0.6 * stats.engineForce * brake : 0;
    else if (throttle > 0) force = speed < topSpeed ? engineForce * throttle : 0;
    else braking = stats.mass * 0.004; // gentle rolling resistance when coasting

    const perWheel = (ENGINE_SIGN * force) / stats.wheels.length;
    const raceSteer = 0.5 - Math.min(0.25, Math.abs(speed) * 0.012); // less twitchy at speed
    const maxSteer = tightTurns ? Math.max(raceSteer, 1 - Math.abs(speed) * 0.06) : raceSteer;
    stats.wheels.forEach((w, i) => {
      vehicle.applyEngineForce(perWheel, i);
      vehicle.setBrake(braking, i);
      vehicle.setSteeringValue(w.front ? STEER_SIGN * clamp(steer, -1, 1) * maxSteer : 0, i);
    });
  }

  function flip() {
    const p = body.position;
    setPose({ x: p.x, y: p.y + flipLift, z: p.z }, heading());
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
    wheelsDown,
  };
}
