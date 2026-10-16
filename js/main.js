import * as THREE from 'three';
import { createGarage } from './storage.js';
import { MODELS, modelToBricks } from './instructions.js';
import { $, showScreen, toast, closeModals } from './ui.js';
import { unlockAudio } from './audio.js';
import { createShowroom } from './showroom.js';
import { createBuilder } from './builder.js';
import { openBuildChooser } from './chooser.js';
import { createCity } from './city.js';
import { renderGarage } from './garageScreen.js';
import { createRace } from './race.js';
import { createFigureStore } from './figureStorage.js';
import { DEFAULT_FIGURE, randomFigure } from './figures.js';
import { setDriverFigure, setRiderResolver } from './brickMesh.js';
import { resolveRider } from './riders.js';
import { createFigureMaker } from './figureMaker.js';
import { renderFigures } from './figuresScreen.js';
import { renderHome } from './homeScreen.js';
import { setupInstall, registerOffline } from './install.js';
import { loadBrandLogos } from './brandLogos.js';
import { createRoomClient } from './net/room.js';
import { carPayload, DEFAULT_ROOM_CAR } from './net/together.js';
import { codeEmoji } from './net/protocol.js';
import { createTogetherScreen } from './playTogether.js';

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
    if (!mode?.isShowroom) app.setMode(createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE, renderer));
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
  // Where this tablet is, for play together: 'lobby', 'city' or 'race' while with friends, else null.
  place: null,
  setMode(next) {
    closeModals();
    const wasAway = !app.place;
    app.place = next.roomPlace ?? null;
    // Friends see 💤 over a player who went off to build or change their figure.
    if (app.room?.inRoom && wasAway !== !app.place) app.room.send('away', { away: !app.place });
    mode?.dispose();
    // OrbitControls writes an inline touch-action when it starts and stops; give control back to the CSS (none).
    renderer.domElement.style.touchAction = '';
    mode = next;
    // Set after disposing: the old mode's cleanup runs after the new mode was built.
    document.body.classList.toggle('racing', !!(next.isRace || next.landscapeOnly));
    resize();
  },
  goHome() {
    showScreen('home');
    renderHome(app);
    $('#home-together').textContent = app.room.inRoom ? `In a room: ${codeEmoji(app.room.state.code)}` : 'With friends, online';
    app.setMode(createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE, renderer));
  },
  openGarage(options = {}) {
    if (!mode?.isShowroom) app.setMode(createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE, renderer));
    showScreen('garage');
    renderGarage(app, options);
  },
  openCity(options = {}) {
    hideBanner();
    app.setMode(createCity(app, options));
  },
  openTogether() {
    hideBanner();
    const showroom = createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE, renderer);
    showroom.roomPlace = 'lobby';
    app.setMode(showroom);
    together.open();
  },
  // The car this tablet brings to play together: the one picked last time, else the newest, else a ready-made one.
  roomCar() {
    const cars = app.garage.list();
    return cars.find(c => c.id === app.room.chosenCarId()) ?? cars[cars.length - 1] ?? DEFAULT_ROOM_CAR;
  },
  chooseBuild() {
    openBuildChooser(app);
  },
  openBuilder(options = {}) {
    app.setMode(createBuilder(app, options));
  },
  startRace(car, options = {}) {
    hideBanner();
    app.setMode(createRace(app, car, options));
  },
};

// --- play together ---
app.room = createRoomClient({
  getHello: () => {
    const figure = app.figures.getMain() ?? DEFAULT_FIGURE;
    return { name: figure.name, figure, car: carPayload(app.roomCar(), app.figures.listFriends()) };
  },
});
const together = createTogetherScreen(app);

// Friends went somewhere: follow them from the room screens, ask first anywhere else (the builder may hold unsaved work).
function followRoom(place) {
  if (place === 'city') app.openCity({ room: true });
  else if (place === 'race') {
    if (app.room.state.race?.slots && app.room.state.you in app.room.state.race.slots) app.startRace(app.roomCar(), { room: true });
    else app.openTogether(); // joined mid-race: wait for the next one
  } else app.openTogether();
}
const banner = $('#room-banner');
const PLACE_NAMES = { city: 'the City 🏙', race: 'a race 🏁', lobby: 'the room 👫' };
function hideBanner() { banner.classList.add('hidden'); }
function showBanner(text) {
  $('.rb-text', banner).textContent = text;
  banner.classList.remove('hidden');
}
app.room.on('go', msg => {
  if (app.place) {
    followRoom(msg.place);
    return;
  }
  const who = app.room.state.players.get(msg.by)?.name ?? 'Your friends';
  showBanner(`${who} went to ${PLACE_NAMES[msg.place]}!`);
});
// Back in the room after the app was closed: offer to go where the friends are.
app.room.on('welcome', msg => {
  $('#home-together').textContent = `In a room: ${codeEmoji(msg.code)}`;
  if (!app.place) app.room.send('away', { away: true });
  if (!app.place && msg.place !== 'lobby') showBanner(`Your friends are in ${PLACE_NAMES[msg.place]}!`);
});
document.addEventListener('visibilitychange', () => {
  if (app.room.inRoom) app.room.send('away', { away: document.hidden || !app.place });
});
banner.addEventListener('click', e => {
  const action = e.target.closest('[data-banner]')?.dataset.banner;
  if (action === 'join') followRoom(app.room.state.place);
  if (action) hideBanner();
});
app.room.on('joined', msg => toast(`👋 ${msg.player.name} joined!`));
app.room.on('left', msg => {
  if (msg.id === app.room.state.you) return;
  const name = msg.name ?? 'A friend';
  toast(msg.reason === 'kicked' ? `${name} was sent out.` : `👋 ${name} left.`);
});
app.room.on('error', msg => {
  if (msg.reason === 'kicked' && app.place && app.place !== 'lobby') {
    toast('You were sent out of the room.', 3000);
    app.goHome();
  }
});

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
  if (action === 'city') app.openCity();
  if (action === 'figures') app.openFigures();
  if (action === 'cars') app.openGarage();
  if (action === 'together') app.openTogether();
  if (action === 'race') {
    if (app.garage.list().length) app.openGarage();
    else {
      toast('Build a car first!');
      app.chooseBuild();
    }
  }
});
for (const id of ['garage', 'rotate-hint', 'figures', 'together']) {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.closest('[data-action="home"]')) app.goHome();
    if (e.target.closest('[data-action="city"]')) app.openCity();
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

await loadBrandLogos(); // before any badge is drawn, so every picture uses the real logos
setRiderResolver(rider => resolveRider(rider, app.figures.listFriends()));
setDriverFigure(app.figures.getMain() ?? DEFAULT_FIGURE);
// First launch: make your figure before anything else.
if (app.figures.getMain()) app.goHome();
else app.openFigureMaker({ first: true });
window.brickRacers = app; // handy for poking at the game from the browser console

// Was in a room last time? Reconnect: the server keeps our place for a while after the app closes.
if (app.room.lastCode()) app.room.connect();

setupInstall({ button: document.querySelector('#home [data-action="install"]') });
registerOffline();
