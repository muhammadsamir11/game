# Figure Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The child makes his own toy figure on first launch (and friend figures later); his figure drives every car and is named on the podium.

**Architecture:** Two new DOM-free modules (`figures.js` catalogue/normalising/random, `figureStorage.js`) with node:test suites; a Three.js `figureMesh.js` used by the seat brick, thumbnails, showroom and a new figure-maker mode; a figures list screen; `main.js` routes first launch to the maker.

**Tech Stack:** Same as the game: Three.js 0.170.0, ES modules, node:test, Canvas 2D textures for faces and prints.

**Spec:** `docs/superpowers/specs/2026-10-15-figure-builder-design.md`

## Global Constraints

- Everything from the base plan still holds (no build step, pinned CDN versions, DOM-free pure modules, kid-friendly copy, no LEGO branding).
- `figures.js` and `figureStorage.js` must not import `three` or touch the DOM.
- Figures are saved under `localStorage` key `brickRacers.figures.v1` as `{ main: Figure | null, friends: Figure[] }`.
- Names: max 24 characters; blank main → "Me", blank friend → "Friend".
- Crown is always gold (`0xffc107`), space helmet always white (`0xf5f5f5`).
- Faces and prints are drawn with Canvas 2D in code — no image files.
- The main figure cannot be deleted.

## Review Focus

1. **Saved figure data from a newer/older version or hand-edited** (unknown head, missing fields, friends list containing junk) — repaired to defaults, never a crash. Pinned in Task 1 and Task 2.
2. **Changing the head style when the chosen colour doesn't fit the new style** (brown hair → cap, red cap → spiky hair) — the colour snaps to a valid one. Pinned in Task 1.
3. **First launch cancelled** (the child taps Cancel on "What's your name?") — he stays in the maker; the home screen never opens without a main figure. Checked in Task 4.
4. **Stale pictures after changing the figure** — car thumbnails and the seat tray picture show the new driver. Checked in Task 3/5.
5. **Many figure-maker visits** — no growing GPU memory (lights disposed) and no stuck listeners. Checked in Task 4.

## File Map

```
js/figures.js         catalogue, DEFAULT_FIGURE, normaliseFigure, randomFigure, cleanName, headHex, figureKey
js/figureStorage.js   createFigureStore: getMain/saveMain/listFriends/getFriend/saveFriend/removeFriend
js/figureMesh.js      createFigureMesh(figure, { pose, pick })
js/figureMaker.js     the maker mode
js/figuresScreen.js   renderFigures(app)
js/brickMesh.js       setDriverFigure/getDriverVersion; seat draws the figure
js/thumbnails.js      figureThumbnail; seat/car keys include the driver version
js/showroom.js        figure on the turntable
js/race.js            AI drivers, podium uses the player's name
js/ui.js              askName(defaultName, title)
js/main.js            figures store, first-launch routing, My Figures
index.html, css/style.css, README.md
tests/figures.test.js, tests/figureStorage.test.js
```

---

### Task 1: Figure catalogue

**Files:**
- Create: `js/figures.js`
- Test: `tests/figures.test.js`

**Interfaces:**
- Consumes: `COLORS`, `COLOR_KEYS` (bricks.js).
- Produces: `HEADS`, `HAIR_COLORS`, `FACES`, `SKINS`, `PRINTS`, `MAX_NAME`, `DEFAULT_FIGURE`, `headColorOptions(head) → string[]`, `cleanName(name, fallback='Me')`, `normaliseFigure(raw, fallbackName='Me') → Figure`, `randomFigure(seed, name='Friend') → Figure`, `headHex(figure) → number|null`, `figureKey(figure) → string`.
- `Figure = { name, head, headColor (string|null), face, skin, shirt, print, pants, id? }`.

- [ ] **Step 1: Write the failing tests**

`tests/figures.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { HEADS, DEFAULT_FIGURE, headColorOptions, cleanName, normaliseFigure, randomFigure, headHex, figureKey, HAIR_COLORS } from '../js/figures.js';
import { COLOR_KEYS } from '../js/bricks.js';

test('the default figure is already valid', () => {
  assert.deepEqual(normaliseFigure(DEFAULT_FIGURE), { ...DEFAULT_FIGURE });
});

test('unknown or missing choices are repaired to defaults', () => {
  const f = normaliseFigure({ name: '  Sam  ', head: 'rocket', face: 'x', skin: 9, shirt: 'gold', print: null });
  assert.deepEqual(f, { name: 'Sam', head: 'spiky', headColor: 'brown', face: 'happy', skin: 'classic', shirt: 'red', print: 'stripe', pants: 'blue' });
});

test('anything that is not an object becomes the default figure', () => {
  for (const junk of [null, undefined, 'hello', 42, []]) assert.equal(normaliseFigure(junk).head, DEFAULT_FIGURE.head);
});

test('a colour that does not fit the head style snaps to one that does', () => {
  assert.equal(normaliseFigure({ head: 'cap', headColor: 'brown' }).headColor, 'red');
  assert.equal(normaliseFigure({ head: 'spiky', headColor: 'red' }).headColor, 'brown');
  assert.equal(normaliseFigure({ head: 'cap', headColor: 'purple' }).headColor, 'purple');
  assert.equal(normaliseFigure({ head: 'long', headColor: 'ginger' }).headColor, 'ginger');
});

test('crown, space helmet and no hat have no colour choice', () => {
  for (const head of ['crown', 'astronaut', 'none']) {
    assert.deepEqual(headColorOptions(head), []);
    assert.equal(normaliseFigure({ head, headColor: 'red' }).headColor, null);
  }
  assert.deepEqual(headColorOptions('cowboy'), COLOR_KEYS);
  assert.deepEqual(headColorOptions('ponytail'), Object.keys(HAIR_COLORS));
});

test('an id is kept when it is a string', () => {
  assert.equal(normaliseFigure({ id: 'fig-1' }).id, 'fig-1');
  assert.equal('id' in normaliseFigure({ id: 7 }), false);
});

test('names are trimmed to 24 characters and blank names use the fallback', () => {
  assert.equal(cleanName('The Super Duper Mega Fast Racer Kid').length, 24);
  assert.equal(cleanName('   '), 'Me');
  assert.equal(cleanName(undefined, 'Friend'), 'Friend');
  assert.equal(normaliseFigure({ name: '' }, 'Friend').name, 'Friend');
});

test('randomFigure is the same for the same seed and always valid', () => {
  assert.deepEqual(randomFigure(1234), randomFigure(1234));
  const heads = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const f = randomFigure(seed * 7919);
    assert.deepEqual(normaliseFigure(f, 'Friend'), f, `seed ${seed}`);
    heads.add(f.head);
  }
  assert.ok(heads.size >= 5, `only ${heads.size} different heads`);
  assert.equal(randomFigure(2147483647).name, 'Friend');
});

test('headHex gives the colour to paint the hat or hair', () => {
  assert.equal(headHex(normaliseFigure({ head: 'crown' })), 0xffc107);
  assert.equal(headHex(normaliseFigure({ head: 'astronaut' })), 0xf5f5f5);
  assert.equal(headHex(normaliseFigure({ head: 'spiky', headColor: 'brown' })), HAIR_COLORS.brown.hex);
  assert.equal(headHex(normaliseFigure({ head: 'none' })), null);
  assert.equal(HEADS.crown.kind, 'fixed');
});

test('figureKey changes when any look choice changes but not with the name', () => {
  const a = normaliseFigure({ name: 'A' });
  assert.equal(figureKey(a), figureKey({ ...a, name: 'B' }));
  assert.notEqual(figureKey(a), figureKey({ ...a, print: 'star' }));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/figures.js`.

- [ ] **Step 3: Write `js/figures.js`**

```js
import { COLORS, COLOR_KEYS } from './bricks.js';

// Everything the child can choose for a figure. Keys are what gets saved.
export const HEADS = {
  none: { name: 'No Hat', kind: 'bare' },
  spiky: { name: 'Spiky Hair', kind: 'hair' },
  long: { name: 'Long Hair', kind: 'hair' },
  ponytail: { name: 'Ponytail', kind: 'hair' },
  cap: { name: 'Cap', kind: 'hat' },
  racing: { name: 'Racing Helmet', kind: 'hat' },
  cowboy: { name: 'Cowboy Hat', kind: 'hat' },
  crown: { name: 'Crown', kind: 'fixed', hex: 0xffc107 },
  astronaut: { name: 'Space Helmet', kind: 'fixed', hex: 0xf5f5f5 },
};

export const HAIR_COLORS = {
  black: { name: 'Black', hex: 0x2b2b2b },
  brown: { name: 'Brown', hex: 0x6d4c41 },
  blonde: { name: 'Blonde', hex: 0xf2c94c },
  ginger: { name: 'Ginger', hex: 0xd9692b },
  blue: { name: 'Blue', hex: 0x42a5f5 },
};

export const FACES = {
  happy: { name: 'Happy' },
  grin: { name: 'Big Grin' },
  sunglasses: { name: 'Cool Shades' },
  silly: { name: 'Silly' },
  determined: { name: 'Determined' },
  surprised: { name: 'Surprised' },
};

export const SKINS = {
  classic: { name: 'Toy Yellow', hex: 0xffd23f },
  light: { name: 'Light', hex: 0xf6d2b8 },
  tan: { name: 'Tan', hex: 0xd9a77a },
  brown: { name: 'Brown', hex: 0x8d5a3b },
  dark: { name: 'Dark', hex: 0x5a3825 },
};

export const PRINTS = {
  plain: { name: 'Plain' },
  stripe: { name: 'Racing Stripe' },
  star: { name: 'Star' },
  flame: { name: 'Flame' },
  badge: { name: 'Police Badge' },
  lightning: { name: 'Lightning' },
};

export const MAX_NAME = 24;
export const DEFAULT_FIGURE = Object.freeze({
  name: 'Me', head: 'spiky', headColor: 'brown', face: 'happy', skin: 'classic', shirt: 'red', print: 'stripe', pants: 'blue',
});

export function headColorOptions(head) {
  const kind = HEADS[head]?.kind;
  if (kind === 'hair') return Object.keys(HAIR_COLORS);
  if (kind === 'hat') return COLOR_KEYS;
  return [];
}

export function cleanName(name, fallback = 'Me') {
  return String(name ?? '').trim().slice(0, MAX_NAME) || fallback;
}

const pickKey = (table, value, fallback) => (typeof value === 'string' && Object.hasOwn(table, value) ? value : fallback);

// Turns anything (old saves, junk, partial objects) into a complete, valid figure.
export function normaliseFigure(raw, fallbackName = 'Me') {
  const f = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const head = pickKey(HEADS, f.head, DEFAULT_FIGURE.head);
  const colors = headColorOptions(head);
  let headColor = null;
  if (colors.length) headColor = colors.includes(f.headColor) ? f.headColor : colors.includes(DEFAULT_FIGURE.headColor) ? DEFAULT_FIGURE.headColor : colors[0];
  const figure = {
    name: cleanName(f.name, fallbackName),
    head,
    headColor,
    face: pickKey(FACES, f.face, DEFAULT_FIGURE.face),
    skin: pickKey(SKINS, f.skin, DEFAULT_FIGURE.skin),
    shirt: pickKey(COLORS, f.shirt, DEFAULT_FIGURE.shirt),
    print: pickKey(PRINTS, f.print, DEFAULT_FIGURE.print),
    pants: pickKey(COLORS, f.pants, DEFAULT_FIGURE.pants),
  };
  if (typeof f.id === 'string') figure.id = f.id;
  return figure;
}

function random(seed) {
  let s = ((Math.floor(seed) >>> 0) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function randomFigure(seed, name = 'Friend') {
  const r = random(seed);
  const pick = keys => keys[Math.floor(r() * keys.length)];
  const head = pick(Object.keys(HEADS));
  const colors = headColorOptions(head);
  return normaliseFigure({
    name,
    head,
    headColor: colors.length ? pick(colors) : null,
    face: pick(Object.keys(FACES)),
    skin: pick(Object.keys(SKINS)),
    shirt: pick(COLOR_KEYS),
    print: pick(Object.keys(PRINTS)),
    pants: pick(COLOR_KEYS),
  }, name);
}

export function headHex(figure) {
  const head = HEADS[figure.head];
  if (head.kind === 'fixed') return head.hex;
  if (head.kind === 'hair') return HAIR_COLORS[figure.headColor].hex;
  if (head.kind === 'hat') return COLORS[figure.headColor].hex;
  return null;
}

// Identifies how a figure looks (not its name), for picture caches.
export function figureKey(f) {
  return [f.head, f.headColor, f.face, f.skin, f.shirt, f.print, f.pants].join(':');
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 10 new tests plus the existing 88.

- [ ] **Step 5: Commit**

```bash
git add js/figures.js tests/figures.test.js
git commit -m "feat: figure catalogue with repair and random figures"
```

---

### Task 2: Figure storage

**Files:**
- Create: `js/figureStorage.js`
- Test: `tests/figureStorage.test.js`

**Interfaces:**
- Consumes: `normaliseFigure` (figures.js).
- Produces: `FIGURES_KEY`, `createFigureStore(storage) → { getMain() → Figure|null, saveMain(fig) → Figure (id 'main'), listFriends() → Figure[], getFriend(id) → Figure|null, saveFriend(fig) → Figure (new id unless fig.id is an existing friend id), removeFriend(id) }`. All return copies.

- [ ] **Step 1: Write the failing tests**

`tests/figureStorage.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFigureStore, FIGURES_KEY } from '../js/figureStorage.js';
import { DEFAULT_FIGURE } from '../js/figures.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

test('a new store has no main figure and no friends (first launch)', () => {
  const store = createFigureStore(memoryStorage());
  assert.equal(store.getMain(), null);
  assert.deepEqual(store.listFriends(), []);
});

test('the main figure is saved and comes back after reopening', () => {
  const storage = memoryStorage();
  createFigureStore(storage).saveMain({ ...DEFAULT_FIGURE, name: 'Sam', face: 'grin' });
  const main = createFigureStore(storage).getMain();
  assert.equal(main.id, 'main');
  assert.equal(main.name, 'Sam');
  assert.equal(main.face, 'grin');
});

test('blank names become "Me" for the main figure and "Friend" for friends', () => {
  const store = createFigureStore(memoryStorage());
  assert.equal(store.saveMain({ name: ' ' }).name, 'Me');
  assert.equal(store.saveFriend({ name: '' }).name, 'Friend');
});

test('friends can be added, changed and deleted', () => {
  const store = createFigureStore(memoryStorage());
  const a = store.saveFriend({ name: 'Ana' });
  const b = store.saveFriend({ name: 'Ben' });
  assert.notEqual(a.id, b.id);
  store.saveFriend({ ...a, name: 'Ana 2' });
  assert.deepEqual(store.listFriends().map(f => f.name), ['Ana 2', 'Ben']);
  store.removeFriend(b.id);
  assert.deepEqual(store.listFriends().map(f => f.name), ['Ana 2']);
  assert.equal(store.getFriend(b.id), null);
});

test('the main figure cannot be deleted or saved as a friend', () => {
  const store = createFigureStore(memoryStorage());
  store.saveMain({ name: 'Sam' });
  store.removeFriend('main');
  assert.equal(store.getMain().name, 'Sam');
  const friend = store.saveFriend({ id: 'main', name: 'Copy' });
  assert.notEqual(friend.id, 'main');
});

test('returned figures are copies', () => {
  const store = createFigureStore(memoryStorage());
  store.saveMain({ name: 'Sam' });
  store.getMain().name = 'Changed';
  assert.equal(store.getMain().name, 'Sam');
});

test('broken JSON means no figures (the first-launch maker runs again)', () => {
  const store = createFigureStore(memoryStorage({ [FIGURES_KEY]: '{oops' }));
  assert.equal(store.getMain(), null);
  assert.deepEqual(store.listFriends(), []);
});

test('saved figures with unknown choices are repaired; junk friends are skipped', () => {
  const raw = { main: { name: 'Sam', head: 'jetpack', face: 'grin' }, friends: [{ id: 'f1', name: 'Ana', skin: 'green' }, null, 'junk', 5] };
  const store = createFigureStore(memoryStorage({ [FIGURES_KEY]: JSON.stringify(raw) }));
  assert.equal(store.getMain().head, DEFAULT_FIGURE.head);
  assert.equal(store.getMain().face, 'grin');
  assert.deepEqual(store.listFriends().map(f => [f.id, f.skin]), [['f1', DEFAULT_FIGURE.skin]]);
});

test('a friends list that is not an array is ignored', () => {
  const store = createFigureStore(memoryStorage({ [FIGURES_KEY]: JSON.stringify({ main: null, friends: 'nope' }) }));
  assert.deepEqual(store.listFriends(), []);
});

test('when storage refuses to save, figures still work for this visit', () => {
  const store = createFigureStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } });
  store.saveMain({ name: 'Sam' });
  assert.equal(store.getMain().name, 'Sam');
});

test('works with no storage at all', () => {
  const store = createFigureStore(null);
  store.saveFriend({ name: 'Ana' });
  assert.equal(store.listFriends().length, 1);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/figureStorage.js`.

- [ ] **Step 3: Write `js/figureStorage.js`**

```js
import { normaliseFigure } from './figures.js';

export const FIGURES_KEY = 'brickRacers.figures.v1';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const newId = () => `fig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

function load(storage) {
  try {
    const data = JSON.parse(storage?.getItem(FIGURES_KEY) ?? 'null');
    if (!isObject(data)) return { main: null, friends: [] };
    const main = isObject(data.main) ? { ...normaliseFigure(data.main, 'Me'), id: 'main' } : null;
    const friends = Array.isArray(data.friends)
      ? data.friends.filter(isObject).map(f => ({ ...normaliseFigure(f, 'Friend'), id: typeof f.id === 'string' && f.id !== 'main' ? f.id : newId() }))
      : [];
    return { main, friends };
  } catch {
    return { main: null, friends: [] };
  }
}

const copy = f => (f ? { ...f } : null);

export function createFigureStore(storage = defaultStorage()) {
  const data = load(storage);

  function persist() {
    try {
      storage?.setItem(FIGURES_KEY, JSON.stringify(data));
    } catch {
      // Storage is full or blocked: keep the figures in memory for this visit.
    }
  }

  return {
    getMain: () => copy(data.main),
    saveMain(figure) {
      data.main = { ...normaliseFigure(figure, 'Me'), id: 'main' };
      persist();
      return copy(data.main);
    },
    listFriends: () => data.friends.map(copy),
    getFriend: id => copy(data.friends.find(f => f.id === id)),
    saveFriend(figure) {
      const known = typeof figure?.id === 'string' && data.friends.some(f => f.id === figure.id);
      const saved = { ...normaliseFigure(figure, 'Friend'), id: known ? figure.id : newId() };
      const index = data.friends.findIndex(f => f.id === saved.id);
      if (index >= 0) data.friends[index] = saved;
      else data.friends.push(saved);
      persist();
      return copy(saved);
    },
    removeFriend(id) {
      data.friends = data.friends.filter(f => f.id !== id);
      persist();
    },
  };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 11 new tests plus all earlier ones.

- [ ] **Step 5: Commit**

```bash
git add js/figureStorage.js tests/figureStorage.test.js
git commit -m "feat: save the main figure and friend figures"
```

---
### Task 3: 3D figure, driver in the seat, figure pictures

**Files:**
- Create: `js/figureMesh.js`
- Modify: `js/brickMesh.js` (driver in the seat), `js/thumbnails.js` (figure pictures, driver-aware cache keys)

**Interfaces:**
- Consumes: figures.js (`SKINS`, `normaliseFigure`, `headHex`, `figureKey`), `COLORS` (bricks.js).
- Produces:
  - `figureMesh.js`: `FIGURE` (sizes), `createFigureMesh(figure, { pose = 'stand' | 'sit', pick = m => m }) → THREE.Group`. Standing: origin at the feet. Sitting: origin at the hips (put it on the seat top). Faces +z. The head group has `userData.part = 'head'`.
  - `brickMesh.js`: `setDriverFigure(figure)`, `getDriverVersion() → number`; `createBrickMesh(brick, { ghost, driver })` and `createCarMesh(bricks, { includeWheels, driver })` — the seat draws `driver ?? the figure set by setDriverFigure ?? DEFAULT_FIGURE`.
  - `thumbnails.js`: `figureThumbnail(figure, part = 'body' | 'head') → dataURL`; `brickThumbnail('seat', …)` and `carThumbnail` caches include the driver version.

- [ ] **Step 1: Write `js/figureMesh.js`**

```js
import * as THREE from 'three';
import { COLORS } from './bricks.js';
import { SKINS, normaliseFigure, headHex } from './figures.js';

// Figure sizes in metres (a brick is 0.6 m tall, a stud 0.5 m wide).
export const FIGURE = { legH: 0.36, hipH: 0.06, torsoH: 0.32, headH: 0.2, headR: 0.12, width: 0.44, depth: 0.22 };

const geometries = new Map();
const materials = new Map();
const textures = new Map();
const cached = (map, key, make) => {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
};
const geo = (key, make) => cached(geometries, key, make);
const mat = (hex, extra = {}) => cached(materials, `${hex}:${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4, ...extra }));
const css = hex => '#' + hex.toString(16).padStart(6, '0');

function canvasTexture(key, width, height, draw) {
  return cached(textures, key, () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

// The head is a cylinder whose texture wraps all the way round: the face is drawn in the middle (x = 256), which is the front.
function faceTexture(face, skin) {
  return canvasTexture(`face:${face}:${skin}`, 512, 128, g => {
    g.fillStyle = css(skin);
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#1b1b1b';
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 6;
    g.lineCap = 'round';
    const cx = 256;
    const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    const eyes = (r = 7) => { dot(cx - 18, 50, r); dot(cx + 18, 50, r); };
    const smile = () => { g.beginPath(); g.arc(cx, 64, 22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); };
    switch (face) {
      case 'grin':
        eyes();
        g.beginPath(); g.moveTo(cx - 26, 72); g.quadraticCurveTo(cx, 110, cx + 26, 72); g.closePath(); g.fill();
        g.fillStyle = '#ffffff'; g.fillRect(cx - 18, 74, 36, 7);
        break;
      case 'sunglasses':
        g.fillRect(cx - 36, 42, 72, 7);
        g.beginPath(); g.ellipse(cx - 18, 52, 15, 11, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(cx + 18, 52, 15, 11, 0, 0, Math.PI * 2); g.fill();
        smile();
        break;
      case 'silly':
        dot(cx - 18, 50, 7);
        g.beginPath(); g.moveTo(cx + 10, 50); g.lineTo(cx + 26, 50); g.stroke();
        smile();
        g.fillStyle = '#e53935'; g.beginPath(); g.ellipse(cx + 6, 92, 9, 12, 0, 0, Math.PI * 2); g.fill();
        break;
      case 'determined':
        eyes(6);
        g.beginPath(); g.moveTo(cx - 30, 32); g.lineTo(cx - 8, 40); g.moveTo(cx + 30, 32); g.lineTo(cx + 8, 40); g.stroke();
        g.beginPath(); g.moveTo(cx - 16, 84); g.lineTo(cx + 16, 84); g.stroke();
        break;
      case 'surprised':
        dot(cx - 18, 48, 10); dot(cx + 18, 48, 10);
        g.beginPath(); g.ellipse(cx, 88, 10, 13, 0, 0, Math.PI * 2); g.fill();
        break;
      default: // happy
        eyes();
        smile();
    }
  });
}

function star(g, x, y, outer, inner, points = 5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

// Drawn on the front of the torso.
function printTexture(print, shirt) {
  return canvasTexture(`print:${print}:${shirt}`, 128, 104, g => {
    g.fillStyle = css(shirt);
    g.fillRect(0, 0, 128, 104);
    switch (print) {
      case 'stripe':
        g.fillStyle = '#ffffff';
        g.fillRect(44, 0, 12, 104);
        g.fillRect(72, 0, 12, 104);
        break;
      case 'star':
        g.fillStyle = '#fdd835';
        star(g, 64, 52, 34, 14);
        break;
      case 'flame':
        g.fillStyle = '#fb8c00';
        g.beginPath(); g.moveTo(10, 104);
        for (const [x, y] of [[22, 50], [36, 80], [50, 30], [64, 76], [78, 24], [92, 78], [106, 46], [118, 104]]) g.lineTo(x, y);
        g.fill();
        g.fillStyle = '#fdd835';
        g.beginPath(); g.moveTo(30, 104);
        for (const [x, y] of [[44, 70], [56, 88], [66, 58], [76, 90], [90, 66], [100, 104]]) g.lineTo(x, y);
        g.fill();
        break;
      case 'badge':
        g.fillStyle = '#ffc107';
        g.beginPath(); g.moveTo(36, 22); g.lineTo(60, 22); g.lineTo(60, 44); g.quadraticCurveTo(48, 60, 36, 44); g.closePath(); g.fill();
        g.fillStyle = '#1e3a8a';
        star(g, 48, 36, 8, 3.5);
        break;
      case 'lightning':
        g.fillStyle = '#fdd835';
        g.beginPath();
        for (const [x, y] of [[74, 6], [40, 58], [62, 58], [50, 98], [90, 42], [68, 42], [84, 6]]) g.lineTo(x, y);
        g.closePath();
        g.fill();
        break;
      default: // plain
    }
  });
}

// A box whose top is a little narrower than its bottom, like a toy figure's chest.
function torsoGeometry() {
  const g = new THREE.BoxGeometry(FIGURE.width, FIGURE.torsoH, FIGURE.depth);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setX(i, pos.getX(i) * 0.8);
  g.computeVertexNormals();
  return g;
}

// A sphere with the front cut out, so the face shows through.
const openHelmet = (r, key) => geo(key, () => new THREE.SphereGeometry(r, 24, 14, 0.75 * Math.PI, 1.5 * Math.PI, 0, 0.62 * Math.PI));

function addHeadgear(head, f, add) {
  const hex = headHex(f);
  if (hex === null) return;
  const m = mat(hex);
  const H = FIGURE.headH;
  const R = FIGURE.headR;
  const cap = () => add(head, geo('hairCap', () => new THREE.SphereGeometry(R + 0.012, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, H * 0.72, 0);
  switch (f.head) {
    case 'spiky':
      cap();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spike = add(head, geo('spike', () => new THREE.ConeGeometry(0.045, 0.12, 8)), m, Math.sin(a) * 0.07, H * 0.72 + 0.09, Math.cos(a) * 0.07 - 0.01);
        spike.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      }
      add(head, geo('spike', () => new THREE.ConeGeometry(0.045, 0.12, 8)), m, 0, H * 0.72 + 0.13, 0);
      break;
    case 'long':
      cap();
      add(head, geo('longHair', () => new THREE.BoxGeometry(0.27, 0.27, 0.07)), m, 0, H * 0.45, -R + 0.01);
      break;
    case 'ponytail': {
      cap();
      const tail = add(head, geo('tail', () => new THREE.CylinderGeometry(0.035, 0.05, 0.18, 10)), m, 0, H * 0.55, -R - 0.06);
      tail.rotation.x = 0.6;
      break;
    }
    case 'cap':
      add(head, geo('capTop', () => new THREE.SphereGeometry(R + 0.015, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, H * 0.75, 0);
      add(head, geo('capBrim', () => new THREE.BoxGeometry(0.2, 0.02, 0.14)), m, 0, H * 0.78, R + 0.04);
      break;
    case 'racing':
      add(head, openHelmet(0.165, 'racingHelmet'), mat(hex, { side: THREE.DoubleSide }), 0, H * 0.6, 0);
      add(head, geo('racingStripe', () => new THREE.BoxGeometry(0.04, 0.02, 0.3)), mat(0xffffff), 0, H * 0.6 + 0.165, -0.02);
      break;
    case 'astronaut':
      add(head, openHelmet(0.19, 'spaceHelmet'), mat(hex, { side: THREE.DoubleSide }), 0, H * 0.55, 0);
      add(head, geo('spaceVisor', () => new THREE.SphereGeometry(0.185, 20, 12, 0.25 * Math.PI, 0.5 * Math.PI, 0.15 * Math.PI, 0.5 * Math.PI)),
        mat(0x1e3a8a, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }), 0, H * 0.55, 0);
      break;
    case 'cowboy':
      add(head, geo('cowboyBrim', () => new THREE.CylinderGeometry(0.26, 0.26, 0.02, 24)), m, 0, H * 0.82, 0);
      add(head, geo('cowboyTop', () => new THREE.CylinderGeometry(0.11, 0.13, 0.13, 20)), m, 0, H * 0.82 + 0.075, 0);
      break;
    case 'crown':
      add(head, geo('crownRing', () => new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.07, 20, 1, true)), mat(hex, { side: THREE.DoubleSide, metalness: 0.6, roughness: 0.3 }), 0, H + 0.02, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(head, geo('crownPoint', () => new THREE.ConeGeometry(0.025, 0.06, 6)), mat(hex, { metalness: 0.6, roughness: 0.3 }), Math.sin(a) * R, H + 0.08, Math.cos(a) * R);
      }
      break;
  }
}

export function createFigureMesh(raw, { pose = 'stand', pick = m => m } = {}) {
  const f = normaliseFigure(raw);
  const skin = SKINS[f.skin].hex;
  const shirtMat = mat(COLORS[f.shirt].hex);
  const pantsMat = mat(COLORS[f.pants].hex);
  const skinMat = mat(skin);
  const root = new THREE.Group();
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, Array.isArray(material) ? material.map(pick) : pick(material));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const sit = pose === 'sit';
  const hipY = sit ? 0 : FIGURE.legH;

  // Legs hang from the hips; sitting swings them forward (+z).
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11, hipY, 0);
    add(leg, geo('leg', () => new THREE.BoxGeometry(0.2, FIGURE.legH, FIGURE.depth)), pantsMat, 0, -FIGURE.legH / 2, 0);
    if (sit) leg.rotation.x = -Math.PI / 2;
    root.add(leg);
  }
  add(root, geo('hips', () => new THREE.BoxGeometry(FIGURE.width, FIGURE.hipH, FIGURE.depth)), pantsMat, 0, hipY + FIGURE.hipH / 2, 0);

  const torsoY = hipY + FIGURE.hipH;
  const printMat = cached(materials, `printMat:${f.print}:${f.shirt}`, () => new THREE.MeshStandardMaterial({ map: printTexture(f.print, COLORS[f.shirt].hex), roughness: 0.4 }));
  // BoxGeometry face order: +x, -x, +y, -y, +z (front), -z.
  add(root, geo('torso', torsoGeometry), [shirtMat, shirtMat, shirtMat, shirtMat, printMat, shirtMat], 0, torsoY + FIGURE.torsoH / 2, 0);

  // Arms hang from the shoulders; sitting reaches forward to the steering wheel.
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.235, torsoY + FIGURE.torsoH - 0.05, 0);
    add(arm, geo('arm', () => new THREE.CylinderGeometry(0.055, 0.06, 0.28, 10)), shirtMat, 0, -0.14, 0);
    add(arm, geo('hand', () => new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10)), skinMat, 0, -0.3, 0.02);
    arm.rotation.z = side * 0.12;
    if (sit) arm.rotation.x = -1.0;
    root.add(arm);
  }

  const neckY = torsoY + FIGURE.torsoH;
  add(root, geo('neck', () => new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10)), skinMat, 0, neckY + 0.015, 0);
  const head = new THREE.Group();
  head.position.y = neckY + 0.03;
  head.userData.part = 'head';
  root.add(head);
  const faceMat = cached(materials, `faceMat:${f.face}:${f.skin}`, () => new THREE.MeshStandardMaterial({ map: faceTexture(f.face, skin), roughness: 0.5 }));
  // thetaStart = π puts the texture seam at the back, so the middle of the texture (the face) is at the front.
  add(head, geo('head', () => new THREE.CylinderGeometry(FIGURE.headR, FIGURE.headR, FIGURE.headH, 24, 1, false, Math.PI)), [faceMat, skinMat, skinMat], 0, FIGURE.headH / 2, 0);
  add(head, geo('headStud', () => new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14)), skinMat, 0, FIGURE.headH + 0.025, 0);
  addHeadgear(head, f, add);
  return root;
}
```

- [ ] **Step 2: Put the driver in the seat (`js/brickMesh.js`)**

Add the import below the existing imports:
```js
import { createFigureMesh } from './figureMesh.js';
import { DEFAULT_FIGURE } from './figures.js';
```

Add below the `box` helper:
```js
// The figure who drives every seat unless a car brings its own driver (AI cars do).
let driverFigure = DEFAULT_FIGURE;
let driverVersion = 0;
export function setDriverFigure(figure) {
  driverFigure = figure ?? DEFAULT_FIGURE;
  driverVersion++;
}
export const getDriverVersion = () => driverVersion;
```

Replace:
```js
export function createBrickMesh(brick, { ghost = null } = {}) {
```
with:
```js
export function createBrickMesh(brick, { ghost = null, driver = null } = {}) {
```

Replace the three driver lines in `case 'seat':`:
```js
      add(geo('driver:body', () => box(0.4, 0.32, 0.24)), fixed('shirt', { color: 0x1e88e5, roughness: 0.6 }), 0, LAYER + 0.16, 0);
      add(geo('driver:head', () => new THREE.CylinderGeometry(0.12, 0.12, 0.2, 16)), fixed('skin', { color: 0xffd23f, roughness: 0.5 }), 0, LAYER + 0.43, 0);
      add(geo('driver:helmet', () => new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), paint, 0, LAYER + 0.5, 0);
      break;
```
with:
```js
      {
        const figure = createFigureMesh(driver ?? driverFigure, { pose: 'sit', pick });
        figure.position.set(0, LAYER, 0.02);
        if (ghost !== null) figure.traverse(node => { node.castShadow = false; });
        group.add(figure);
      }
      break;
```

Replace:
```js
export function createCarMesh(bricks, { includeWheels = true } = {}) {
  const car = new THREE.Group();
  for (const b of bricks) {
    if (includeWheels || BRICK_TYPES[b.type]?.kind !== 'wheel') car.add(createBrickMesh(b));
  }
```
with:
```js
export function createCarMesh(bricks, { includeWheels = true, driver = null } = {}) {
  const car = new THREE.Group();
  for (const b of bricks) {
    if (includeWheels || BRICK_TYPES[b.type]?.kind !== 'wheel') car.add(createBrickMesh(b, { driver }));
  }
```

- [ ] **Step 3: Figure pictures (`js/thumbnails.js`)**

Replace the import line:
```js
import { createBrickMesh, createCarMesh } from './brickMesh.js';
```
with:
```js
import { createBrickMesh, createCarMesh, getDriverVersion } from './brickMesh.js';
import { createFigureMesh } from './figureMesh.js';
import { normaliseFigure, figureKey } from './figures.js';
```

Replace `function snapshot(object) {` and its bounds lines:
```js
function snapshot(object) {
  if (!renderer) setup();
  scene.add(object);
  const bounds = new THREE.Box3().setFromObject(object);
```
with:
```js
// `focus` is the part of the object the camera frames (a figure's head for head/face tiles).
function snapshot(object, focus = object) {
  if (!renderer) setup();
  scene.add(object);
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(focus);
```

Replace the two exported functions with:
```js
export function brickThumbnail(type, color) {
  const key = `brick:${type}:${color}:${type === 'seat' ? getDriverVersion() : 0}`;
  if (!cache.has(key)) cache.set(key, snapshot(createBrickMesh({ type, color, x: 0, y: 0, z: 0, r: 0 })));
  return cache.get(key);
}

export function carThumbnail(bricks, cacheKey) {
  const key = `car:${cacheKey}:${getDriverVersion()}`;
  if (!cache.has(key)) cache.set(key, snapshot(createCarMesh(bricks)));
  return cache.get(key);
}

export function figureThumbnail(figure, part = 'body') {
  const f = normaliseFigure(figure);
  const key = `figure:${figureKey(f)}:${part}`;
  if (!cache.has(key)) {
    const mesh = createFigureMesh(f);
    let focus = mesh;
    if (part === 'head') mesh.traverse(node => { if (node.userData.part === 'head') focus = node; });
    cache.set(key, snapshot(mesh, focus));
  }
  return cache.get(key);
}
```

- [ ] **Step 4: Check it in the browser**

Start the dev server (`brick-racers` in the browser pane) and reload http://localhost:8080. In the console:

```js
const { figureThumbnail } = await import('/js/thumbnails.js');
const { HEADS, FACES, PRINTS, SKINS } = await import('/js/figures.js');
const pics = [
  ...Object.keys(HEADS).map(head => figureThumbnail({ head, headColor: 'blue' }, 'head')),
  ...Object.keys(FACES).map(face => figureThumbnail({ face }, 'head')),
  ...Object.keys(PRINTS).map(print => figureThumbnail({ print, shirt: 'green' })),
  ...Object.keys(SKINS).map(skin => figureThumbnail({ skin })),
];
const strip = document.createElement('div');
strip.style = 'position:fixed;inset:0;z-index:99;background:#fff;display:flex;flex-wrap:wrap;gap:4px;padding:8px;overflow:auto';
for (const src of pics) { const img = new Image(); img.src = src; img.width = 110; strip.append(img); }
document.body.append(strip);
```

Expected: 26 pictures, no console errors:
- 9 heads: no hat (bare stud), spiky, long, ponytail, cap, racing helmet with the face visible, cowboy, gold crown, white space helmet with a blue visor;
- 6 distinct faces, facing the camera (not on the back of the head);
- 6 shirt prints on the chest front;
- 5 skin tones.

Remove the strip (`strip.remove()`), open the workshop and check the **Seat + Driver** tray picture and a placed seat: the default figure (spiky brown hair, red striped shirt) sits on the seat with legs forward and arms reaching forward. On the home turntable, the demo car's driver is the same figure.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/figureMesh.js js/brickMesh.js js/thumbnails.js
git commit -m "feat: 3D toy figure that drives every seat"
```

---
### Task 4: Figure maker, My Figures screen and first launch

**Files:**
- Create: `js/figureMaker.js`, `js/figuresScreen.js`
- Modify: `index.html` (figure + figures screens, home button), `css/style.css`, `js/ui.js` (`askName` title), `js/main.js` (figures store, routing)

**Interfaces:**
- Consumes: figures.js, figureStorage.js, `createFigureMesh` (figureMesh.js), `figureThumbnail` (thumbnails.js), `setDriverFigure` (brickMesh.js), ui.js, audio.js.
- Produces:
  - `createFigureMaker(app, { figure, first, isMain, onSave(figure) }) → Mode`.
  - `renderFigures(app)`.
  - `askName(defaultName, title = 'Name your car')`.
  - `app.figures` (the figure store); `app.openFigures()`; `app.openFigureMaker({ id = 'main', first = false })` where `id` is `'main'`, a friend id, or `null` for a new friend.

- [ ] **Step 1: Screens in `index.html`**

Replace:
```html
    <button class="big-btn garage" data-action="garage">🚗 My Garage</button>
  </section>
```
with:
```html
    <button class="big-btn garage" data-action="garage">🚗 My Garage</button>
    <button class="big-btn figures" data-action="figures">👤 My Figures</button>
  </section>

  <section id="figures" class="screen hidden">
    <header class="bar">
      <button class="icon-btn" data-action="home" aria-label="Home">🏠</button>
      <h2>My Figures</h2>
    </header>
    <div id="figures-list" class="garage-list"></div>
  </section>

  <section id="figure" class="screen hidden passthrough">
    <header class="bar">
      <button class="icon-btn" data-fig="home" aria-label="Home">🏠</button>
      <h2 class="fig-title">Make your figure!</h2>
    </header>
    <div class="fig-panel card">
      <div class="fig-tabs">
        <button data-tab="head">Head</button>
        <button data-tab="face">Face</button>
        <button data-tab="skin">Skin</button>
        <button data-tab="shirt">Shirt</button>
        <button data-tab="pants">Pants</button>
      </div>
      <div id="fig-tiles" class="fig-tiles"></div>
      <div id="fig-colors" class="fig-colors"></div>
    </div>
    <footer class="fig-actions">
      <button class="tool-btn" data-fig="random">🎲<small>Surprise me</small></button>
      <button class="go-btn" data-fig="done">✓ Done</button>
    </footer>
  </section>
```

- [ ] **Step 2: Styles (append to `css/style.css`)**

```css
/* Figures */
.big-btn.figures { background: #8e24aa; }
#figures { display: flex; flex-direction: column; gap: 16px; background: rgba(143, 211, 255, 0.55); }
#figure { display: flex; flex-direction: column; }
.fig-panel { position: absolute; top: 90px; right: 12px; bottom: 104px; width: min(440px, 50vw); display: flex; flex-direction: column; gap: 10px; }
.fig-tabs { display: flex; gap: 6px; }
.fig-tabs button { flex: 1; height: 52px; border-radius: 14px; font-size: 17px; font-weight: 700; background: #eceff1; }
.fig-tabs button.selected { color: #fff; background: var(--blue); }
.fig-tiles { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; align-content: start; overflow-y: auto; touch-action: pan-y; }
.fig-tile { display: flex; flex-direction: column; align-items: center; padding: 6px; font-size: 13px; font-weight: 600; background: #f5f9ff; border: 4px solid transparent; border-radius: 16px; }
.fig-tile img { width: 84px; height: 84px; }
.fig-tile.selected { border-color: var(--blue); background: #e3f2fd; }
.fig-colors { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.fig-colors .swatch.big { width: 68px; height: 68px; }
.fig-actions { position: absolute; left: 12px; right: 12px; bottom: max(16px, env(safe-area-inset-bottom)); display: flex; justify-content: flex-end; gap: 12px; }
@media (max-width: 760px), (max-height: 600px) {
  .fig-tile img { width: 64px; height: 64px; }
  .fig-panel { bottom: 92px; }
}
```

- [ ] **Step 3: Let `askName` take a title (`js/ui.js`)**

Replace:
```js
export function askName(defaultName) {
```
with:
```js
export function askName(defaultName, title = 'Name your car') {
```
and inside it replace:
```js
      title: 'Name your car',
```
with:
```js
      title,
```

- [ ] **Step 4: Write `js/figureMaker.js`**

```js
import * as THREE from 'three';
import { COLORS, COLOR_KEYS } from './bricks.js';
import { HEADS, FACES, SKINS, PRINTS, HAIR_COLORS, headColorOptions, normaliseFigure, randomFigure, cleanName } from './figures.js';
import { createFigureMesh } from './figureMesh.js';
import { figureThumbnail } from './thumbnails.js';
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

  // --- 3D: the figure on a podium, on the left of the screen ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6fbf5f, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 5, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(20, 32), new THREE.MeshStandardMaterial({ color: 0x6fcf5f }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const turntable = new THREE.Group();
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.3, 32), new THREE.MeshStandardMaterial({ color: 0xfdd835 }));
  podium.position.y = 0.15;
  podium.receiveShadow = true;
  turntable.add(podium);
  scene.add(turntable);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  let mesh = null;

  function rebuild() {
    if (mesh) turntable.remove(mesh);
    mesh = createFigureMesh(current);
    mesh.position.y = 0.3;
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
      if (JSON.stringify(current) !== original && !(await confirmDialog('Leave without saving?', { yes: 'Leave', no: 'Stay' }))) return;
      app.openFigures();
    }
  });

  rebuild();

  return {
    scene,
    camera,
    update(dt) {
      if (dragX === null) turntable.rotation.y += dt * 0.5;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Landscape: aim right of the figure so it stands left of the choices panel.
      const shift = w > h ? 0.75 : 0;
      camera.position.set(shift, 0.95, 3.6);
      camera.lookAt(shift, 0.75, 0);
    },
    dispose() {
      abort.abort();
      sun.dispose();
      for (const thing of [ground, podium]) {
        thing.geometry.dispose();
        thing.material.dispose();
      }
    },
  };
}
```

- [ ] **Step 5: Write `js/figuresScreen.js`**

```js
import { $, el, confirmDialog } from './ui.js';
import { figureThumbnail } from './thumbnails.js';

export function renderFigures(app) {
  const main = app.figures.getMain();
  const card = (figure, isMain) => el('div', { class: 'car-card' }, [
    el('img', { src: figureThumbnail(figure), alt: '' }),
    el('h3', { text: isMain ? `${figure.name} (you)` : figure.name }),
    el('div', { class: 'card-actions' }, [
      el('button', { class: 'go-btn', text: '✏️ Change', onclick: () => app.openFigureMaker({ id: isMain ? 'main' : figure.id }) }),
      isMain ? null : el('button', {
        class: 'tool-btn danger',
        text: '🗑',
        'aria-label': `Delete ${figure.name}`,
        onclick: async () => {
          if (!(await confirmDialog(`Delete ${figure.name}?`, { yes: 'Delete', no: 'Keep' }))) return;
          app.figures.removeFriend(figure.id);
          renderFigures(app);
        },
      }),
    ]),
  ]);
  const items = [
    main ? card(main, true) : null,
    el('button', { class: 'car-card new', onclick: () => app.openFigureMaker({ id: null }) }, [
      el('div', { class: 'plus', text: '＋' }),
      el('span', { text: 'New friend' }),
    ]),
    ...app.figures.listFriends().map(friend => card(friend, false)),
  ];
  $('#figures-list').replaceChildren(...items.filter(Boolean));
}
```

- [ ] **Step 6: Wire it into `js/main.js`**

Add below the existing imports:
```js
import { createFigureStore } from './figureStorage.js';
import { DEFAULT_FIGURE, randomFigure } from './figures.js';
import { setDriverFigure } from './brickMesh.js';
import { createFigureMaker } from './figureMaker.js';
import { renderFigures } from './figuresScreen.js';
```

Replace:
```js
  garage: createGarage(),
```
with:
```js
  garage: createGarage(),
  figures: createFigureStore(),
  openFigures() {
    if (!mode?.isShowroom) app.setMode(createShowroom(showroomBricks()));
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
          app.openFigures();
        }
      },
    }));
  },
```

In the home click handler, add after the `garage` line:
```js
  if (action === 'figures') app.openFigures();
```

Replace:
```js
for (const id of ['garage', 'rotate-hint']) {
```
with:
```js
for (const id of ['garage', 'rotate-hint', 'figures']) {
```

Replace the start-up line:
```js
app.goHome();
window.brickRacers = app;
```
with:
```js
setDriverFigure(app.figures.getMain() ?? DEFAULT_FIGURE);
// First launch: make your figure before anything else.
if (app.figures.getMain()) app.goHome();
else app.openFigureMaker({ first: true });
window.brickRacers = app;
```

- [ ] **Step 7: Check it in the browser** (1024×768)

1. In the console run `localStorage.clear()` and reload. Expected: "Make your figure!" with no 🏠; the default figure spins on a yellow podium left of the panel; the Head tab shows 9 head pictures with spiky selected and 5 hair-colour dots.
2. Tap every tile in every tab. Expected: the 3D figure updates each time. Head: hat styles show 8 colour dots; crown, space helmet and no-hat show none. Skin: 5 big dots. Shirt: 6 print pictures + 8 colours. Pants: 8 big dots.
3. 🎲 Surprise me changes everything.
4. ✓ Done → "What's your name?" → Cancel: still in the maker. ✓ Done → type `Sam` → Save → home screen with 4 buttons.
5. 👤 My Figures → "Sam (you)" card with picture + Change, and a "＋ New friend" card. New friend → "Make a friend" with a random figure and a 🏠; Done → name `Ana` → back to the list with Ana (with 🗑). 🗑 → Keep: stays; 🗑 → Delete: gone.
6. Change on Sam → edit → 🏠 → "Leave without saving?" → Stay / Leave work.
7. Open the workshop: the Seat + Driver picture now shows Sam's look.
8. Reload: goes straight home (main figure saved). No console errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add index.html css/style.css js/ui.js js/figureMaker.js js/figuresScreen.js js/main.js
git commit -m "feat: figure maker on first launch and a My Figures screen"
```

---

### Task 5: Figure on the turntable, AI drivers, podium name, README

**Files:**
- Modify: `js/showroom.js`, `js/main.js` (pass the figure), `js/race.js`, `README.md`

**Interfaces:**
- Consumes: `createFigureMesh` (figureMesh.js), `randomFigure`, `DEFAULT_FIGURE` (figures.js), `app.figures`.
- Produces: `createShowroom(bricks, figure)`.

- [ ] **Step 1: Figure beside the car (`js/showroom.js`)**

Add the import:
```js
import { createFigureMesh } from './figureMesh.js';
```

Replace:
```js
export function createShowroom(bricks) {
```
with:
```js
export function createShowroom(bricks, figure) {
```

Replace:
```js
  turntable.add(car);
  scene.add(turntable);
```
with:
```js
  turntable.add(car);
  if (figure) {
    const person = createFigureMesh(figure);
    person.position.set(2.2, 0.3, 0.7);
    person.rotation.y = 0.5;
    person.scale.setScalar(1.3);
    turntable.add(person);
  }
  scene.add(turntable);
```

In `js/main.js` replace both `createShowroom(showroomBricks())` calls with `createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE)` (one in `goHome`, one in `openGarage`, one in `openFigures` — three calls in total).

- [ ] **Step 2: AI drivers and the podium name (`js/race.js`)**

Add the import:
```js
import { randomFigure } from './figures.js';
```

Replace:
```js
    ...OPPONENTS.map(o => ({ name: o.name, bricks: modelToBricks(MODELS[o.model], o.recolor), dot: COLORS[o.color].hex, human: false })),
    { name: playerCar.name, bricks: playerCar.bricks, dot: 0xffffff, human: true },
```
with:
```js
    ...OPPONENTS.map((o, i) => ({ name: o.name, bricks: modelToBricks(MODELS[o.model], o.recolor), dot: COLORS[o.color].hex, human: false, driver: randomFigure(101 + i * 37, o.name) })),
    { name: playerCar.name, bricks: playerCar.bricks, dot: 0xffffff, human: true, driver: null },
```

Replace:
```js
    const body = createCarMesh(entry.bricks, { includeWheels: false });
```
with:
```js
    const body = createCarMesh(entry.bricks, { includeWheels: false, driver: entry.driver });
```

In `showPodium`, replace:
```js
      title: place === 1 ? 'You won! 🏆' : `You came ${ordinal(place)}!`,
```
with:
```js
      title: place === 1 ? `You won, ${playerName}! 🏆` : `You came ${ordinal(place)}, ${playerName}!`,
```
and add as the first line of `createRace`:
```js
  const playerName = app.figures?.getMain()?.name ?? 'Me';
```

- [ ] **Step 3: README**

In `README.md` replace:
```markdown
## How to play

```
with:
```markdown
## How to play

- **First time:** make your own figure — hair or hat, face, skin, shirt and pants — and type your name. Your figure drives all your cars. Change it, or make friends, in **👤 My Figures**.
```

- [ ] **Step 4: Check it in the browser**

Expected:
- Home: Sam stands on the turntable beside the newest car, about as tall as the car.
- Garage pictures show Sam in the driver's seat (made fresh after the figure changed).
- A race: the three AI cars have different, stable drivers; the player's car has Sam.
- The podium says "You won, Sam! 🏆" or "You came 2nd, Sam!".
- Changing Sam's shirt and reopening the garage: the car pictures show the new shirt.
- No console errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/showroom.js js/main.js js/race.js README.md
git commit -m "feat: your figure on the turntable, AI drivers, podium uses your name"
```
