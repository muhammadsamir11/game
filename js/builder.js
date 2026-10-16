import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BRICK_TYPES, COLORS, COLOR_KEYS, TRAY_GROUPS, groupOf, STUD, LAYER, makeChassis } from './bricks.js';
import { DEFAULT_RIDER } from './riders.js';
import { pickRider } from './riderPicker.js';
import { canPlace, candidateFromHit, footprint, nearestWheelSlot } from './snapping.js';
import { raceReadiness } from './carStats.js';
import { createBrickMesh, carLift } from './brickMesh.js';
import { brickThumbnail, carThumbnail } from './thumbnails.js';
import { $, el, hexCss, toast, confirmDialog, askName, showScreen, openModal } from './ui.js';
import { MODELS } from './instructions.js';
import { createGuide } from './guide.js';
import { sfx } from './audio.js';

const GHOST_OK = 0x5be37a;
const GHOST_BAD = 0xff5252;
const TAP_MAX_MOVE = 10; // px
const TAP_MAX_MS = 500;
const REASONS = {
  overlap: 'Oops! Something is already there.',
  floating: 'Bricks need something under them!',
  outOfBounds: "That's too far out!",
  wheelSlot: 'Wheels go on the sides of the chassis.',
  unknown: "That piece won't fit there.",
};
const NEEDS = { wheels: '4 wheels at the corners', engine: 'an engine', seat: 'a seat' };
const sameBrick = (a, b) => !!a && !!b && ['type', 'color', 'x', 'y', 'z', 'r'].every(k => a[k] === b[k]);
const belongsTo = (object, root) => {
  for (let o = object; o; o = o.parent) if (o === root) return true;
  return false;
};

export function createBuilder(app, { car = null, modelKey = null } = {}) {
  showScreen('build');
  const ui = $('#build');
  const canvas = app.renderer.domElement;
  const abort = new AbortController();
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });

  const tray = $('#tray', ui);
  const colors = $('#colors', ui);
  const checklist = $('#checklist', ui);
  const placeBtn = $('#place-btn', ui);
  const doneBtn = $('[data-tool="done"]', ui);
  const deleteBtn = $('[data-tool="delete"]', ui);
  const trayTabs = $('#tray-tabs', ui);
  ui.classList.toggle('guided', !!modelKey);
  checklist.classList.toggle('hidden', !!modelKey);
  $('#instruction-card', ui).classList.add('hidden');

  // --- 3D scene ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe6ff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
  scene.add(sun);
  const baseplate = createBaseplate();
  scene.add(baseplate);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(7, 6.5, 9);
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(0, 0.9, 0);
  orbit.enablePan = false;
  orbit.enableDamping = true;
  orbit.minDistance = 5;
  orbit.maxDistance = 18;
  orbit.maxPolarAngle = Math.PI * 0.49;

  const carGroup = new THREE.Group();
  scene.add(carGroup);

  // --- state ---
  let bricks = [];
  const meshes = new Map();
  const undoStack = [];
  let selectedType = null;
  let selectedColor = 'red';
  let rotation = 0;
  let deleteMode = false;
  let ghost = null;
  let ghostCand = null;
  let lastHit = null;
  let guide = null; // guided mode (Task 11) plugs in here
  let dirty = false;
  let trayGroup = 'bricks';
  let needed = null; // guided mode: { type, color } of the part to highlight
  let disposed = false; // the next mode is built before this one is disposed; stop touching the shared tray then

  function addBrick(brick) {
    bricks.push(brick);
    const mesh = createBrickMesh(brick);
    meshes.set(brick, mesh);
    carGroup.add(mesh);
    afterChange();
  }

  function removeBrick(brick) {
    bricks = bricks.filter(b => b !== brick);
    carGroup.remove(meshes.get(brick));
    meshes.delete(brick);
    afterChange();
  }
  // Redraw one brick (after its rider changes).
  function refreshBrickMesh(brick) {
    carGroup.remove(meshes.get(brick));
    const mesh = createBrickMesh(brick);
    meshes.set(brick, mesh);
    carGroup.add(mesh);
  }

  async function chooseRider(brick) {
    const rider = await pickRider(app);
    if (!meshes.has(brick)) return; // removed or undone meanwhile
    brick.rider = rider;
    refreshBrickMesh(brick);
    dirty = true;
    sfx.snap();
  }


  function afterChange() {
    dirty = true;
    carGroup.position.y = carLift(bricks);
    updateChecklist();
  }

  for (const b of car ? car.bricks : [makeChassis()]) addBrick({ ...b });
  dirty = false;

  // --- picking: screen tap → brick face in car-local grid space ---
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(clientX, clientY, extra = []) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([...meshes.values(), ...extra], true)[0];
    if (!hit) return null;
    return {
      object: hit.object,
      brick: hit.object.userData.brick,
      point: carGroup.worldToLocal(hit.point.clone()),
      normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld),
      isTarget: !!hit.object.userData.isTarget,
    };
  }

  function candidateFor(hit) {
    if (BRICK_TYPES[selectedType]?.kind === 'wheel') {
      const slot = nearestWheelSlot(hit.point.x / STUD, hit.point.z / STUD);
      return { cand: { type: selectedType, color: selectedColor, r: 0, ...slot }, cell: slot };
    }
    let normal = { x: Math.round(hit.normal.x), y: Math.round(hit.normal.y), z: Math.round(hit.normal.z) };
    const p = hit.point.clone().add(new THREE.Vector3(normal.x, normal.y, normal.z).multiplyScalar(0.01));
    let cell = { x: Math.floor(p.x / STUD), y: Math.floor(p.y / LAYER), z: Math.floor(p.z / STUD) };
    // Taps on studs, drivers' heads, pipes etc. stick out above the brick's top: treat them as its top face.
    const b = hit.brick;
    if (b && !hit.isTarget) {
      const top = b.y + footprint(b.type, b.r).h;
      if (hit.point.y > top * LAYER + 0.005) {
        normal = { x: 0, y: 1, z: 0 };
        cell = { x: Math.floor(hit.point.x / STUD), y: top, z: Math.floor(hit.point.z / STUD) };
      }
    }
    return { cand: { ...candidateFromHit(selectedType, rotation, cell, normal), color: selectedColor }, cell };
  }

  // Wheels can also be placed by tapping the baseplate beside the car: they snap to the nearest corner.
  const extraTargets = () => [...(ghost ? [ghost] : []), ...(BRICK_TYPES[selectedType]?.kind === 'wheel' ? [baseplate] : [])];

  // --- ghost preview ---
  function showGhost(cand) {
    hideGhost();
    const ok = canPlace(bricks, cand).ok;
    ghost = createBrickMesh(cand, { ghost: ok ? GHOST_OK : GHOST_BAD });
    ghostCand = cand;
    carGroup.add(ghost);
    placeBtn.classList.toggle('hidden', !ok);
  }

  function hideGhost() {
    if (ghost) carGroup.remove(ghost);
    ghost = null;
    ghostCand = null;
    placeBtn.classList.add('hidden');
  }

  function refreshGhost() {
    if (ghost && lastHit && selectedType) showGhost(candidateFor(lastHit).cand);
    else hideGhost();
  }

  function tryPlace(cand) {
    const result = canPlace(bricks, cand);
    if (!result.ok) {
      sfx.wrong();
      toast(REASONS[result.reason]);
      return false;
    }
    const brick = { type: cand.type, color: cand.color, x: cand.x, y: cand.y, z: cand.z, r: cand.r };
    if (brick.type === 'passengerSeat') brick.rider = DEFAULT_RIDER;
    addBrick(brick);
    undoStack.push({ op: 'add', brick });
    sfx.snap();
    hideGhost();
    if (brick.type === 'passengerSeat') chooseRider(brick);
    return true;
  }

  // --- taps (OrbitControls handles drags and pinches on the same canvas) ---
  const downs = new Map();
  on(canvas, 'pointerdown', e => {
    const multi = downs.size > 0;
    for (const d of downs.values()) d.multi = true;
    downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), multi });
  });
  on(canvas, 'pointercancel', e => downs.delete(e.pointerId));
  on(canvas, 'pointerup', e => {
    const d = downs.get(e.pointerId);
    downs.delete(e.pointerId);
    if (!d || d.multi) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_MAX_MOVE || performance.now() - d.t > TAP_MAX_MS) return;
    onTap(e.clientX, e.clientY, e.pointerType);
  });
  on(canvas, 'pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons || guide || deleteMode || !selectedType) return;
    const hit = pick(e.clientX, e.clientY, extraTargets());
    if (!hit) return hideGhost();
    if (ghost && belongsTo(hit.object, ghost)) return;
    lastHit = hit;
    const { cand } = candidateFor(hit);
    if (!sameBrick(cand, ghostCand)) showGhost(cand);
  });

  function onTap(x, y, pointerType) {
    if (guide) return guide.tap(x, y);
    if (deleteMode) {
      const hit = pick(x, y);
      if (!hit) return;
      if (hit.brick.type === 'chassis') {
        sfx.wrong();
        toast('The chassis has to stay!');
        return;
      }
      removeBrick(hit.brick);
      undoStack.push({ op: 'remove', brick: hit.brick });
      sfx.pop();
      return;
    }
    if (!selectedType) {
      toast('Pick a brick from the tray first!');
      return;
    }
    const hit = pick(x, y, extraTargets());
    if (!hit) return hideGhost();
    if (ghost && belongsTo(hit.object, ghost)) {
      tryPlace(ghostCand);
      return;
    }
    // With the Passenger Seat selected, tapping a passenger seat swaps who rides instead of stacking on it.
    if (selectedType === 'passengerSeat' && hit.brick?.type === 'passengerSeat') {
      hideGhost();
      chooseRider(hit.brick);
      return;
    }
    lastHit = hit;
    const { cand } = candidateFor(hit);
    if (pointerType === 'mouse' || sameBrick(cand, ghostCand)) tryPlace(cand);
    else showGhost(cand);
  }

  // --- tray, colours and tool buttons ---
  function buildTray() {
    trayTabs.replaceChildren(...TRAY_GROUPS.map(g => el('button', { class: 'tray-tab', 'data-group': g.key, text: g.label })));
    colors.replaceChildren(...COLOR_KEYS.map(key => el('button', {
      class: 'swatch', 'data-color': key, 'aria-label': COLORS[key].name, style: `background:${hexCss(COLORS[key].hex)}`,
    })));
    renderTrayItems();
  }

  function renderTrayItems() {
    const group = TRAY_GROUPS.find(g => g.key === trayGroup);
    tray.replaceChildren(...group.types.map(type => el('button', { class: 'tray-item', 'data-type': type }, [
      el('img', { alt: '' }),
      el('span', { text: BRICK_TYPES[type].name }),
    ])));
    tray.scrollLeft = 0;
    refreshTray();
  }

  function refreshTray() {
    if (disposed) return;
    for (const tab of trayTabs.children) tab.classList.toggle('selected', tab.dataset.group === trayGroup);
    for (const item of tray.children) {
      item.classList.toggle('selected', item.dataset.type === selectedType);
      item.classList.toggle('needed', item.dataset.type === needed?.type);
      item.querySelector('img').src = brickThumbnail(item.dataset.type, selectedColor);
    }
    const colorMatters = needed && !BRICK_TYPES[needed.type].fixedColor;
    for (const swatch of colors.children) {
      swatch.classList.toggle('selected', swatch.dataset.color === selectedColor);
      swatch.classList.toggle('needed', !!colorMatters && swatch.dataset.color === needed.color);
    }
    deleteBtn.classList.toggle('active', deleteMode);
  }

  // Guided mode: open the right tab and highlight the part (and colour) needed next.
  function showNeeded(next) {
    if (disposed) return;
    needed = next;
    const group = next ? groupOf(next.type) : null;
    if (group && group !== trayGroup) {
      trayGroup = group;
      renderTrayItems();
    } else {
      refreshTray();
    }
    tray.querySelector('.tray-item.needed')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  on(trayTabs, 'click', e => {
    const tab = e.target.closest('[data-group]');
    if (!tab) return;
    trayGroup = tab.dataset.group;
    sfx.pop();
    renderTrayItems();
  });

  function updateChecklist() {
    const ready = raceReadiness(bricks);
    checklist.replaceChildren(
      el('h3', { text: 'Ready to race?' }),
      ...Object.entries(NEEDS).map(([key, label]) => el('div', { class: `check ${ready[key] ? 'ok' : ''}`, text: `${ready[key] ? '✅' : '⬜'} ${label[0].toUpperCase()}${label.slice(1)}` })),
    );
    doneBtn.classList.toggle('disabled', !ready.ready);
  }

  on(tray, 'click', e => {
    const item = e.target.closest('.tray-item');
    if (!item) return;
    selectedType = item.dataset.type;
    deleteMode = false;
    sfx.pop();
    refreshTray();
    refreshGhost();
    if (!guide && BRICK_TYPES[selectedType].kind === 'wheel') toast('Tap near a corner of the car');
  });
  on(colors, 'click', e => {
    const swatch = e.target.closest('.swatch');
    if (!swatch) return;
    selectedColor = swatch.dataset.color;
    sfx.pop();
    refreshTray();
    refreshGhost();
  });

  const tools = {
    home: goHome,
    undo() {
      const last = undoStack.pop();
      if (!last) return toast('Nothing to undo');
      if (last.op === 'add') removeBrick(last.brick);
      else addBrick(last.brick);
      sfx.pop();
    },
    rotate() {
      rotation = (rotation + 1) % 4;
      sfx.pop();
      refreshGhost();
    },
    delete() {
      deleteMode = !deleteMode;
      hideGhost();
      refreshTray();
      if (deleteMode) toast('Tap a brick to take it off');
    },
    async clear() {
      if (!(await confirmDialog('Take all the bricks off?'))) return;
      for (const b of [...bricks]) if (b.type !== 'chassis') removeBrick(b);
      undoStack.length = 0;
      hideGhost();
    },
    place() {
      if (ghostCand) tryPlace(ghostCand);
    },
    done: finish,
    speak() {
      guide?.readAloud();
    },
  };
  on(ui, 'click', e => {
    const tool = e.target.closest('[data-tool]')?.dataset.tool;
    if (tool) tools[tool]?.();
  });

  async function finish() {
    const ready = raceReadiness(bricks);
    if (!ready.ready) {
      sfx.wrong();
      toast(`Your car still needs ${Object.keys(NEEDS).filter(k => !ready[k]).map(k => NEEDS[k]).join(' and ')}!`, 3000);
      return;
    }
    const name = await askName(car?.name ?? 'My Car');
    if (name === null) return;
    const saved = app.garage.save({ id: car?.id, name, bricks });
    dirty = false;
    sfx.success();
    app.startRace(saved);
  }

  async function goHome() {
    if (dirty && !(await confirmDialog('Leave without saving your car?', { yes: 'Leave', no: 'Stay' }))) return;
    app.goHome();
  }

  buildTray();
  updateChecklist();
  if (modelKey) {
    guide = createGuide({
      modelKey, scene, carGroup, ui, pick, candidateFor, addBrick, showNeeded,
      selection: () => ({ type: selectedType, color: selectedColor }),
      onComplete: () => celebrate(MODELS[modelKey]),
    });
  }

  async function celebrate(model) {
    const name = await askName(`My ${model.name}`);
    const saved = app.garage.save({ name: name ?? `My ${model.name}`, bricks });
    dirty = false;
    openModal({
      title: 'Your car is ready! 🎉',
      body: [el('img', { class: 'done-img', src: carThumbnail(saved.bricks, `${saved.id}:${saved.updatedAt}`), alt: '' })],
      buttons: [
        { label: '🏠 Home', onClick: () => app.goHome() },
        { label: '🔧 Build more', onClick: () => app.openBuilder({ car: saved }) },
        { label: '🏁 Race it!', kind: 'go', onClick: () => app.startRace(saved) },
      ],
    });
  }

  return {
    scene,
    camera,
    update(dt) {
      orbit.update();
      guide?.update(dt);
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      disposed = true;
      abort.abort();
      orbit.dispose();
      guide?.dispose();
      sun.dispose(); // frees the shadow map on the GPU
      baseplate.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    },
  };
}

// A big green plate with studs, under the car.
function createBaseplate() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.6 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 16), material);
  plate.position.y = -0.1;
  plate.receiveShadow = true;
  group.add(plate);
  const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 12), material, 24 * 32);
  const matrix = new THREE.Matrix4();
  let i = 0;
  for (let x = 0; x < 24; x++) {
    for (let z = 0; z < 32; z++) studs.setMatrixAt(i++, matrix.makeTranslation(-5.75 + x * 0.5, 0.045, -7.75 + z * 0.5));
  }
  studs.receiveShadow = true;
  group.add(studs);
  return group;
}
