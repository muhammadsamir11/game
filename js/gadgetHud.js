import * as THREE from 'three';
import { gadgetsOf, createBoost, createCooldown } from './gadgets.js';
import { createConfetti } from './confetti.js';
import { sfx, createSirenSound } from './audio.js';

const GADGET_KEYS = { KeyB: 'boost', KeyH: 'horn', KeyN: 'siren', KeyC: 'confetti' };
const RED = 0xe53935;

// Looks-only animation for any car: spinning propellers, flapping flags, rocket flames, flashing siren.
export function animateFx(fx, dt, { speed = 0, clock = 0, seed = 0, boosting = false, sirenOn = false } = {}) {
  for (const s of fx.spinners) s.rotation.z += dt * (4 + speed * 2);
  for (const f of fx.flags) f.rotation.y = Math.sin(clock * 8 + seed) * (0.15 + Math.min(speed, 15) * 0.02);
  for (const f of fx.flames) {
    f.visible = boosting;
    f.scale.setScalar(0.85 + Math.random() * 0.3);
  }
  const redTurn = Math.floor(clock * 4) % 2 === 0;
  for (const dome of fx.sirens) {
    const isRed = dome.userData.sirenLight === RED;
    dome.material.emissiveIntensity = !sirenOn ? 0.15 : isRed === redTurn ? 2.5 : 0.1;
  }
}

// The player's gadget buttons (boost, horn, siren, confetti), shared by races and the city.
// onUse(action): told about each boost, honk and confetti, so friends can hear and see them too.
export function createGadgetHud({ ui, scene, signal, canUse, onUse = () => {} }) {
  const buttons = [...ui.querySelectorAll('[data-gadget]')];
  const boost = createBoost();
  const horn = createCooldown(0.3);
  const confettiCooldown = createCooldown(1.5);
  const siren = createSirenSound();
  const confetti = createConfetti(scene);
  let gadgets = [];
  let fx = null;
  let sirenOn = false;

  function showButtons() {
    for (const button of buttons) {
      button.classList.toggle('hidden', !gadgets.includes(button.dataset.gadget));
      button.classList.remove('on');
    }
  }

  function setSiren(onNow) {
    sirenOn = onNow && gadgets.includes('siren');
    ui.querySelector('[data-gadget="siren"]')?.classList.toggle('on', sirenOn);
    if (sirenOn) siren.start();
    else siren.stop();
  }

  function use(action) {
    if (!gadgets.includes(action) || !canUse()) return;
    if (action === 'boost' && boost.trigger()) {
      sfx.whoosh();
      onUse('boost');
    }
    if (action === 'horn' && horn.trigger()) {
      sfx.horn();
      onUse('horn');
    }
    if (action === 'siren') setSiren(!sirenOn);
    if (action === 'confetti' && confettiCooldown.trigger()) {
      sfx.pop();
      onUse('confetti');
      for (const muzzle of fx?.muzzles ?? []) confetti.burst(muzzle.localToWorld(new THREE.Vector3(0, 0, 0.4)), 60);
    }
  }

  ui.addEventListener('pointerdown', e => {
    const gadget = e.target.closest('[data-gadget]')?.dataset.gadget;
    if (gadget) use(gadget);
  }, { signal });
  window.addEventListener('keydown', e => {
    if (GADGET_KEYS[e.code] && !e.repeat) use(GADGET_KEYS[e.code]);
  }, { signal });
  showButtons();

  return {
    setCar(bricks, carFx) {
      gadgets = gadgetsOf(bricks);
      fx = carFx;
      setSiren(false);
      showButtons();
    },
    clearCar() {
      gadgets = [];
      fx = null;
      setSiren(false);
      showButtons();
    },
    use,
    setSiren,
    get boosting() { return boost.active; },
    get sirenOn() { return sirenOn; },
    update(dt) {
      boost.update(dt);
      horn.update(dt);
      confettiCooldown.update(dt);
      confetti.update(dt);
      for (const button of buttons) {
        if (button.dataset.gadget === 'boost') {
          const charge = `${Math.round(boost.charge * 100)}%`;
          if (button.dataset.charge !== charge) { // repaints the button: only when it changes
            button.dataset.charge = charge;
            button.style.setProperty('--charge', charge);
          }
          if (button.classList.contains('on') !== boost.active) button.classList.toggle('on', boost.active);
        }
      }
    },
    dispose() {
      siren.stop();
      confetti.dispose();
    },
  };
}
