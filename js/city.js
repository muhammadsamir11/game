import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCityWorld } from './cityWorld.js';
import { createSky } from './sky.js';
import { createFrameWatch, softerShadows } from './frameWatch.js';
import { createCityTraffic } from './cityTraffic.js';
import { GARAGE, RACE_GATE, SIZE, FLOOR_HEIGHT, spotAt, inCity, garageFloorAt } from './cityMap.js';
import { createCityMinimap } from './cityMinimap.js';
import { carPaint } from './mapView.js';
import { createCityStore } from './cityState.js';
import { createWalker, findExit } from './walker.js';
import { computeStats } from './carStats.js';
import { attachStick } from './joystick.js';
import { attachCameraDrag } from './cameraDrag.js';
import { createDrivenCar } from './drivenCar.js';
import { createGadgetHud, animateFx } from './gadgetHud.js';
import { createCarMesh, carLift } from './brickMesh.js';
import { createFigureMesh, applyPose } from './figureMesh.js';
import { createGait, stepGait } from './walkCycle.js';
import { createControlState, toDriveInput } from './inputState.js';
import { attachDriveControls } from './input.js';
import { $, el, showScreen, openModal, toast, confirmDialog } from './ui.js';
import { sfx, speak, createEngineSound } from './audio.js';
import { DEFAULT_FIGURE } from './figures.js';
import { wrapAngle } from './math.js';
import { createProgressStore } from './progress.js';
import { COIN_SPOTS, PICKUP, createCoinField } from './coins.js';
import { createCityCoins } from './cityCoins.js';
import { createStuntTracker, throughHoop, ringEvent } from './stunts.js';
import { STUNT_PARK } from './stuntPark.js';
import { createConfetti } from './confetti.js';
import { createCityMissions } from './cityMissions.js';
import { createRemotePlayers, createStickerPopper } from './net/remotePlayers.js';
import { createCityGames } from './cityGames.js';
import { STATE_HZ, STICKERS, packState } from './net/protocol.js';
import { carPayload } from './net/together.js';
import { figureThumbnail } from './thumbnails.js';

const GET_IN_DISTANCE = 3.5;
const MAX_CAR_HEIGHT = FLOOR_HEIGHT - GARAGE.floors[0].hy * 2 - 0.2; // what fits under a garage floor

// room: true when playing together (friends drive around the same city on their own tablets).
export function createCity(app, { nearCarId = null, room = false } = {}) {
  showScreen('city');
  const ui = $('#city');
  const net = room && app.room?.inRoom ? app.room : null;
  ui.classList.toggle('in-room', !!net);
  const abort = new AbortController();
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });

  // --- scene and physics ---
  const scene = new THREE.Scene();
  const sky = createSky(scene, app.renderer, { center: { x: SIZE / 2, z: SIZE / 2 } });
  scene.add(new THREE.HemisphereLight(0xe3f1ff, 0x5f8f4a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
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
  const unparked = savedCars.length - entries.length;
  if (unparked) toast(`The garage is full! ${unparked} more ${unparked === 1 ? 'car waits' : 'cars wait'} in 🚗 My cars.`, 4000);

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
    return { car, spotIndex, paint: carPaint(car.bricks), mesh, body, driven: null, halfWidth: size.x / 2, halfLength: size.z / 2, height: size.y };
  }

  function behind(p, spot) {
    const h = spot.heading;
    return { x: p.x - 3 * Math.sin(h), y: spot.y, z: p.z - 3 * Math.cos(h), heading: h };
  }

  const entryPos = e => (e.driven ? e.driven.car.body.position : e.mesh.position);

  // --- him, on foot ---
  const figureMesh = createFigureMesh(app.figures.getMain() ?? DEFAULT_FIGURE);
  scene.add(figureMesh);
  const gait = createGait();
  let lastFeet = null; // where he stood last frame, so his stride follows the ground he really covers
  const near = entries.find(e => e.car.id === nearCarId);
  // With friends, each player starts a step to the side, so nobody starts inside someone else.
  const spawnSlot = net ? Math.max(0, [...net.state.players.keys()].indexOf(net.state.you)) : 0;
  const start = near
    ? behind(near.mesh.position, GARAGE.spots[near.spotIndex]) // just behind it, close enough to get in
    : { ...GARAGE.spawn, z: GARAGE.spawn.z + spawnSlot * 2.2 };
  let walker = createWalker(world, { position: { x: start.x, y: start.y + 0.6, z: start.z }, heading: start.heading });
  let driving = null;
  let camYaw = start.heading;
  let paused = false;
  let clock = 0;
  let leaving = false;

  const controls = createControlState();
  const pad = attachDriveControls(ui, controls, abort.signal);
  const stick = attachStick($('#stick', ui), abort.signal);
  const view = attachCameraDrag(app.renderer.domElement, abort.signal);
  const hud = createGadgetHud({ ui, scene, signal: abort.signal, canUse: () => !!driving && !paused, onUse: kind => net?.send('fx', { kind }) });
  const engine = createEngineSound();
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
  const enterBtn = $('[data-city="enter"]', ui);

  // --- coins and stunts ---
  const progress = createProgressStore();
  const coins = createCityCoins(scene, createCoinField(COIN_SPOTS));
  const stunts = createStuntTracker();
  const confetti = createConfetti(scene);
  const coinCount = $('#coin-count', ui);
  const coinTotal = $('b', coinCount);
  const stuntPop = $('#stunt-pop', ui);
  coinTotal.textContent = progress.get().coins;
  let prevCarPos = null;
  let takeOff = null; // where the current jump left the ground
  let flippedThisVisit = false;
  let airTipShown = false;
  let popTimer = 0;

  // --- friends (play together) ---
  const popper = createStickerPopper();
  const myPos = () => (driving ? driving.driven.car.body.position : walker?.body.position ?? null);
  const friends = net ? createRemotePlayers({
    scene, world, room: net, collide: true, popper,
    noBumpAt: p => insideGarage(p),
    listener: myPos,
    onConfetti: at => confetti.burst(at, 60),
  }) : null;
  const netOffs = [];
  let sendTimer = 0;
  let sentCarId;
  let gateAsked = false;
  const stickerTray = $('#sticker-tray', ui);
  const friendChips = $('#city-friends', ui);
  stickerTray.classList.add('hidden');

  // Where I am, 15 times a second, for my friends' tablets.
  function shareState(dt) {
    sendTimer += dt;
    if (sendTimer < 1 / STATE_HZ) return;
    sendTimer = 0;
    if (driving) {
      const car = driving.driven.car;
      net.send('state', { s: packState({ p: car.body.position, q: car.body.quaternion, v: car.body.velocity, h: car.pose().heading, siren: hud.sirenOn, boost: hud.boosting }) });
    } else if (walker) {
      net.send('state', { s: packState({ p: walker.shown, v: walker.body.velocity, h: walker.heading, foot: true }) });
    }
  }

  function renderFriendChips() {
    const me = net.state.you;
    friendChips.replaceChildren(...[...net.state.players.values()].filter(p => p.id !== me).map(p => el('button', {
      class: `friend-chip${p.away ? ' away' : ''}`,
      style: `--ring: ${friends.get(p.id)?.color ?? '#fff'}`,
      'aria-label': `Zap to ${p.name}`,
      'data-zap': p.id,
    }, [el('img', { src: figureThumbnail(p.figure, 'head'), alt: '' })])));
  }

  // Zap! Jump to just behind a friend, for when someone is lost (or just far away).
  function zapTo(id) {
    const f = friends.positions().find(x => x.id === id);
    if (!f) {
      toast('Can’t find them yet!');
      return;
    }
    const back = 6;
    let x = f.p.x - Math.sin(f.h) * back;
    let z = f.p.z - Math.cos(f.h) * back;
    if (!inCity(x, z)) ({ x, z } = f.p);
    if (driving) {
      driving.driven.car.resetTo({ x, y: f.p.y + 0.6, z }, f.h);
      resetStunts();
    } else {
      walker.teleport({ x, y: f.p.y + 0.2, z }, f.h);
      lastFeet = null;
    }
    sfx.flip();
    toast(`Zap! 🧲 Next to ${f.name}`);
    updateCamera(0, true);
  }

  function showMySticker(sticker) {
    if (driving) popper.pop(driving.driven.mesh, sticker, driving.height + 1.2);
    else popper.pop(figureMesh, sticker, 2.6);
  }

  if (net) {
    stickerTray.replaceChildren(...STICKERS.map((emoji, i) => el('button', { 'data-sticker': String(i), 'aria-label': `Send ${emoji}`, text: emoji })));
    renderFriendChips();
    netOffs.push(
      net.on('room', renderFriendChips),
      net.on('sticker', msg => { if (msg.id === net.state.you) showMySticker(msg.sticker); }),
    );
  }

  // Add coins to his saved pile and show them arriving.
  function award(n) {
    if (!(n > 0)) return;
    coinTotal.textContent = progress.addCoins(n);
    coinCount.classList.remove('bump');
    void coinCount.offsetWidth; // restart the bump animation
    coinCount.classList.add('bump');
    const float = document.createElement('span');
    float.className = 'coin-float';
    float.textContent = `+${n}`;
    coinCount.append(float);
    setTimeout(() => float.remove(), 900);
  }

  function showStunt(ev) {
    stuntPop.textContent = ev.oops ? 'Oops! 🙃' : `${ev.names.join(' + ')}! +${ev.coins} 🪙`;
    stuntPop.classList.remove('hidden', 'pop');
    void stuntPop.offsetWidth;
    stuntPop.classList.add('pop');
    popTimer = 1.6;
    if (ev.oops) return;
    sfx.cheer();
    confetti.burst(new THREE.Vector3().copy(driving.driven.car.body.position), 60);
    award(ev.coins);
    if (ev.names.some(n => n === 'FLIP' || n === 'BARREL ROLL' || n === '360 SPIN')) flippedThisVisit = true;
    else if (!flippedThisVisit && !airTipShown && ev.names.some(n => n.endsWith('AIR'))) {
      airTipShown = true;
      toast('In the air, tap GO to flip! 🤸', 3500);
      speak('In the air, tap GO to flip!');
    }
  }

  // Feed this frame's jump to the stunt tracker; returns any stunt that just finished.
  function trackStunts(dt) {
    const car = driving.driven.car;
    const spin = car.body.quaternion.conjugate().vmult(car.body.angularVelocity);
    const wasAirborne = stunts.airborne;
    // Touching anything (even with no wheel down, e.g. on its roof) counts as landed, not flying.
    const down = car.inAir() ? 0 : Math.max(2, car.wheelsDown());
    let ev = stunts.update({ dt, wheelsDown: down, upY: car.upY(), pitch: spin.x * dt, roll: spin.z * dt, yaw: spin.y * dt });
    const p = car.body.position;
    if (!wasAirborne && stunts.airborne) takeOff = { x: p.x, z: p.z };
    if (prevCarPos && stunts.airborne && throughHoop(prevCarPos, p, STUNT_PARK.hoop)) ev = { ...ringEvent(), from: { x: p.x, z: p.z } };
    else if (ev) ev = { ...ev, from: takeOff ?? { x: p.x, z: p.z } };
    prevCarPos = { x: p.x, y: p.y, z: p.z };
    if (ev) showStunt(ev);
    return ev;
  }

  function resetStunts() {
    stunts.reset();
    prevCarPos = null;
    takeOff = null;
  }

  // --- missions from the pizza shop ---
  function freeze() {
    paused = true;
    controls.releaseAll();
    stick.reset();
    view.reset();
    hud.setSiren(false);
    engine.silence();
  }
  const missions = createCityMissions({
    scene,
    ui,
    progress,
    cityWorld: city,
    onPause: freeze,
    onResume: () => { paused = false; },
    award,
    celebrate: at => confetti.burst(new THREE.Vector3(at.x, at.y + 1, at.z), 80),
    getFigure: () => app.figures.getMain() ?? DEFAULT_FIGURE,
  });

  // Play-together games (🎮): need the friends, coins and confetti above.
  let rushOn = false;
  const games = net ? createCityGames({
    ui, scene, camera, net, friends, confetti, award,
    me: () => ({ p: myPos(), driving: !!driving, host: driving ? driving.driven.mesh : figureMesh }),
    hidePersonalCoins: on => {
      rushOn = on;
      coins.setVisible(!on);
    },
  }) : null;

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
    if (entry.height > MAX_CAR_HEIGHT) {
      toast('This car is too tall to drive in the garage! Race it from 🚗 My cars.', 3200);
      return;
    }
    if (!entry.driven) {
      world.removeBody(entry.body);
      scene.remove(entry.mesh);
      // The physics body sits at the car's centre of mass, so turn that offset with the car.
      const p = entry.mesh.position;
      const h = entry.mesh.rotation.y;
      const com = computeStats(entry.car.bricks).centerOfMass;
      const position = { x: p.x + com.x * Math.cos(h) + com.z * Math.sin(h), y: p.y + com.y + 0.1, z: p.z - com.x * Math.sin(h) + com.z * Math.cos(h) };
      entry.driven = createDrivenCar({ world, scene, bricks: entry.car.bricks, pose: { position, heading: h }, vehicle: { tightTurns: true, flipLift: 0.5, airControl: true } });
    }
    controls.releaseAll(); // a finger still on the stick must not drive off
    stick.reset();
    view.reset();
    entry.driven.showDriver(true);
    resetStunts();
    walker.remove();
    walker = null;
    figureMesh.visible = false;
    driving = entry;
    hud.setCar(entry.car.bricks, entry.driven.fx);
    if (net && sentCarId !== `${entry.car.id}:${entry.car.updatedAt}`) {
      sentCarId = `${entry.car.id}:${entry.car.updatedAt}`;
      net.chooseCar(entry.car.id, carPayload(entry.car, app.figures.listFriends()));
    }
    setModeClass();
    sfx.snap();
  }

  function getOut() {
    const entry = driving;
    const car = entry.driven.car;
    const pose = car.pose();
    const door = findExit(world, { car: car.body, ...pose, halfWidth: entry.halfWidth, halfLength: entry.halfLength });
    const speed = Math.abs(car.forwardSpeed());
    resetStunts();
    controls.releaseAll(); // a finger still on GO must not walk him off
    stick.reset();
    view.reset();
    walker = createWalker(world, { position: door, heading: pose.heading });
    lastFeet = null;
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
    view.reset();
    hud.setSiren(false);
    engine.silence();
    openModal({
      title: 'Paused',
      icon: '⏸',
      buttons: [
        { label: '🏠 Home', onClick: () => app.goHome() },
        ...(net ? [{ label: '🤝 Room', onClick: () => app.openTogether() }] : []),
        { label: '▶ Keep going', kind: 'go', onClick: () => { paused = false; } },
      ],
    });
  }

  async function goHome() {
    if (driving && !(await confirmDialog('Leave the city?', { yes: '🏠 Leave', no: 'Stay', icon: '🏙' }))) return;
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
      resetStunts();
      sfx.flip();
    }
    if (action === 'pause') pause();
    if (action === 'home') goHome();
    if (action === 'cars') app.openGarage({ fromCity: true });
    if (action === 'stickers') stickerTray.classList.toggle('hidden');
    if (action === 'games') games?.openMenu();
  });
  if (net) {
    on(stickerTray, 'pointerdown', ev => {
      const sticker = ev.target.closest('[data-sticker]')?.dataset.sticker;
      if (sticker === undefined) return;
      net.sticker(Number(sticker));
      stickerTray.classList.add('hidden');
    });
    on(friendChips, 'pointerdown', ev => {
      const id = ev.target.closest('[data-zap]')?.dataset.zap;
      if (id) zapTo(id);
    });
  }
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
    const p = driving ? driving.driven.car.body.position : walker.shown;
    const targetYaw = driving ? driving.driven.car.pose().heading : walker.heading;
    const moving = driving || Math.hypot(walker.body.velocity.x, walker.body.velocity.z) > 0.5;
    camYaw += view.takeYaw();
    // After a drag the view stays put for a moment, then swings back behind him as before.
    const looked = view.idle < (driving ? 1.5 : 1);
    if (snap) camYaw = targetYaw;
    else if (moving && !looked) camYaw += wrapAngle(targetYaw - camYaw) * (1 - Math.exp(-dt * (driving ? 5 : 1.5)));
    if (!looked) view.look.pitch *= Math.exp(-dt * 2);
    const indoor = insideGarage(p);
    const dist = driving ? (indoor ? 6 : 8.5) : (indoor ? 3.8 : 5.5);
    const height = driving ? (indoor ? 2.2 : 3.6) : (indoor ? 1.7 : 2.8);
    // Tilting swings the camera up or down around him; in the garage it stays under the 3.7 m slab above.
    const reach = Math.hypot(dist, height);
    const level = Math.atan2(height, dist);
    const highest = indoor ? Math.asin(Math.min(1, (driving ? 2.5 : 2.9) / reach)) : 1.2;
    const tilt = Math.min(highest, Math.max(0.12, level + view.look.pitch));
    view.look.pitch = tilt - level; // so dragging back the other way answers at once
    const back = reach * Math.cos(tilt);
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    camPos.lerp(tmp.set(p.x - fx * back, p.y + reach * Math.sin(tilt), p.z - fz * back), k);
    camLook.lerp(tmp.set(p.x + fx * 3, p.y + 0.8, p.z + fz * 3), k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sun.position.set(p.x + 30, p.y + 50, p.z + 20);
    sun.target.position.set(p.x, p.y, p.z);
  }

  // Mini-map: follows him and turns with the camera; tap it for the big map of the whole city.
  const map = $('#city-map', ui);
  const minimap = createCityMinimap({ canvas: map, buildings: city.mapBuildings });
  function mapState(dt = 1) {
    const p = driving ? driving.driven.car.body.position : walker.shown;
    const cars = entries.filter(e => e !== driving).map(e => {
      const q = entryPos(e);
      const heading = e.driven ? e.driven.car.pose().heading : GARAGE.spots[e.spotIndex].heading;
      return { x: q.x, z: q.z, heading, floor: garageFloorAt(q.x, q.y, q.z), spot: spotAt(q.x, q.y, q.z), hex: e.paint };
    });
    return {
      me: { x: p.x, y: p.y, z: p.z },
      heading: driving ? driving.driven.car.pose().heading : walker.heading,
      yaw: camYaw,
      driving: !!driving,
      cars,
      coins: rushOn ? null : coins.field,
      friends: friends?.positions() ?? [],
      extras: (g, toMap, scale) => {
        missions.drawMap(g, toMap, scale, clock);
        games?.drawMap(g, toMap);
      },
      dt,
    };
  }
  function openBigMap() {
    if (paused) return;
    paused = true;
    controls.releaseAll();
    stick.reset();
    view.reset();
    engine.silence();
    const big = el('canvas', { class: 'big-map', width: '1200', height: '1200' });
    minimap.drawBig(big, mapState());
    openModal({
      className: 'map-modal',
      body: [big],
      buttons: [{ label: '▶ Keep going', kind: 'go', onClick: () => { paused = false; } }],
    });
  }
  on(map, 'pointerdown', ev => {
    ev.preventDefault();
    openBigMap();
  });

  function syncFigure(dt = 0) {
    if (walker.body.position.y < -5) walker.teleport({ x: GARAGE.spawn.x, y: 1, z: GARAGE.spawn.z }, GARAGE.spawn.heading);
    const p = walker.shown;
    const distance = lastFeet && dt > 0 ? Math.min(Math.hypot(p.x - lastFeet.x, p.z - lastFeet.z), 0.5) : 0;
    lastFeet = { x: p.x, z: p.z };
    applyPose(figureMesh, stepGait(gait, { distance, dt, grounded: walker.grounded }));
    figureMesh.position.set(p.x, p.y - 0.4, p.z);
    figureMesh.rotation.y = walker.heading;
  }

  // Driving through the race gate takes this car to the race track.
  function reachedRaceGate() {
    if (!driving || leaving) return false;
    const p = driving.driven.car.body.position;
    const atGate = Math.hypot(p.x - RACE_GATE.x, p.z - RACE_GATE.z) <= RACE_GATE.radius;
    if (net) {
      // With friends, the arch asks first (once per drive-through): everyone in the room goes racing.
      if (!atGate) gateAsked = false;
      else if (!gateAsked) {
        gateAsked = true;
        confirmDialog('Race everyone? 🏁', { yes: '🏁 Race!', no: 'Not now', icon: '🤝' }).then(yes => { if (yes) net.send('go', { place: 'race' }); });
      }
      return false;
    }
    if (!atGate) return false;
    leaving = true;
    app.startRace(driving.car, { fromCity: true });
    return true;
  }

  // If the iPad struggles, draw fewer real studs, then use softer shadows.
  const watchFrames = createFrameWatch([
    () => { city.ground.radius *= 0.6; },
    () => { city.ground.radius *= 0.6; },
    () => softerShadows(sun),
  ]);

  setModeClass();
  syncFigure();
  updateCamera(0, true);

  return {
    scene,
    camera,
    landscapeOnly: true,
    roomPlace: net ? 'city' : null,
    // for poking at from the browser console
    debug: {
      teleport(x, z, y = 0.6, heading = null) {
        if (driving) driving.driven.car.resetTo({ x, y: y + 0.4, z }, heading ?? driving.driven.car.pose().heading);
        else walker.teleport({ x, y, z });
      },
      getIn() {
        const entry = nearestCar();
        if (entry) getIn(entry);
        return !!entry;
      },
      get floor() {
        const p = driving ? driving.driven.car.body.position : walker.body.position;
        return garageFloorAt(p.x, p.y, p.z);
      },
    },
    update(dt) {
      // Friends keep moving (and see me) even while this tablet is paused or showing a popup.
      if (net) {
        shareState(dt);
        friends.update(dt);
        games.update(dt);
      }
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
        if (driving.driven.car.update(dt)) {
          resetStunts();
          sfx.flip();
        }
      } else {
        walker.move(walkInput(), camYaw, dt);
      }
      for (const e of entries) if (e.driven && e !== driving) e.driven.car.applyInput({ hold: true });
      const player = driving ? driving.driven.car.body.position : walker.body.position;
      const looseCars = entries.filter(e => e.driven && e !== driving).map(e => e.driven.car.body.position);
      traffic.update(dt, clock, player, [player, ...looseCars]);
      world.step(1 / 60, dt, 3);
      coins.update(dt, clock);
      const here = driving ? driving.driven.car.body.position : walker.body.position;
      for (const got of rushOn ? [] : coins.field.collect(here, driving ? PICKUP.car : PICKUP.foot)) {
        if (got.value > 1) sfx.bigCoin();
        else sfx.coin();
        award(got.value);
      }
      const stunt = driving ? trackStunts(dt) : null;
      missions.update(dt, { player: here, driving: !!driving, carMesh: driving?.driven.mesh ?? null, figureMesh, stunt, clock });
      confetti.update(dt);
      if (popTimer > 0 && (popTimer -= dt) <= 0) stuntPop.classList.add('hidden');
      for (const e of entries) {
        if (!e.driven) continue;
        e.driven.sync();
        animateFx(e.driven.fx, dt, { speed: Math.abs(e.driven.car.forwardSpeed()), clock, seed: e.spotIndex, boosting: e === driving && hud.boosting, sirenOn: e === driving && hud.sirenOn });
      }
      if (!driving) syncFigure(dt);
      hud.update(dt);
      pad.refresh();
      city.update(clock, here);
      sky.update(dt, camera);
      watchFrames(dt);
      enterBtn.classList.toggle('hidden', !nearestCar());
      if (reachedRaceGate()) return;
      updateCamera(dt);
      minimap.draw(mapState(dt));
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
      coins.dispose();
      missions.dispose();
      for (const off of netOffs) off();
      games?.dispose();
      friends?.dispose();
      popper.dispose();
      stickerTray.classList.add('hidden');
      confetti.dispose();
      stuntPop.classList.add('hidden');
      traffic.dispose();
      city.dispose();
      sky.dispose();
      sun.dispose();
    },
  };
}
