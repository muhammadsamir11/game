import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCityWorld } from './cityWorld.js';
import { createSky } from './sky.js';
import { createFrameWatch, softerShadows, lowerResolution } from './frameWatch.js';
import { createCityTraffic } from './cityTraffic.js';
import { GARAGE, RACE_GATE, SIZE, FLOOR_HEIGHT, SHOWROOM, TRUCK_YARD, GARAGE_DOOR, spotAt, inCity, garageFloorAt, truckBayAt, trailerBayAt } from './cityMap.js';
import { createCityMinimap } from './cityMinimap.js';
import { carPaint } from './mapView.js';
import { createCityStore } from './cityState.js';
import { createWalker, findExit } from './walker.js';
import { computeStats } from './carStats.js';
import { attachStick } from './joystick.js';
import { attachCameraDrag } from './cameraDrag.js';
import { createDrivenCar, collectFx } from './drivenCar.js';
import { createTricks, UMBRELLA_TIME } from './carTricks.js';
import { createGadgetHud, animateFx } from './gadgetHud.js';
import { createSpeedometer } from './speedometer.js';
import { createCarMesh, carLift, createUmbrellaMesh } from './brickMesh.js';
import { disposeMerged } from './meshMerge.js';
import { createFigureMesh, mergeFigure, applyPose } from './figureMesh.js';
import { createGait, stepGait } from './walkCycle.js';
import { createControlState, toDriveInput } from './inputState.js';
import { attachDriveControls } from './input.js';
import { $, el, showScreen, openModal, toast, confirmDialog } from './ui.js';
import { sfx, speak, createEngineSound } from './audio.js';
import { DEFAULT_FIGURE } from './figures.js';
import { wrapAngle } from './math.js';
import { createProgressStore } from './progress.js';
import { createShowroomStore, missingPrizes, stalePrizes, prizeCarFor, deliveryNote } from './prizeShowroom.js';
import { prizeBricks } from './prizeCars.js';
import { createCityShowroom, createRibbon } from './cityShowroom.js';
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
import { nearestTraffic, launchDirection, createTumble, KICK_POSE, KICK_REACH, KICK_TIME, GIVE_BACK_DISTANCE } from './carjack.js';
import { buildKind } from './bricks.js';
import { canHook } from './hitch.js';
import { createTrailer, trailerSpecFromBricks, hookWorld } from './towing.js';
import { frameToWorld } from './towPhysics.js';

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

  // His coins, and the showroom's mystery cars (won with math questions, one a day). Any prize car missing from
  // his garage comes back, and any saved from an older recipe is brought up to date, before parking.
  const progress = createProgressStore();
  const showroom = createShowroomStore();
  for (const key of missingPrizes(app.garage.list(), showroom.get().unlocked)) app.garage.save(prizeCarFor(key));
  for (const car of stalePrizes(app.garage.list())) app.garage.save({ ...car, bricks: prizeBricks(car.prize) }); // a recipe was improved

  // --- his cars, each in its garage spot (just a picture + a box until he gets in) ---
  // Prize cars that find the garage full wait beside the showroom's turntable instead.
  // His trucks and trailers park in the Truck Yard's bays instead.
  const savedAll = app.garage.list();
  const ofKind = kind => savedAll.filter(c => buildKind(c.bricks) === kind);
  const savedCars = ofKind('car');
  const spots = store.spotsFor(savedCars.map(c => c.id));
  const entries = [];
  for (const c of savedCars) {
    if (spots[c.id] !== undefined) entries.push(parkCar(c, spots[c.id]));
    else if (c.prize) parkWaiting(c);
  }
  const unparked = savedCars.length - entries.length;
  if (unparked) toast(`The garage is full! ${unparked} more ${unparked === 1 ? 'car waits' : 'cars wait'} in 🚗 My cars.`, 4000);

  // Trucks are entries like cars (he gets in and drives); trailers are not (they're hooked on and pulled).
  const truckBays = store.baysFor('truck', ofKind('truck').map(c => c.id));
  for (const c of ofKind('truck')) {
    const bay = TRUCK_YARD.truckBays[truckBays[c.id]];
    if (bay) entries.push({ ...parkCar(c, null, { x: bay.x, y: 0, z: bay.z, heading: bay.heading }), kind: 'truck' });
  }
  const trailerBays = store.baysFor('trailer', ofKind('trailer').map(c => c.id));
  const trailers = []; // { car, trailer, paint }
  for (const c of ofKind('trailer')) {
    const bay = TRUCK_YARD.trailerBays[trailerBays[c.id]];
    if (bay) trailers.push({ car: c, paint: carPaint(c.bricks), trailer: createTrailer({ world, scene, spec: trailerSpecFromBricks(c.bricks), pose: bay }) });
  }
  const yardFull = ofKind('truck').length + ofKind('trailer').length - Object.keys(truckBays).length - Object.keys(trailerBays).length;
  if (yardFull) setTimeout(() => toast(`The truck yard is full! ${yardFull} more ${yardFull === 1 ? 'waits' : 'wait'} in 🚗 My cars.`, 4000), unparked ? 4200 : 0);

  // A garage-door barrier that only a towing truck meets (its collisions are switched on while he tows).
  const doorBarrier = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(GARAGE_DOOR.hx, GARAGE_DOOR.hy, GARAGE_DOOR.hz)) });
  doorBarrier.position.set(GARAGE_DOOR.cx, GARAGE_DOOR.cy, GARAGE_DOOR.cz);
  doorBarrier.collisionResponse = false;
  doorBarrier.aabbNeedsUpdate = true;
  world.addBody(doorBarrier);

  function parkWaiting(car) {
    const slot = SHOWROOM.waiting.find(w => !entries.some(e => e.spotIndex === null && e.pose.x === w.x && e.pose.z === w.z));
    if (!slot) return null;
    const entry = parkCar(car, null, { ...slot, y: 0 });
    entries.push(entry);
    return entry;
  }

  // spotIndex: his numbered garage spot, or null for a prize car waiting at the showroom (at pose).
  function parkCar(car, spotIndex, pose = GARAGE.spots[spotIndex]) {
    const mesh = createCarMesh(car.bricks, { emptySeat: true, merge: true });
    const bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (car.prize && !showroom.get().driven.includes(car.prize)) mesh.add(createRibbon(size, center)); // new: tied with a bow
    mesh.position.set(pose.x, pose.y + carLift(car.bricks), pose.z);
    mesh.rotation.y = pose.heading;
    createTricks(collectFx(mesh)).park(); // a parked Rolls-Royce has its flying lady tucked away
    scene.add(mesh);
    const body = new CANNON.Body({ type: CANNON.Body.STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)), new CANNON.Vec3(center.x, center.y, center.z));
    body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    body.quaternion.setFromEuler(0, pose.heading, 0);
    body.aabbNeedsUpdate = true;
    world.addBody(body);
    return { car, spotIndex, pose, paint: carPaint(car.bricks), mesh, body, driven: null, halfWidth: size.x / 2, halfLength: size.z / 2, height: size.y };
  }

  function behind(p, spot, back = 3) {
    const h = spot.heading;
    return { x: p.x - back * Math.sin(h), y: spot.y, z: p.z - back * Math.cos(h), heading: h };
  }

  const entryPos = e => (e.driven ? e.driven.car.body.position : e.mesh.position);

  // --- him, on foot ---
  const figureMesh = createFigureMesh(app.figures.getMain() ?? DEFAULT_FIGURE);
  scene.add(figureMesh);
  const gait = createGait();
  let lastFeet = null; // where he stood last frame, so his stride follows the ground he really covers
  const near = entries.find(e => e.car.id === nearCarId);
  const nearTrailer = trailers.find(t => t.car.id === nearCarId);
  // With friends, each player starts a step to the side, so nobody starts inside someone else.
  const spawnSlot = net ? Math.max(0, [...net.state.players.keys()].indexOf(net.state.you)) : 0;
  const inFront = t => { // in front of a trailer's towbar, facing it
    const o = t.trailer.origin();
    return { ...frameToWorld(o, { x: 0, y: 0, z: t.trailer.spec.ring.z + 2.5 }), y: 0, heading: o.heading + Math.PI };
  };
  const start = near
    ? behind(near.mesh.position, near.pose, Math.max(3, near.halfLength + 1)) // just behind it, close enough to get in
    : nearTrailer ? inFront(nearTrailer)
      : { ...GARAGE.spawn, z: GARAGE.spawn.z + spawnSlot * 2.2 };
  let walker = createWalker(world, { position: { x: start.x, y: start.y + 0.6, z: start.z }, heading: start.heading });
  let driving = null;
  // A car he took from the traffic (kicked the driver out): entry-shaped, with .traffic its car on the road.
  let borrowed = null;
  let kick = null; // { car, t }: his kick is mid-swing at that traffic car
  const tumbles = []; // kicked-out drivers flying, sitting dazed or running off
  const drivenEntries = () => (borrowed ? [...entries, borrowed] : entries);
  let camYaw = start.heading;
  let paused = false;
  let clock = 0;
  let leaving = false;

  const controls = createControlState();
  const pad = attachDriveControls(ui, controls, abort.signal);
  const stick = attachStick($('#stick', ui), abort.signal);
  const view = attachCameraDrag(app.renderer.domElement, abort.signal);
  const hud = createGadgetHud({ ui, scene, signal: abort.signal, canUse: () => !!driving && !paused, onUse: kind => {
    net?.send('fx', { kind });
    if (kind === 'horn') driving?.tricks.honk(); // the limo's disco lights
  } });
  const speedo = createSpeedometer($('.speedo', ui));
  const engine = createEngineSound();
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
  const enterBtn = $('[data-city="enter"]', ui);
  const hitchBtn = $('[data-city="hitch"]', ui);
  hitchBtn.classList.add('hidden');
  let doorWarned = -Infinity; // clock time of the last "Unhook your trailer first!"
  // Said when his towing truck bumps the garage door's barrier (at most every 3 seconds).
  function warnAtGarageDoor() {
    if (clock - doorWarned < 3 || !world.contacts.some(c => c.bi === doorBarrier || c.bj === doorBarrier)) return;
    doorWarned = clock;
    toast('Unhook your trailer first! 🔗');
  }

  // --- coins and stunts ---
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
      driving.trailer?.straighten();
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

  // --- Murad Motors: the mystery car on the turntable ---
  // deliver: the prize is his (saved) the moment the reveal starts; place() parks it under the flash at the
  // end of the show, and says where it went.
  function deliver(key) {
    const car = app.garage.save(prizeCarFor(key));
    return () => {
      const spot = store.spotsFor(app.garage.list().map(c => c.id))[car.id];
      if (spot !== undefined) {
        entries.push(parkCar(car, spot));
        return deliveryNote(car.name, 'garage', spot);
      }
      return deliveryNote(car.name, parkWaiting(car) ? 'showroom' : 'cars');
    };
  }
  const showroomView = createCityShowroom({
    scene,
    world,
    ui,
    showroom,
    onPause: freeze,
    onResume: () => {
      paused = false;
      if (pauseAfterReveal) {
        pauseAfterReveal = false;
        pause();
      }
    },
    celebrate: at => confetti.burst(new THREE.Vector3(at.x, at.y, at.z), 120),
    deliver,
  });

  function setModeClass() {
    ui.classList.toggle('driving', !!driving);
    ui.classList.toggle('on-foot', !driving);
  }

  function nearestCar() {
    if (driving || !walker) return null;
    const p = walker.body.position;
    let best = null;
    let bestDist = GET_IN_DISTANCE;
    for (const e of drivenEntries()) {
      const q = entryPos(e);
      // Measured from near its ends for long cars (the limo), so he needn't squeeze up to its middle.
      const d = Math.hypot(q.x - p.x, q.z - p.z) - Math.max(0, e.halfLength - 2);
      if (d < bestDist && Math.abs(q.y - p.y) < 2) {
        best = e;
        bestDist = d;
      }
    }
    return best;
  }

  // His own car (or the borrowed one) to get into wins; otherwise a traffic car to kick the driver out of.
  function nearestTarget() {
    if (driving || !walker || kick) return null;
    const entry = nearestCar();
    if (entry) return { entry };
    const car = nearestTraffic(traffic.cars, walker.body.position, KICK_REACH);
    return car && walker.body.position.y < 2 ? { traffic: car } : null; // not from up in the garage
  }

  function act(target) {
    if (target?.entry) getIn(target.entry);
    else if (target?.traffic) kickOut(target.traffic);
  }

  // The parked (or traffic) picture of a car swapped for a real driven one, in the same place.
  function driveFrom(bricks, mesh) {
    // The physics body sits at the car's centre of mass, so turn that offset with the car.
    const p = mesh.position;
    const h = mesh.rotation.y;
    const com = computeStats(bricks).centerOfMass;
    const position = { x: p.x + com.x * Math.cos(h) + com.z * Math.sin(h), y: p.y + com.y + 0.1, z: p.z - com.x * Math.sin(h) + com.z * Math.cos(h) };
    return createDrivenCar({ world, scene, bricks, pose: { position, heading: h }, vehicle: { tightTurns: true, flipLift: 0.5, airControl: true } });
  }

  // Step 1: the car stops dead and he swings his kick (finishKick does the rest).
  function kickOut(car) {
    traffic.freeze(car);
    controls.releaseAll();
    stick.reset();
    kick = { car, t: 0, heading: Math.atan2(car.mesh.position.x - walker.body.position.x, car.mesh.position.z - walker.body.position.z) };
    sfx.whoosh();
  }

  // Step 2: out pops the driver, in he gets.
  function finishKick() {
    const { car } = kick;
    kick = null;
    if (borrowed) giveBack();
    const from = { x: car.mesh.position.x, z: car.mesh.position.z };
    const heading = car.mesh.rotation.y;
    traffic.take(car);
    const driven = driveFrom(car.bricks, car.mesh);
    borrowed = {
      car: { id: `traffic-${car.index}`, name: 'Borrowed car', bricks: car.bricks, updatedAt: 0 },
      traffic: car,
      spotIndex: null,
      paint: carPaint(car.bricks),
      driven,
      tricks: createTricks(driven.fx),
      halfWidth: car.halfWidth,
      halfLength: car.halfLength,
      height: 0,
    };
    const dir = launchDirection(from, heading, walker.body.position);
    const mesh = mergeFigure(createFigureMesh(car.driver));
    mesh.scale.setScalar(1.25);
    scene.add(mesh);
    tumbles.push({ mesh, tumble: createTumble({ ...from, dir }), gait: createGait(), last: null });
    getIn(borrowed);
    sfx.whoa();
  }

  // The borrowed car goes back on the road (its driver back in it), wherever it was taken from.
  function giveBack() {
    borrowed.driven.remove();
    disposeMerged(borrowed.driven.mesh);
    traffic.giveBack(borrowed.traffic);
    borrowed = null;
  }

  function updateTumbles(dt) {
    for (let i = tumbles.length - 1; i >= 0; i--) {
      const t = tumbles[i];
      const s = t.tumble.step(dt);
      if (s.phase === 'gone') {
        scene.remove(t.mesh);
        disposeMerged(t.mesh);
        tumbles.splice(i, 1);
        continue;
      }
      if (s.landed) {
        sfx.pop();
        toast('😲 Hey! That\'s my car!');
      }
      const distance = t.last && dt > 0 ? Math.hypot(s.x - t.last.x, s.z - t.last.z) / 1.25 : 0;
      t.last = { x: s.x, z: s.z };
      const pose = stepGait(t.gait, { distance: s.phase === 'run' ? distance : 0, dt, grounded: s.phase !== 'fly' });
      if (s.phase === 'dazed') Object.assign(pose, { legL: 1.4, legR: 1.4, bob: -0.45, lean: 0.1, headTilt: Math.sin(clock * 9) * 0.25 }); // sat on the road, head wobbling
      applyPose(t.mesh, pose);
      t.mesh.position.set(s.x, s.y, s.z);
      t.mesh.rotation.set(s.spin, s.heading, 0, 'YXZ');
    }
  }

  function getIn(entry) {
    if (!entry.traffic && entry.kind !== 'truck' && entry.height > MAX_CAR_HEIGHT) {
      toast('This car is too tall to drive in the garage! Race it from 🚗 My cars.', 3200);
      return;
    }
    if (entry.car.prize) showroom.markDriven(entry.car.prize); // the ribbon comes off (it's on the parked mesh)
    if (!entry.driven) {
      world.removeBody(entry.body);
      scene.remove(entry.mesh);
      disposeMerged(entry.mesh); // the parked picture is done with: a driven car takes its place
      entry.driven = driveFrom(entry.car.bricks, entry.mesh);
      entry.tricks = createTricks(entry.driven.fx);
    }
    entry.tricks.getIn();
    engine.setSoft(entry.car.bricks.some(b => b.type === 'grille'));
    hideUmbrella();
    if (entry.tricks.has.stars && !showroom.get().starsSeen) {
      starShot = 2.5; // the first time: look down at the starlight roof
      showroom.seeStars();
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
    entry.tricks.getOut();
    if (entry.tricks.has.umbrella) showUmbrella();
    figureMesh.visible = true;
    driving = null;
    hud.clearCar();
    engine.silence();
    setModeClass();
    camYaw = pose.heading;
    if (entry.kind === 'truck') {
      parkInYard('truck', entry.car.id, truckBayAt(pose.x, pose.z), speed);
      return;
    }
    const spot = spotAt(pose.x, pose.y, pose.z);
    if (spot === null) return;
    if (entry.traffic) {
      toast("That's not your car to park! 😄");
      return;
    }
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

  // A truck or trailer left in one of the Truck Yard's bays parks there (and keeps it next visit).
  function parkInYard(kind, id, bay, speed = 0) {
    if (bay === null || !savedAll.some(c => c.id === id)) return;
    if (speed >= 1) toast('Stop in the bay to park!');
    else if (store.parkInBay(kind, id, bay)) {
      toast(`Parked in ${kind} bay ${bay + 1}! 🅿️`);
      sfx.success();
    } else toast(`That bay belongs to another ${kind}.`);
  }

  // --- hooking trailers on and off ---
  // What the 🔗 button would do now: hook on the trailer whose towbar is at his truck's hook, or let his trailer go.
  function hitchAction() {
    if (!driving || driving.kind !== 'truck' || paused) return null;
    const car = driving.driven.car;
    if (driving.trailer) return Math.abs(car.forwardSpeed()) < 1 ? { unhook: true } : null;
    const hook = hookWorld(car);
    const heading = car.pose().heading;
    const t = trailers.find(x => !x.trailer.hookedTo && canHook({ hook, ring: x.trailer.ringWorld(), truckHeading: heading, trailerHeading: x.trailer.origin().heading, speed: car.forwardSpeed() }));
    return t ? { hook: t } : null;
  }

  function doHitch(action) {
    if (action?.hook) {
      action.hook.trailer.hook(driving);
      sfx.snap();
      toast('🔗 Clunk! Hooked on.');
    } else if (action?.unhook) {
      const t = trailers.find(x => x.trailer === driving.trailer);
      driving.trailer.unhook();
      sfx.pop();
      const o = t.trailer.origin();
      parkInYard('trailer', t.car.id, trailerBayAt(o.x, o.z));
    }
  }

  // The Rolls-Royce's door umbrella: out for a few seconds every time he steps out.
  let umbrella = null;
  let umbrellaTime = 0;
  function showUmbrella() {
    if (!umbrella) {
      umbrella = createUmbrellaMesh();
      figureMesh.add(umbrella);
    }
    umbrella.visible = true;
    umbrellaTime = UMBRELLA_TIME;
  }
  function hideUmbrella() {
    umbrellaTime = 0;
    if (umbrella) umbrella.visible = false;
  }

  // A pause asked for during the showroom's reveal (⏸, or the iPad going to sleep) waits for the show to end.
  let pauseAfterReveal = false;
  function pause() {
    if (showroomView.revealing) {
      pauseAfterReveal = true;
      return;
    }
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
    if (showroomView.revealing) { // the buttons rest while the reveal plays
      if (action === 'pause') pause();
      return;
    }
    if (action === 'enter') act(nearestTarget());
    if (action === 'exit' && driving) getOut();
    if (action === 'hitch') doHitch(hitchAction());
    if (action === 'flip' && driving) {
      driving.driven.car.flip();
      driving.trailer?.straighten();
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
      if (showroomView.revealing) return;
      const sticker = ev.target.closest('[data-sticker]')?.dataset.sticker;
      if (sticker === undefined) return;
      net.sticker(Number(sticker));
      stickerTray.classList.add('hidden');
    });
    on(friendChips, 'pointerdown', ev => {
      if (showroomView.revealing) return;
      const id = ev.target.closest('[data-zap]')?.dataset.zap;
      if (id) zapTo(id);
    });
  }
  on(window, 'keydown', ev => {
    if (ev.code !== 'KeyE' || ev.repeat || paused || showroomView.revealing) return;
    const hitch = hitchAction();
    if (hitch?.hook) doHitch(hitch);
    else if (driving) getOut();
    else act(nearestTarget());
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

  // A camera shot that takes over from following him for a moment: the showroom's reveal, or the first
  // look down at the starlight roof.
  let starShot = 0;
  function cameraShot() {
    const reveal = showroomView.cameraShot();
    if (reveal) return reveal;
    if (starShot > 0 && driving) {
      const p = driving.driven.car.body.position;
      const h = driving.driven.car.pose().heading;
      const [up, back] = insideGarage(p) ? [2.3, 2.4] : [5, 1.6]; // under the floor above, in the garage
      return { pos: { x: p.x - Math.sin(h) * back, y: p.y + up, z: p.z - Math.cos(h) * back }, look: { x: p.x, y: p.y + 0.8, z: p.z } };
    }
    return null;
  }

  function updateCamera(dt, snap = false) {
    const shot = cameraShot();
    if (shot) {
      const k = snap ? 1 : 1 - Math.exp(-dt * 4);
      camPos.lerp(tmp.set(shot.pos.x, shot.pos.y, shot.pos.z), k);
      camLook.lerp(tmp.set(shot.look.x, shot.look.y, shot.look.z), k);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      return;
    }
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
    const towing = driving?.trailer ? driving.trailer.spec.length : 0;
    const dist = driving ? (indoor ? 6 : 8.5) + Math.max(0, driving.halfLength - 2) + towing * 0.6 : (indoor ? 3.8 : 5.5); // further back for the limo, and a trailer
    const height = driving ? (indoor ? 2.2 : 3.6) + (towing ? 1.5 : 0) : (indoor ? 1.7 : 2.8);
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
  let mapTimer = 1; // seconds since the mini-map was painted (paint it on the first frame)
  function mapState(dt = 1) {
    const p = driving ? driving.driven.car.body.position : walker.shown;
    const cars = entries.filter(e => e !== driving).map(e => {
      const q = entryPos(e);
      const heading = e.driven ? e.driven.car.pose().heading : e.pose.heading;
      return { x: q.x, z: q.z, heading, floor: garageFloorAt(q.x, q.y, q.z), spot: spotAt(q.x, q.y, q.z), hex: e.paint };
    }).concat(trailers.map(t => {
      const o = t.trailer.origin();
      return { x: o.x, z: o.z, heading: o.heading, floor: null, spot: null, hex: t.paint };
    }));
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
        showroomView.drawMap(g, toMap, scale);
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
    const pose = stepGait(gait, { distance, dt, grounded: walker.grounded });
    applyPose(figureMesh, kick ? KICK_POSE : pose);
    figureMesh.position.set(p.x, p.y - 0.4, p.z);
    figureMesh.rotation.y = kick ? kick.heading : walker.heading; // a kick faces the car
  }

  // Driving through the race gate takes this car to the race track.
  function reachedRaceGate() {
    if (!driving || leaving) return false;
    const p = driving.driven.car.body.position;
    const atGate = Math.hypot(p.x - RACE_GATE.x, p.z - RACE_GATE.z) <= RACE_GATE.radius;
    // A truck pulling a trailer doesn't go racing (once per drive-through, it says why).
    if (driving.trailer) {
      if (!atGate) gateAsked = false;
      else if (!gateAsked) {
        gateAsked = true;
        toast('Unhook your trailer to race! 🔗', 3000);
      }
      return false;
    }
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

  // If the iPad struggles, draw fewer real studs and pixels, then use softer shadows.
  const watchFrames = createFrameWatch([
    () => { city.ground.radius *= 0.6; },
    () => lowerResolution(app.renderer),
    () => { city.ground.radius *= 0.6; },
    () => softerShadows(sun),
    () => lowerResolution(app.renderer),
  ]);

  setModeClass();
  syncFigure();
  updateCamera(0, true);

  return {
    scene,
    camera,
    landscapeOnly: true,
    roomPlace: net ? 'city' : null,
    // Nothing moves behind a popup (unless friends are about, or a reveal is playing): no need to redraw.
    isPaused: () => paused && !net && !showroomView.revealing,
    // for poking at from the browser console
    debug: {
      teleport(x, z, y = 0.6, heading = null) {
        if (driving) {
          driving.driven.car.resetTo({ x, y: y + 0.4, z }, heading ?? driving.driven.car.pose().heading);
          driving.trailer?.straighten();
        } else walker.teleport({ x, y, z }, heading ?? walker.heading);
        updateCamera(0, true);
      },
      getIn() {
        const entry = nearestCar();
        if (entry) getIn(entry);
        return !!entry;
      },
      // Kick the driver out of the nearest traffic car, however far (for testing).
      kickOut() {
        if (driving || kick) return false;
        const car = nearestTraffic(traffic.cars, walker.body.position, Infinity);
        if (car) kickOut(car);
        return !!car;
      },
      get trafficCars() {
        return traffic.cars.map(c => ({ index: c.index, x: c.mesh.position.x, z: c.mesh.position.z, heading: c.mesh.rotation.y, taken: c.taken }));
      },
      get borrowed() {
        return borrowed ? { index: borrowed.traffic.index, driving: driving === borrowed } : null;
      },
      get tumbles() {
        return tumbles.map(t => ({ ...t.tumble.state }));
      },
      // For grown-ups testing on the iPad: no waiting for tomorrow, and the next Let's go! skips the questions.
      showroomReady() {
        showroom.debugReady();
        showroomView.skipNextQuiz();
        return showroom.status();
      },
      // Hook on whatever trailer is at his truck's hook, as the button would (for testing).
      hookNearest() {
        const action = hitchAction();
        if (action?.hook) doHitch(action);
        return !!action?.hook;
      },
      get trailers() {
        return trailers.map(t => ({ id: t.car.id, ...t.trailer.origin(), ring: t.trailer.ringWorld(), hooked: !!t.trailer.hookedTo }));
      },
      get hook() {
        return driving?.kind === 'truck' ? hookWorld(driving.driven.car) : null;
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
      if (showroomView.revealing) {
        // The reveal plays on while the rest of the city holds still.
        showroomView.update(dt, { player: myPos(), speed: 0, busy: true });
        confetti.update(dt);
        sky.update(dt, camera);
        updateCamera(dt);
        return;
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
          driving.trailer?.straighten();
          resetStunts();
          sfx.flip();
        }
      } else if (kick) {
        walker.move({ x: 0, y: 0 }, camYaw, dt); // stands still while his kick swings
        if ((kick.t += dt) >= KICK_TIME) finishKick();
      } else {
        walker.move(walkInput(), camYaw, dt);
      }
      if (borrowed && borrowed !== driving) {
        const me = driving ? driving.driven.car.body.position : walker.body.position;
        const far = p => Math.hypot(p.x - me.x, p.z - me.z) > GIVE_BACK_DISTANCE;
        if (far(borrowed.driven.car.body.position) && far(borrowed.traffic.mesh.position)) giveBack(); // out of sight: nobody sees it swap
      }
      for (const e of drivenEntries()) if (e.driven && e !== driving) e.driven.car.applyInput({ hold: true });
      const padInput = driving ? toDriveInput(controls) : {};
      for (const t of trailers) t.trailer.update({ driving: !!driving && t.trailer.hookedTo === driving, input: padInput });
      doorBarrier.collisionResponse = !!driving?.trailer;
      if (driving?.trailer) warnAtGarageDoor();
      const player = driving ? driving.driven.car.body.position : walker.body.position;
      const looseCars = [...drivenEntries().filter(e => e.driven && e !== driving).map(e => e.driven.car.body.position), ...trailers.map(t => t.trailer.mesh.position)];
      traffic.update(dt, clock, player, [player, ...looseCars]);
      world.step(1 / 60, dt, 2);
      coins.update(dt, clock);
      const here = driving ? driving.driven.car.body.position : walker.body.position;
      for (const got of rushOn ? [] : coins.field.collect(here, driving ? PICKUP.car : PICKUP.foot)) {
        if (got.value > 1) sfx.bigCoin();
        else sfx.coin();
        award(got.value);
      }
      const stunt = driving ? trackStunts(dt) : null;
      missions.update(dt, { player: here, driving: !!driving, carMesh: driving?.driven.mesh ?? null, figureMesh, stunt, clock });
      showroomView.update(dt, {
        player: here,
        speed: driving ? Math.abs(driving.driven.car.forwardSpeed()) : 0,
        busy: missions.runner.state === 'running' || !!games?.running,
      });
      confetti.update(dt);
      updateTumbles(dt);
      if (popTimer > 0 && (popTimer -= dt) <= 0) stuntPop.classList.add('hidden');
      for (const t of trailers) t.trailer.sync();
      for (const e of drivenEntries()) {
        if (!e.driven) continue;
        e.driven.sync();
        animateFx(e.driven.fx, dt, { speed: Math.abs(e.driven.car.forwardSpeed()), clock, seed: e.spotIndex, boosting: e === driving && hud.boosting, sirenOn: e === driving && hud.sirenOn });
        e.tricks.update(dt);
      }
      if (umbrellaTime > 0 && (umbrellaTime -= dt) <= 0) hideUmbrella();
      if (starShot > 0) starShot -= dt;
      if (!driving) syncFigure(dt);
      hud.update(dt);
      speedo.update(driving ? driving.driven.car.forwardSpeed() : 0, dt);
      pad.refresh();
      city.update(clock, here);
      sky.update(dt, camera);
      watchFrames(dt);
      const hitch = hitchAction();
      hitchBtn.classList.toggle('hidden', !hitch);
      const hitchLabel = hitch?.unhook ? '🔓 Unhook' : '🔗 Hook on';
      if (hitch && hitchBtn.textContent !== hitchLabel) hitchBtn.textContent = hitchLabel;
      const target = nearestTarget();
      enterBtn.classList.toggle('hidden', !target);
      const label = target?.traffic ? '🦶 Kick out!' : '🚗 Get in';
      if (target && enterBtn.textContent !== label) enterBtn.textContent = label;
      if (reachedRaceGate()) return;
      updateCamera(dt);
      if ((mapTimer += dt) >= 1 / 30) { // the mini-map is costly to paint: 30 times a second looks just as smooth
        minimap.draw(mapState(mapTimer));
        mapTimer = 0;
      }
      if (driving) engine.setSpeed(Math.abs(driving.driven.car.forwardSpeed()));
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      abort.abort();
      disposeMerged(scene); // parked and driven cars' baked shapes
      controls.releaseAll();
      engine.stop();
      hud.dispose();
      coins.dispose();
      missions.dispose();
      showroomView.dispose();
      for (const off of netOffs) off();
      games?.dispose();
      friends?.dispose();
      popper.dispose();
      stickerTray.classList.add('hidden');
      confetti.dispose();
      stuntPop.classList.add('hidden');
      for (const t of trailers) t.trailer.remove();
      traffic.dispose();
      city.dispose();
      sky.dispose();
      sun.dispose();
    },
  };
}
