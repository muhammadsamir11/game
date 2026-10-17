// Murad Motors' turntable: the next mystery car under a silk sheet, the coin goal card when he walks up,
// and the reveal — drumroll, the sheet flies off, confetti, the car turning in a spotlight. The prize is
// saved (and parked in his garage) the moment the reveal starts; the rest is only for show.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SHOWROOM } from './cityMap.js';
import { shouldStartReveal } from './prizeShowroom.js';
import { prizeByKey, prizeBricks, carBounds } from './prizeCars.js';
import { createCarMesh, carLift } from './brickMesh.js';
import { $, toast } from './ui.js';
import { sfx, speak } from './audio.js';
import { REVEAL, revealEvents } from './revealTimeline.js';

const TURN_SPEED = 0.3; // radians a second
const SHOW_TURN = 8; // seconds each car gets on the turntable once every car is out
const DECK = 0.3; // the turntable's top, above the ground

export const goalLine = goal => `What's under the sheet? Collect ${goal} coins to find out!`;
export const SOON_LINE = 'More cars coming soon ✨';

// A gold ribbon tied round a new prize car, with a bow on the roof. size/center: the car's own bounds.
export function createRibbon(size, center) {
  const ribbon = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc107, roughness: 0.35, metalness: 0.3 });
  const top = center.y + size.y / 2;
  const band = (w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), gold);
    m.position.set(center.x, top + 0.03, center.z);
    ribbon.add(m);
  };
  band(0.3, size.z + 0.06);
  band(size.x + 0.06, 0.3);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 16), gold);
    loop.position.set(center.x + side * 0.2, top + 0.24, center.z);
    loop.rotation.set(0, Math.PI / 2, side * 0.5);
    ribbon.add(loop);
  }
  ribbon.userData.dispose = () => {
    gold.dispose();
    ribbon.traverse(n => n.geometry?.dispose());
  };
  return ribbon;
}

function labelTexture(text, { bg = null, fg = '#ffd54f', w = 256, h = 256, font = 190 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${font}px Fredoka, Arial Rounded MT Bold, sans-serif`;
  if (!bg) {
    g.lineWidth = font * 0.12; // a dark edge so it reads against the sky and the building
    g.strokeStyle = '#3e2723';
    g.lineJoin = 'round';
    g.strokeText(text, w / 2, h / 2 + font * 0.06, w * 0.92);
  }
  g.fillStyle = fg;
  g.fillText(text, w / 2, h / 2 + font * 0.06, w * 0.92);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A silk sheet draped over a car-sized box: the top sags toward the edges, like cloth over a roof.
function sheetGeometry({ length, width, height }) {
  const w = width + 0.3;
  const l = length + 0.3;
  const h = height + 0.15;
  const geometry = new THREE.BoxGeometry(w, h, l, 6, 3, 10);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y <= -h / 2 + 1e-6) continue;
    const edge = Math.max(Math.abs(pos.getX(i)) / (w / 2), Math.abs(pos.getZ(i)) / (l / 2));
    pos.setY(i, -h / 2 + (y + h / 2) * (1 - 0.35 * edge * edge * edge));
  }
  geometry.translate(0, h / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

// showroom: the saved store (prizeShowroom.js). coins(): his coin pile now. deliver(key): saves the prize
// car at once (city.js) and returns place(), which parks it (under the flash, so it can't pop into view
// during the show) and returns the deliveryNote to show and say. onPause/onResume: freeze the city around
// the reveal. celebrate(at): confetti.
export function createCityShowroom({ scene, world, ui, showroom, coins, onPause, onResume, celebrate, deliver }) {
  const { turntable: T, zoneRadius } = SHOWROOM;
  const owned = [];
  const own = thing => { owned.push(thing); return thing; };

  // --- 3D bits ---
  const deck = new THREE.Group();
  deck.position.set(T.x, DECK, T.z);
  scene.add(deck);
  const disc = new THREE.Mesh(own(new THREE.CylinderGeometry(T.radius, T.radius, 0.12, 48)), own(new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.3, metalness: 0.4 })));
  disc.position.y = -0.06;
  disc.receiveShadow = true;
  deck.add(disc);
  const show = new THREE.Group(); // whatever is on the turntable: a sheet, a car, or both during a reveal
  deck.add(show);
  const silk = own(new THREE.MeshStandardMaterial({ color: 0xb71c1c, roughness: 0.38, metalness: 0.08, transparent: true }));
  const mark = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: own(labelTexture('?', { fg: '#ffd54f' })), transparent: true })));
  mark.scale.set(2, 2, 1);
  scene.add(mark);
  const soonBoard = new THREE.Mesh(own(new THREE.PlaneGeometry(7.6, 0.95)),
    own(new THREE.MeshStandardMaterial({ map: own(labelTexture(SOON_LINE, { bg: '#263238', fg: '#ffd54f', w: 1024, h: 128, font: 76 })) })));
  soonBoard.position.set(T.x, 4.65, T.z + 4.25);
  scene.add(soonBoard);
  const spot = new THREE.SpotLight(0xfff8e1, 0, 14, 0.5, 0.4);
  spot.position.set(T.x, 9, T.z + 2);
  spot.target.position.set(T.x, 0, T.z);
  scene.add(spot, spot.target);
  // Something solid round the turntable, so nobody walks or drives through the car on show.
  const body = new CANNON.Body({ type: CANNON.Body.STATIC });
  body.addShape(new CANNON.Box(new CANNON.Vec3(T.radius - 0.2, 1, T.radius - 0.2)));
  body.position.set(T.x, 1, T.z);
  world.addBody(body);

  // --- screen bits ---
  const panel = $('#showroom-panel', ui);
  const panelText = $('.s-text', panel);
  const panelCount = $('.s-count', panel);
  const panelBar = $('.s-bar i', panel);
  const flash = $('#showroom-flash', ui);

  let shown = null; // what the turntable is set up for, e.g. 'sheet:phantom' or 'collection'
  let sheet = null;
  let sheetMesh = null;
  let cars = []; // car meshes on show, each with its own geometry-free group
  let collectionAt = 0;
  let collectionTimer = 0;
  let inZoneBefore = false;
  let reveal = null; // { key, t, place: parks the prize (at the flash), note: what to say after }
  let clock = 0;

  function clearShow() {
    if (sheetMesh) {
      show.remove(sheetMesh);
      sheetMesh = null;
    }
    sheet?.dispose();
    sheet = null;
    for (const c of cars) show.remove(c);
    cars = [];
  }

  function carOnDeck(key) {
    const bricks = prizeBricks(key);
    const mesh = createCarMesh(bricks, { emptySeat: true });
    mesh.position.y = carLift(bricks);
    show.add(mesh);
    cars.push(mesh);
    return mesh;
  }

  function showSheet(key) {
    clearShow();
    sheet = sheetGeometry(carBounds(prizeBricks(key)));
    sheet.computeBoundingBox();
    sheetMesh = new THREE.Mesh(sheet, silk);
    sheetMesh.castShadow = true;
    silk.opacity = 1;
    show.add(sheetMesh);
    shown = `sheet:${key}`;
  }

  function showCollection() {
    clearShow();
    const unlocked = showroom.get().unlocked;
    if (unlocked.length) carOnDeck(unlocked[collectionAt % unlocked.length]);
    shown = 'collection';
  }

  // Keep the turntable matching the store: the next mystery's sheet, or his cars taking turns.
  // During a reveal it waits, unless told to move on (under the flash at the end).
  function sync(status, force = false) {
    if (reveal && !force) return;
    if (status.next) {
      if (shown !== `sheet:${status.next}`) showSheet(status.next);
    } else if (shown !== 'collection') {
      collectionAt = 0;
      collectionTimer = 0;
      showCollection();
    }
  }

  function startReveal(key) {
    reveal = { key, t: 0, place: deliver(key), note: null };
    onPause();
    panel.classList.add('hidden');
    mark.visible = false;
    sfx.drumroll();
  }

  function stepReveal(dt) {
    const t0 = reveal.t;
    const t = (reveal.t += dt);
    for (const moment of revealEvents(t0, t)) {
      if (moment === 'uncover') {
        carOnDeck(reveal.key); // only now, so nothing pokes through the silk during the drumroll
        sfx.whoosh();
      } else if (moment === 'celebrate') {
        if (sheetMesh) {
          show.remove(sheetMesh);
          sheetMesh = null;
        }
        celebrate({ x: T.x, y: 2, z: T.z });
        sfx.fanfare();
        speak(prizeByKey(reveal.key).sayName);
      } else if (moment === 'swap') {
        // Under the flash: the car goes to his garage, and the next mystery rolls in.
        spot.intensity = 0;
        reveal.note = reveal.place();
        sync(showroom.status(coins()), true);
      } else if (moment === 'end') {
        flash.style.opacity = '0';
        const { note } = reveal;
        reveal = null;
        onResume();
        if (note) {
          toast(note.text, 4000);
          speak(note.say);
        }
        return;
      }
    }
    if (t < REVEAL.drum) {
      if (sheetMesh) sheetMesh.rotation.z = Math.sin(t * 40) * 0.015 * (t / REVEAL.drum); // a nervous little wiggle
    } else if (t < REVEAL.whoosh) {
      const k = (t - REVEAL.drum) / (REVEAL.whoosh - REVEAL.drum);
      if (sheetMesh) {
        sheetMesh.position.y = k * k * 6;
        sheetMesh.rotation.set(0, k * 2.5, 0);
        silk.opacity = 1 - k;
      }
      spot.intensity = 80 * k;
    } else if (t < REVEAL.shine) {
      spot.intensity = 80;
    } else {
      const k = (t - REVEAL.shine) / (REVEAL.fade - REVEAL.shine);
      flash.style.opacity = String(k < 0.5 ? k * 2 : 2 - k * 2);
    }
  }

  function updatePanel(status, inZone, busy) {
    const showPanel = inZone && !busy && (status.mode === 'mystery' || status.mode === 'ready');
    panel.classList.toggle('hidden', !showPanel);
    if (!showPanel) return;
    const ready = status.mode === 'ready';
    panel.classList.toggle('ready', ready);
    panelText.textContent = ready ? 'Ready! 🎁' : goalLine(status.goal);
    panelCount.textContent = `🪙 ${status.have} / ${status.goal}`;
    panelBar.style.width = `${Math.round((status.have / status.goal) * 100)}%`;
  }

  return {
    get revealing() { return !!reveal; },
    update(dt, { player, speed, busy }) {
      clock += dt;
      deck.rotation.y += dt * TURN_SPEED * (reveal && reveal.t > REVEAL.drum ? 2 : 1);
      if (reveal) {
        stepReveal(dt);
        return;
      }
      const status = showroom.status(coins());
      sync(status);
      if (shown === 'collection' && showroom.get().unlocked.length > 1 && (collectionTimer += dt) >= SHOW_TURN) {
        collectionTimer = 0;
        collectionAt++;
        showCollection();
      }
      const ready = status.mode === 'ready';
      mark.visible = !!sheetMesh;
      const top = sheet?.boundingBox.max.y ?? 2;
      mark.position.set(T.x, DECK + top + 1.1 + Math.sin(clock * (ready ? 6 : 2)) * 0.15, T.z);
      mark.scale.setScalar(ready ? 2 + 0.3 * Math.sin(clock * 6) : 2);
      soonBoard.visible = status.mode === 'soon';

      const inZone = !!player && Math.hypot(player.x - T.x, player.z - T.z) < zoneRadius;
      if (inZone && !inZoneBefore && status.mode === 'mystery' && !busy) speak(goalLine(status.goal));
      inZoneBefore = inZone;
      updatePanel(status, inZone, busy);
      if (shouldStartReveal({ mode: status.mode, inZone, speed, busy })) {
        const key = showroom.reveal(coins()); // saved before any of the show
        if (key) startReveal(key);
      }
    },
    // While the reveal plays, the camera stands in front of the turntable, looking at the car.
    cameraShot() {
      if (!reveal) return null;
      return { pos: { x: T.x + 4.5, y: 3.4, z: T.z + 8.5 }, look: { x: T.x, y: 1.1, z: T.z } }; // beside the lamp post
    },
    drawMap(g, toMap, scale) {
      if (showroom.status(coins()).mode !== 'ready') return;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 5);
      g.strokeStyle = `rgba(255, 213, 79, ${0.5 + 0.5 * pulse})`;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(toMap(T.x), toMap(T.z), (zoneRadius + 2 * pulse) * scale, 0, Math.PI * 2);
      g.stroke();
    },
    dispose() {
      clearShow();
      scene.remove(deck, mark, soonBoard, spot, spot.target);
      world.removeBody(body);
      panel.classList.add('hidden');
      flash.style.opacity = '0';
      for (const thing of owned) thing.dispose();
    },
  };
}
