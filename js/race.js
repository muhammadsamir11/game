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

const LAPS = 3;
const COUNTDOWN_SECONDS = 3;
const CHECKPOINT_RADIUS = 12;
const AI_PACE = 0.86; // "friendly" difficulty: AI cars aim for 86% of their top speed
const AUTOPILOT_PACE = 0.6; // the player's car cruises by itself after the finish line
const MEDALS = ['🥇', '🥈', '🥉', '🏅'];
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

export function createRace(app, playerCar, { fromCity = false } = {}) {
  const playerName = app.figures?.getMain()?.name ?? 'Me';
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
  const entries = [
    ...OPPONENTS.map((o, i) => ({ name: o.name, bricks: modelToBricks(MODELS[o.model], o.recolor), dot: COLORS[o.color].hex, human: false, driver: AI_DRIVERS[i] })),
    { name: playerCar.name, bricks: playerCar.bricks, dot: 0xffffff, human: true, driver: null },
  ];
  const racers = entries.map((entry, slot) => {
    const driven = createDrivenCar({ world, scene, bricks: entry.bricks, pose: track.startGrid(slot), driver: entry.driver });
    return { ...entry, id: slot, car: driven.car, mesh: driven.mesh, wheels: driven.wheels, fx: driven.fx, sync: driven.sync, state: newRaceState(), aiIdx: track.racingLine.length - 2, offTime: 0, stuck: { slowFor: 0, reverseFor: 0 } };
  });
  const player = racers[racers.length - 1];

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
  const hud = createGadgetHud({ ui, scene, signal: abort.signal, canUse: () => !paused && phase === 'racing' });
  hud.setCar(playerCar.bricks, player.fx);
  const setSiren = onNow => hud.setSiren(onNow);

  function animateParts(dt) {
    for (const r of racers) {
      animateFx(r.fx, dt, { speed: Math.abs(r.car.forwardSpeed()), clock, seed: r.id, boosting: r.human && hud.boosting, sirenOn: r.human && hud.sirenOn });
    }
  }

  let phase = 'countdown'; // countdown → racing → finished
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
    if (phase === 'countdown') return { hold: true };
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
    if (phase === 'countdown') return;
    const before = r.state;
    r.state = advanceCheckpoint(before, r.car.body.position, track.checkpoints, CHECKPOINT_RADIUS, LAPS, raceTime);
    if (!r.human || r.state === before) return;
    if (r.state.finishTime !== null) {
      phase = 'finished';
      finishedAt = clock;
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
    if (phase === 'countdown') {
      const left = Math.ceil(COUNTDOWN_SECONDS - clock);
      if (left > 0 && left !== shownCount) {
        shownCount = left;
        showBig(String(left));
        sfx.beep();
      }
      if (clock >= COUNTDOWN_SECONDS) {
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

  function ranking() {
    return rankRacers(racers.map(r => ({ id: r.id, state: r.state, pos: r.car.body.position })), track.checkpoints);
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
    minimap.draw(racers);
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
    // The top three stand on a podium (2nd, 1st, 3rd); anyone else is listed underneath.
    const spot = i => {
      const r = racers[ranked[i].id];
      const key = r.human && playerCar.id ? `${playerCar.id}:${playerCar.updatedAt}` : `race:${r.id}:${r.name}`;
      return el('div', { class: `spot p${i + 1}${r.human ? ' me' : ''}` }, [
        el('img', { src: carThumbnail(r.bricks, key), alt: '' }),
        el('div', { class: 'who', text: `${MEDALS[i]} ${r.name}` }),
        el('div', { class: 'step', text: String(i + 1) }),
      ]);
    };
    openModal({
      title: place === 1 ? `You won, ${playerName}!` : `You came ${ordinal(place)}, ${playerName}!`,
      icon: place === 1 ? '🏆' : place <= 3 ? MEDALS[place - 1] : '🏁',
      body: [
        el('p', { text: place === 1 ? 'Amazing driving!' : 'Great race! Want to try again?' }),
        el('div', { class: 'podium' }, [1, 0, 2].filter(i => i < ranked.length).map(spot)),
        ranked.length > 3 ? el('ol', { class: 'results', start: '4' }, ranked.slice(3).map((x, i) => el('li', {
          class: racers[x.id].human ? 'me' : '',
          text: `${MEDALS[i + 3] ?? ''} ${racers[x.id].name}`,
        }))) : null,
      ],
      buttons: [
        fromCity
          ? { label: '🏙 Back to city', onClick: () => app.openCity({ nearCarId: playerCar.id }) }
          : { label: '🚗 Garage', onClick: () => app.openGarage() },
        { label: '🔁 Race again', kind: 'go', onClick: () => app.startRace(playerCar, { fromCity }) },
      ],
    });
  }

  racers.forEach(syncMeshes);
  updateCamera(0, true);

  return {
    scene,
    camera,
    isRace: true,
    update(dt) {
      if (paused) return;
      if (portrait.matches) { // the "turn sideways" overlay covers the race: don't race behind it
        pause();
        return;
      }
      clock += dt;
      if (phase !== 'countdown') raceTime += dt;
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
    draw(racers) {
      ctx.clearRect(0, 0, size, size);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#55595f';
      ctx.lineWidth = 18;
      ctx.stroke(path);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke(path);
      for (const r of racers) {
        const p = r.car.body.position;
        const [x, y] = toMap(p.x, p.z);
        ctx.beginPath();
        ctx.arc(x, y, r.human ? 14 : 10, 0, Math.PI * 2);
        ctx.fillStyle = hexCss(r.dot);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = r.human ? '#e53935' : '#1d2a44';
        ctx.stroke();
      }
    },
  };
}
