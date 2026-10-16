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
import { createFigureStore } from './figureStorage.js';
import { DEFAULT_FIGURE, randomFigure } from './figures.js';
import { setDriverFigure, setRiderResolver } from './brickMesh.js';
import { resolveRider } from './riders.js';
import { createFigureMaker } from './figureMaker.js';
import { renderFigures } from './figuresScreen.js';

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let mode = null;

const app = {
  renderer,
  garage: createGarage(),
  figures: createFigureStore(),
  // Car pictures show friends as passengers, so redraw them when friends change.
  figuresChanged() {
    setDriverFigure(app.figures.getMain() ?? DEFAULT_FIGURE);
  },
  openFigures() {
    if (!mode?.isShowroom) app.setMode(createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE));
    showScreen('figures');
    renderFigures(app);
  },
  // id: 'main', a friend's id, or null for a brand-new friend.
  openFigureMaker({ id = 'main', first = false } = {}) {
    const isMain = id === 'main';
    const figure = isMain ? app.figures.getMain() ?? DEFAULT_FIGURE
      : id ? app.figures.getFriend(id) : randomFigure(Math.floor(Math.random() * 1e9), 'Friend');
    app.setMode(createFigureMaker(app, {
      figure, first, isMain,
      onSave(saved) {
        if (isMain) {
          setDriverFigure(app.figures.saveMain(saved));
          if (first) app.goHome();
          else app.openFigures();
        } else {
          app.figures.saveFriend({ ...saved, id: id ?? undefined });
          app.figuresChanged();
          app.openFigures();
        }
      },
    }));
  },
  setMode(next) {
    closeModals();
    mode?.dispose();
    // OrbitControls writes an inline touch-action when it starts and stops; give control back to the CSS (none).
    renderer.domElement.style.touchAction = '';
    mode = next;
    // Set after disposing: the old mode's cleanup runs after the new mode was built.
    document.body.classList.toggle('racing', !!next.isRace);
    resize();
  },
  goHome() {
    showScreen('home');
    app.setMode(createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE));
  },
  openGarage() {
    if (!mode?.isShowroom) app.setMode(createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE));
    showScreen('garage');
    renderGarage(app);
  },
  chooseBuild() {
    openBuildChooser(app);
  },
  openBuilder(options = {}) {
    app.setMode(createBuilder(app, options));
  },
  startRace(car, options = {}) {
    app.setMode(createRace(app, car, options));
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
// iPad Safari only treats some events as a real tap for sound, so try on all of them.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click']) document.addEventListener(type, unlockAudio, { capture: true });
// Older iPadOS pinch-zooms the page through gesture events even with touch-action set.
document.addEventListener('gesturestart', e => e.preventDefault());

document.getElementById('home').addEventListener('click', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'build') app.chooseBuild();
  if (action === 'garage') app.openGarage();
  if (action === 'figures') app.openFigures();
  if (action === 'race') {
    if (app.garage.list().length) app.openGarage();
    else {
      toast('Build a car first!');
      app.chooseBuild();
    }
  }
});
for (const id of ['garage', 'rotate-hint', 'figures']) {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.closest('[data-action="home"]')) app.goHome();
  });
}

let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!mode) return;
  mode.update(dt);
  renderer.render(mode.scene, mode.camera);
});

setRiderResolver(rider => resolveRider(rider, app.figures.listFriends()));
setDriverFigure(app.figures.getMain() ?? DEFAULT_FIGURE);
// First launch: make your figure before anything else.
if (app.figures.getMain()) app.goHome();
else app.openFigureMaker({ first: true });
window.brickRacers = app; // handy for poking at the game from the browser console
