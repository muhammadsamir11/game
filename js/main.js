import * as THREE from 'three';
import { createGarage } from './storage.js';
import { MODELS, modelToBricks } from './instructions.js';
import { showScreen, toast, closeModals } from './ui.js';
import { unlockAudio } from './audio.js';
import { createShowroom } from './showroom.js';
import { createBuilder } from './builder.js';
import { openBuildChooser } from './chooser.js';
import { renderGarage } from './garageScreen.js';
import { createRace } from './race.js';

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let mode = null;

const app = {
  renderer,
  garage: createGarage(),
  setMode(next) {
    closeModals();
    mode?.dispose();
    mode = next;
    // Set after disposing: the old mode's cleanup runs after the new mode was built.
    document.body.classList.toggle('racing', !!next.isRace);
    resize();
  },
  goHome() {
    showScreen('home');
    app.setMode(createShowroom(showroomBricks()));
  },
  openGarage() {
    if (!mode?.isShowroom) app.setMode(createShowroom(showroomBricks()));
    showScreen('garage');
    renderGarage(app);
  },
  chooseBuild() {
    openBuildChooser(app);
  },
  openBuilder(options = {}) {
    app.setMode(createBuilder(app, options));
  },
  startRace(car) {
    app.setMode(createRace(app, car));
  },
};

function showroomBricks() {
  const cars = app.garage.list();
  return cars.length ? cars[cars.length - 1].bricks : modelToBricks(MODELS.raceCar);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  mode?.resize(w, h);
}

window.addEventListener('resize', resize);
document.addEventListener('pointerdown', unlockAudio, { capture: true });

document.getElementById('home').addEventListener('click', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'build') app.chooseBuild();
  if (action === 'garage') app.openGarage();
  if (action === 'race') {
    if (app.garage.list().length) app.openGarage();
    else {
      toast('Build a car first!');
      app.chooseBuild();
    }
  }
});
document.getElementById('garage').addEventListener('click', e => {
  if (e.target.closest('[data-action="home"]')) app.goHome();
});

let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!mode) return;
  mode.update(dt);
  renderer.render(mode.scene, mode.camera);
});

app.goHome();
window.brickRacers = app; // handy for poking at the game from the browser console
