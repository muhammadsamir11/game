// The pizza shop's missions in the 3D city: the glowing ring, the mission card and banner,
// the target beam and arrow, the pizza box, Biscuit the puppy and the blue coin trails.
import * as THREE from 'three';
import { createMissionRunner, createRingGate, MISSION_RING } from './missions.js';
import { TRAIL_ROUTES, PICKUP, createCoinField } from './coins.js';
import { createCityCoins } from './cityCoins.js';
import { STUNT_PARK } from './stuntPark.js';
import { $, openModal, toast, setText } from './ui.js';
import { sfx, speak } from './audio.js';

const SEARCH_RADIUS = 25; // the puppy's circle on the map
const HEAR_WOOFS = 15;

// A spot near the puppy (not on it) for the centre of its search circle: fixed per spot so it doesn't jump around.
const searchCentre = t => ({ x: t.x + Math.sin(t.x * 1.7 + t.z) * 9, z: t.z + Math.cos(t.x + t.z * 1.3) * 9 });

function makePuppy(own) {
  const puppy = new THREE.Group();
  const fur = own(new THREE.MeshStandardMaterial({ color: 0xa1683a, roughness: 0.8 }));
  const dark = own(new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.8 }));
  const box = (w, h, d, x, y, z, m = fur) => {
    const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(w, h, d)), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    puppy.add(mesh);
    return mesh;
  };
  box(0.5, 0.35, 0.9, 0, 0.45, 0); // body
  for (const [x, z] of [[-0.18, 0.3], [0.18, 0.3], [-0.18, -0.3], [0.18, -0.3]]) box(0.14, 0.3, 0.14, x, 0.15, z, dark);
  box(0.4, 0.35, 0.4, 0, 0.75, 0.55); // head
  box(0.12, 0.2, 0.08, -0.17, 0.98, 0.5, dark); // ears
  box(0.12, 0.2, 0.08, 0.17, 0.98, 0.5, dark);
  box(0.16, 0.12, 0.14, 0, 0.7, 0.8, dark); // nose
  const tail = box(0.08, 0.08, 0.4, 0, 0.6, -0.6, dark);
  puppy.userData.tail = tail;
  puppy.scale.setScalar(1.4);
  return puppy;
}

export function createCityMissions({ scene, ui, progress, cityWorld, onPause, onResume, award, celebrate, getFigure }) {
  const abort = new AbortController();
  const runner = createMissionRunner({ startIndex: progress.get().missionsDone });
  if (progress.get().missionsDone >= 1) cityWorld.showStatue(getFigure());
  const owned = [];
  const own = thing => { owned.push(thing); return thing; };
  const timers = [];

  // --- 3D bits ---
  const ringMaterial = own(new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.7, depthWrite: false }));
  const ring = new THREE.Mesh(own(new THREE.CylinderGeometry(MISSION_RING.radius, MISSION_RING.radius, 0.12, 40)), ringMaterial);
  ring.position.set(MISSION_RING.x, 0.08, MISSION_RING.z);
  const beam = new THREE.Mesh(
    own(new THREE.CylinderGeometry(1.2, 1.2, 30, 16, 1, true)),
    own(new THREE.MeshBasicMaterial({ color: 0x76ff03, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })),
  );
  const arrow = new THREE.Mesh(own(new THREE.ConeGeometry(0.5, 1.4, 12).rotateX(Math.PI / 2)), own(new THREE.MeshStandardMaterial({ color: 0x76ff03, emissive: 0x33691e })));
  const pizzaBox = new THREE.Mesh(own(new THREE.BoxGeometry(0.8, 0.14, 0.8)), [
    own(new THREE.MeshStandardMaterial({ color: 0xffffff })), own(new THREE.MeshStandardMaterial({ color: 0xffffff })),
    own(new THREE.MeshStandardMaterial({ color: 0xe53935 })), own(new THREE.MeshStandardMaterial({ color: 0xffffff })),
    own(new THREE.MeshStandardMaterial({ color: 0xffffff })), own(new THREE.MeshStandardMaterial({ color: 0xffffff })),
  ]);
  const puppy = makePuppy(own);
  beam.visible = arrow.visible = pizzaBox.visible = puppy.visible = false;
  scene.add(ring, beam, arrow, puppy);
  let trail = null;
  let found = 0; // seconds of the puppy's happy jump
  let runKind = null;

  // --- screen bits ---
  const banner = $('#mission-banner', ui);
  const bannerEmoji = $('.m-emoji', banner);
  const bannerText = $('.m-text', banner);
  const bannerTimer = $('.m-timer', banner);
  let lastTick = null;
  let woofIn = 0;
  const ringGate = createRingGate();

  function clearRun() {
    beam.visible = arrow.visible = puppy.visible = false;
    pizzaBox.removeFromParent();
    pizzaBox.visible = false;
    trail?.dispose();
    trail = null;
    banner.classList.add('hidden');
    lastTick = null;
  }

  function startRun() {
    const m = runner.current;
    runKind = m.kind;
    bannerEmoji.textContent = m.emoji;
    bannerText.textContent = m.title;
    banner.classList.remove('hidden');
    if (m.kind === 'pizza') {
      beam.position.set(m.target.x, 15, m.target.z);
      beam.visible = true;
      pizzaBox.visible = true;
    }
    if (m.kind === 'puppy') {
      puppy.position.set(m.target.x, 0, m.target.z);
      puppy.rotation.y = Math.atan2(MISSION_RING.x - m.target.x, MISSION_RING.z - m.target.z);
      puppy.visible = true;
    }
    if (m.kind === 'coinTrail') {
      trail = createCityCoins(scene, createCoinField(TRAIL_ROUTES[m.routeIndex].map(p => ({ ...p, value: 1 })), { respawn: Infinity }), { color: 0x2196f3 });
    }
  }

  function offer() {
    const m = runner.offer();
    if (!m) return;
    onPause();
    speak(m.say);
    openModal({
      title: m.title,
      icon: m.emoji,
      className: 'mission-card',
      buttons: [
        { label: 'Not now', onClick: () => { runner.decline(); onResume(); } },
        { label: "Let's go! ▶", kind: 'go', onClick: () => { runner.accept(); startRun(); onResume(); } },
      ],
    });
  }

  function soClose() {
    onPause();
    speak('So close! Try again?');
    openModal({
      title: 'So close! Try again?',
      icon: '⏰',
      className: 'mission-card',
      buttons: [
        { label: 'Not now', onClick: () => { runner.cancel(); clearRun(); onResume(); } },
        { label: '🔁 Try again', kind: 'go', onClick: () => { runner.retry(); clearRun(); startRun(); onResume(); } },
      ],
    });
  }

  function complete(reward, at) {
    const puppyFound = runKind === 'puppy';
    clearRun();
    if (puppyFound) {
      puppy.visible = true; // a happy jump before he runs home
      found = 2;
    }
    sfx.fanfare();
    celebrate(at);
    speak('Mission complete!');
    toast(`Mission complete! +${reward} 🪙`, 2600);
    award(reward);
    if (progress.missionDone() === 1) {
      cityWorld.showStatue(getFigure());
      timers.push(setTimeout(() => toast('Something shiny appeared in the park… ✨', 3500), 2800));
    }
  }

  banner.querySelector('[data-city="quit-mission"]').addEventListener('pointerdown', ev => {
    ev.stopPropagation();
    runner.cancel();
    clearRun();
  }, { signal: abort.signal });

  // Where the arrow points: the drop-off, near the puppy's circle, the next blue coin, or the stunt park.
  function guideTarget(player) {
    const m = runner.current;
    if (!m) return null;
    if (m.kind === 'pizza') return m.target;
    if (m.kind === 'puppy') return runner.near(player) < SEARCH_RADIUS ? null : searchCentre(m.target);
    if (m.kind === 'coinTrail' && trail) {
      let best = null;
      trail.field.spots.forEach((s, i) => {
        if (trail.field.isActive(i) && (!best || Math.hypot(s.x - player.x, s.z - player.z) < Math.hypot(best.x - player.x, best.z - player.z))) best = s;
      });
      return best;
    }
    if (m.kind === 'stunt') {
      const r = STUNT_PARK.rect;
      const inPark = player.x > r.x0 && player.x < r.x1 && player.z > r.z0 && player.z < r.z1;
      return inPark ? null : { x: STUNT_PARK.arch.x, z: STUNT_PARK.arch.z };
    }
    return null;
  }

  return {
    // ctx: { player: {x,y,z}, driving, carMesh, figureMesh, stunt, clock }
    update(dt, { player, driving, carMesh, figureMesh, stunt, clock }) {
      const r = STUNT_PARK.rect;
      const inStuntPark = player.x > r.x0 && player.x < r.x1 && player.z > r.z0 && player.z < r.z1;

      // the ring: offer a mission when he arrives, once per visit to the ring
      const inRing = Math.hypot(player.x - MISSION_RING.x, player.z - MISSION_RING.z) < MISSION_RING.radius + (driving ? 1.5 : 0);
      ringMaterial.opacity = runner.state === 'ready' ? 0.55 + 0.25 * Math.sin(clock * 4) : 0.12;
      ring.scale.setScalar(runner.state === 'ready' ? 1 + 0.06 * Math.sin(clock * 4) : 1);
      if (ringGate.shouldOffer(inRing, runner.state)) {
        offer();
        return;
      }

      // blue coins
      let trailLeft;
      if (trail) {
        trail.update(dt, clock);
        for (const got of trail.field.collect(player, driving ? PICKUP.car : PICKUP.foot)) {
          sfx.coin();
          award(got.value);
        }
        trailLeft = trail.field.activeCount();
      }

      // a stunt counts for the park if the jump left the ground there (big jumps land beyond its edge)
      const from = stunt?.from;
      const stuntInPark = from ? from.x > r.x0 && from.x < r.x1 && from.z > r.z0 && from.z < r.z1 : inStuntPark;
      const result = runner.update(dt, { player, stunt, inStuntPark: stuntInPark, trailLeft });
      if (result?.completed) complete(result.completed, player);
      else if (result?.failed) soClose();

      // the puppy wags, and jumps for joy when found
      if (found > 0) {
        found -= dt;
        puppy.position.y = Math.abs(Math.sin(found * 10)) * 0.6;
        if (found <= 0) puppy.visible = false;
      }
      if (puppy.visible) puppy.userData.tail.rotation.y = Math.sin(clock * 14) * 0.6;

      const m = runner.state === 'running' ? runner.current : null;
      if (!m) {
        arrow.visible = false;
        return;
      }
      if (m.kind === 'puppy') {
        woofIn -= dt;
        if (runner.near(player) < HEAR_WOOFS && woofIn <= 0) {
          sfx.woof();
          woofIn = 2;
        }
      }
      if (m.kind === 'pizza') {
        const holder = driving ? carMesh : figureMesh;
        if (pizzaBox.parent !== holder) {
          holder.add(pizzaBox);
          if (driving) {
            const top = new THREE.Box3().setFromObject(holder).max.y - holder.position.y;
            pizzaBox.position.set(0, top + 0.1, 0);
            pizzaBox.scale.setScalar(1);
          } else {
            pizzaBox.position.set(0, 0.62, 0.22); // held in front of him
            pizzaBox.scale.setScalar(0.5);
          }
        }
      }
      if (runner.timeLeft !== null) {
        const secs = Math.ceil(runner.timeLeft);
        setText(bannerTimer, `⏱ ${secs}`);
        if (secs <= 5 && secs !== lastTick) sfx.tick();
        lastTick = secs;
      } else setText(bannerTimer, '');
      const target = guideTarget(player);
      arrow.visible = !!target;
      if (target) {
        arrow.position.set(player.x, player.y + 3, player.z);
        arrow.rotation.y = Math.atan2(target.x - player.x, target.z - player.z);
        arrow.position.y += Math.sin(clock * 5) * 0.15;
      }
    },
    get runner() { return runner; },
    drawMap(g, toMap, scale, clock) {
      const ready = runner.state === 'ready';
      g.fillStyle = ready ? '#ffca28' : 'rgba(255, 202, 40, 0.4)';
      g.beginPath();
      g.arc(toMap(MISSION_RING.x), toMap(MISSION_RING.z), ready ? 9 : 6, 0, Math.PI * 2);
      g.fill();
      const r = STUNT_PARK.rect;
      g.strokeStyle = '#ff7043';
      g.lineWidth = 4;
      g.strokeRect(toMap(r.x0), toMap(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      const m = runner.state === 'running' ? runner.current : null;
      if (!m) return;
      const flash = Math.sin(clock * 8) > 0;
      if (m.kind === 'pizza' && flash) {
        g.fillStyle = '#76ff03';
        g.beginPath();
        g.arc(toMap(m.target.x), toMap(m.target.z), 10, 0, Math.PI * 2);
        g.fill();
      }
      if (m.kind === 'puppy') {
        const c = searchCentre(m.target);
        g.strokeStyle = '#a1683a';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(toMap(c.x), toMap(c.z), SEARCH_RADIUS * scale, 0, Math.PI * 2);
        g.stroke();
      }
      if (m.kind === 'coinTrail' && trail) {
        g.fillStyle = '#2196f3';
        trail.field.spots.forEach((s, i) => {
          if (trail.field.isActive(i)) g.fillRect(toMap(s.x) - 4, toMap(s.z) - 4, 8, 8);
        });
      }
      if (m.kind === 'stunt' && flash) {
        g.fillStyle = '#ff7043';
        g.fillRect(toMap(r.x0), toMap(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      }
    },
    dispose() {
      abort.abort();
      for (const t of timers) clearTimeout(t);
      clearRun();
      scene.remove(ring, beam, arrow, puppy);
      for (const thing of owned) thing.dispose?.();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },
  };
}
