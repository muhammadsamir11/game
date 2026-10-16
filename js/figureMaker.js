import * as THREE from 'three';
import { COLORS, COLOR_KEYS } from './bricks.js';
import { HEADS, FACES, SKINS, PRINTS, HAIR_COLORS, headColorOptions, normaliseFigure, randomFigure, cleanName } from './figures.js';
import { createFigureMesh } from './figureMesh.js';
import { createSky } from './sky.js';
import { createKit } from './legoKit.js';
import { buildPodium, dressBaseplate } from './podium.js';
import { figureThumbnail, clearFigureThumbnails } from './thumbnails.js';
import { $, el, hexCss, showScreen, askName, confirmDialog } from './ui.js';
import { sfx } from './audio.js';

export function createFigureMaker(app, { figure, first = false, isMain = true, onSave }) {
  showScreen('figure');
  const ui = $('#figure');
  const canvas = app.renderer.domElement;
  const abort = new AbortController();
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });
  const fallbackName = isMain ? 'Me' : 'Friend';
  let current = normaliseFigure(figure, fallbackName);
  const original = JSON.stringify(current);
  let tab = 'head';

  $('.fig-title', ui).textContent = first ? 'Make your figure!' : isMain ? 'Change your figure' : 'Make a friend';
  $('[data-fig="home"]', ui).classList.toggle('hidden', first);

  // --- 3D: the figure on a round brick, out on a studded baseplate under the same sky as the city and the race ---
  const disposables = [];
  const own = thing => { disposables.push(thing); return thing; };
  const scene = new THREE.Scene();
  const sky = createSky(scene, app.renderer);
  scene.add(new THREE.HemisphereLight(0xe3f1ff, 0x5f8f4a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  scene.add(sun);
  const kit = createKit(own);
  const turntable = new THREE.Group();
  scene.add(turntable);
  const podiumTop = buildPodium(kit, turntable, { radius: 0.85 });
  dressBaseplate(kit, scene, {
    clear: 1.2,
    near: 5,
    flowers: 8,
    trees: [
      { x: -4.2, z: -6, s: 0.75, kind: 'round' }, { x: -8, z: -11, s: 1, kind: 'pine' }, { x: 1.5, z: -12, s: 0.9, kind: 'round' },
      { x: 6, z: -8, s: 0.85, kind: 'pine' }, { x: 10, z: -13, s: 1, kind: 'round' },
    ],
    bushes: [{ x: -2.4, z: -3, s: 0.55 }, { x: 2.8, z: -3.6, s: 0.5 }, { x: -5.5, z: -2, s: 0.6 }],
  });
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  let mesh = null;

  function rebuild() {
    if (mesh) turntable.remove(mesh);
    mesh = createFigureMesh(current);
    mesh.position.y = podiumTop;
    turntable.add(mesh);
    renderPanel();
  }

  // One-finger drag turns the figure; otherwise it spins slowly.
  let dragX = null;
  on(canvas, 'pointerdown', e => { dragX = e.clientX; });
  on(window, 'pointermove', e => {
    if (dragX === null) return;
    turntable.rotation.y += (e.clientX - dragX) * 0.01;
    dragX = e.clientX;
  });
  on(window, 'pointerup', () => { dragX = null; });
  on(window, 'pointercancel', () => { dragX = null; });

  // --- choices panel ---
  const tiles = $('#fig-tiles', ui);
  const colors = $('#fig-colors', ui);

  const tile = (src, label, selected, onPick) => el('button', { class: `fig-tile${selected ? ' selected' : ''}`, onclick: onPick }, [
    el('img', { src, alt: '' }),
    el('span', { text: label }),
  ]);
  const swatch = (hex, label, selected, onPick, big = false) => el('button', {
    class: `swatch${big ? ' big' : ''}${selected ? ' selected' : ''}`, 'aria-label': label, style: `background:${hexCss(hex)}`, onclick: onPick,
  });
  const colorSwatches = (keys, table, value, field) => keys.map(k => swatch(table[k].hex, table[k].name, value === k, () => set({ [field]: k })));

  function renderPanel() {
    for (const button of ui.querySelectorAll('.fig-tabs button')) button.classList.toggle('selected', button.dataset.tab === tab);
    let tileList = [];
    let colorList = [];
    if (tab === 'head') {
      tileList = Object.keys(HEADS).map(k => tile(figureThumbnail({ ...current, head: k }, 'head'), HEADS[k].name, current.head === k, () => set({ head: k })));
      const options = headColorOptions(current.head);
      colorList = colorSwatches(options, HEADS[current.head].kind === 'hair' ? HAIR_COLORS : COLORS, current.headColor, 'headColor');
    } else if (tab === 'face') {
      tileList = Object.keys(FACES).map(k => tile(figureThumbnail({ ...current, face: k }, 'head'), FACES[k].name, current.face === k, () => set({ face: k })));
    } else if (tab === 'skin') {
      colorList = Object.keys(SKINS).map(k => swatch(SKINS[k].hex, SKINS[k].name, current.skin === k, () => set({ skin: k }), true));
    } else if (tab === 'shirt') {
      tileList = Object.keys(PRINTS).map(k => tile(figureThumbnail({ ...current, print: k }), PRINTS[k].name, current.print === k, () => set({ print: k })));
      colorList = colorSwatches(COLOR_KEYS, COLORS, current.shirt, 'shirt');
    } else if (tab === 'pants') {
      colorList = COLOR_KEYS.map(k => swatch(COLORS[k].hex, COLORS[k].name, current.pants === k, () => set({ pants: k }), true));
    }
    tiles.replaceChildren(...tileList);
    colors.replaceChildren(...colorList);
  }

  function set(change) {
    current = normaliseFigure({ ...current, ...change }, fallbackName);
    sfx.pop();
    rebuild();
  }

  on($('.fig-tabs', ui), 'click', e => {
    const button = e.target.closest('[data-tab]');
    if (!button) return;
    tab = button.dataset.tab;
    sfx.pop();
    renderPanel();
  });

  on(ui, 'click', async e => {
    const action = e.target.closest('[data-fig]')?.dataset.fig;
    if (action === 'random') set(randomFigure(Math.floor(Math.random() * 1e9), current.name));
    if (action === 'done') {
      const name = await askName(current.name, isMain ? "What's your name?" : 'Name your friend');
      if (name === null) return; // stay here: on first launch there is nowhere else to go yet
      sfx.success();
      onSave({ ...current, name: cleanName(name, fallbackName) });
    }
    if (action === 'home') {
      if (JSON.stringify(current) !== original && !(await confirmDialog('Leave without saving?', { yes: 'Leave', no: 'Stay', danger: true }))) return;
      app.openFigures();
    }
  });

  rebuild();

  return {
    scene,
    camera,
    update(dt) {
      if (dragX === null) turntable.rotation.y += dt * 0.5;
      sky.update(dt, camera);
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Centre the figure in the space left of the choices panel; in portrait that space is narrow, so step back.
      const panel = Math.min(440, w * 0.5) + 12;
      const freeShare = (w - panel) / w;
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const distance = Math.max(3.6, 1.5 / (freeShare * 2 * tan * camera.aspect));
      const shift = (1 - freeShare) * distance * tan * camera.aspect;
      camera.position.set(shift, podiumTop + 0.65 * (distance / 3.6), distance);
      camera.lookAt(shift, podiumTop + 0.45, 0);
    },
    dispose() {
      abort.abort();
      sun.dispose();
      sky.dispose();
      clearFigureThumbnails();
      for (const thing of disposables) thing.dispose();
    },
  };
}
