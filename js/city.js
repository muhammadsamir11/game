import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCityWorld } from './cityWorld.js';
import { createCityTraffic } from './cityTraffic.js';
import { GARAGE, RACE_GATE, SIZE, GRID, PITCH, ROAD, spotAt } from './cityMap.js';
import { createCityStore } from './cityState.js';
import { createWalker } from './walker.js';
import { attachStick } from './joystick.js';
import { createDrivenCar } from './drivenCar.js';
import { createGadgetHud, animateFx } from './gadgetHud.js';
import { createCarMesh, carLift } from './brickMesh.js';
import { createFigureMesh } from './figureMesh.js';
import { createControlState, toDriveInput } from './inputState.js';
import { attachDriveControls } from './input.js';
import { $, showScreen, openModal, toast, confirmDialog } from './ui.js';
import { sfx, createEngineSound } from './audio.js';
import { DEFAULT_FIGURE } from './figures.js';
import { wrapAngle } from './math.js';

const SKY = 0x8fd3ff;
const GET_IN_DISTANCE = 3.5;

export function createCity(app, { nearCarId = null } = {}) {
  showScreen('city');
  const ui = $('#city');
  const abort = new AbortController();
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });

  // --- scene and physics ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 80, 260);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6fbf5f, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.25;
  const city = createCityWorld(scene, world);
  const traffic = createCityTraffic(scene, world);
  const store = createCityStore();

  // --- his cars, each in its garage spot (just a picture + a box until he gets in) ---
  const savedCars = app.garage.list();
  const spots = store.spotsFor(savedCars.map(c => c.id));
  const entries = savedCars.filter(c => spots[c.id] !== undefined).map(c => parkCar(c, spots[c.id]));

  function parkCar(car, spotIndex) {
    const spot = GARAGE.spots[spotIndex];
    const mesh = createCarMesh(car.bricks, { emptySeat: true });
    const bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    mesh.position.set(spot.x, spot.y + carLift(car.bricks), spot.z);
    mesh.rotation.y = spot.heading;
    scene.add(mesh);
    const body = new CANNON.Body({ type: CANNON.Body.STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)), new CANNON.Vec3(center.x, center.y, center.z));
    body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    body.quaternion.setFromEuler(0, spot.heading, 0);
    body.aabbNeedsUpdate = true;
    world.addBody(body);
    return { car, spotIndex, mesh, body, driven: null, halfWidth: size.x / 2 };
  }

  const entryPos = e => (e.driven ? e.driven.car.body.position : e.mesh.position);

  // --- him, on foot ---
  const figureMesh = createFigureMesh(app.figures.getMain() ?? DEFAULT_FIGURE);
  scene.add(figureMesh);
  const near = entries.find(e => e.car.id === nearCarId);
  const start = near
    ? { x: near.mesh.position.x + 3, y: GARAGE.spots[near.spotIndex].y, z: near.mesh.position.z, heading: -Math.PI / 2 } // just behind it, close enough to get in
    : GARAGE.spawn;
  let walker = createWalker(world, { position: { x: start.x, y: start.y + 0.6, z: start.z }, heading: start.heading });
  let driving = null;
  let camYaw = start.heading;
  let paused = false;
  let clock = 0;
  let leaving = false;

  const controls = createControlState();
  const pad = attachDriveControls(ui, controls, abort.signal);
  const stick = attachStick($('#stick', ui), abort.signal);
  const hud = createGadgetHud({ ui, scene, signal: abort.signal, canUse: () => !!driving && !paused });
  const engine = createEngineSound();
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
  const enterBtn = $('[data-city="enter"]', ui);

  function setModeClass() {
    ui.classList.toggle('driving', !!driving);
    ui.classList.toggle('on-foot', !driving);
  }

  function nearestCar() {
    if (driving || !walker) return null;
    const p = walker.body.position;
    let best = null;
    let bestDist = GET_IN_DISTANCE;
    for (const e of entries) {
      const q = entryPos(e);
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bestDist && Math.abs(q.y - p.y) < 2) {
        best = e;
        bestDist = d;
      }
    }
    return best;
  }

  function getIn(entry) {
    if (!entry.driven) {
      world.removeBody(entry.body);
      scene.remove(entry.mesh);
      const p = entry.mesh.position;
      entry.driven = createDrivenCar({ world, scene, bricks: entry.car.bricks, pose: { position: { x: p.x, y: p.y + 0.5, z: p.z }, heading: entry.mesh.rotation.y }, tightTurns: true });
    }
    entry.driven.showDriver(true);
    walker.remove();
    walker = null;
    figureMesh.visible = false;
    driving = entry;
    hud.setCar(entry.car.bricks, entry.driven.fx);
    setModeClass();
    sfx.snap();
  }

  // Is the straight line from the car's middle to a door spot free of walls and other cars?
  function isClear(from, to) {
    const body = driving.driven.car.body;
    const result = new CANNON.RaycastResult();
    body.collisionResponse = false;
    world.raycastClosest(new CANNON.Vec3(from.x, from.y + 0.3, from.z), new CANNON.Vec3(to.x, from.y + 0.3, to.z), { skipBackfaces: true }, result);
    body.collisionResponse = true;
    return !result.hasHit;
  }

  function getOut() {
    const entry = driving;
    const car = entry.driven.car;
    const pose = car.pose();
    const rightX = -Math.cos(pose.heading);
    const rightZ = Math.sin(pose.heading);
    const side = entry.halfWidth + 0.9;
    const doors = [1, -1, 0].map(s => (s === 0
      ? { x: pose.x - Math.sin(pose.heading) * 3.5, z: pose.z - Math.cos(pose.heading) * 3.5 } // behind the car
      : { x: pose.x + rightX * side * s, z: pose.z + rightZ * side * s }));
    const door = doors.find(d => isClear(pose, d)) ?? doors[0];
    const speed = Math.abs(car.forwardSpeed());
    walker = createWalker(world, { position: { x: door.x, y: pose.y + 0.2, z: door.z }, heading: pose.heading });
    entry.driven.showDriver(false);
    figureMesh.visible = true;
    driving = null;
    hud.clearCar();
    engine.silence();
    setModeClass();
    camYaw = pose.heading;
    const spot = spotAt(pose.x, pose.y, pose.z);
    if (spot === null) return;
    if (speed >= 1) {
      toast('Stop in the spot to park!');
    } else if (store.park(entry.car.id, spot)) {
      entry.spotIndex = spot;
      toast(`Parked in spot ${spot + 1}! 🅿️`);
      sfx.success();
    } else {
      toast('That spot belongs to another car.');
    }
  }

  function pause() {
    if (paused) return;
    paused = true;
    controls.releaseAll();
    stick.reset();
    hud.setSiren(false);
    engine.silence();
    openModal({
      title: 'Paused',
      buttons: [
        { label: '🏠 Home', onClick: () => app.goHome() },
        { label: '▶ Keep going', kind: 'go', onClick: () => { paused = false; } },
      ],
    });
  }

  async function goHome() {
    if (driving && !(await confirmDialog('Leave the city?', { yes: 'Leave', no: 'Stay' }))) return;
    app.goHome();
  }

  on(ui, 'pointerdown', ev => {
    const action = ev.target.closest('[data-city]')?.dataset.city;
    if (!action) return;
    if (action === 'enter') {
      const entry = nearestCar();
      if (entry) getIn(entry);
    }
    if (action === 'exit' && driving) getOut();
    if (action === 'flip' && driving) {
      driving.driven.car.flip();
      sfx.flip();
    }
    if (action === 'pause') pause();
    if (action === 'home') goHome();
    if (action === 'cars') app.openGarage({ fromCity: true });
  });
  on(window, 'keydown', ev => {
    if (ev.code !== 'KeyE' || ev.repeat || paused) return;
    if (driving) getOut();
    else {
      const entry = nearestCar();
      if (entry) getIn(entry);
    }
  });
  on(document, 'visibilitychange', () => { if (document.hidden) pause(); });

  // Keyboard arrows/WASD walk too; the on-screen stick wins when it is used.
  function walkInput() {
    if (Math.hypot(stick.value.x, stick.value.y) > 0.05) return stick.value;
    const k = toDriveInput(controls);
    return { x: -k.steer, y: k.throttle - k.brake };
  }

  const insideGarage = p => p.x > GARAGE.rect.x0 && p.x < GARAGE.rect.x1 && p.z > GARAGE.rect.z0 && p.z < GARAGE.rect.z1;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function updateCamera(dt, snap = false) {
    const p = driving ? driving.driven.car.body.position : walker.body.position;
    const targetYaw = driving ? driving.driven.car.pose().heading : walker.heading;
    const moving = driving || Math.hypot(walker.body.velocity.x, walker.body.velocity.z) > 0.5;
    if (snap) camYaw = targetYaw;
    else if (moving) camYaw += wrapAngle(targetYaw - camYaw) * (1 - Math.exp(-dt * (driving ? 5 : 1.5)));
    const indoor = insideGarage(p);
    const dist = driving ? (indoor ? 6 : 8.5) : (indoor ? 3.8 : 5.5);
    const height = driving ? (indoor ? 2.2 : 3.6) : (indoor ? 1.7 : 2.8);
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    camPos.lerp(tmp.set(p.x - fx * dist, p.y + height, p.z - fz * dist), k);
    camLook.lerp(tmp.set(p.x + fx * 3, p.y + 0.8, p.z + fz * 3), k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sun.position.set(p.x + 30, p.y + 50, p.z + 20);
    sun.target.position.set(p.x, p.y, p.z);
  }

  // Mini-map: roads, the garage, the race gate and him (north up).
  const map = $('#city-map', ui);
  const g = map.getContext('2d');
  const scale = map.width / (SIZE + 24);
  const toMap = v => (v + 12) * scale;
  function drawMap() {
    g.clearRect(0, 0, map.width, map.height);
    g.fillStyle = '#9e9e9e';
    for (let i = 0; i <= GRID; i++) {
      g.fillRect(toMap(i * PITCH), toMap(0), ROAD * scale, SIZE * scale);
      g.fillRect(toMap(0), toMap(i * PITCH), SIZE * scale, ROAD * scale);
    }
    g.fillStyle = '#1e88e5';
    g.fillRect(toMap(GARAGE.rect.x0), toMap(GARAGE.rect.z0), 36 * scale, 36 * scale);
    g.fillStyle = '#e53935';
    g.beginPath();
    g.arc(toMap(RACE_GATE.x), toMap(RACE_GATE.z), 9, 0, Math.PI * 2);
    g.fill();
    const p = driving ? driving.driven.car.body.position : walker.body.position;
    const heading = driving ? driving.driven.car.pose().heading : walker.heading;
    g.save();
    g.translate(toMap(p.x), toMap(p.z));
    g.rotate(-heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#e53935';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 14);
    g.lineTo(9, -9);
    g.lineTo(-9, -9);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  function syncFigure() {
    const p = walker.body.position;
    if (p.y < -5) walker.teleport({ x: GARAGE.spawn.x, y: 1, z: GARAGE.spawn.z }, GARAGE.spawn.heading);
    const moving = Math.hypot(walker.body.velocity.x, walker.body.velocity.z) > 0.3;
    figureMesh.position.set(p.x, p.y - 0.4 + (moving ? Math.abs(Math.sin(clock * 10)) * 0.06 : 0), p.z);
    figureMesh.rotation.y = walker.heading;
  }

  // Driving through the race gate takes this car to the race track.
  function reachedRaceGate() {
    if (!driving || leaving) return false;
    const p = driving.driven.car.body.position;
    if (Math.hypot(p.x - RACE_GATE.x, p.z - RACE_GATE.z) > RACE_GATE.radius) return false;
    leaving = true;
    app.startRace(driving.car, { fromCity: true });
    return true;
  }

  setModeClass();
  syncFigure();
  updateCamera(0, true);

  return {
    scene,
    camera,
    landscapeOnly: true,
    update(dt) {
      if (paused) return;
      if (portrait.matches) {
        pause();
        return;
      }
      clock += dt;
      if (driving) {
        const input = { ...toDriveInput(controls), boost: hud.boosting };
        driving.driven.car.applyInput(input);
        // No input here: the race's "stuck → hop up" rescue could pop a car into the garage ceiling. Flip me! is there instead.
        if (driving.driven.car.update(dt)) sfx.flip();
      } else {
        walker.move(walkInput(), camYaw);
      }
      for (const e of entries) if (e.driven && e !== driving) e.driven.car.applyInput({ hold: true });
      const player = driving ? driving.driven.car.body.position : walker.body.position;
      const looseCars = entries.filter(e => e.driven && e !== driving).map(e => e.driven.car.body.position);
      traffic.update(dt, clock, player, [player, ...looseCars]);
      world.step(1 / 60, dt, 3);
      for (const e of entries) {
        if (!e.driven) continue;
        e.driven.sync();
        animateFx(e.driven.fx, dt, { speed: Math.abs(e.driven.car.forwardSpeed()), clock, seed: e.spotIndex, boosting: e === driving && hud.boosting, sirenOn: e === driving && hud.sirenOn });
      }
      if (!driving) syncFigure();
      hud.update(dt);
      pad.refresh();
      city.update(clock);
      enterBtn.classList.toggle('hidden', !nearestCar());
      if (reachedRaceGate()) return;
      updateCamera(dt);
      drawMap();
      if (driving) engine.setSpeed(Math.abs(driving.driven.car.forwardSpeed()));
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      abort.abort();
      controls.releaseAll();
      engine.stop();
      hud.dispose();
      traffic.dispose();
      city.dispose();
      sun.dispose();
    },
  };
}
