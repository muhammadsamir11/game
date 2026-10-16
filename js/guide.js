import * as THREE from 'three';
import { BRICK_TYPES, COLORS, STUD, LAYER } from './bricks.js';
import { footprint } from './snapping.js';
import { MODELS, describeStep, checkPlacement } from './instructions.js';
import { createBrickMesh } from './brickMesh.js';
import { brickThumbnail } from './thumbnails.js';
import { $, toast } from './ui.js';
import { sfx, speak } from './audio.js';
import { createConfetti } from './confetti.js';

const TARGET_GLOW = 0xffd54f;

// Step-by-step instructions on top of the workshop: a glowing, bouncing target shows where the next brick goes.
export function createGuide({ modelKey, scene, carGroup, ui, pick, candidateFor, addBrick, showNeeded, selection, onComplete }) {
  const model = MODELS[modelKey];
  const card = $('#instruction-card', ui);
  const confetti = createConfetti(scene);
  let index = 0;
  let target = null;
  let time = 0;
  let bounce = 0;

  const current = () => model.steps[index];

  function centreOf(step) {
    const { w, d, h } = footprint(step.type, step.r);
    return carGroup.localToWorld(new THREE.Vector3((step.x + w / 2) * STUD, (step.y + h) * LAYER, (step.z + d / 2) * STUD));
  }

  function showStep() {
    if (target) {
      carGroup.remove(target);
      target.traverse(node => { if (node.material?.visible === false) node.geometry.dispose(); });
    }
    const step = current();
    target = createBrickMesh(step, { ghost: TARGET_GLOW });
    // Thin parts (ladder, flag, propeller) are mostly gaps: an invisible box the size of the part makes them easy to tap.
    const type = BRICK_TYPES[step.type];
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(type.w * STUD, type.h * LAYER, type.d * STUD), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = (type.h * LAYER) / 2;
    target.add(hitbox);
    target.traverse(node => { node.userData.isTarget = true; });
    target.userData.baseY = target.position.y;
    carGroup.add(target);
    card.querySelector('.step-count').textContent = `Step ${index + 1} of ${model.steps.length}`;
    card.style.setProperty('--progress', index / model.steps.length);
    card.querySelector('.step-img').src = brickThumbnail(step.type, step.color);
    card.querySelector('.step-text').textContent = describeStep(step);
    showNeeded({ type: step.type, color: step.color });
  }

  function clearHighlights() {
    showNeeded(null);
  }

  function wiggle(selector) {
    const node = ui.querySelector(selector);
    if (!node) return;
    node.classList.remove('wiggle');
    void node.offsetWidth; // restart the animation
    node.classList.add('wiggle');
    node.addEventListener('animationend', () => node.classList.remove('wiggle'), { once: true });
  }

  function tap(x, y) {
    const step = current();
    if (!step) return;
    const { type, color } = selection();
    if (!type) {
      toast('First pick a brick from the tray!');
      showNeeded({ type: step.type, color: step.color }); // he may have opened another tab
      wiggle('.tray-item.needed');
      return;
    }
    const hit = pick(x, y, target ? [target] : []);
    if (!hit) return;
    const at = hit.isTarget ? { x: step.x, y: step.y, z: step.z } : candidateFor(hit).cell;
    const result = checkPlacement(step, { type, color, at });

    if (result === 'correct') {
      addBrick({ type: step.type, color: step.color, x: step.x, y: step.y, z: step.z, r: step.r, ...(step.rider ? { rider: step.rider } : {}), ...(step.badge ? { badge: step.badge } : {}) });
      sfx.snap();
      confetti.burst(centreOf(step));
      index++;
      if (index < model.steps.length) {
        showStep();
        return;
      }
      carGroup.remove(target);
      target = null;
      card.classList.add('hidden');
      clearHighlights();
      sfx.fanfare();
      confetti.burst(carGroup.localToWorld(new THREE.Vector3(0, 1.5, 0)), 150);
      onComplete();
      return;
    }

    sfx.wrong();
    if (result === 'wrongBrick') {
      toast(`That's a ${BRICK_TYPES[type].name}. Find the ${BRICK_TYPES[step.type].name}!`);
      showNeeded({ type: step.type, color: step.color });
      wiggle('.tray-item.needed');
    } else if (result === 'wrongColor') {
      toast(`Right brick! Now pick ${COLORS[step.color].name.toLowerCase()}.`);
      wiggle('.swatch.needed');
    } else {
      toast('Put it on the glowing spot!');
      bounce = 1;
    }
  }

  card.classList.remove('hidden');
  showStep();

  return {
    tap,
    update(dt) {
      time += dt;
      if (target) {
        target.position.y = target.userData.baseY + 0.08 + Math.abs(Math.sin(time * 4)) * (0.12 + bounce * 0.3);
        bounce = Math.max(0, bounce - dt);
      }
      confetti.update(dt);
    },
    readAloud() {
      const step = current();
      if (step) speak(describeStep(step));
    },
    dispose() {
      confetti.dispose();
      clearHighlights();
    },
  };
}
