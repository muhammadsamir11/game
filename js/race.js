import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createTrack } from './track.js';
import { createDrivenCar } from './drivenCar.js';
import { MODELS, modelToBricks } from './instructions.js';
import { COLORS } from './bricks.js';
import { newRaceState, advanceCheckpoint, progressValue, rankRacers, ordinal } from './raceLogic.js';
import { aiControl, rubberBand, unstick } from './ai.js';
import { createGadgetHud, animateFx } from './gadgetHud.js';
import { createControlState, toDriveInput } from './inputState.js';
import { attachDriveControls } from './input.js';
import { $, el, hexCss, showScreen, openModal, toast } from './ui.js';
import { sfx, createEngineSound } from './audio.js';
import { carThumbnail } from './thumbnails.js';
import { createSky } from './sky.js';
import { createFrameWatch, softerShadows } from './frameWatch.js';
import { createCarMesh, carLift } from './brickMesh.js';
import { createRail } from './rail.js';
import { createRemotePlayers } from './net/remotePlayers.js';
import { STATE_HZ, RACE, packState } from './net/protocol.js';
import { peopleFor, bricksOf, bricksKey } from './net/together.js';

const LAPS = 3;
const COUNTDOWN_SECONDS = 3;
const CHECKPOINT_RADIUS = 12;
const AI_PACE = 0.86; // "friendly" difficulty: AI cars aim for 86% of their top speed
const AUTOPILOT_PACE = 0.6; // the player's car cruises by itself after the finish line
const MEDALS = ['🥇', '🥈', '🥉', '🏅'];
// Play-together races: computer cars ride the track at these steady speeds (m/s), front row fastest.
const RAIL_SPEEDS = [10.4, 9.8, 9.2];
// Written out (not random) so new hats in the catalogue never change them.
const AI_DRIVERS = [
  { name: 'Turbo Tia', head: 'racing', headColor: 'green', face: 'grin', skin: 'tan', shirt: 'orange', print: 'badge', pants: 'black' },
  { name: 'Mighty Max', head: 'cowboy', headColor: 'orange', face: 'grin', skin: 'dark', shirt: 'yellow', print: 'stripe', pants: 'blue' },
  { name: 'Bix', head: 'spiky', headColor: 'blonde', face: 'determined', skin: 'light', shirt: 'white', print: 'star', pants: 'green' },
];
const OPPONENTS = [
  { name: 'Turbo Tia', model: 'raceCar', recolor: { red: 'orange' }, color: 'orange' },
  { name: 'Mighty Max', model: 'monsterTruck', recolor: { blue: 'purple' }, color: 'purple' },
  { name: 'Bix the Buggy', model: 'buggy', recolor: { green: 'blue' }, color: 'blue' },
];

// room: true for a play-together race (the room says who starts where; friends race on their own tablets).
export function createRace(app, playerCar, { fromCity = false, room = false } = {}) {
  const playerName = app.figures?.getMain()?.name ?? 'Me';
  const net = room && app.room?.inRoom && app.room.state.race ? app.room : null;
  const raceInfo = net?.state.race ?? null;
  const mySlot = net ? raceInfo.slots[net.state.you] ?? RACE.slots - 1 : null;
  showScreen('race');
  const ui = $('#race');
  const abort = new AbortController();
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });

  // --- scene ---
  const scene = new THREE.Scene();
  const sky = createSky(scene, app.renderer, { center: { x: 40, z: -10 } });
  scene.add(new THREE.HemisphereLight(0xe3f1ff, 0x5f8f4a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 150 });
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);

  // --- physics ---
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.25;
  const track = createTrack(scene, world);
  // If the iPad struggles, draw fewer real studs, then use softer shadows.
  const watchFrames = createFrameWatch([
    () => { track.studs.radius *= 0.6; },
    () => { track.studs.radius *= 0.6; },
    () => softerShadows(sun),
  ]);
  const cpCount = track.checkpoints.length;

  // --- racers: three AI cars on the front row, the player at the back so there's someone to overtake ---
  // With friends, only this tablet's own car has physics here; computer cars ride a rail (below).
  const playerEntry = { name: playerCar.name, bricks: playerCar.bricks, dot: 0xffffff, human: true, driver: null, slot: mySlot };
  const entries = net ? [playerEntry] : [
    ...OPPONENTS.map((o, i) => ({ name: o.name, bricks: modelToBricks(MODELS[o.model], o.recolor), dot: COLORS[o.color].hex, human: false, driver: AI_DRIVERS[i] })),
    playerEntry,
  ];
  const racers = entries.map((entry, i) => {
    const slot = entry.slot ?? i;
    const driven = createDrivenCar({ world, scene, bricks: entry.bricks, pose: track.startGrid(slot), driver: entry.driver });
    return { ...entry, id: slot, car: driven.car, mesh: driven.mesh, wheels: driven.wheels, fx: driven.fx, sync: driven.sync, state: newRaceState(), aiIdx: track.racingLine.length - 2, offTime: 0, stuck: { slowFor: 0, reverseFor: 0 } };
  });
  const player = racers[racers.length - 1];

  // --- play together: computer cars on rails, and friends' cars ---
  const rail = net ? createRail(track.samples) : null;
  const railCars = net ? OPPONENTS.slice(0, raceInfo.ai).map((o, i) => {
    const bricks = modelToBricks(MODELS[o.model], o.recolor);
    const mesh = createCarMesh(bricks, { driver: AI_DRIVERS[i] });
    scene.add(mesh);
    const grid = track.startGrid(i).position;
    const car = { id: `ai${i}`, name: o.name, bricks, dot: COLORS[o.color].hex, mesh, lift: carLift(bricks), lane: i % 2 ? 3.2 : -3.2, start: rail.distanceAt(grid.x, grid.z), speed: RAIL_SPEEDS[i], state: newRaceState(), pos: { x: grid.x, y: grid.y, z: grid.z } };
    return car;
  }) : [];
  // The same clock on every tablet (seconds since GO), so every tablet sees them in the same places.
  function placeRailCar(car) {
    const p = rail.at(car.start + car.speed * raceTime, car.lane);
    car.mesh.position.set(p.x, p.y + car.lift, p.z);
    car.mesh.rotation.set(p.pitch, p.heading, 0, 'YXZ');
    car.pos = { x: p.x, y: p.y + 1, z: p.z };
  }
  const friends = net ? createRemotePlayers({ scene, world: null, room: net, collide: false }) : null;
  const finishes = Object.fromEntries(Object.entries(raceInfo?.finishes ?? {}).map(([id, ms]) => [id, ms / 1000]));
  const netOffs = [];
  let sendTimer = 0;
  let closePodium = null;
  function shareState(dt) {
    sendTimer += dt;
    if (sendTimer < 1 / STATE_HZ) return;
    sendTimer = 0;
    const b = player.car.body;
    net.send('state', { s: packState({ p: b.position, q: b.quaternion, v: b.velocity, h: player.car.pose().heading, siren: hud.sirenOn, boost: hud.boosting, lap: player.state.lapsDone, cp: player.state.nextCp }) });
  }
  const controls = createControlState();
  const pad = attachDriveControls(ui, controls, abort.signal);
  const engine = createEngineSound();
  const minimap = createMinimap($('#minimap', ui), track.samples);
  const positionEl = $('#hud-position', ui);
  const lapEl = $('#hud-lap', ui);
  const posBadge = $('#hud-pos', ui);
  const lapDots = $('#lap-dots', ui);
  const countdownEl = $('#countdown', ui);

  // --- gadgets (player only) ---
  const hud = createGadgetHud({ ui, scene, signal: abort.signal, canUse: () => !paused && phase === 'racing', onUse: kind => net?.send('fx', { kind }) });
  hud.setCar(playerCar.bricks, player.fx);
  const setSiren = onNow => hud.setSiren(onNow);

  function animateParts(dt) {
    for (const r of racers) {
      animateFx(r.fx, dt, { speed: Math.abs(r.car.forwardSpeed()), clock, seed: r.id, boosting: r.human && hud.boosting, sirenOn: r.human && hud.sirenOn });
    }
  }

  let phase = net ? 'waiting' : 'countdown'; // (waiting for friends →) countdown → racing → finished
  let countdownEnd = COUNTDOWN_SECONDS;
  let clock = 0;
  let raceTime = 0;
  let paused = false;
  let shownCount = 0;
  let hideCountdownAt = 0;
  let finishedAt = 0;
  let podiumShown = false;
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  // pointerdown, not click: iPad Safari may not send click for a tap made while another finger holds GO.
  on(ui, 'pointerdown', e => {
    const action = e.target.closest('[data-race]')?.dataset.race;
    if (action === 'pause') pause();
    if (action === 'flip') {
      player.car.flip();
      sfx.flip();
    }
  });
  on(document, 'visibilitychange', () => {
    if (document.hidden) pause();
  });

  function pause() {
    if (paused || podiumShown) return;
    if (net) {
      // Friends are still racing: never stop the race, just offer a way out.
      openModal({
        title: 'Leave the race?',
        icon: '🏁',
        buttons: [
          { label: '🚪 Leave race', onClick: () => app.openTogether() },
          { label: '▶ Keep racing', kind: 'go' },
        ],
      });
      return;
    }
    paused = true;
    controls.releaseAll();
    setSiren(false);
    engine.silence();
    openModal({
      title: 'Paused',
      icon: '⏸',
      buttons: [
        { label: '🏠 Quit', onClick: () => app.goHome() },
        { label: '🔁 Restart', onClick: () => app.startRace(playerCar, { fromCity }) },
        { label: '▶ Keep racing', kind: 'go', onClick: () => { paused = false; } },
      ],
    });
  }

  function driverInput(r, dt) {
    if (phase === 'countdown' || phase === 'waiting') return { hold: true };
    if (r.human && r.state.finishTime === null) return { ...toDriveInput(controls), boost: hud.boosting };
    const gap = progressValue(r.state, cpCount) - progressValue(player.state, cpCount);
    const pace = r.human ? AUTOPILOT_PACE : AI_PACE * rubberBand(gap);
    const out = aiControl({ ...r.car.pose(), topSpeed: r.car.stats.topSpeed }, track.racingLine, r.aiIdx, pace);
    r.aiIdx = out.idx;
    r.stuck = unstick(r.stuck, r.car.forwardSpeed(), dt);
    // Nose against a wall: back up, steering the other way so the nose swings toward the road.
    if (r.stuck.reverseFor > 0) return { steer: -out.input.steer, throttle: 0, brake: 1 };
    return out.input;
  }

  function syncMeshes(r) {
    r.sync();
  }


  function trackProgress(r) {
    if (phase === 'countdown' || phase === 'waiting') return;
    const before = r.state;
    r.state = advanceCheckpoint(before, r.car.body.position, track.checkpoints, CHECKPOINT_RADIUS, LAPS, raceTime);
    if (!r.human || r.state === before) return;
    if (r.state.finishTime !== null) {
      phase = 'finished';
      finishedAt = clock;
      net?.send('race.finish');
      setSiren(false); // gadgets stop at the finish line, so the siren can't be left wailing over the podium
      sfx.fanfare();
      toast('Finish! 🏁');
    } else if (r.state.lapsDone > before.lapsDone) {
      sfx.success();
      toast(r.state.lapsDone === LAPS - 1 ? 'Last lap! 🏁' : `Lap ${r.state.lapsDone + 1}!`);
    }
  }

  // Off the road, under the bridge or off the world for 1.5 s → back to the last checkpoint passed.
  function keepOnTrack(r, dt) {
    const p = r.car.body.position;
    const near = track.nearest(p.x, p.z);
    const off = near.distance > track.width / 2 + 4 || p.y < near.point.y - 2.5 || p.y < -5;
    r.offTime = off ? r.offTime + dt : 0;
    if (r.offTime < 1.5) return;
    const spot = track.respawnPoint((r.state.nextCp - 1 + cpCount) % cpCount);
    r.car.resetTo(spot.position, spot.heading);
    r.aiIdx = spot.racingIndex;
    r.offTime = 0;
    r.stuck = { slowFor: 0, reverseFor: 0 };
    if (r.human) {
      sfx.flip();
      toast('Back on the track!');
    }
  }

  function showBig(text) {
    countdownEl.textContent = text;
    countdownEl.classList.remove('hidden', 'pop');
    void countdownEl.offsetWidth; // restart the pop for every number
    countdownEl.classList.add('pop');
  }

  function updateCountdown() {
    if (phase === 'waiting') return;
    if (phase === 'countdown') {
      const left = Math.ceil(countdownEnd - clock);
      if (left > 0 && left !== shownCount) {
        shownCount = left;
        showBig(String(left));
        sfx.beep();
      }
      if (clock >= countdownEnd) {
        phase = 'racing';
        showBig('GO!');
        sfx.go();
        hideCountdownAt = clock + 0.9;
      }
    } else if (hideCountdownAt && clock > hideCountdownAt) {
      countdownEl.classList.add('hidden');
      hideCountdownAt = 0;
    }
  }

  // Everyone in the race: physics cars here, plus (with friends) rail cars and friends' cars.
  function standings() {
    const list = racers.map(r => ({ id: r.id, state: r.state, pos: r.car.body.position }));
    if (!net) return list;
    const me = list[0];
    if (finishes[net.state.you] !== undefined) me.state = { ...me.state, finishTime: finishes[net.state.you] };
    // Every friend on the grid counts, even before their first position arrives (they're on their grid spot).
    const seen = new Map(friends.positions().map(f => [f.id, f]));
    for (const [id, slot] of Object.entries(raceInfo.slots)) {
      if (id === net.state.you || !net.state.players.has(id)) continue; // me, or a friend who left
      const f = seen.get(id);
      list.push({ id, state: { lapsDone: f?.lap ?? 0, nextCp: f?.cp ?? 1, finishTime: finishes[id] ?? null }, pos: f?.p ?? track.startGrid(slot).position });
    }
    for (const c of railCars) list.push({ id: c.id, state: c.state, pos: c.pos });
    return list;
  }
  function ranking() {
    return rankRacers(standings(), track.checkpoints);
  }
  // Name, car picture and colour for anyone in the standings.
  function who(id) {
    const r = racers.find(x => x.id === id);
    if (r) return { name: r.human && net ? playerName : r.name, me: r.human, bricks: r.bricks, key: r.human && playerCar.id ? `${playerCar.id}:${playerCar.updatedAt}` : `race:${r.id}:${r.name}`, people: {}, dot: r.dot };
    const c = railCars.find(x => x.id === id);
    if (c) return { name: c.name, me: false, bricks: c.bricks, key: `race:${c.id}:${c.name}`, people: {}, dot: c.dot };
    const p = net.state.players.get(id);
    const f = friends.get(id);
    return { name: p?.name ?? 'Friend', me: false, bricks: bricksOf(p), key: `room:${bricksKey([bricksOf(p), p?.figure, p?.car?.riders])}`, people: peopleFor(p), dot: f ? parseInt(f.color.slice(1), 16) : 0xffffff, friend: true };
  }

  function updateHud() {
    const place = ranking().findIndex(x => x.id === player.id) + 1;
    const position = ordinal(place);
    const lap = `Lap ${Math.min(player.state.lapsDone + 1, LAPS)}/${LAPS}`;
    if (positionEl.textContent !== position) {
      positionEl.textContent = position;
      posBadge.dataset.place = place;
    }
    if (lapEl.textContent !== lap) {
      lapEl.textContent = lap;
      lapDots.dataset.lap = Math.min(player.state.lapsDone + 1, LAPS);
    }
    minimap.draw(standings().map(x => ({ p: x.pos, me: who(x.id).me, dot: who(x.id).dot, friend: !!who(x.id).friend })));
  }

  function updateCamera(dt, snap = false) {
    const p = player.car.body.position;
    const h = player.car.pose().heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(tmpA.set(p.x - fx * 8.5, p.y + 3.6, p.z - fz * 8.5), k);
    camLook.lerp(tmpB.set(p.x + fx * 4, p.y + 1, p.z + fz * 4), k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sun.position.set(p.x + 30, p.y + 50, p.z + 20);
    sun.target.position.set(p.x, p.y, p.z);
  }

  function showPodium() {
    podiumShown = true;
    const ranked = ranking();
    const place = ranked.findIndex(x => x.id === player.id) + 1;
    // A friend still on the track gets a little car instead of a medal until they finish.
    const label = (x, i) => `${x.state.finishTime === null && who(x.id).friend ? '🏎' : MEDALS[i] ?? ''} ${who(x.id).name}`;
    // The top three stand on a podium (2nd, 1st, 3rd); anyone else is listed underneath.
    const spot = i => {
      const r = who(ranked[i].id);
      return el('div', { class: `spot p${i + 1}${r.me ? ' me' : ''}` }, [
        el('img', { src: carThumbnail(r.bricks, r.key, r.people), alt: '' }),
        el('div', { class: 'who', text: label(ranked[i], i) }),
        el('div', { class: 'step', text: String(i + 1) }),
      ]);
    };
    closePodium = openModal({
      title: place === 1 ? `You won, ${playerName}!` : `You came ${ordinal(place)}, ${playerName}!`,
      icon: place === 1 ? '🏆' : place <= 3 ? MEDALS[place - 1] : '🏁',
      body: [
        el('p', { text: place === 1 ? 'Amazing driving!' : 'Great race! Want to try again?' }),
        el('div', { class: 'podium' }, [1, 0, 2].filter(i => i < ranked.length).map(spot)),
        ranked.length > 3 ? el('ol', { class: 'results', start: '4' }, ranked.slice(3).map((x, i) => el('li', {
          class: who(x.id).me ? 'me' : '',
          text: label(x, i + 3),
        }))) : null,
      ],
      buttons: net ? [
        { label: '🏙 Back to city', onClick: () => net.send('go', { place: 'city' }) },
        { label: '🔁 Race again', kind: 'go', onClick: () => net.send('go', { place: 'race' }) },
      ] : [
        fromCity
          ? { label: '🏙 Back to city', onClick: () => app.openCity({ nearCarId: playerCar.id }) }
          : { label: '🚗 Garage', onClick: () => app.openGarage() },
        { label: '🔁 Race again', kind: 'go', onClick: () => app.startRace(playerCar, { fromCity }) },
      ],
    });
  }

  racers.forEach(syncMeshes);
  if (net) {
    railCars.forEach(placeRailCar);
    netOffs.push(
      net.on('race.countdown', msg => {
        if (phase !== 'waiting') return;
        phase = 'countdown';
        countdownEnd = clock + msg.goIn / 1000;
      }),
      net.on('race.finish', msg => {
        finishes[msg.id] = msg.time / 1000;
        if (podiumShown) {
          closePodium?.();
          showPodium();
        }
      }),
    );
    if (raceInfo.goIn !== null && raceInfo.goIn !== undefined) {
      phase = 'countdown';
      countdownEnd = Math.max(0, raceInfo.goIn / 1000);
    } else toast('Waiting for your friends… 🏁', 3000);
    net.send('race.ready');
  }
  updateCamera(0, true);

  return {
    scene,
    camera,
    isRace: true,
    roomPlace: net ? 'race' : null,
    debug: { ranking, showPodium, who }, // for poking at from the browser console
    update(dt) {
      if (net) {
        shareState(dt);
        friends.update(dt);
      }
      if (paused) return;
      if (portrait.matches && !net) { // the "turn sideways" overlay covers the race: don't race behind it
        pause();
        return;
      }
      clock += dt;
      if (phase === 'racing' || phase === 'finished') raceTime += dt;
      for (const c of railCars) {
        placeRailCar(c);
        if (phase === 'racing' || phase === 'finished') c.state = advanceCheckpoint(c.state, c.pos, track.checkpoints, CHECKPOINT_RADIUS, LAPS, raceTime);
      }
      updateCountdown();
      for (const r of racers) {
        const input = driverInput(r, dt);
        r.car.applyInput(input);
        if (r.car.update(dt, input) && r.human) sfx.flip();
      }
      world.step(1 / 60, dt, 3);
      track.update(clock, player.car.body.position);
      for (const r of racers) {
        syncMeshes(r);
        trackProgress(r);
        keepOnTrack(r, dt);
      }
      hud.update(dt);
      animateParts(dt);
      if (phase === 'finished' && !podiumShown && clock - finishedAt > 1.8) showPodium();
      updateHud();
      pad.refresh();
      updateCamera(dt);
      sky.update(dt, camera);
      watchFrames(dt);
      engine.setSpeed(Math.abs(player.car.forwardSpeed()));
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      abort.abort();
      for (const off of netOffs) off();
      friends?.dispose();
      controls.releaseAll();
      engine.stop();
      hud.dispose();
      track.dispose();
      sky.dispose();
      sun.dispose(); // frees the shadow map on the GPU
      countdownEl.classList.add('hidden');
    },
  };
}

// Top-down map, drawn at 2× for sharp lines. Mirrored so the driver's left (+x) is on the map's left and forward (+z) is up.
function createMinimap(canvas, points) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const pad = 28;
  const xs = points.map(p => p.x);
  const zs = points.map(p => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const offX = pad + (size - pad * 2 - (maxX - minX) * scale) / 2;
  const offY = pad + (size - pad * 2 - (maxZ - minZ) * scale) / 2;
  const toMap = (x, z) => [offX + (maxX - x) * scale, offY + (maxZ - z) * scale];
  const path = new Path2D();
  points.forEach((p, i) => {
    const [x, y] = toMap(p.x, p.z);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return {
    draw(dots) {
      ctx.clearRect(0, 0, size, size);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#55595f';
      ctx.lineWidth = 18;
      ctx.stroke(path);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke(path);
      // dots: { p, me, dot, friend }: you are big with a red ring, friends have a white ring.
      for (const d of dots) {
        const [x, y] = toMap(d.p.x, d.p.z);
        ctx.beginPath();
        ctx.arc(x, y, d.me || d.friend ? 14 : 10, 0, Math.PI * 2);
        ctx.fillStyle = hexCss(d.dot);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = d.me ? '#e53935' : d.friend ? '#ffffff' : '#1d2a44';
        ctx.stroke();
      }
    },
  };
}
