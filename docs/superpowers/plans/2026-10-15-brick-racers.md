# Brick Racers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 3D, touch-first web game for an 8-year-old on an iPad: build a car from toy bricks (guided step-by-step or free build), then race it against three computer cars on a toy track with real physics.

**Architecture:** Plain HTML + ES modules with no build step; Three.js renders, cannon-es simulates (`RaycastVehicle`). All rules that are easy to get wrong (brick snapping, guided-step checking, car stats, laps/positions, AI steering, touch state, saving, vehicle physics) live in DOM-free modules tested with `node:test`. The 3D/DOM modules on top (meshes, workshop, track, race) are verified by playing the game in a browser at iPad size.

**Tech Stack:** Three.js 0.170.0 and cannon-es 0.20.0 (browser: jsDelivr CDN via an import map; Node tests: `cannon-es` dev dependency), Web Audio, `speechSynthesis`, `localStorage`, Node 26 (`node --test`), a tiny Node static server.

**Spec:** `docs/superpowers/specs/2026-10-15-brick-racers-design.md`

## Global Constraints

- Touch-first for iPad Safari (landscape); keyboard arrows/WASD also drive, for testing on a computer.
- Generic toy bricks only: never the word "LEGO", its logo, or its minifigure trademark in UI text.
- No accounts, no server-side state, no online play. Saved cars live in `localStorage` under the key `brickRacers.garage.v1`.
- No build step. Browser loads `three@0.170.0` and `cannon-es@0.20.0` from `https://cdn.jsdelivr.net/npm/` through the import map in `index.html` — exact pinned versions.
- These modules must never import `three` or touch `document`/`window` (they are tested in Node): `math.js`, `bricks.js`, `snapping.js`, `carStats.js`, `instructions.js`, `storage.js`, `raceLogic.js`, `ai.js`, `inputState.js`, `vehiclePhysics.js`.
- Grid units: 1 stud = 0.5 m wide (`STUD`), 1 plate layer = 0.2 m tall (`LAYER`); a brick is 3 layers. Car forward is local **+z**, the driver's left is **+x**, up is **+y**. Heading `h` means forward vector `(sin h, 0, cos h)`. Steering input `steer > 0` means turn left.
- Kid-friendly copy: short, encouraging, no "error"/"failed"/"invalid" wording. Car names: max 24 characters, blank becomes "My Car".
- All sound is generated with Web Audio — no audio files.
- One race = 3 laps, 4 cars (player + 3 AI), 12 checkpoints.

## Review Focus

1. **Old or corrupted saved data** (bad JSON, a brick type that no longer exists, missing fields) — the garage should load the valid cars and skip the rest, never crash. Pinned in Task 4.
2. **Extreme free builds** (a 20-brick tower, six wheels, five engines) — stats stay clamped and the car still drives forward. Pinned in Task 2 and Task 8.
3. **A finger that leaves the pad** (iOS `pointercancel`, app switch, one of two fingers lifting) — the released control lets go and the other keeps working; the car never keeps accelerating on its own. Pinned in Task 7.
4. **Driving the wrong way or cutting across the infield** — no lap credit unless checkpoints are passed in order. Pinned in Task 5.
5. **Blank or very long car names** — become "My Car" / trimmed to 24 characters. Pinned in Task 4.

## File Map

```
package.json            npm scripts (test, start), cannon-es dev dependency
server.js               static file server on 0.0.0.0:8080, prints the Wi-Fi URL
.claude/launch.json     preview config for the browser pane
index.html              screens markup + import map
manifest.webmanifest    home-screen app metadata (Task 15)
css/style.css           all styling
js/math.js              clamp, wrapAngle
js/bricks.js            brick catalogue, colours, chassis, brick validation
js/snapping.js          grid footprint, overlap/support rules, wheel slots, tap→candidate
js/carStats.js          race readiness, mass/centre of mass, physics boxes, speed/grip numbers
js/instructions.js      the 3 guided models, step text, step checking
js/storage.js           garage save/load
js/raceLogic.js         checkpoints, laps, ranking, ordinals
js/ai.js                AI steering/throttle, rubber-banding
js/inputState.js        which drive controls are held (pure)
js/input.js             DOM touch + keyboard → inputState
js/vehiclePhysics.js    bricks → cannon-es RaycastVehicle, driving, auto-flip
js/brickMesh.js         Three.js meshes for bricks, wheels, whole cars
js/thumbnails.js        small rendered pictures of bricks and cars
js/ui.js                screens, modals, toasts, name prompt
js/audio.js             sound effects, engine hum, read-aloud
js/showroom.js          home/garage background: car on a turntable
js/builder.js           the workshop (free build)
js/confetti.js          celebration particles
js/guide.js             guided build on top of the workshop
js/chooser.js           "What do you want to build?" picker
js/garageScreen.js      garage list
js/track.js             race track: road, bridge, barriers, jump, cones, checkpoints
js/race.js              race mode: racers, countdown, HUD, camera, podium
js/main.js              renderer, render loop, screen switching
tests/*.test.js         node:test suites
README.md               how to play on the iPad (Task 15)
```

Note: the spec put the mesh factory inside `bricks.js`; this plan moves it to `brickMesh.js` so `bricks.js` stays importable from Node tests.

---
### Task 1: Project setup, brick catalogue and snapping rules

**Files:**
- Create: `package.json`, `.gitignore`, `server.js`, `.claude/launch.json`
- Create: `js/math.js`, `js/bricks.js`, `js/snapping.js`
- Test: `tests/snapping.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `math.js`: `clamp(v, lo, hi) → number`, `wrapAngle(a) → number in [-π, π)`
  - `bricks.js`: `STUD = 0.5`, `LAYER = 0.2`, `COLORS: {key: {name, hex}}`, `COLOR_KEYS: string[]`, `BRICK_TYPES: {key: {name, w, d, h, mass, kind, radius?}}`, `TRAY_ORDER: string[]`, `makeChassis() → Brick`, `isValidBrick(b) → boolean`
  - A **Brick** is `{ type, color, x, y, z, r }`: integer grid position of its min corner (x across, y layers up, z along), `r` = quarter turns 0–3.
  - `snapping.js`: `BOUNDS`, `WHEEL_SLOTS: {x,z}[]`, `footprint(type, r) → {w,d,h}`, `cellsOf(brick) → string[]` ("x,y,z"), `canPlace(bricks, cand) → {ok:true} | {ok:false, reason:'unknown'|'wheelSlot'|'outOfBounds'|'overlap'|'floating'}`, `candidateFromHit(type, r, cell, normal) → {type, r, x, y, z}`, `nearestWheelSlot(gx, gz) → {x, y:0, z}`

- [ ] **Step 1: Create the project files**

`package.json`:
```json
{
  "name": "brick-racers",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/*.test.js\"",
    "start": "node server.js"
  },
  "devDependencies": {
    "cannon-es": "0.20.0"
  }
}
```

`.gitignore`:
```
node_modules/
.DS_Store
```

`server.js`:
```js
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = join(ROOT, normalize(urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath));
  if (!file.startsWith(ROOT) || file.includes(`${sep}node_modules${sep}`) || file.includes(`${sep}.git${sep}`)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Brick Racers is running!`);
  console.log(`  On this computer: http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) console.log(`  On the iPad (same Wi-Fi): http://${net.address}:${PORT}`);
    }
  }
});
```

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "brick-racers", "runtimeExecutable": "node", "runtimeArgs": ["server.js"], "port": 8080 }
  ]
}
```

Run: `npm install`
Expected: installs `cannon-es@0.20.0` into `node_modules/`, creates `package-lock.json`.

- [ ] **Step 2: Write `js/math.js` and `js/bricks.js`**

`js/math.js`:
```js
export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

// Wrap any angle into [-π, π) so "how far do I need to turn" is always the short way round.
export function wrapAngle(a) {
  const twoPi = Math.PI * 2;
  return ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}
```

`js/bricks.js`:
```js
// Brick catalogue. Sizes are grid units: w studs across (x), d studs long (z), h plate layers tall (y).
export const STUD = 0.5; // metres per stud
export const LAYER = 0.2; // metres per plate layer; a brick is 3 layers

export const COLORS = {
  red: { name: 'Red', hex: 0xe53935 },
  blue: { name: 'Blue', hex: 0x1e88e5 },
  yellow: { name: 'Yellow', hex: 0xfdd835 },
  green: { name: 'Green', hex: 0x43a047 },
  orange: { name: 'Orange', hex: 0xfb8c00 },
  white: { name: 'White', hex: 0xf5f5f5 },
  black: { name: 'Black', hex: 0x263238 },
  purple: { name: 'Purple', hex: 0x8e24aa },
};
export const COLOR_KEYS = Object.keys(COLORS);

export const BRICK_TYPES = {
  chassis: { name: 'Chassis', w: 4, d: 8, h: 1, mass: 40, kind: 'plate' },
  plate24: { name: 'Plate 2×4', w: 2, d: 4, h: 1, mass: 4, kind: 'plate' },
  brick12: { name: 'Brick 1×2', w: 1, d: 2, h: 3, mass: 3, kind: 'brick' },
  brick22: { name: 'Brick 2×2', w: 2, d: 2, h: 3, mass: 5, kind: 'brick' },
  brick24: { name: 'Brick 2×4', w: 2, d: 4, h: 3, mass: 9, kind: 'brick' },
  slope22: { name: 'Slope 2×2', w: 2, d: 2, h: 3, mass: 4, kind: 'slope' },
  wheelSmall: { name: 'Small Wheel', w: 1, d: 2, h: 3, mass: 6, kind: 'wheel', radius: 0.35 },
  wheelLarge: { name: 'Big Wheel', w: 1, d: 2, h: 3, mass: 9, kind: 'wheel', radius: 0.5 },
  engine: { name: 'Engine', w: 2, d: 2, h: 3, mass: 15, kind: 'engine' },
  seat: { name: 'Seat + Driver', w: 2, d: 2, h: 3, mass: 6, kind: 'seat' },
  steering: { name: 'Steering Wheel', w: 1, d: 1, h: 3, mass: 1, kind: 'steering' },
  spoiler: { name: 'Spoiler', w: 4, d: 1, h: 3, mass: 2, kind: 'spoiler' },
  lights: { name: 'Headlights', w: 2, d: 1, h: 2, mass: 1, kind: 'lights' },
};

// Everything except the chassis, in the order the tray shows it.
export const TRAY_ORDER = ['plate24', 'brick12', 'brick22', 'brick24', 'slope22', 'wheelSmall', 'wheelLarge', 'engine', 'seat', 'steering', 'spoiler', 'lights'];

// Every car starts from this 4×8 plate, centred on the origin.
export function makeChassis() {
  return { type: 'chassis', color: 'black', x: -2, y: 0, z: -4, r: 0 };
}

export function isValidBrick(b) {
  return !!b && Object.hasOwn(BRICK_TYPES, b.type) && Object.hasOwn(COLORS, b.color)
    && [b.x, b.y, b.z].every(Number.isInteger) && [0, 1, 2, 3].includes(b.r);
}
```

- [ ] **Step 3: Write the failing snapping tests**

`tests/snapping.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis, isValidBrick } from '../js/bricks.js';
import { footprint, cellsOf, canPlace, candidateFromHit, nearestWheelSlot } from '../js/snapping.js';

const chassis = makeChassis();
const brick = (type, x, y, z, r = 0, color = 'red') => ({ type, color, x, y, z, r });

test('footprint swaps width and depth on a quarter turn', () => {
  assert.deepEqual(footprint('brick24', 0), { w: 2, d: 4, h: 3 });
  assert.deepEqual(footprint('brick24', 1), { w: 4, d: 2, h: 3 });
  assert.deepEqual(footprint('brick24', 2), { w: 2, d: 4, h: 3 });
});

test('cellsOf lists every grid cell a brick fills', () => {
  const cells = cellsOf(brick('brick12', 0, 1, 0));
  assert.equal(cells.length, 6);
  assert.ok(cells.includes('0,1,0'));
  assert.ok(cells.includes('0,3,1'));
});

test('a brick can sit on top of the chassis', () => {
  assert.deepEqual(canPlace([chassis], brick('brick24', -2, 1, -4)), { ok: true });
});

test('a brick cannot go where another brick already is', () => {
  const existing = brick('brick22', -2, 1, -4);
  assert.equal(canPlace([chassis, existing], brick('brick12', -1, 2, -3)).reason, 'overlap');
});

test('a brick needs something underneath it', () => {
  assert.equal(canPlace([chassis], brick('brick22', -2, 5, -4)).reason, 'floating');
});

test('a brick cannot leave the baseplate area', () => {
  assert.equal(canPlace([chassis], brick('brick24', 5, 1, 0)).reason, 'outOfBounds');
});

test('a brick may hang over the edge if one stud is supported', () => {
  assert.deepEqual(canPlace([chassis], brick('brick24', 1, 1, 0, 1)), { ok: true });
});

test('wheels only fit the wheel slots beside the chassis', () => {
  assert.deepEqual(canPlace([chassis], brick('wheelSmall', -3, 0, 2, 0, 'black')), { ok: true });
  assert.equal(canPlace([chassis], brick('wheelSmall', -3, 0, 0, 0, 'black')).reason, 'wheelSlot');
  assert.equal(canPlace([chassis], brick('wheelSmall', 0, 1, 0, 0, 'black')).reason, 'wheelSlot');
});

test('two wheels cannot share a slot', () => {
  const wheel = brick('wheelSmall', 2, 0, -4, 0, 'black');
  assert.equal(canPlace([chassis, wheel], brick('wheelLarge', 2, 0, -4, 0, 'black')).reason, 'overlap');
});

test('wheels do not hold bricks up', () => {
  const wheel = brick('wheelSmall', -3, 0, 2, 0, 'black');
  assert.equal(canPlace([chassis, wheel], brick('brick12', -3, 3, 2)).reason, 'floating');
});

test('unknown brick types are refused', () => {
  assert.equal(canPlace([chassis], brick('rocket', 0, 1, 0)).reason, 'unknown');
});

test('tapping a top face centres the brick on the tapped stud', () => {
  assert.deepEqual(candidateFromHit('brick24', 0, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }), { type: 'brick24', r: 0, x: 0, y: 1, z: -1 });
});

test('tapping a side face puts the brick beside that face', () => {
  assert.deepEqual(candidateFromHit('brick24', 0, { x: -3, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }), { type: 'brick24', r: 0, x: -4, y: 1, z: -1 });
  assert.deepEqual(candidateFromHit('brick22', 0, { x: 0, y: 1, z: 4 }, { x: 0, y: 0, z: 1 }), { type: 'brick22', r: 0, x: 0, y: 1, z: 4 });
});

test('nearestWheelSlot picks the closest corner', () => {
  assert.deepEqual(nearestWheelSlot(-2.6, 3.2), { x: -3, y: 0, z: 2 });
  assert.deepEqual(nearestWheelSlot(3, -3), { x: 2, y: 0, z: -4 });
});

test('isValidBrick rejects unknown types, colours and fractional positions', () => {
  assert.equal(isValidBrick(brick('brick22', 0, 1, 0)), true);
  assert.equal(isValidBrick(brick('rocket', 0, 1, 0)), false);
  assert.equal(isValidBrick(brick('brick22', 0, 1, 0, 0, 'gold')), false);
  assert.equal(isValidBrick(brick('brick22', 0.5, 1, 0)), false);
  assert.equal(isValidBrick(null), false);
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/snapping.js`.

- [ ] **Step 5: Write `js/snapping.js`**

```js
import { BRICK_TYPES } from './bricks.js';

// The baseplate area a car may use (max values are exclusive).
export const BOUNDS = { minX: -6, maxX: 6, minY: 0, maxY: 24, minZ: -8, maxZ: 8 };

// Wheels clip onto the sides of the 4×8 chassis: front, middle and back on each side.
export const WHEEL_SLOTS = [
  { x: -3, z: 2 }, { x: 2, z: 2 },
  { x: -3, z: -1 }, { x: 2, z: -1 },
  { x: -3, z: -4 }, { x: 2, z: -4 },
];

export function footprint(type, r = 0) {
  const t = BRICK_TYPES[type];
  return r % 2 === 0 ? { w: t.w, d: t.d, h: t.h } : { w: t.d, d: t.w, h: t.h };
}

export function cellsOf(brick) {
  const { w, d, h } = footprint(brick.type, brick.r);
  const cells = [];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      for (let k = 0; k < d; k++) cells.push(`${brick.x + i},${brick.y + j},${brick.z + k}`);
    }
  }
  return cells;
}

function occupancy(bricks) {
  const map = new Map();
  for (const b of bricks) for (const cell of cellsOf(b)) map.set(cell, b);
  return map;
}

export function canPlace(bricks, cand) {
  const t = BRICK_TYPES[cand.type];
  if (!t) return { ok: false, reason: 'unknown' };
  if (t.kind === 'wheel' && (cand.y !== 0 || !WHEEL_SLOTS.some(s => s.x === cand.x && s.z === cand.z))) {
    return { ok: false, reason: 'wheelSlot' };
  }
  const { w, d, h } = footprint(cand.type, cand.r);
  if (cand.x < BOUNDS.minX || cand.x + w > BOUNDS.maxX || cand.y < BOUNDS.minY || cand.y + h > BOUNDS.maxY
    || cand.z < BOUNDS.minZ || cand.z + d > BOUNDS.maxZ) {
    return { ok: false, reason: 'outOfBounds' };
  }
  const occupied = occupancy(bricks);
  if (cellsOf(cand).some(cell => occupied.has(cell))) return { ok: false, reason: 'overlap' };
  if (t.kind !== 'wheel' && cand.type !== 'chassis') {
    let supported = false;
    for (let i = 0; i < w && !supported; i++) {
      for (let k = 0; k < d && !supported; k++) {
        const below = occupied.get(`${cand.x + i},${cand.y - 1},${cand.z + k}`);
        supported = !!below && BRICK_TYPES[below.type].kind !== 'wheel';
      }
    }
    if (!supported) return { ok: false, reason: 'floating' };
  }
  return { ok: true };
}

// `cell` is the empty grid cell next to the tapped face; `normal` is that face's direction rounded to -1/0/1.
// Top faces centre the brick on the tapped stud; side and bottom faces put it flush against the face.
export function candidateFromHit(type, r, cell, normal) {
  const { w, d, h } = footprint(type, r);
  let x = cell.x - Math.floor((w - 1) / 2);
  let z = cell.z - Math.floor((d - 1) / 2);
  let y = cell.y;
  if (normal.x > 0.5) x = cell.x;
  else if (normal.x < -0.5) x = cell.x - w + 1;
  if (normal.z > 0.5) z = cell.z;
  else if (normal.z < -0.5) z = cell.z - d + 1;
  if (normal.y < -0.5) y = cell.y - h + 1;
  return { type, r, x, y, z };
}

// gx/gz are grid-space coordinates (metres / STUD) of where the player tapped.
export function nearestWheelSlot(gx, gz) {
  let best = WHEEL_SLOTS[0];
  let bestDist = Infinity;
  for (const slot of WHEEL_SLOTS) {
    const dist = (slot.x + 0.5 - gx) ** 2 + (slot.z + 1 - gz) ** 2;
    if (dist < bestDist) { bestDist = dist; best = slot; }
  }
  return { x: best.x, y: 0, z: best.z };
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test`
Expected: PASS — 15 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore server.js .claude/launch.json js/math.js js/bricks.js js/snapping.js tests/snapping.test.js
git commit -m "feat: project setup, brick catalogue and snapping rules"
```

---
### Task 2: Car stats and race readiness

**Files:**
- Create: `js/carStats.js`
- Test: `tests/carStats.test.js`

**Interfaces:**
- Consumes: `BRICK_TYPES`, `STUD`, `LAYER`, `makeChassis` (bricks.js); `footprint` (snapping.js); `clamp` (math.js).
- Produces:
  - `LIMITS = { minTopSpeed: 12, maxTopSpeed: 24, minEngineForce: 500, maxEngineForce: 1400 }`
  - `raceReadiness(bricks) → { chassis, wheels, engine, seat, ready }` (all booleans). `wheels` means a wheel in each of the four corner slots (x −3/2, z 2/−4).
  - `brickBox(brick) → { cx, cy, cz, hx, hy, hz }` in metres, car-local.
  - `computeStats(bricks) → { mass, centerOfMass:{x,y,z}, boxes: Box[], wheels: Wheel[], engines, engineForce, topSpeed, frictionSlip, brakeForce }` where `Wheel = { type, color, radius, x, y, z, front }` (x/y/z = wheel centre in metres, car-local; `front` = z > 0).

- [ ] **Step 1: Write the failing tests**

`tests/carStats.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis } from '../js/bricks.js';
import { raceReadiness, computeStats, LIMITS } from '../js/carStats.js';

const part = (type, x, y, z, color = 'black', r = 0) => ({ type, color, x, y, z, r });
const corners = (type = 'wheelSmall') => [part(type, -3, 0, 2), part(type, 2, 0, 2), part(type, -3, 0, -4), part(type, 2, 0, -4)];
const basicCar = () => [makeChassis(), ...corners(), part('engine', -1, 1, -4), part('seat', -1, 1, -1, 'white')];

test('a bare chassis is not ready to race', () => {
  assert.deepEqual(raceReadiness([makeChassis()]), { chassis: true, wheels: false, engine: false, seat: false, ready: false });
});

test('chassis + four corner wheels + engine + seat is race-ready', () => {
  assert.equal(raceReadiness(basicCar()).ready, true);
});

test('a missing corner wheel makes the car not ready', () => {
  const car = basicCar().filter(b => !(b.type === 'wheelSmall' && b.x === -3 && b.z === -4));
  const r = raceReadiness(car);
  assert.equal(r.wheels, false);
  assert.equal(r.ready, false);
});

test('middle wheels do not replace a back corner wheel', () => {
  const car = [makeChassis(), part('wheelSmall', -3, 0, 2), part('wheelSmall', 2, 0, 2),
    part('wheelSmall', -3, 0, -1), part('wheelSmall', 2, 0, -1), part('engine', -1, 1, -4), part('seat', -1, 1, -1)];
  assert.equal(raceReadiness(car).wheels, false);
});

test('computeStats adds up mass and separates wheels from body boxes', () => {
  const s = computeStats(basicCar());
  assert.equal(s.mass, 85);
  assert.equal(s.boxes.length, 3);
  assert.equal(s.wheels.length, 4);
  assert.equal(s.wheels.filter(w => w.front).length, 2);
  assert.deepEqual(s.wheels[0], { type: 'wheelSmall', color: 'black', radius: 0.35, x: -1.25, y: 0.1, z: 1.5, front: true });
  assert.equal(s.engines, 1);
  assert.equal(s.engineForce, 750);
  assert.equal(s.topSpeed, 14);
  assert.equal(s.frictionSlip, 3);
  assert.equal(s.brakeForce, 85 * 0.05);
});

test('centre of mass sits low and in the middle for a symmetric car', () => {
  const { x, y } = computeStats(basicCar()).centerOfMass;
  assert.ok(Math.abs(x) < 1e-9, `x=${x}`);
  assert.ok(Math.abs(y - 0.255) < 0.01, `y=${y}`);
});

test('brick boxes are in metres around the brick centre', () => {
  const s = computeStats([makeChassis()]);
  assert.deepEqual(s.boxes[0], { cx: 0, cy: 0.1, cz: 0, hx: 1, hy: 0.1, hz: 2 });
});

test('a very tall tower car stays drivable: speed clamps to the minimum', () => {
  const tower = Array.from({ length: 20 }, (_, k) => part('brick22', -1, 1 + 3 * k, 1, 'red'));
  const s = computeStats([...basicCar(), ...tower]);
  assert.equal(s.topSpeed, LIMITS.minTopSpeed);
  assert.equal(s.engineForce, 750);
  assert.ok(s.centerOfMass.y > 2);
});

test('extra engines stop helping after three', () => {
  const engines = [part('engine', -1, 1, 1), part('engine', -1, 4, 1), part('engine', -1, 7, 1), part('engine', -1, 10, 1)];
  const s = computeStats([...basicCar(), ...engines]);
  assert.equal(s.engines, 5);
  assert.equal(s.engineForce, 1350);
  assert.ok(s.topSpeed <= LIMITS.maxTopSpeed);
});

test('six wheels grip better than four', () => {
  const s = computeStats([...basicCar(), part('wheelSmall', -3, 0, -1), part('wheelSmall', 2, 0, -1)]);
  assert.equal(s.wheels.length, 6);
  assert.equal(s.frictionSlip, 3.5);
  assert.equal(s.wheels.filter(w => w.front).length, 2);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/carStats.js`.

- [ ] **Step 3: Write `js/carStats.js`**

```js
import { BRICK_TYPES, STUD, LAYER } from './bricks.js';
import { footprint } from './snapping.js';
import { clamp } from './math.js';

// Every race-ready car must stay drivable, however it was built.
export const LIMITS = { minTopSpeed: 12, maxTopSpeed: 24, minEngineForce: 500, maxEngineForce: 1400 };
const CORNER_SLOTS = [[-3, 2], [2, 2], [-3, -4], [2, -4]];

const kindOf = b => BRICK_TYPES[b.type]?.kind;

export function raceReadiness(bricks) {
  const checks = {
    chassis: bricks.some(b => b.type === 'chassis'),
    wheels: CORNER_SLOTS.every(([x, z]) => bricks.some(b => kindOf(b) === 'wheel' && b.x === x && b.z === z)),
    engine: bricks.some(b => kindOf(b) === 'engine'),
    seat: bricks.some(b => kindOf(b) === 'seat'),
  };
  return { ...checks, ready: Object.values(checks).every(Boolean) };
}

export function brickBox(b) {
  const { w, d, h } = footprint(b.type, b.r);
  return {
    cx: (b.x + w / 2) * STUD, cy: (b.y + h / 2) * LAYER, cz: (b.z + d / 2) * STUD,
    hx: (w * STUD) / 2, hy: (h * LAYER) / 2, hz: (d * STUD) / 2,
  };
}

export function computeStats(bricks) {
  let mass = 0, mx = 0, my = 0, mz = 0, engines = 0, spoilers = 0;
  const boxes = [];
  const wheels = [];
  for (const b of bricks) {
    const t = BRICK_TYPES[b.type];
    if (!t) continue;
    const box = brickBox(b);
    mass += t.mass;
    mx += box.cx * t.mass;
    my += box.cy * t.mass;
    mz += box.cz * t.mass;
    if (t.kind === 'wheel') {
      wheels.push({ type: b.type, color: b.color, radius: t.radius, x: box.cx, y: LAYER / 2, z: box.cz, front: box.cz > 0.01 });
    } else {
      boxes.push(box);
    }
    if (t.kind === 'engine') engines++;
    if (t.kind === 'spoiler') spoilers++;
  }
  const centerOfMass = mass > 0 ? { x: mx / mass, y: my / mass, z: mz / mass } : { x: 0, y: 0, z: 0 };
  const e = Math.min(engines, 3);
  return {
    mass,
    centerOfMass,
    boxes,
    wheels,
    engines,
    engineForce: clamp(450 + 300 * e, LIMITS.minEngineForce, LIMITS.maxEngineForce),
    topSpeed: clamp(14 + 3 * (e - 1) - Math.max(0, mass - 130) / 25, LIMITS.minTopSpeed, LIMITS.maxTopSpeed),
    frictionSlip: clamp(3 + 0.25 * Math.max(0, wheels.length - 4) + 0.2 * Math.min(spoilers, 2), 2.5, 4.5),
    brakeForce: mass * 0.05,
  };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — all carStats and snapping tests.

- [ ] **Step 5: Commit**

```bash
git add js/carStats.js tests/carStats.test.js
git commit -m "feat: car stats and race readiness"
```

---

### Task 3: Guided models and step checking

**Files:**
- Create: `js/instructions.js`
- Test: `tests/instructions.test.js`

**Interfaces:**
- Consumes: `BRICK_TYPES`, `COLORS`, `makeChassis` (bricks.js); `footprint` (snapping.js).
- Produces:
  - `MODELS: { raceCar, monsterTruck, buggy }`, each `{ name, steps: Brick[] }` (steps exclude the chassis; the chassis is always pre-placed).
  - `modelToBricks(model, recolor = {}) → Brick[]` — chassis + steps, colours swapped via `recolor` map (e.g. `{ red: 'orange' }`).
  - `describeStep(step) → string` — e.g. `"Find a red Brick 2×4 and put it on the glowing spot!"`.
  - `checkPlacement(step, { type, color, at }, tolerance = 2) → 'correct' | 'wrongBrick' | 'wrongColor' | 'wrongSpot'` — `at` is the grid cell the child tapped (or the wheel slot); within `tolerance` cells of the step's footprint counts as correct.

- [ ] **Step 1: Write the failing tests**

`tests/instructions.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis } from '../js/bricks.js';
import { canPlace } from '../js/snapping.js';
import { raceReadiness } from '../js/carStats.js';
import { MODELS, modelToBricks, describeStep, checkPlacement } from '../js/instructions.js';

for (const [key, model] of Object.entries(MODELS)) {
  test(`${key}: every step fits exactly where the instructions say`, () => {
    const built = [makeChassis()];
    model.steps.forEach((step, i) => {
      const result = canPlace(built, step);
      assert.equal(result.ok, true, `step ${i + 1} (${step.type}) refused: ${result.reason}`);
      built.push(step);
    });
  });

  test(`${key}: the finished model is ready to race`, () => {
    assert.equal(raceReadiness(modelToBricks(model)).ready, true);
  });

  test(`${key}: has a kid-sized number of steps (10-16)`, () => {
    assert.ok(model.steps.length >= 10 && model.steps.length <= 16, `${model.steps.length} steps`);
  });
}

test('modelToBricks starts with the chassis and can repaint colours', () => {
  const bricks = modelToBricks(MODELS.raceCar, { red: 'orange' });
  assert.deepEqual(bricks[0], makeChassis());
  assert.equal(bricks.length, MODELS.raceCar.steps.length + 1);
  assert.ok(bricks.some(b => b.color === 'orange'));
  assert.ok(!bricks.some(b => b.color === 'red'));
  assert.ok(bricks.filter(b => b.type === 'wheelSmall').every(b => b.color === 'black'));
  assert.equal(MODELS.raceCar.steps.find(s => s.type === 'spoiler').color, 'red', 'original model is untouched');
});

test('describeStep reads like a friendly instruction', () => {
  assert.equal(describeStep({ type: 'brick24', color: 'red', x: 0, y: 1, z: 0, r: 0 }), 'Find a red Brick 2×4 and put it on the glowing spot!');
  assert.equal(describeStep({ type: 'slope22', color: 'orange', x: 0, y: 1, z: 0, r: 0 }), 'Find an orange Slope 2×2 and put it on the glowing spot!');
});

test('checkPlacement accepts the right brick on or near the glowing spot', () => {
  const step = { type: 'brick12', color: 'red', x: -2, y: 1, z: -2, r: 0 };
  assert.equal(checkPlacement(step, { type: 'brick12', color: 'red', at: { x: -2, y: 1, z: -2 } }), 'correct');
  assert.equal(checkPlacement(step, { type: 'brick12', color: 'red', at: { x: -1, y: 2, z: 0 } }), 'correct');
});

test('checkPlacement explains what is wrong, brick first, then colour, then spot', () => {
  const step = { type: 'brick12', color: 'red', x: -2, y: 1, z: -2, r: 0 };
  assert.equal(checkPlacement(step, { type: 'brick22', color: 'blue', at: { x: 3, y: 1, z: 3 } }), 'wrongBrick');
  assert.equal(checkPlacement(step, { type: 'brick12', color: 'blue', at: { x: -2, y: 1, z: -2 } }), 'wrongColor');
  assert.equal(checkPlacement(step, { type: 'brick12', color: 'red', at: { x: 3, y: 1, z: -2 } }), 'wrongSpot');
});

test('a wheel for the front-left slot is not accepted in the middle slot', () => {
  const step = { type: 'wheelSmall', color: 'black', x: -3, y: 0, z: 2, r: 0 };
  assert.equal(checkPlacement(step, { type: 'wheelSmall', color: 'black', at: { x: -3, y: 0, z: -1 } }), 'wrongSpot');
  assert.equal(checkPlacement(step, { type: 'wheelSmall', color: 'black', at: { x: 2, y: 0, z: 2 } }), 'wrongSpot');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/instructions.js`.

- [ ] **Step 3: Write `js/instructions.js`**

```js
import { BRICK_TYPES, COLORS, makeChassis } from './bricks.js';
import { footprint } from './snapping.js';

const step = (type, color, x, y, z, r = 0) => ({ type, color, x, y, z, r });
const cornerWheels = type => [step(type, 'black', -3, 0, 2), step(type, 'black', 2, 0, 2), step(type, 'black', -3, 0, -4), step(type, 'black', 2, 0, -4)];

// Guided models. Steps run in order on top of the pre-placed chassis (x -2..1, z -4..3, layer 0).
export const MODELS = {
  raceCar: {
    name: 'Race Car',
    steps: [
      ...cornerWheels('wheelSmall'),
      step('engine', 'black', -1, 1, -4),
      step('seat', 'white', -1, 1, -1),
      step('steering', 'black', -1, 1, 1),
      step('brick12', 'red', -2, 1, -2),
      step('brick12', 'red', 1, 1, -2),
      step('brick12', 'red', -2, 1, -4),
      step('brick12', 'red', 1, 1, -4),
      step('slope22', 'red', -2, 1, 2),
      step('slope22', 'red', 0, 1, 2),
      step('spoiler', 'red', -2, 4, -4),
    ],
  },
  monsterTruck: {
    name: 'Monster Truck',
    steps: [
      ...cornerWheels('wheelLarge'),
      step('plate24', 'blue', -2, 1, -4),
      step('plate24', 'blue', 0, 1, -4),
      step('engine', 'black', -1, 2, -4),
      step('seat', 'white', -1, 1, 0),
      step('steering', 'black', -1, 1, 2),
      step('brick12', 'blue', -2, 1, 0),
      step('brick12', 'blue', 1, 1, 0),
      step('brick12', 'blue', -2, 1, 2),
      step('brick22', 'blue', 0, 1, 2),
      step('lights', 'yellow', 0, 4, 3),
    ],
  },
  buggy: {
    name: 'Buggy',
    steps: [
      step('wheelSmall', 'black', -3, 0, 2),
      step('wheelSmall', 'black', 2, 0, 2),
      step('wheelLarge', 'black', -3, 0, -4),
      step('wheelLarge', 'black', 2, 0, -4),
      step('engine', 'black', -1, 1, -4),
      step('seat', 'white', -1, 1, -2),
      step('steering', 'black', -1, 1, 0),
      step('slope22', 'green', -1, 1, 2),
      step('brick12', 'green', -2, 1, -2),
      step('brick12', 'green', 1, 1, -2),
      step('brick12', 'green', -2, 4, -2),
      step('brick12', 'green', 1, 4, -2),
      step('plate24', 'green', -2, 7, -2, 1),
    ],
  },
};

export function modelToBricks(model, recolor = {}) {
  return [makeChassis(), ...model.steps.map(s => ({ ...s, color: recolor[s.color] ?? s.color }))];
}

export function describeStep(s) {
  const color = COLORS[s.color].name.toLowerCase();
  const article = /^[aeiou]/.test(color) ? 'an' : 'a';
  return `Find ${article} ${color} ${BRICK_TYPES[s.type].name} and put it on the glowing spot!`;
}

function nearTarget(s, at, tolerance) {
  const { w, d, h } = footprint(s.type, s.r);
  return at.x >= s.x - tolerance && at.x < s.x + w + tolerance
    && at.y >= s.y - tolerance && at.y < s.y + h + tolerance
    && at.z >= s.z - tolerance && at.z < s.z + d + tolerance;
}

export function checkPlacement(s, { type, color, at }, tolerance = 2) {
  if (type !== s.type) return 'wrongBrick';
  if (color !== s.color) return 'wrongColor';
  if (!nearTarget(s, at, tolerance)) return 'wrongSpot';
  return 'correct';
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 9 model tests (3 per model) plus 5 others, and all earlier tests. If a model step test fails, fix the step's coordinates in `MODELS` (never loosen `canPlace`).

- [ ] **Step 5: Commit**

```bash
git add js/instructions.js tests/instructions.test.js
git commit -m "feat: guided car models and step checking"
```

---
### Task 4: Garage storage

**Files:**
- Create: `js/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: `isValidBrick` (bricks.js).
- Produces:
  - `GARAGE_KEY = 'brickRacers.garage.v1'`
  - `createGarage(storage = localStorage-or-null) → { list(), get(id), save(car), remove(id) }`
  - A saved **Car** is `{ id: string, name: string, bricks: Brick[], updatedAt: number }`. `save({ id?, name, bricks })` returns the saved Car (new id when none given). `list()` returns copies in save order. `get(id)` returns a copy or `null`.
  - Works in memory when storage is `null`, throws, or holds junk.

- [ ] **Step 1: Write the failing tests**

`tests/storage.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis } from '../js/bricks.js';
import { createGarage, GARAGE_KEY } from '../js/storage.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } };
}
const zoomer = () => ({ name: 'Zoomer', bricks: [makeChassis()] });

test('a saved car is still there after reopening the garage', () => {
  const storage = memoryStorage();
  const saved = createGarage(storage).save(zoomer());
  const reopened = createGarage(storage);
  assert.equal(reopened.list().length, 1);
  assert.equal(reopened.get(saved.id).name, 'Zoomer');
  assert.deepEqual(reopened.get(saved.id).bricks, [makeChassis()]);
  assert.equal(typeof saved.updatedAt, 'number');
});

test('saving with an existing id updates that car instead of adding one', () => {
  const garage = createGarage(memoryStorage());
  const first = garage.save(zoomer());
  garage.save({ id: first.id, name: 'Zoomer 2', bricks: first.bricks });
  assert.equal(garage.list().length, 1);
  assert.equal(garage.get(first.id).name, 'Zoomer 2');
});

test('remove deletes a car and get returns null for it', () => {
  const garage = createGarage(memoryStorage());
  const car = garage.save(zoomer());
  garage.remove(car.id);
  assert.equal(garage.get(car.id), null);
  assert.deepEqual(garage.list(), []);
});

test('blank names become "My Car" and long names are trimmed to 24 characters', () => {
  const garage = createGarage(memoryStorage());
  assert.equal(garage.save({ name: '   ', bricks: [makeChassis()] }).name, 'My Car');
  assert.equal(garage.save({ name: undefined, bricks: [makeChassis()] }).name, 'My Car');
  assert.equal(garage.save({ name: 'The Super Duper Mega Fast Rocket Car', bricks: [makeChassis()] }).name.length, 24);
});

test('changing a returned car does not change the saved one', () => {
  const garage = createGarage(memoryStorage());
  const car = garage.save(zoomer());
  garage.get(car.id).bricks.push({ type: 'brick22', color: 'red', x: 0, y: 1, z: 0, r: 0 });
  assert.equal(garage.get(car.id).bricks.length, 1);
});

test('broken JSON in storage gives an empty garage instead of crashing', () => {
  assert.deepEqual(createGarage(memoryStorage({ [GARAGE_KEY]: '{not json' })).list(), []);
  assert.deepEqual(createGarage(memoryStorage({ [GARAGE_KEY]: '{"a":1}' })).list(), []);
});

test('cars with unknown bricks or missing fields are skipped, good cars are kept', () => {
  const good = { id: 'car-1', name: 'Good', bricks: [makeChassis()], updatedAt: 1 };
  const badBrick = { id: 'car-2', name: 'Bad', bricks: [{ ...makeChassis(), type: 'rocket' }], updatedAt: 1 };
  const noName = { id: 'car-3', bricks: [makeChassis()] };
  const storage = memoryStorage({ [GARAGE_KEY]: JSON.stringify([good, badBrick, noName, null, 'junk']) });
  assert.deepEqual(createGarage(storage).list().map(c => c.id), ['car-1']);
});

test('when storage refuses to save, the garage still works for this visit', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const garage = createGarage(storage);
  const car = garage.save(zoomer());
  assert.equal(garage.get(car.id).name, 'Zoomer');
});

test('works with no storage at all', () => {
  const garage = createGarage(null);
  garage.save(zoomer());
  assert.equal(garage.list().length, 1);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/storage.js`.

- [ ] **Step 3: Write `js/storage.js`**

```js
import { isValidBrick } from './bricks.js';

export const GARAGE_KEY = 'brickRacers.garage.v1';
const MAX_NAME = 24;

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // some private-browsing modes throw just for touching localStorage
  }
}

function isValidCar(car) {
  return !!car && typeof car.id === 'string' && typeof car.name === 'string'
    && Array.isArray(car.bricks) && car.bricks.length > 0 && car.bricks.every(isValidBrick);
}

function load(storage) {
  try {
    const data = JSON.parse(storage?.getItem(GARAGE_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(isValidCar) : [];
  } catch {
    return [];
  }
}

const copy = car => ({ ...car, bricks: car.bricks.map(b => ({ ...b })) });
const newId = () => `car-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function createGarage(storage = defaultStorage()) {
  let cars = load(storage);

  function persist() {
    try {
      storage?.setItem(GARAGE_KEY, JSON.stringify(cars));
    } catch {
      // Storage is full or blocked: keep the cars in memory for this visit.
    }
  }

  return {
    list: () => cars.map(copy),
    get: id => {
      const car = cars.find(c => c.id === id);
      return car ? copy(car) : null;
    },
    save({ id, name, bricks }) {
      const saved = {
        id: id ?? newId(),
        name: String(name ?? '').trim().slice(0, MAX_NAME) || 'My Car',
        bricks: bricks.map(b => ({ type: b.type, color: b.color, x: b.x, y: b.y, z: b.z, r: b.r })),
        updatedAt: Date.now(),
      };
      const index = cars.findIndex(c => c.id === saved.id);
      if (index >= 0) cars[index] = saved;
      else cars.push(saved);
      persist();
      return copy(saved);
    },
    remove(id) {
      cars = cars.filter(c => c.id !== id);
      persist();
    },
  };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 9 storage tests plus all earlier tests.

- [ ] **Step 5: Commit**

```bash
git add js/storage.js tests/storage.test.js
git commit -m "feat: garage storage that survives bad data"
```

---

### Task 5: Race rules — checkpoints, laps, ranking

**Files:**
- Create: `js/raceLogic.js`
- Test: `tests/raceLogic.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `newRaceState() → { lapsDone: 0, nextCp: 1, finishTime: null }` (cars start just behind checkpoint 0, the start line).
  - `advanceCheckpoint(state, pos{x,z}, checkpoints{x,z}[], radius, totalLaps, time) → state` — returns the **same object** when nothing changed, a new one when the next checkpoint was reached.
  - `progressValue(state, checkpointCount) → number` — checkpoints passed in total.
  - `rankRacers(entries{id, state, pos}[], checkpoints) → entries sorted 1st..last`.
  - `ordinal(n) → '1st' | '2nd' | '3rd' | '4th'`.

- [ ] **Step 1: Write the failing tests**

`tests/raceLogic.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { newRaceState, advanceCheckpoint, progressValue, rankRacers, ordinal } from '../js/raceLogic.js';

// A square track: checkpoint 0 is the start line.
const CPS = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 }];
const R = 10;
const at = (cp, dx = 0) => ({ x: CPS[cp].x + dx, z: CPS[cp].z });
const pass = (state, cps, laps = 2, time = 0) => cps.reduce((s, cp) => advanceCheckpoint(s, at(cp), CPS, R, laps, time), state);

test('a new racer has done no laps and is heading for checkpoint 1', () => {
  assert.deepEqual(newRaceState(), { lapsDone: 0, nextCp: 1, finishTime: null });
});

test('reaching the next checkpoint moves on to the one after', () => {
  const s = advanceCheckpoint(newRaceState(), at(1, 5), CPS, R, 2, 0);
  assert.deepEqual(s, { lapsDone: 0, nextCp: 2, finishTime: null });
});

test('nothing changes away from the next checkpoint (same object back)', () => {
  const s = newRaceState();
  assert.equal(advanceCheckpoint(s, { x: 50, z: 50 }, CPS, R, 2, 0), s);
});

test('skipping ahead to a later checkpoint gives no credit', () => {
  const s = newRaceState();
  assert.equal(advanceCheckpoint(s, at(2), CPS, R, 2, 0), s);
});

test('driving the wrong way over the start line gives no lap', () => {
  const s = pass(newRaceState(), [0, 3, 0, 3]);
  assert.deepEqual(s, newRaceState());
});

test('passing every checkpoint and then the start line counts a lap', () => {
  const s = pass(newRaceState(), [1, 2, 3, 0]);
  assert.deepEqual(s, { lapsDone: 1, nextCp: 1, finishTime: null });
});

test('finishing the last lap records the finish time and then stops changing', () => {
  const done = pass(newRaceState(), [1, 2, 3, 0, 1, 2, 3, 0], 2, 42);
  assert.equal(done.lapsDone, 2);
  assert.equal(done.finishTime, 42);
  assert.equal(advanceCheckpoint(done, at(1), CPS, R, 2, 50), done);
});

test('progressValue counts checkpoints passed', () => {
  assert.equal(progressValue(newRaceState(), 4), 0);
  assert.equal(progressValue(pass(newRaceState(), [1, 2]), 4), 2);
  assert.equal(progressValue(pass(newRaceState(), [1, 2, 3]), 4), 3);
  assert.equal(progressValue(pass(newRaceState(), [1, 2, 3, 0, 1]), 4), 5);
});

test('ranking: finishers by time, then by progress, then by distance to next checkpoint', () => {
  const entries = [
    { id: 'slow', state: pass(newRaceState(), [1]), pos: at(1) },
    { id: 'near', state: pass(newRaceState(), [1, 2]), pos: { x: 100, z: 99 } },
    { id: 'far', state: pass(newRaceState(), [1, 2]), pos: { x: 100, z: 50 } },
    { id: 'second', state: { lapsDone: 2, nextCp: 1, finishTime: 70 }, pos: at(0) },
    { id: 'winner', state: { lapsDone: 2, nextCp: 1, finishTime: 60 }, pos: at(0) },
  ];
  assert.deepEqual(rankRacers(entries, CPS).map(e => e.id), ['winner', 'second', 'near', 'far', 'slow']);
});

test('ordinal turns places into words kids know', () => {
  assert.deepEqual([1, 2, 3, 4].map(ordinal), ['1st', '2nd', '3rd', '4th']);
});
```

Note on the `near`/`far` entries: both have passed checkpoints 1 and 2, so their next checkpoint is 3 at (0, 100). `near` at (100, 99) is 100 m away; `far` at (100, 50) is ~112 m away.

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/raceLogic.js`.

- [ ] **Step 3: Write `js/raceLogic.js`**

```js
// Racers start just behind checkpoint 0 (the start line), so the first one to reach is 1.
export function newRaceState() {
  return { lapsDone: 0, nextCp: 1, finishTime: null };
}

// Only the next checkpoint in order counts, so cutting across or driving backwards earns nothing.
export function advanceCheckpoint(state, pos, checkpoints, radius, totalLaps, time) {
  if (state.finishTime !== null) return state;
  const cp = checkpoints[state.nextCp];
  const dx = pos.x - cp.x;
  const dz = pos.z - cp.z;
  if (dx * dx + dz * dz > radius * radius) return state;
  const lapsDone = state.nextCp === 0 ? state.lapsDone + 1 : state.lapsDone;
  return {
    lapsDone,
    nextCp: (state.nextCp + 1) % checkpoints.length,
    finishTime: lapsDone >= totalLaps ? time : null,
  };
}

export function progressValue(state, count) {
  return state.lapsDone * count + ((state.nextCp - 1 + count) % count);
}

export function rankRacers(entries, checkpoints) {
  const n = checkpoints.length;
  const distanceToNext = e => {
    const cp = checkpoints[e.state.nextCp];
    return Math.hypot(e.pos.x - cp.x, e.pos.z - cp.z);
  };
  return [...entries].sort((a, b) => {
    const fa = a.state.finishTime;
    const fb = b.state.finishTime;
    if (fa !== null && fb !== null) return fa - fb;
    if (fa !== null) return -1;
    if (fb !== null) return 1;
    return progressValue(b.state, n) - progressValue(a.state, n) || distanceToNext(a) - distanceToNext(b);
  });
}

export function ordinal(n) {
  return n + (['th', 'st', 'nd', 'rd'][n] ?? 'th');
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 10 race-logic tests plus all earlier tests.

- [ ] **Step 5: Commit**

```bash
git add js/raceLogic.js tests/raceLogic.test.js
git commit -m "feat: checkpoint, lap and ranking rules"
```

---
### Task 6: AI driver

**Files:**
- Create: `js/ai.js`
- Test: `tests/ai.test.js`

**Interfaces:**
- Consumes: `clamp`, `wrapAngle` (math.js).
- Produces:
  - `nearestIndex(line{x,z}[], x, z, fromIdx = 0, ahead = 40) → index` — searches from 5 points behind to `ahead` points in front of `fromIdx`, wrapping round the loop.
  - `aiControl(car{x, z, heading, speed, topSpeed}, line, prevIdx, speedFactor = 1) → { idx, input: { steer, throttle, brake } }`
  - `rubberBand(gap) → number` — `gap` = AI progress minus player progress in checkpoints; returns a speed factor (0.8 … 1.1).

- [ ] **Step 1: Write the failing tests**

`tests/ai.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestIndex, aiControl, rubberBand } from '../js/ai.js';

const straight = (x = 0) => Array.from({ length: 100 }, (_, i) => ({ x, z: i * 2 }));
const circle = Array.from({ length: 100 }, (_, i) => ({ x: Math.sin((i / 100) * Math.PI * 2) * 50, z: Math.cos((i / 100) * Math.PI * 2) * 50 }));
const car = (over = {}) => ({ x: 0, z: 0, heading: 0, speed: 5, topSpeed: 14, ...over });

test('drives straight down a straight line', () => {
  const { input } = aiControl(car(), straight(), 0);
  assert.ok(Math.abs(input.steer) < 0.01);
  assert.equal(input.throttle, 1);
  assert.equal(input.brake, 0);
});

test('steers left (positive) when the line is off to +x', () => {
  assert.ok(aiControl(car(), straight(10), 0).input.steer > 0.5);
});

test('steers right (negative) when facing +x and the line runs along +z', () => {
  assert.ok(aiControl(car({ heading: Math.PI / 2 }), straight(0), 0).input.steer < -0.5);
});

test('turns the short way round across the ±π seam', () => {
  // Facing heading 3.1 (almost -z); the target is at heading ≈ -3.14, only ~0.05 rad away the short way.
  const line = Array.from({ length: 20 }, () => ({ x: -0.5, z: -100 }));
  const { input } = aiControl(car({ heading: 3.1, speed: 0 }), line, 0);
  assert.ok(Math.abs(input.steer) < 0.3, `steer=${input.steer}`);
});

test('lifts off the gas above the target speed and brakes when far above it', () => {
  assert.equal(aiControl(car({ speed: 13 }), straight(), 0, 0.8).input.throttle, 0);
  assert.equal(aiControl(car({ speed: 16 }), straight(), 0, 0.8).input.brake, 1);
});

test('nearestIndex follows the car round the end of the loop', () => {
  const p = circle[1];
  assert.equal(nearestIndex(circle, p.x, p.z, 98), 1);
});

test('rubber band slows leaders and helps cars that are behind', () => {
  assert.equal(rubberBand(3), 0.8);
  assert.equal(rubberBand(1), 0.92);
  assert.equal(rubberBand(0), 1);
  assert.equal(rubberBand(-3), 1.1);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/ai.js`.

- [ ] **Step 3: Write `js/ai.js`**

```js
import { clamp, wrapAngle } from './math.js';

export function nearestIndex(line, x, z, fromIdx = 0, ahead = 40) {
  const n = line.length;
  let best = ((fromIdx % n) + n) % n;
  let bestDist = Infinity;
  for (let k = -5; k <= ahead; k++) {
    const i = (((fromIdx + k) % n) + n) % n;
    const dist = (line[i].x - x) ** 2 + (line[i].z - z) ** 2;
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

// Aim at a point further down the racing line the faster we go; slow down for sharp turns.
export function aiControl(car, line, prevIdx, speedFactor = 1) {
  const idx = nearestIndex(line, car.x, car.z, prevIdx);
  const look = Math.round(5 + Math.max(0, car.speed) * 0.5);
  const target = line[(idx + look) % line.length];
  const turn = wrapAngle(Math.atan2(target.x - car.x, target.z - car.z) - car.heading);
  const targetSpeed = car.topSpeed * speedFactor * (Math.abs(turn) > 0.5 ? 0.6 : 1);
  return {
    idx,
    input: {
      steer: clamp(turn * 2.5, -1, 1),
      throttle: car.speed < targetSpeed ? 1 : 0,
      brake: car.speed > targetSpeed + 3 ? 1 : 0,
    },
  };
}

// Keeps races close: leaders ease off, cars that fall behind get a small boost.
export function rubberBand(gap) {
  if (gap > 2) return 0.8;
  if (gap > 0) return 0.92;
  if (gap < -2) return 1.1;
  return 1;
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 7 AI tests plus all earlier tests.

- [ ] **Step 5: Commit**

```bash
git add js/ai.js tests/ai.test.js
git commit -m "feat: AI driver with friendly rubber-banding"
```

---

### Task 7: Drive controls (touch + keyboard)

**Files:**
- Create: `js/inputState.js`, `js/input.js`
- Test: `tests/inputState.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `inputState.js`: `createControlState() → { press(pointerId, control), release(pointerId), releaseAll(), isDown(control) }` where control ∈ `'left' | 'right' | 'go' | 'stop'`; `toDriveInput(state) → { steer, throttle, brake }`.
  - `input.js`: `attachDriveControls(root, state, signal) → { refresh() }` — wires every `[data-control]` button inside `root`, plus arrow keys/WASD, to `state`; `refresh()` toggles the `pressed` class on the buttons. All listeners are removed when `signal` aborts.

- [ ] **Step 1: Write the failing tests**

`tests/inputState.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlState, toDriveInput } from '../js/inputState.js';

test('nothing pressed means coast straight', () => {
  assert.deepEqual(toDriveInput(createControlState()), { steer: 0, throttle: 0, brake: 0 });
});

test('steering and gas work together with two fingers', () => {
  const s = createControlState();
  s.press(1, 'left');
  s.press(2, 'go');
  assert.deepEqual(toDriveInput(s), { steer: 1, throttle: 1, brake: 0 });
});

test('lifting one finger keeps the other control held', () => {
  const s = createControlState();
  s.press(1, 'right');
  s.press(2, 'go');
  s.release(1);
  assert.deepEqual(toDriveInput(s), { steer: 0, throttle: 1, brake: 0 });
});

test('sliding a finger from one button to another switches control', () => {
  const s = createControlState();
  s.press(1, 'left');
  s.press(1, 'right');
  assert.equal(toDriveInput(s).steer, -1);
});

test('a cancelled touch or app switch lets go of everything', () => {
  const s = createControlState();
  s.press(1, 'go');
  s.press('key:ArrowLeft', 'left');
  s.releaseAll();
  assert.deepEqual(toDriveInput(s), { steer: 0, throttle: 0, brake: 0 });
});

test('left and right together cancel out', () => {
  const s = createControlState();
  s.press(1, 'left');
  s.press(2, 'right');
  assert.equal(toDriveInput(s).steer, 0);
});

test('STOP is reported as brake', () => {
  const s = createControlState();
  s.press(7, 'stop');
  assert.equal(toDriveInput(s).brake, 1);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/inputState.js`.

- [ ] **Step 3: Write `js/inputState.js`**

```js
// Tracks which control each finger (or key) is holding, so fingers can come and go independently.
export function createControlState() {
  const pressed = new Map();
  return {
    press(pointerId, control) { pressed.set(pointerId, control); },
    release(pointerId) { pressed.delete(pointerId); },
    releaseAll() { pressed.clear(); },
    isDown(control) {
      for (const held of pressed.values()) if (held === control) return true;
      return false;
    },
  };
}

export function toDriveInput(state) {
  return {
    steer: (state.isDown('left') ? 1 : 0) - (state.isDown('right') ? 1 : 0),
    throttle: state.isDown('go') ? 1 : 0,
    brake: state.isDown('stop') ? 1 : 0,
  };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 7 input tests plus all earlier tests.

- [ ] **Step 5: Write `js/input.js`** (DOM glue; verified by hand in Task 14)

```js
const KEYS = {
  ArrowUp: 'go', KeyW: 'go',
  ArrowDown: 'stop', KeyS: 'stop',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export function attachDriveControls(root, state, signal) {
  const opts = { signal };
  const fingers = new Set();
  const controlAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-control]')?.dataset.control ?? null;

  root.addEventListener('pointerdown', e => {
    const control = e.target.closest('[data-control]')?.dataset.control;
    if (!control) return;
    e.preventDefault();
    fingers.add(e.pointerId);
    state.press(e.pointerId, control);
  }, opts);

  // A finger sliding from ◀ to ▶ switches; sliding off every button lets go.
  window.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    const control = controlAt(e.clientX, e.clientY);
    if (control) state.press(e.pointerId, control);
    else state.release(e.pointerId);
  }, opts);

  const lift = e => {
    fingers.delete(e.pointerId);
    state.release(e.pointerId);
  };
  window.addEventListener('pointerup', lift, opts);
  window.addEventListener('pointercancel', lift, opts);

  window.addEventListener('keydown', e => {
    const control = KEYS[e.code];
    if (!control) return;
    e.preventDefault();
    state.press(`key:${e.code}`, control);
  }, opts);
  window.addEventListener('keyup', e => {
    if (KEYS[e.code]) state.release(`key:${e.code}`);
  }, opts);

  const letGo = () => { fingers.clear(); state.releaseAll(); };
  window.addEventListener('blur', letGo, opts);
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); }, opts);

  return {
    refresh() {
      for (const button of root.querySelectorAll('[data-control]')) {
        button.classList.toggle('pressed', state.isDown(button.dataset.control));
      }
    },
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add js/inputState.js js/input.js tests/inputState.test.js
git commit -m "feat: multi-touch and keyboard drive controls"
```

---
### Task 8: Vehicle physics

**Files:**
- Create: `js/vehiclePhysics.js`
- Test: `tests/vehiclePhysics.test.js`

**Interfaces:**
- Consumes: `computeStats` (carStats.js), `clamp` (math.js), `MODELS`, `modelToBricks` (instructions.js — tests only), `cannon-es`.
- Produces:
  - `ENGINE_SIGN = -1`, `STEER_SIGN = 1` (pinned by the direction tests below).
  - `createVehicle(world, bricks, { position{x,y,z}, heading }) → Vehicle`
  - `Vehicle = { body, vehicle, stats, applyInput(input), update(dt, input) → flipped:boolean, flip(), resetTo(position, heading), pose() → {x,y,z,heading,speed}, forwardSpeed(), upY() }`
  - `input = { steer?: -1..1 (+ = left), throttle?: 0..1, brake?: 0..1, hold?: boolean }`. `brake` brakes while moving forward faster than 1 m/s, otherwise reverses (when not also on the gas). `hold` locks the wheels (race countdown). No input = gentle rolling resistance.
  - The body's origin is the car's centre of mass; brick boxes are offset by `-centerOfMass`.

Background for the implementer: cannon-es `RaycastVehicle` computes each wheel's forward direction as `surfaceNormal × axle`, where the axle is the vehicle's right-axis (`indexRightAxis: 0` → +x). With up = +y that gives −z, and positive engine force pushes along it — so driving toward +z needs a **negative** force (`ENGINE_SIGN = -1`). Positive steering rotates the front wheels from +z toward +x, which is the driver's left (`STEER_SIGN = 1`). If a direction test fails, flip the matching constant; do not change the test. Suspension stiffness in cannon-es is multiplied by chassis mass, so the same numbers suit light and heavy cars.

- [ ] **Step 1: Write the failing tests**

`tests/vehiclePhysics.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createVehicle } from '../js/vehiclePhysics.js';
import { MODELS, modelToBricks } from '../js/instructions.js';

const STEP = 1 / 60;

function makeWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  return world;
}

function drive(world, car, input, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    car.applyInput(input);
    car.update(STEP, input);
    world.step(STEP);
  }
}

function settledCar(bricks = modelToBricks(MODELS.raceCar)) {
  const world = makeWorld();
  const car = createVehicle(world, bricks, { position: { x: 0, y: 1.2, z: 0 }, heading: 0 });
  drive(world, car, {}, 1.5);
  return { world, car };
}

const upsideDown = car => car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI);

test('a car settles upright on its wheels', () => {
  const { car } = settledCar();
  const y = car.body.position.y;
  assert.ok(car.upY() > 0.95, `upY=${car.upY()}`);
  assert.ok(y > 0.2 && y < 1.2, `y=${y}`);
});

test('GO drives the car forward (+z) in a straight line', () => {
  const { world, car } = settledCar();
  drive(world, car, { throttle: 1 }, 3);
  const p = car.body.position;
  assert.ok(p.z > 8, `z=${p.z}`);
  assert.ok(Math.abs(p.x) < 1.5, `x=${p.x}`);
  assert.ok(car.pose().speed > 5);
});

test('steering left (positive) turns toward +x', () => {
  const { world, car } = settledCar();
  drive(world, car, { throttle: 1, steer: 1 }, 3);
  assert.ok(car.body.position.x > 2, `x=${car.body.position.x}`);
});

test('the car reaches but does not run away past its top speed', () => {
  const { world, car } = settledCar();
  drive(world, car, { throttle: 1 }, 12);
  const v = car.forwardSpeed();
  assert.ok(v > car.stats.topSpeed * 0.8, `v=${v}`);
  assert.ok(v <= car.stats.topSpeed + 1.5, `v=${v}`);
});

test('STOP while moving brakes hard', () => {
  const { world, car } = settledCar();
  drive(world, car, { throttle: 1 }, 3);
  const before = car.forwardSpeed();
  drive(world, car, { brake: 1 }, 1);
  assert.ok(car.forwardSpeed() < before * 0.4, `before=${before} after=${car.forwardSpeed()}`);
});

test('STOP while standing still reverses', () => {
  const { world, car } = settledCar();
  drive(world, car, { brake: 1 }, 2);
  assert.ok(car.body.position.z < -1, `z=${car.body.position.z}`);
});

test('hold keeps the car still (race countdown)', () => {
  const { world, car } = settledCar();
  drive(world, car, { hold: true }, 2);
  assert.ok(car.body.velocity.length() < 0.2);
});

test('flip() puts an upside-down car back on its wheels, lifted up', () => {
  const { car } = settledCar();
  upsideDown(car);
  const y0 = car.body.position.y;
  car.flip();
  assert.ok(car.upY() > 0.99);
  assert.ok(car.body.position.y > y0 + 1);
});

test('a car stuck on its roof rights itself after about 2 seconds', () => {
  const { world, car } = settledCar();
  upsideDown(car);
  car.body.position.y = 1.5;
  drive(world, car, {}, 4);
  assert.ok(car.upY() > 0.9, `upY=${car.upY()}`);
});

test('resetTo places the car at a spot facing a heading', () => {
  const { car } = settledCar();
  car.resetTo({ x: 10, y: 2, z: -5 }, Math.PI / 2);
  const pose = car.pose();
  assert.deepEqual([pose.x, pose.y, pose.z], [10, 2, -5]);
  assert.ok(Math.abs(pose.heading - Math.PI / 2) < 1e-6);
  assert.equal(car.body.velocity.length(), 0);
});

for (const key of Object.keys(MODELS)) {
  test(`${key} drives forward`, () => {
    const { world, car } = settledCar(modelToBricks(MODELS[key]));
    drive(world, car, { throttle: 1 }, 3);
    assert.ok(car.body.position.z > 6, `z=${car.body.position.z}`);
    assert.ok(car.upY() > 0.9);
  });
}

test('a six-wheel car drives forward', () => {
  const bricks = [...modelToBricks(MODELS.raceCar),
    { type: 'wheelSmall', color: 'black', x: -3, y: 0, z: -1, r: 0 },
    { type: 'wheelSmall', color: 'black', x: 2, y: 0, z: -1, r: 0 }];
  const { world, car } = settledCar(bricks);
  assert.equal(car.vehicle.wheelInfos.length, 6);
  drive(world, car, { throttle: 1 }, 3);
  assert.ok(car.body.position.z > 6);
});

test('a very tall tower car still drives forward', () => {
  const tower = Array.from({ length: 10 }, (_, k) => ({ type: 'brick22', color: 'red', x: -1, y: 7 + 3 * k, z: -4, r: 0 }));
  const { world, car } = settledCar([...modelToBricks(MODELS.raceCar), ...tower]);
  drive(world, car, { throttle: 1 }, 3);
  assert.ok(car.body.position.z > 5, `z=${car.body.position.z}`);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/vehiclePhysics.js`.

- [ ] **Step 3: Write `js/vehiclePhysics.js`**

```js
import * as CANNON from 'cannon-es';
import { computeStats } from './carStats.js';
import { clamp } from './math.js';

// The car drives along local +z with +x as its axle. cannon-es pushes each wheel along
// (surface normal × axle) = -z for a positive engine force, so forward needs a negative force.
export const ENGINE_SIGN = -1;
// Positive steering turns the front wheels from +z toward +x: the driver's left.
export const STEER_SIGN = 1;

const UP = new CANNON.Vec3(0, 1, 0);
const FORWARD = new CANNON.Vec3(0, 0, 1);
const REST_LENGTH = 0.3;
const REVERSE_SPEED = 6;
const TIPPED_SECONDS = 2;
const STUCK_SECONDS = 4;

export function createVehicle(world, bricks, { position = { x: 0, y: 1.5, z: 0 }, heading: startHeading = 0 } = {}) {
  const stats = computeStats(bricks);
  const com = stats.centerOfMass;
  const body = new CANNON.Body({ mass: stats.mass, angularDamping: 0.3, linearDamping: 0.02 });
  for (const b of stats.boxes) {
    body.addShape(new CANNON.Box(new CANNON.Vec3(b.hx, b.hy, b.hz)), new CANNON.Vec3(b.cx - com.x, b.cy - com.y, b.cz - com.z));
  }

  const vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
  for (const w of stats.wheels) {
    vehicle.addWheel({
      radius: w.radius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(1, 0, 0),
      // Mount the suspension one rest-length above where the wheel was built, so at rest it sits there.
      chassisConnectionPointLocal: new CANNON.Vec3(w.x - com.x, w.y + REST_LENGTH - com.y, w.z - com.z),
      suspensionRestLength: REST_LENGTH,
      suspensionStiffness: 30,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 1e5,
      maxSuspensionTravel: 0.3,
      rollInfluence: 0.02,
      frictionSlip: stats.frictionSlip,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    });
  }
  vehicle.addToWorld(world);

  const tmp = new CANNON.Vec3();
  let tippedFor = 0;
  let stuckFor = 0;

  function setPose(p, h) {
    body.position.set(p.x, p.y, p.z);
    body.quaternion.setFromAxisAngle(UP, h);
    body.velocity.setZero();
    body.angularVelocity.setZero();
    tippedFor = 0;
    stuckFor = 0;
  }

  function forwardSpeed() {
    body.quaternion.vmult(FORWARD, tmp);
    return body.velocity.dot(tmp);
  }

  function heading() {
    body.quaternion.vmult(FORWARD, tmp);
    return Math.atan2(tmp.x, tmp.z);
  }

  function upY() {
    body.quaternion.vmult(UP, tmp);
    return tmp.y;
  }

  function applyInput({ steer = 0, throttle = 0, brake = 0, hold = false } = {}) {
    const speed = forwardSpeed();
    let force = 0;
    let braking = 0;
    if (hold) braking = stats.brakeForce * 2;
    else if (brake > 0 && speed > 1) braking = stats.brakeForce * brake;
    else if (brake > 0 && throttle === 0) force = speed > -REVERSE_SPEED ? -0.6 * stats.engineForce * brake : 0;
    else if (throttle > 0) force = speed < stats.topSpeed ? stats.engineForce * throttle : 0;
    else braking = stats.mass * 0.004; // gentle rolling resistance when coasting

    const perWheel = (ENGINE_SIGN * force) / stats.wheels.length;
    const maxSteer = 0.5 - Math.min(0.25, Math.abs(speed) * 0.012); // less twitchy at speed
    stats.wheels.forEach((w, i) => {
      vehicle.applyEngineForce(perWheel, i);
      vehicle.setBrake(braking, i);
      vehicle.setSteeringValue(w.front ? STEER_SIGN * clamp(steer, -1, 1) * maxSteer : 0, i);
    });
  }

  function flip() {
    const p = body.position;
    setPose({ x: p.x, y: p.y + 1.5, z: p.z }, heading());
  }

  // Returns true when the car was flipped back over this frame (so the game can play a sound).
  function update(dt, input = {}) {
    tippedFor = upY() < 0.5 ? tippedFor + dt : 0;
    const trying = (input.throttle ?? 0) > 0 || (input.brake ?? 0) > 0;
    stuckFor = trying && body.velocity.length() < 0.3 ? stuckFor + dt : 0;
    if (tippedFor > TIPPED_SECONDS || stuckFor > STUCK_SECONDS) {
      flip();
      return true;
    }
    return false;
  }

  setPose(position, startHeading);

  return {
    body,
    vehicle,
    stats,
    applyInput,
    update,
    flip,
    resetTo: setPose,
    pose: () => ({ x: body.position.x, y: body.position.y, z: body.position.z, heading: heading(), speed: forwardSpeed() }),
    forwardSpeed,
    upY,
  };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 15 physics tests plus all earlier tests. Tuning guide if a test fails:
- direction tests (`forward`, `steering left`, `reverses`) → flip `ENGINE_SIGN` or `STEER_SIGN`;
- `settles` / `rights itself` → check `chassisConnectionPointLocal` uses `w.y + REST_LENGTH - com.y`;
- `brakes hard` → raise the `0.05` brake factor in `carStats.js` (and its test value);
- `top speed` → check the engine force is cut at `stats.topSpeed`.

- [ ] **Step 5: Commit**

```bash
git add js/vehiclePhysics.js tests/vehiclePhysics.test.js
git commit -m "feat: brick cars become cannon-es raycast vehicles"
```

---
### Task 9: App shell — page, styles, meshes, sounds, home screen

**Files:**
- Create: `index.html`, `css/style.css`
- Create: `js/ui.js`, `js/audio.js`, `js/brickMesh.js`, `js/thumbnails.js`, `js/showroom.js`, `js/main.js`

**Interfaces:**
- Consumes: `BRICK_TYPES`, `COLORS`, `STUD`, `LAYER` (bricks.js); `footprint` (snapping.js); `createGarage` (storage.js); `MODELS`, `modelToBricks` (instructions.js).
- Produces:
  - `ui.js`: `$(selector, root?)`, `hexCss(hex) → '#rrggbb'`, `el(tag, props, children) → Element` (props: `class`, `text`, `on<event>` handlers, other attributes), `showScreen(id)`, `toast(text, ms?)`, `openModal({ title, body, buttons:[{label, kind?, onClick?}], className }) → close()`, `closeModals()`, `confirmDialog(text, {yes, no}) → Promise<boolean>`, `askName(defaultName) → Promise<string|null>`.
  - `audio.js`: `unlockAudio()`, `sfx.{snap, pop, wrong, success, beep, go, fanfare, flip}()`, `speak(text)`, `createEngineSound() → { setSpeed(mps), silence(), stop() }`.
  - `brickMesh.js`: `colorMaterial(color)`, `ghostMaterial(hex)`, `createBrickMesh(brick, { ghost?: hex }) → THREE.Group` (positioned in car-local metres, every descendant has `userData.brick`), `createWheelMesh(type, color, pick?) → THREE.Group` (centred, axle along x), `createCarMesh(bricks, { includeWheels = true }) → THREE.Group`, `carLift(bricks) → metres` (how far to raise a car so its wheels touch y = 0).
  - `thumbnails.js`: `brickThumbnail(type, color) → dataURL`, `carThumbnail(bricks, cacheKey) → dataURL`.
  - `showroom.js`: `createShowroom(bricks) → Mode` with `isShowroom: true`.
  - A **Mode** is `{ scene, camera, update(dt), resize(w, h), dispose() }`; `main.js` renders exactly one at a time.
  - `main.js` creates the global `app = { renderer, garage, setMode(mode), goHome(), openGarage(), chooseBuild(), openBuilder(opts), startRace(car) }`. In this task `openGarage`, `openBuilder` and `startRace` are placeholders that show a "coming soon" toast; Tasks 10, 11, 12 and 14 replace them.

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Brick Racers">
  <meta name="theme-color" content="#8fd3ff">
  <title>Brick Racers</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
      "cannon-es": "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js"
    }
  }
  </script>
</head>
<body>
  <canvas id="scene"></canvas>

  <section id="home" class="screen">
    <h1 class="logo">Brick<br><span>Racers</span></h1>
    <button class="big-btn build" data-action="build">🧱 Build</button>
    <button class="big-btn race" data-action="race">🏁 Race</button>
    <button class="big-btn garage" data-action="garage">🚗 My Garage</button>
  </section>

  <section id="garage" class="screen hidden">
    <header class="bar">
      <button class="icon-btn" data-action="home" aria-label="Home">🏠</button>
      <h2>My Garage</h2>
    </header>
    <div id="garage-list" class="garage-list"></div>
  </section>

  <section id="build" class="screen hidden passthrough">
    <header class="bar">
      <button class="icon-btn" data-tool="home" aria-label="Home">🏠</button>
      <div class="tools">
        <button class="tool-btn" data-tool="undo">↶<small>Undo</small></button>
        <button class="tool-btn" data-tool="rotate">⟳<small>Turn</small></button>
        <button class="tool-btn" data-tool="delete">🗑<small>Remove</small></button>
        <button class="tool-btn" data-tool="clear">✖<small>Clear</small></button>
      </div>
      <button class="go-btn" data-tool="done">🏁 Race!</button>
    </header>
    <aside id="instruction-card" class="card hidden">
      <div class="step-count"></div>
      <img class="step-img" alt="">
      <p class="step-text"></p>
      <button class="icon-btn speak" data-tool="speak" aria-label="Read it to me">🔊</button>
    </aside>
    <aside id="checklist" class="card hidden"></aside>
    <button id="place-btn" class="place-btn hidden" data-tool="place">✓ Place</button>
    <footer class="tray-wrap">
      <div id="colors" class="colors"></div>
      <div id="tray" class="tray"></div>
    </footer>
  </section>

  <section id="race" class="screen hidden passthrough">
    <div class="hud-top">
      <div class="hud-pos"><span id="hud-position">1st</span><small id="hud-lap">Lap 1/3</small></div>
      <canvas id="minimap" width="360" height="360"></canvas>
    </div>
    <button class="icon-btn pause-btn" data-race="pause" aria-label="Pause">⏸</button>
    <button class="flip-btn" data-race="flip">🙃 Flip me!</button>
    <div id="countdown" class="countdown hidden"></div>
    <div class="pad left">
      <button class="pad-btn" data-control="left" aria-label="Steer left">◀</button>
      <button class="pad-btn" data-control="right" aria-label="Steer right">▶</button>
    </div>
    <div class="pad right">
      <button class="pad-btn stop" data-control="stop">STOP</button>
      <button class="pad-btn go" data-control="go">GO</button>
    </div>
  </section>

  <div id="modal-root"></div>
  <div id="toast" class="toast hidden"></div>
  <div id="rotate-hint">Turn your iPad sideways to race! ↻</div>

  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `css/style.css`**

```css
:root {
  --ink: #1d2a44;
  --sky: #8fd3ff;
  --card: rgba(255, 255, 255, 0.94);
  --red: #e53935;
  --yellow: #fdd835;
  --green: #43a047;
  --blue: #1e88e5;
  --orange: #fb8c00;
  --shadow: 0 6px 0 rgba(0, 0, 0, 0.18);
  --font: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif;
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body {
  margin: 0; height: 100%; overflow: hidden; background: var(--sky); color: var(--ink); font-family: var(--font);
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; overscroll-behavior: none;
}
#scene { position: fixed; inset: 0; display: block; touch-action: none; }
button { font: inherit; color: inherit; border: 0; cursor: pointer; touch-action: manipulation; }
.hidden { display: none !important; }

.screen {
  position: fixed; inset: 0;
  padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
}
/* Overlay screens let touches through to the 3D canvas except on their own controls. */
.passthrough { pointer-events: none; }
.passthrough > * { pointer-events: auto; }

/* Buttons */
.big-btn { display: block; width: min(360px, 80vw); margin: 12px 0; padding: 18px 28px; font-size: 34px; font-weight: 700; border-radius: 22px; color: #fff; box-shadow: var(--shadow); text-align: left; }
.big-btn.build { background: var(--orange); }
.big-btn.race { background: var(--red); }
.big-btn.garage { background: var(--blue); }
.icon-btn { width: 64px; height: 64px; font-size: 30px; border-radius: 18px; background: var(--card); box-shadow: var(--shadow); }
.tool-btn { min-width: 72px; height: 64px; padding: 4px 10px; font-size: 26px; line-height: 1; border-radius: 18px; background: var(--card); box-shadow: var(--shadow); display: inline-flex; flex-direction: column; align-items: center; justify-content: center; }
.tool-btn small { font-size: 13px; margin-top: 4px; }
.tool-btn.active { background: var(--yellow); }
.tool-btn.danger { background: #ffd6d6; }
.go-btn { height: 64px; padding: 0 24px; font-size: 26px; font-weight: 700; color: #fff; background: var(--green); border-radius: 18px; box-shadow: var(--shadow); }
.go-btn.disabled { background: #9e9e9e; }
.big-btn:active, .go-btn:active, .tool-btn:active, .icon-btn:active, .place-btn:active, .flip-btn:active { transform: translateY(4px); box-shadow: 0 2px 0 rgba(0, 0, 0, 0.18); }

/* Home */
#home { display: flex; flex-direction: column; justify-content: center; padding-left: max(48px, env(safe-area-inset-left)); }
.logo { margin: 0 0 16px; font-size: clamp(52px, 8vw, 88px); line-height: 0.95; color: #fff; text-shadow: 0 5px 0 var(--red), 0 10px 0 rgba(0, 0, 0, 0.2); }
.logo span { color: var(--yellow); }

/* Top bar */
.bar { display: flex; align-items: center; gap: 12px; }
.bar h2 { margin: 0; font-size: 34px; color: #fff; text-shadow: 0 3px 0 rgba(0, 0, 0, 0.25); }
.tools { display: flex; gap: 10px; margin: 0 auto 0 8px; }

/* Garage */
#garage { display: flex; flex-direction: column; gap: 16px; background: rgba(143, 211, 255, 0.55); }
.garage-list { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; align-content: start; padding-bottom: 24px; touch-action: pan-y; }
.car-card { background: var(--card); border-radius: 22px; padding: 12px; box-shadow: var(--shadow); display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.car-card img { width: 160px; height: 160px; }
.car-card h3 { margin: 0; font-size: 22px; overflow-wrap: anywhere; }
.car-card.new { justify-content: center; min-height: 260px; font-size: 22px; font-weight: 700; color: var(--blue); }
.car-card .plus { font-size: 72px; line-height: 1; }
.card-actions { display: flex; gap: 8px; }
.card-actions .go-btn { height: 56px; font-size: 22px; padding: 0 16px; }
.card-actions .tool-btn { height: 56px; min-width: 56px; }
.empty { grid-column: 1 / -1; font-size: 22px; color: #fff; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.25); }

/* Workshop */
#build { display: flex; flex-direction: column; }
.card { background: var(--card); border-radius: 22px; box-shadow: var(--shadow); padding: 14px; }
#instruction-card { position: absolute; top: 96px; left: 12px; width: 230px; text-align: center; }
.step-count { font-weight: 700; color: var(--blue); font-size: 18px; }
.step-img { width: 120px; height: 120px; }
.step-text { margin: 4px 0 8px; font-size: 20px; line-height: 1.2; }
#instruction-card .speak { width: 56px; height: 56px; font-size: 26px; }
#checklist { position: absolute; top: 96px; right: 12px; width: 240px; font-size: 18px; }
#checklist h3 { margin: 0 0 6px; font-size: 20px; }
.check { padding: 3px 0; opacity: 0.75; }
.check.ok { opacity: 1; font-weight: 700; color: var(--green); }
.place-btn { position: absolute; right: 24px; bottom: 210px; height: 72px; padding: 0 28px; font-size: 28px; font-weight: 700; color: #fff; background: var(--green); border-radius: 36px; box-shadow: var(--shadow); }
.tray-wrap { position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 12px max(12px, env(safe-area-inset-bottom)); background: linear-gradient(transparent, rgba(255, 255, 255, 0.65) 30%); }
.colors { display: flex; gap: 10px; justify-content: center; margin-bottom: 8px; }
.swatch { width: 48px; height: 48px; border-radius: 50%; border: 4px solid #fff; box-shadow: 0 3px 0 rgba(0, 0, 0, 0.2); }
.swatch.selected { transform: scale(1.18); border-color: var(--ink); }
.tray { display: flex; gap: 10px; overflow-x: auto; padding: 4px 4px 8px; touch-action: pan-x; scrollbar-width: none; }
.tray::-webkit-scrollbar { display: none; }
.tray-item { flex: 0 0 auto; width: 104px; padding: 6px; background: var(--card); border-radius: 18px; box-shadow: var(--shadow); display: flex; flex-direction: column; align-items: center; font-size: 13px; font-weight: 600; border: 4px solid transparent; }
.tray-item img { width: 72px; height: 72px; }
.tray-item.selected { border-color: var(--blue); background: #e3f2fd; }
.needed { animation: pulse 1s ease-in-out infinite; border-color: var(--yellow) !important; }
.wiggle { animation: wiggle 0.5s ease-in-out; }
@keyframes pulse { 50% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(253, 216, 53, 0.6); } }
@keyframes wiggle { 20% { transform: rotate(-8deg); } 40% { transform: rotate(8deg); } 60% { transform: rotate(-5deg); } 80% { transform: rotate(5deg); } }
#build.guided .tools, #build.guided [data-tool="done"], #build.guided #checklist, #build.guided #place-btn { display: none !important; }

/* Race */
#race .hud-top { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 12px; right: 12px; display: flex; justify-content: space-between; align-items: flex-start; pointer-events: none; }
.hud-pos { margin-left: 80px; background: var(--card); border-radius: 20px; padding: 8px 18px; box-shadow: var(--shadow); text-align: center; }
#hud-position { display: block; font-size: 44px; font-weight: 700; color: var(--red); line-height: 1; }
#hud-lap { font-size: 20px; font-weight: 600; }
#minimap { width: 180px; height: 180px; background: rgba(255, 255, 255, 0.55); border-radius: 22px; }
.pause-btn { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 12px; }
.flip-btn { position: absolute; right: 24px; top: 216px; height: 60px; padding: 0 18px; font-size: 22px; font-weight: 700; background: var(--yellow); border-radius: 30px; box-shadow: var(--shadow); }
#race .countdown { position: absolute; inset: 0; display: grid; place-items: center; font-size: 180px; font-weight: 700; color: #fff; text-shadow: 0 10px 0 var(--red); pointer-events: none; }
.pad { position: absolute; bottom: max(20px, env(safe-area-inset-bottom)); display: flex; align-items: flex-end; gap: 16px; }
.pad.left { left: max(20px, env(safe-area-inset-left)); }
.pad.right { right: max(20px, env(safe-area-inset-right)); }
.pad-btn { width: 120px; height: 120px; border-radius: 28px; font-size: 48px; font-weight: 700; background: rgba(255, 255, 255, 0.85); box-shadow: var(--shadow); touch-action: none; }
.pad-btn.go { width: 140px; height: 140px; font-size: 34px; color: #fff; background: var(--green); }
.pad-btn.stop { font-size: 26px; color: #fff; background: var(--red); }
.pad-btn.pressed { transform: translateY(5px) scale(0.96); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2); filter: brightness(1.1); }

/* Modals and toasts */
.modal-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 16px; background: rgba(20, 40, 70, 0.45); }
.modal { width: min(560px, 100%); max-height: 90vh; overflow-y: auto; padding: 24px; text-align: center; background: #fff; border-radius: 28px; box-shadow: 0 10px 0 rgba(0, 0, 0, 0.2); }
.modal h2 { margin: 0 0 12px; font-size: 34px; }
.modal p { margin: 8px 0; font-size: 20px; }
.modal-buttons { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 18px; }
.modal-buttons button { min-height: 60px; padding: 0 22px; font-size: 22px; font-weight: 700; border-radius: 18px; background: #eceff1; box-shadow: var(--shadow); }
.modal-buttons button.go { color: #fff; background: var(--green); }
.modal input { width: 100%; padding: 12px 16px; font: inherit; font-size: 26px; text-align: center; border: 3px solid var(--blue); border-radius: 16px; -webkit-user-select: text; user-select: text; }
.model-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.model-card { display: flex; flex-direction: column; align-items: center; padding: 10px; font-size: 20px; font-weight: 700; background: #f5f9ff; border-radius: 20px; box-shadow: var(--shadow); }
.model-card img, .model-card .free { width: 120px; height: 120px; }
.model-card .free { display: grid; place-items: center; font-size: 64px; }
.model-card small { font-weight: 500; color: #546e7a; }
.done-img { width: 200px; height: 200px; }
.results { display: inline-block; margin: 12px 0 0; padding: 0; list-style: none; font-size: 26px; text-align: left; }
.results li { padding: 4px 12px; border-radius: 12px; }
.results li.me { font-weight: 700; background: #fff59d; }
.toast { position: fixed; top: 24px; left: 50%; z-index: 30; max-width: 90vw; padding: 14px 24px; transform: translateX(-50%); font-size: 24px; font-weight: 600; text-align: center; color: #fff; background: var(--ink); border-radius: 20px; box-shadow: var(--shadow); pointer-events: none; }

#rotate-hint { display: none; }
@media (orientation: portrait) and (max-width: 900px) {
  body.racing #rotate-hint { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 24px; font-size: 32px; font-weight: 700; text-align: center; color: #fff; background: var(--sky); text-shadow: 0 3px 0 rgba(0, 0, 0, 0.25); }
}
/* iPad mini and smaller */
@media (max-width: 760px), (max-height: 600px) {
  .pad-btn { width: 96px; height: 96px; font-size: 38px; }
  .pad-btn.go { width: 110px; height: 110px; }
  #minimap { width: 130px; height: 130px; }
  .tray-item { width: 88px; }
  .tray-item img { width: 56px; height: 56px; }
  #instruction-card { width: 190px; }
  .step-img { width: 90px; height: 90px; }
  #checklist { width: 200px; font-size: 16px; }
  .place-btn { bottom: 180px; }
}
```

- [ ] **Step 3: Write `js/ui.js`**

```js
export const $ = (selector, root = document) => root.querySelector(selector);
export const hexCss = hex => '#' + hex.toString(16).padStart(6, '0');

// Small element builder. Text always goes in via textContent, so car names can never inject HTML.
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
}

export function showScreen(id) {
  for (const screen of document.querySelectorAll('.screen')) screen.classList.toggle('hidden', screen.id !== id);
}

let toastTimer = 0;
export function toast(text, ms = 2200) {
  const node = $('#toast');
  node.textContent = text;
  node.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), ms);
}

// A button's onClick may return false to keep the modal open.
export function openModal({ title = '', body = [], buttons = [], className = '' } = {}) {
  const close = () => backdrop.remove();
  const backdrop = el('div', { class: 'modal-backdrop' }, [
    el('div', { class: `modal ${className}` }, [
      title ? el('h2', { text: title }) : null,
      ...[].concat(body),
      el('div', { class: 'modal-buttons' }, buttons.map(b => el('button', {
        class: b.kind ?? '',
        text: b.label,
        onclick: () => { if (b.onClick?.() !== false) close(); },
      }))),
    ]),
  ]);
  $('#modal-root').append(backdrop);
  return close;
}

export function closeModals() {
  $('#modal-root').replaceChildren();
}

export function confirmDialog(text, { yes = 'Yes', no = 'No' } = {}) {
  return new Promise(resolve => openModal({
    title: text,
    buttons: [{ label: no, onClick: () => resolve(false) }, { label: yes, kind: 'go', onClick: () => resolve(true) }],
  }));
}

export function askName(defaultName) {
  return new Promise(resolve => {
    const input = el('input', { type: 'text', maxlength: '24', value: defaultName, 'aria-label': 'Car name', enterkeyhint: 'done' });
    const close = openModal({
      title: 'Name your car',
      body: [input],
      buttons: [{ label: 'Cancel', onClick: () => resolve(null) }, { label: 'Save ✓', kind: 'go', onClick: () => resolve(input.value) }],
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { resolve(input.value); close(); }
    });
    setTimeout(() => input.select(), 50);
  });
}
```

- [ ] **Step 4: Write `js/audio.js`**

```js
// All sounds are made with oscillators: no audio files to download or license.
let ctx = null;

// iPad Safari only allows sound after a touch, so main.js calls this on every pointerdown.
export function unlockAudio() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, duration, { type = 'sine', volume = 0.2, delay = 0, slideTo = null } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sfx = {
  snap() { tone(1200, 0.05, { type: 'square', volume: 0.12 }); tone(1800, 0.06, { type: 'square', volume: 0.08, delay: 0.04 }); },
  pop() { tone(500, 0.12, { slideTo: 220, volume: 0.18 }); },
  wrong() { tone(260, 0.14, { type: 'triangle', volume: 0.25 }); tone(200, 0.2, { type: 'triangle', volume: 0.25, delay: 0.12 }); },
  success() { [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', delay: i * 0.09 })); },
  beep() { tone(660, 0.18, { type: 'square', volume: 0.12 }); },
  go() { tone(990, 0.5, { type: 'square', volume: 0.14 }); },
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, { type: 'triangle', volume: 0.22, delay: i * 0.13 })); },
  flip() { tone(300, 0.35, { slideTo: 900, volume: 0.2 }); },
};

export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.1;
  speechSynthesis.speak(utterance);
}

export function createEngineSound() {
  if (!ctx) return { setSpeed() {}, silence() {}, stop() {} };
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  gain.gain.value = 0;
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start();
  return {
    setSpeed(mps) {
      const t = ctx.currentTime;
      osc.frequency.setTargetAtTime(55 + mps * 7, t, 0.1);
      gain.gain.setTargetAtTime(0.035 + Math.min(mps, 20) * 0.002, t, 0.1);
    },
    silence() { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); },
    stop() { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); osc.stop(ctx.currentTime + 0.3); },
  };
}
```

- [ ] **Step 5: Write `js/brickMesh.js`**

```js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRICK_TYPES, COLORS, STUD, LAYER } from './bricks.js';
import { footprint } from './snapping.js';

const GAP = 0.012; // tiny gap so neighbouring bricks read as separate pieces
const STUD_RADIUS = STUD * 0.3;
const STUD_HEIGHT = LAYER * 0.45;

// Geometries and materials are shared by every brick and never disposed.
const geometries = new Map();
const materials = new Map();
const cached = (map, key, make) => {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
};
const geo = (key, make) => cached(geometries, key, make);
const fixed = (key, options) => cached(materials, `fixed:${key}`, () => new THREE.MeshStandardMaterial(options));
const chrome = () => fixed('chrome', { color: 0xdddddd, roughness: 0.2, metalness: 0.9 });
const dark = () => fixed('dark', { color: 0x263238, roughness: 0.6 });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function colorMaterial(color) {
  return cached(materials, `color:${color}`, () => new THREE.MeshStandardMaterial({ color: COLORS[color].hex, roughness: 0.35, metalness: 0.05 }));
}

export function ghostMaterial(hex) {
  return cached(materials, `ghost:${hex}`, () => new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: 0.4, transparent: true, opacity: 0.5, depthWrite: false,
  }));
}

// A w×d×h block standing on y = 0 with studs on top; slopes drop to one layer at the +z end and keep studs on the back row.
function blockGeometry(w, d, h, { slope = false } = {}) {
  const W = w * STUD - GAP;
  const D = d * STUD - GAP;
  const H = h * LAYER;
  const body = box(W, H, D);
  body.translate(0, H / 2, 0);
  if (slope) {
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > H / 2 && pos.getZ(i) > 0) pos.setY(i, LAYER);
    body.computeVertexNormals();
  }
  const parts = [body];
  for (let i = 0; i < w; i++) {
    for (let k = 0; k < d; k++) {
      if (slope && k > 0) continue;
      const stud = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 14);
      stud.translate((i - (w - 1) / 2) * STUD, H + STUD_HEIGHT / 2, (k - (d - 1) / 2) * STUD);
      parts.push(stud);
    }
  }
  return mergeGeometries(parts);
}

export function createWheelMesh(type, color, pick = m => m) {
  const r = BRICK_TYPES[type].radius;
  const wheel = new THREE.Group();
  const parts = [
    [geo(`tire:${r}`, () => new THREE.CylinderGeometry(r, r, 0.4, 24).rotateZ(Math.PI / 2)), fixed('tire', { color: 0x1b1b1b, roughness: 0.9 })],
    [geo(`hub:${r}`, () => new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.42, 16).rotateZ(Math.PI / 2)), colorMaterial(color)],
    [geo(`spoke:${r}`, () => box(0.44, r * 0.18, r * 1.05)), chrome()],
  ];
  for (const [g, m] of parts) {
    const mesh = new THREE.Mesh(g, pick(m));
    mesh.castShadow = true;
    wheel.add(mesh);
  }
  return wheel;
}

export function createBrickMesh(brick, { ghost = null } = {}) {
  const t = BRICK_TYPES[brick.type];
  const { w, d } = footprint(brick.type, brick.r);
  const group = new THREE.Group();
  const paint = colorMaterial(brick.color);
  const pick = material => (ghost === null ? material : ghostMaterial(ghost));
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, pick(material));
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = ghost === null;
    group.add(mesh);
    return mesh;
  };
  const W = t.w * STUD - GAP;
  const D = t.d * STUD - GAP;
  const H = t.h * LAYER;

  switch (t.kind) {
    case 'plate':
    case 'brick':
      add(geo(`block:${t.w}:${t.d}:${t.h}`, () => blockGeometry(t.w, t.d, t.h)), paint);
      break;
    case 'slope':
      add(geo(`slope:${t.w}:${t.d}:${t.h}`, () => blockGeometry(t.w, t.d, t.h, { slope: true })), paint);
      break;
    case 'wheel': {
      const wheel = createWheelMesh(brick.type, brick.color, pick);
      wheel.position.y = LAYER / 2;
      group.add(wheel);
      break;
    }
    case 'engine':
      add(geo('engine:base', () => box(W, LAYER * 2, D)), paint, 0, LAYER, 0);
      add(geo('engine:block', () => box(W * 0.7, LAYER, D * 0.7)), fixed('metal', { color: 0x78909c, roughness: 0.4, metalness: 0.6 }), 0, LAYER * 2.5, 0);
      for (const x of [-0.15, 0.15]) add(geo('engine:pipe', () => new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10)), chrome(), x, H + 0.1, -0.25);
      break;
    case 'seat':
      add(geo('seat:base', () => box(W, LAYER, D)), paint, 0, LAYER / 2, 0);
      add(geo('seat:back', () => box(W, H, LAYER)), paint, 0, H / 2, -D / 2 + LAYER / 2);
      add(geo('driver:body', () => box(0.4, 0.32, 0.24)), fixed('shirt', { color: 0x1e88e5, roughness: 0.6 }), 0, LAYER + 0.16, 0);
      add(geo('driver:head', () => new THREE.CylinderGeometry(0.12, 0.12, 0.2, 16)), fixed('skin', { color: 0xffd23f, roughness: 0.5 }), 0, LAYER + 0.43, 0);
      add(geo('driver:helmet', () => new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), paint, 0, LAYER + 0.5, 0);
      break;
    case 'steering': {
      add(geo('steering:post', () => new THREE.CylinderGeometry(0.03, 0.03, H * 0.8, 8)), dark(), 0, H * 0.4, 0);
      const ring = add(geo('steering:ring', () => new THREE.TorusGeometry(0.15, 0.035, 8, 24)), paint, 0, H * 0.85, -0.03);
      ring.rotation.x = -0.5;
      break;
    }
    case 'spoiler': {
      for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) add(geo('spoiler:post', () => new THREE.CylinderGeometry(0.04, 0.04, H * 0.75, 8)), dark(), x, H * 0.375, 0);
      const wing = add(geo('spoiler:wing', () => box(W, 0.06, D * 1.6)), paint, 0, H * 0.8, 0);
      wing.rotation.x = 0.15;
      break;
    }
    case 'lights':
      add(geo('lights:body', () => box(W, H, D)), paint, 0, H / 2, 0);
      for (const x of [-0.22, 0.22]) {
        add(geo('lights:lamp', () => box(0.3, 0.16, 0.04)), fixed('lamp', { color: 0xfff6c0, emissive: 0xffe680, emissiveIntensity: 0.9 }), x, H / 2, D / 2 + 0.01);
      }
      break;
  }

  // Bricks are built around their own centre, then moved to their grid spot and turned.
  group.position.set((brick.x + w / 2) * STUD, brick.y * LAYER, (brick.z + d / 2) * STUD);
  group.rotation.y = (brick.r * Math.PI) / 2;
  group.traverse(node => { node.userData.brick = brick; });
  return group;
}

export function createCarMesh(bricks, { includeWheels = true } = {}) {
  const car = new THREE.Group();
  for (const b of bricks) {
    if (includeWheels || BRICK_TYPES[b.type]?.kind !== 'wheel') car.add(createBrickMesh(b));
  }
  return car;
}

// Wheels are centred half a layer up, so a car must be lifted by (biggest radius - LAYER/2) to stand on y = 0.
export function carLift(bricks) {
  const radii = bricks.filter(b => BRICK_TYPES[b.type]?.kind === 'wheel').map(b => BRICK_TYPES[b.type].radius);
  return Math.max(0.35, ...radii) - LAYER / 2;
}
```

- [ ] **Step 6: Write `js/thumbnails.js`**

```js
import * as THREE from 'three';
import { createBrickMesh, createCarMesh } from './brickMesh.js';

// One small offscreen renderer makes every picture in the tray, instruction card and garage.
let renderer = null;
let scene = null;
let camera = null;
const cache = new Map();

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(160, 160);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
}

function snapshot(object) {
  if (!renderer) setup();
  scene.add(object);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3()).length();
  const center = bounds.getCenter(new THREE.Vector3());
  camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1.2).normalize().multiplyScalar(size * 1.9));
  camera.lookAt(center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(object);
  return url;
}

export function brickThumbnail(type, color) {
  const key = `brick:${type}:${color}`;
  if (!cache.has(key)) cache.set(key, snapshot(createBrickMesh({ type, color, x: 0, y: 0, z: 0, r: 0 })));
  return cache.get(key);
}

export function carThumbnail(bricks, cacheKey) {
  const key = `car:${cacheKey}`;
  if (!cache.has(key)) cache.set(key, snapshot(createCarMesh(bricks)));
  return cache.get(key);
}
```

- [ ] **Step 7: Write `js/showroom.js`**

```js
import * as THREE from 'three';
import { createCarMesh, carLift } from './brickMesh.js';

// Home and garage background: the newest car spinning on a yellow turntable.
export function createShowroom(bricks) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 25, 70);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6fbf5f, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(5, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x6fcf5f }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const turntable = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0xfdd835 }));
  disc.position.y = 0.15;
  disc.receiveShadow = true;
  turntable.add(disc);
  const car = createCarMesh(bricks);
  car.position.y = 0.3 + carLift(bricks);
  turntable.add(car);
  scene.add(turntable);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  return {
    scene,
    camera,
    isShowroom: true,
    update(dt) { turntable.rotation.y += dt * 0.6; },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // In landscape, aim the camera left of the car so the car sits to the right of the menu.
      const shift = w > h ? -3.2 : 0;
      camera.position.set(shift, 3.4, 10);
      camera.lookAt(shift, 1, 0);
    },
    dispose() {
      ground.geometry.dispose();
      ground.material.dispose();
      disc.geometry.dispose();
      disc.material.dispose();
    },
  };
}
```

- [ ] **Step 8: Write `js/main.js`**

```js
import * as THREE from 'three';
import { createGarage } from './storage.js';
import { MODELS, modelToBricks } from './instructions.js';
import { showScreen, toast, closeModals } from './ui.js';
import { unlockAudio } from './audio.js';
import { createShowroom } from './showroom.js';

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
    resize();
  },
  goHome() {
    showScreen('home');
    app.setMode(createShowroom(showroomBricks()));
  },
  openGarage() {
    toast('The garage is coming soon!');
  },
  chooseBuild() {
    app.openBuilder({});
  },
  openBuilder() {
    toast('The workshop is coming soon!');
  },
  startRace() {
    toast('The race track is coming soon!');
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
```

- [ ] **Step 9: Check it in the browser**

Start the dev server with the browser pane (`preview_start` name `brick-racers`, or `npm start`) and open http://localhost:8080 at 1024×768.
Expected:
- Sky-blue page, "Brick Racers" logo and three big buttons (Build / Race / My Garage) on the left.
- A red race car built from studded bricks (4 black wheels, white seat with a yellow-headed driver, black engine with chrome pipes, red spoiler) spins on a yellow turntable on the right, with shadows.
- Tapping Build shows "The workshop is coming soon!"; Race shows "Build a car first!" then the workshop toast.
- Browser console has no errors (warnings about the font are fine).
- In the console, `(await import('/js/thumbnails.js')).brickThumbnail('slope22', 'orange')` returns a `data:image/png` URL; open it in a new tab — an orange slope with two studs on the back row.

Run: `npm test`
Expected: PASS (nothing in Node changed).

- [ ] **Step 10: Commit**

```bash
git add index.html css/style.css js/ui.js js/audio.js js/brickMesh.js js/thumbnails.js js/showroom.js js/main.js
git commit -m "feat: app shell, brick meshes, sounds and home showroom"
```

---
### Task 10: Free-build workshop

**Files:**
- Create: `js/builder.js`
- Modify: `js/main.js` (replace the `openBuilder` placeholder)

**Interfaces:**
- Consumes: bricks.js (`BRICK_TYPES`, `COLORS`, `COLOR_KEYS`, `TRAY_ORDER`, `STUD`, `LAYER`, `makeChassis`); snapping.js (`canPlace`, `candidateFromHit`, `footprint`, `nearestWheelSlot`); carStats.js (`raceReadiness`); brickMesh.js (`createBrickMesh`, `carLift`); thumbnails.js (`brickThumbnail`); ui.js (`$`, `el`, `hexCss`, `toast`, `confirmDialog`, `askName`, `showScreen`); audio.js (`sfx`); `app` from main.js.
- Produces: `createBuilder(app, { car = null } = {}) → Mode`. `car` is a saved Car to edit (saving overwrites it); without it a new car starts from the chassis. Inside the closure, Task 11 relies on these names: `scene`, `carGroup`, `ui`, `bricks`, `pick(clientX, clientY, extra = []) → Hit | null`, `candidateFor(hit) → { cand, cell }`, `addBrick(brick)`, `selectedType`, `selectedColor`, `guide` (initially `null`), `dirty`, and the block `buildTray(); updateChecklist();` right before `return {`.
- A **Hit** is `{ object, brick, point (car-local THREE.Vector3), normal (world THREE.Vector3), isTarget }`.

Workshop rules (from the spec): one finger orbits, two fingers pinch-zoom. On touch, the first tap shows a ghost (green = fits, red = doesn't); tapping the same spot again, tapping the ghost, or pressing **✓ Place** places it. With a mouse, hovering shows the ghost and a click places. Wheels snap to the nearest wheel slot. The chassis can't be removed.

- [ ] **Step 1: Write `js/builder.js`**

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BRICK_TYPES, COLORS, COLOR_KEYS, TRAY_ORDER, STUD, LAYER, makeChassis } from './bricks.js';
import { canPlace, candidateFromHit, footprint, nearestWheelSlot } from './snapping.js';
import { raceReadiness } from './carStats.js';
import { createBrickMesh, carLift } from './brickMesh.js';
import { brickThumbnail } from './thumbnails.js';
import { $, el, hexCss, toast, confirmDialog, askName, showScreen } from './ui.js';
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

export function createBuilder(app, { car = null } = {}) {
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
  ui.classList.remove('guided');
  checklist.classList.remove('hidden');
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
    addBrick(brick);
    undoStack.push({ op: 'add', brick });
    sfx.snap();
    hideGhost();
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
    const hit = pick(e.clientX, e.clientY);
    if (!hit) return hideGhost();
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
    const hit = pick(x, y, ghost ? [ghost] : []);
    if (!hit) return hideGhost();
    if (ghost && belongsTo(hit.object, ghost)) {
      tryPlace(ghostCand);
      return;
    }
    lastHit = hit;
    const { cand } = candidateFor(hit);
    if (pointerType === 'mouse' || sameBrick(cand, ghostCand)) tryPlace(cand);
    else showGhost(cand);
  }

  // --- tray, colours and tool buttons ---
  function buildTray() {
    tray.replaceChildren(...TRAY_ORDER.map(type => el('button', { class: 'tray-item', 'data-type': type }, [
      el('img', { alt: '' }),
      el('span', { text: BRICK_TYPES[type].name }),
    ])));
    colors.replaceChildren(...COLOR_KEYS.map(key => el('button', {
      class: 'swatch', 'data-color': key, 'aria-label': COLORS[key].name, style: `background:${hexCss(COLORS[key].hex)}`,
    })));
    refreshTray();
  }

  function refreshTray() {
    for (const item of tray.children) {
      item.classList.toggle('selected', item.dataset.type === selectedType);
      item.querySelector('img').src = brickThumbnail(item.dataset.type, selectedColor);
    }
    for (const swatch of colors.children) swatch.classList.toggle('selected', swatch.dataset.color === selectedColor);
    deleteBtn.classList.toggle('active', deleteMode);
  }

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
      abort.abort();
      orbit.dispose();
      guide?.dispose();
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
```

Note: the chassis checklist line is left out on purpose — the chassis is always there.

- [ ] **Step 2: Hook it into `js/main.js`**

Add the import below the `createShowroom` import:
```js
import { createBuilder } from './builder.js';
```

Replace:
```js
  openBuilder() {
    toast('The workshop is coming soon!');
  },
```
with:
```js
  openBuilder(options = {}) {
    app.setMode(createBuilder(app, options));
  },
```

- [ ] **Step 3: Check it in the browser** (1024×768, then emulate touch with the `mobile`-style viewport or real touch if available)

Expected:
- Build → workshop: green studded baseplate, black chassis in the middle, tray of 12 brick pictures at the bottom, 8 colour dots above it, checklist top-right with three ⬜ items, grey "🏁 Race!" button.
- Dragging on empty space orbits; scroll/pinch zooms between near and far limits; the camera never goes under the baseplate.
- Pick "Brick 2×4", hover the chassis with a mouse → green ghost following the studs; click → brick snaps in with a click sound. Hovering a spot where it would overlap → red ghost; clicking → "Oops! Something is already there."
- Touch flow (enable touch emulation): first tap shows the ghost and a "✓ Place" button; second tap on the same spot or on ✓ Place places it.
- Turn button rotates the ghost a quarter turn. Remove mode: tapping a brick removes it; tapping the chassis says "The chassis has to stay!". Undo restores removed bricks and removes added ones. Clear asks first.
- Pick "Small Wheel", tap near each corner → wheels snap to the corner slots; the whole car lifts so the wheels sit on the baseplate. Big wheels lift it more.
- Add an engine and a seat → all checklist items ✅, Race! turns green. Race! with something missing shows "Your car still needs …".
- Race! → "Name your car" box → Save → toast "The race track is coming soon!" and the car is saved: in the console `brickRacers.garage.list()` shows it.
- 🏠 with unsaved changes asks "Leave without saving your car?"; Stay keeps you in the workshop.

- [ ] **Step 4: Commit**

```bash
git add js/builder.js js/main.js
git commit -m "feat: free-build workshop with ghost placement, undo and race checklist"
```

---
### Task 11: Guided building and the build chooser

**Files:**
- Create: `js/confetti.js`, `js/guide.js`, `js/chooser.js`
- Modify: `js/builder.js` (accept `modelKey`, start the guide, celebrate when done)
- Modify: `js/main.js` (`chooseBuild` opens the chooser)

**Interfaces:**
- Consumes: from Task 10's builder closure — `scene`, `carGroup`, `ui`, `pick`, `candidateFor`, `addBrick`, `selectedType`, `selectedColor`, `bricks`, `dirty`, `guide`; instructions.js (`MODELS`, `describeStep`, `checkPlacement`, `modelToBricks`); bricks.js; brickMesh.js (`createBrickMesh`); thumbnails.js; ui.js; audio.js (`sfx`, `speak`).
- Produces:
  - `createConfetti(scene) → { burst(worldPosition: THREE.Vector3, count = 40), update(dt), dispose() }`
  - `createGuide({ modelKey, scene, carGroup, ui, pick, candidateFor, addBrick, selection, onComplete }) → { tap(clientX, clientY), update(dt), readAloud(), dispose() }` — `selection()` returns `{ type, color }`; `onComplete()` is called once after the last step.
  - `createBuilder(app, { car = null, modelKey = null })` — `modelKey` ∈ `Object.keys(MODELS)` starts guided mode.
  - `openBuildChooser(app)` — modal with the 3 models (picture + step count) and Free Build.

- [ ] **Step 1: Write `js/confetti.js`**

```js
import * as THREE from 'three';

const PALETTE = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xfb8c00, 0x8e24aa];

export function createConfetti(scene) {
  const geometry = new THREE.PlaneGeometry(0.12, 0.08);
  const materials = PALETTE.map(color => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  const bits = [];
  return {
    burst(origin, count = 40) {
      for (let i = 0; i < count; i++) {
        const bit = new THREE.Mesh(geometry, materials[i % materials.length]);
        bit.position.copy(origin);
        bit.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5);
        bit.userData.spin = new THREE.Vector2(Math.random() * 10, Math.random() * 10);
        bit.userData.life = 1.4;
        scene.add(bit);
        bits.push(bit);
      }
    },
    update(dt) {
      for (let i = bits.length - 1; i >= 0; i--) {
        const bit = bits[i];
        const u = bit.userData;
        u.velocity.y -= 9 * dt;
        bit.position.addScaledVector(u.velocity, dt);
        bit.rotation.x += u.spin.x * dt;
        bit.rotation.y += u.spin.y * dt;
        u.life -= dt;
        if (u.life <= 0) {
          scene.remove(bit);
          bits.splice(i, 1);
        }
      }
    },
    dispose() {
      for (const bit of bits) scene.remove(bit);
      bits.length = 0;
      geometry.dispose();
      materials.forEach(m => m.dispose());
    },
  };
}
```

- [ ] **Step 2: Write `js/guide.js`**

```js
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
export function createGuide({ modelKey, scene, carGroup, ui, pick, candidateFor, addBrick, selection, onComplete }) {
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
    if (target) carGroup.remove(target);
    const step = current();
    target = createBrickMesh(step, { ghost: TARGET_GLOW });
    target.traverse(node => { node.userData.isTarget = true; });
    target.userData.baseY = target.position.y;
    carGroup.add(target);
    card.querySelector('.step-count').textContent = `Step ${index + 1} of ${model.steps.length}`;
    card.querySelector('.step-img').src = brickThumbnail(step.type, step.color);
    card.querySelector('.step-text').textContent = describeStep(step);
    for (const item of ui.querySelectorAll('.tray-item')) item.classList.toggle('needed', item.dataset.type === step.type);
    for (const swatch of ui.querySelectorAll('.swatch')) swatch.classList.toggle('needed', swatch.dataset.color === step.color);
    ui.querySelector('.tray-item.needed')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function clearHighlights() {
    for (const node of ui.querySelectorAll('.needed')) node.classList.remove('needed');
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
      wiggle('.tray-item.needed');
      return;
    }
    const hit = pick(x, y, target ? [target] : []);
    if (!hit) return;
    const at = hit.isTarget ? { x: step.x, y: step.y, z: step.z } : candidateFor(hit).cell;
    const result = checkPlacement(step, { type, color, at });

    if (result === 'correct') {
      addBrick({ type: step.type, color: step.color, x: step.x, y: step.y, z: step.z, r: step.r });
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
```

- [ ] **Step 3: Write `js/chooser.js`**

```js
import { el, openModal } from './ui.js';
import { MODELS, modelToBricks } from './instructions.js';
import { carThumbnail } from './thumbnails.js';

export function openBuildChooser(app) {
  let close = () => {};
  const choose = options => () => {
    close();
    app.openBuilder(options);
  };
  const cards = Object.entries(MODELS).map(([key, model]) => el('button', { class: 'model-card', onclick: choose({ modelKey: key }) }, [
    el('img', { src: carThumbnail(modelToBricks(model), `model:${key}`), alt: '' }),
    el('span', { text: model.name }),
    el('small', { text: `${model.steps.length} steps` }),
  ]));
  cards.push(el('button', { class: 'model-card', onclick: choose({}) }, [
    el('div', { class: 'free', text: '🧱' }),
    el('span', { text: 'Free Build' }),
    el('small', { text: 'Make your own!' }),
  ]));
  close = openModal({ title: 'What do you want to build?', body: [el('div', { class: 'model-grid' }, cards)], buttons: [{ label: 'Back' }] });
}
```

- [ ] **Step 4: Wire guided mode into `js/builder.js`**

Replace the ui.js and thumbnails.js import lines:
```js
import { brickThumbnail } from './thumbnails.js';
import { $, el, hexCss, toast, confirmDialog, askName, showScreen } from './ui.js';
```
with:
```js
import { brickThumbnail, carThumbnail } from './thumbnails.js';
import { $, el, hexCss, toast, confirmDialog, askName, showScreen, openModal } from './ui.js';
import { MODELS } from './instructions.js';
import { createGuide } from './guide.js';
```

Replace:
```js
export function createBuilder(app, { car = null } = {}) {
```
with:
```js
export function createBuilder(app, { car = null, modelKey = null } = {}) {
```

Replace:
```js
  ui.classList.remove('guided');
  checklist.classList.remove('hidden');
```
with:
```js
  ui.classList.toggle('guided', !!modelKey);
  checklist.classList.toggle('hidden', !!modelKey);
```

Replace:
```js
  buildTray();
  updateChecklist();

  return {
```
with:
```js
  buildTray();
  updateChecklist();
  if (modelKey) {
    guide = createGuide({
      modelKey, scene, carGroup, ui, pick, candidateFor, addBrick,
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
```

- [ ] **Step 5: Open the chooser from `js/main.js`**

Add the import below the `createBuilder` import:
```js
import { openBuildChooser } from './chooser.js';
```

Replace:
```js
  chooseBuild() {
    app.openBuilder({});
  },
```
with:
```js
  chooseBuild() {
    openBuildChooser(app);
  },
```

- [ ] **Step 6: Check it in the browser**

Expected:
- Build → "What do you want to build?" with pictures of Race Car (14 steps), Monster Truck (14 steps), Buggy (13 steps) and Free Build. Back closes it.
- Race Car → workshop without the tool buttons, checklist or Race! button. Instruction card top-left: "Step 1 of 14", picture of a black small wheel, "Find a black Small Wheel and put it on the glowing spot!". A yellow see-through wheel bounces at the front-left corner; the Small Wheel tray item and the black dot pulse.
- Tapping the car before picking a brick → "First pick a brick from the tray!" and the needed tray item wiggles.
- Picking Brick 2×2 and tapping → "That's a Brick 2×2. Find the Small Wheel!". Right brick, red colour → "Right brick! Now pick black." Right brick and colour far away (e.g. the back right corner) → "Put it on the glowing spot!" and the target bounces higher.
- Right brick + colour tapped on or next to the glowing spot → click sound, confetti, card moves to Step 2.
- 🔊 reads the instruction aloud.
- Finishing all 14 steps → fanfare + big confetti → "Name your car" (pre-filled "My Race Car") → "Your car is ready! 🎉" with a picture; "Build more" opens the free workshop with the same car (editing it); "Race it!" shows the race-track toast for now.
- Repeat quickly with Monster Truck and Buggy to make sure every step can be completed.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/confetti.js js/guide.js js/chooser.js js/builder.js js/main.js
git commit -m "feat: guided step-by-step building with a model chooser"
```

---
### Task 12: Garage screen

**Files:**
- Create: `js/garageScreen.js`
- Modify: `js/main.js` (replace the `openGarage` placeholder)

**Interfaces:**
- Consumes: `app.garage`, `app.chooseBuild()`, `app.openBuilder({ car })`, `app.startRace(car)`; ui.js (`$`, `el`, `confirmDialog`); thumbnails.js (`carThumbnail`); `createShowroom` (showroom.js).
- Produces: `renderGarage(app)` — fills `#garage-list` with a "New car" card and one card per saved car (newest first): picture, name, 🏁 Race, 🔧 Edit, 🗑 Delete (asks first).

- [ ] **Step 1: Write `js/garageScreen.js`**

```js
import { $, el, confirmDialog } from './ui.js';
import { carThumbnail } from './thumbnails.js';

export function renderGarage(app) {
  const cars = app.garage.list().reverse();

  const carCard = car => el('div', { class: 'car-card' }, [
    el('img', { src: carThumbnail(car.bricks, `${car.id}:${car.updatedAt}`), alt: '' }),
    el('h3', { text: car.name }),
    el('div', { class: 'card-actions' }, [
      el('button', { class: 'go-btn', text: '🏁 Race', onclick: () => app.startRace(car) }),
      el('button', { class: 'tool-btn', text: '🔧', 'aria-label': `Change ${car.name}`, onclick: () => app.openBuilder({ car }) }),
      el('button', {
        class: 'tool-btn danger',
        text: '🗑',
        'aria-label': `Delete ${car.name}`,
        onclick: async () => {
          if (!(await confirmDialog(`Delete ${car.name}?`, { yes: 'Delete', no: 'Keep it' }))) return;
          app.garage.remove(car.id);
          renderGarage(app);
        },
      }),
    ]),
  ]);

  const items = [
    el('button', { class: 'car-card new', onclick: () => app.chooseBuild() }, [
      el('div', { class: 'plus', text: '＋' }),
      el('span', { text: 'New car' }),
    ]),
    cars.length ? null : el('p', { class: 'empty', text: 'No cars yet. Tap "New car" to build one!' }),
    ...cars.map(carCard),
  ];
  $('#garage-list').replaceChildren(...items.filter(Boolean));
}
```

- [ ] **Step 2: Hook it into `js/main.js`**

Add the import below the `openBuildChooser` import:
```js
import { renderGarage } from './garageScreen.js';
```

Replace:
```js
  openGarage() {
    toast('The garage is coming soon!');
  },
```
with:
```js
  openGarage() {
    if (!mode?.isShowroom) app.setMode(createShowroom(showroomBricks()));
    showScreen('garage');
    renderGarage(app);
  },
```

- [ ] **Step 3: Check it in the browser**

Expected:
- My Garage with no cars: "New car" card plus "No cars yet…". New car opens the chooser.
- After saving two cars: newest first, each with its picture and name; the turntable car stays spinning behind the list.
- 🔧 opens the workshop with that car; changing it and pressing Race! → Save updates the same card (no duplicate).
- 🗑 asks "Delete <name>?"; Keep it does nothing; Delete removes the card.
- 🏁 Race shows the race-track toast for now. Home button returns to the home screen.
- Home → Race with at least one car opens the garage.
- A name like `<b>hi</b>` shows literally, not bold.

- [ ] **Step 4: Commit**

```bash
git add js/garageScreen.js js/main.js
git commit -m "feat: garage screen to race, edit and delete saved cars"
```

---
### Task 13: Race track

**Files:**
- Create: `js/track.js`

**Interfaces:**
- Consumes: `three`, `cannon-es`.
- Produces: `ROAD_WIDTH = 14`, `createTrack(scene, world) → Track` which adds the ground (visual + static physics plane), road, bridge, barriers, start arch, jump ramp, knock-over cones and trees.
  - `Track = { width, samples: THREE.Vector3[400], checkpoints: {x,y,z}[12], racingLine: {x,z}[200], nearest(x, z) → { index, point, distance }, startGrid(slot 0-3) → { position{x,y,z}, heading }, respawnPoint(checkpointIndex) → { position, heading, racingIndex }, update(), dispose() }`
  - The loop is ~375 m long and driven in control-point order. Checkpoint 0 is the start line (sample 0). The start grid is just behind it: slots 0/1 front row, 2/3 back row; even slots on the driver's left.
  - Each frame `frames[i]` has `point`, `forward` (3D), `right` (flat, the driver's right), `heading`, `length` (to the next sample).

- [ ] **Step 1: Write `js/track.js`**

```js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const ROAD_WIDTH = 14;
const HALF = ROAD_WIDTH / 2;
const SAMPLES = 400;
const CHECKPOINTS = 12;
const BARRIER_EVERY = 4; // samples per barrier block
const UP = new THREE.Vector3(0, 1, 0);

// A closed loop, driven in this order. The two 3.5 m points lift the road into a bridge over a river.
const CONTROL_POINTS = [
  [0, 0, -40], [0, 0, 20], [10, 0, 52], [38, 0, 64], [66, 0, 50], [78, 0, 20],
  [78, 3.5, -12], [78, 3.5, -34], [70, 0, -64], [45, 0, -80], [15, 0, -78], [2, 0, -62],
];
const CONE_SAMPLES = [40, 46, 52, 120, 126, 132, 230, 236, 242, 330, 336];

export function createTrack(scene, world) {
  const disposables = [];
  const own = thing => { disposables.push(thing); return thing; };

  const curve = new THREE.CatmullRomCurve3(CONTROL_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  const points = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
  for (const p of points) p.y = Math.max(0, p.y);
  const frames = points.map((point, i) => {
    const next = points[(i + 1) % SAMPLES];
    const forward = next.clone().sub(point).normalize();
    const flat = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    return { point, forward, right: new THREE.Vector3().crossVectors(flat, UP).normalize(), heading: Math.atan2(flat.x, flat.z), length: next.distanceTo(point) };
  });

  // A road-aligned box from sample i to sample i+span: x = driver's left, y = road up, z = along the road.
  function segment(i, span = 1) {
    const a = points[i];
    const b = points[(i + span) % SAMPLES];
    const z = b.clone().sub(a).normalize();
    const x = new THREE.Vector3().crossVectors(UP, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    return { mid: a.clone().add(b).multiplyScalar(0.5), x, y, q, length: a.distanceTo(b) };
  }

  function staticBox(center, hx, hy, hz, q) {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    body.position.set(center.x, center.y, center.z);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    world.addBody(body);
  }

  function canvasTexture(width, height, draw, repeat = false) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'));
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // --- ground ---
  const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(900, 900)), own(new THREE.MeshStandardMaterial({ color: 0x6fcf5f, roughness: 1 })));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // --- road ribbon (wheels drive on the ground plane or bridge boxes; this is just the paint) ---
  {
    const positions = [];
    const uvs = [];
    const indices = [];
    let v = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const f = frames[i % SAMPLES];
      const left = f.point.clone().addScaledVector(f.right, -HALF);
      const right = f.point.clone().addScaledVector(f.right, HALF);
      positions.push(left.x, left.y + 0.03, left.z, right.x, right.y + 0.03, right.z);
      uvs.push(0, v, 1, v);
      v += f.length / 10;
    }
    for (let i = 0; i < SAMPLES; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const asphalt = canvasTexture(128, 256, g => {
      g.fillStyle = '#55595f';
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = '#ffffff';
      g.fillRect(4, 0, 6, 256);
      g.fillRect(118, 0, 6, 256);
      g.fillStyle = '#fdd835';
      g.fillRect(61, 0, 6, 128);
    }, true);
    const road = new THREE.Mesh(geometry, own(new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, side: THREE.DoubleSide })));
    road.receiveShadow = true;
    scene.add(road);
  }

  // --- bridge: solid deck boxes wherever the road leaves the ground, pillars and a river below ---
  {
    const deckMaterial = own(new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 }));
    const pillarGeometry = own(new THREE.CylinderGeometry(0.6, 0.6, 1, 12));
    for (let i = 0; i < SAMPLES; i++) {
      if (Math.max(points[i].y, points[(i + 1) % SAMPLES].y) < 0.05) continue;
      const s = segment(i);
      const center = s.mid.clone().addScaledVector(s.y, -0.3);
      staticBox(center, HALF + 0.5, 0.3, s.length / 2 + 0.2, s.q);
      const deck = new THREE.Mesh(own(new THREE.BoxGeometry(ROAD_WIDTH + 1, 0.6, s.length + 0.4)), deckMaterial);
      deck.position.copy(center);
      deck.quaternion.copy(s.q);
      deck.castShadow = deck.receiveShadow = true;
      scene.add(deck);
      if (i % 10 === 0 && points[i].y > 1.5) {
        for (const side of [-1, 1]) {
          const height = points[i].y - 0.6;
          const pillar = new THREE.Mesh(pillarGeometry, deckMaterial);
          pillar.scale.y = height;
          pillar.position.copy(points[i]).addScaledVector(s.x, side * (HALF - 1));
          pillar.position.y = height / 2;
          scene.add(pillar);
        }
      }
    }
    const river = new THREE.Mesh(own(new THREE.PlaneGeometry(70, 14)), own(new THREE.MeshStandardMaterial({ color: 0x29b6f6, roughness: 0.2 })));
    river.rotation.x = -Math.PI / 2;
    river.position.set(78, 0.02, -23);
    scene.add(river);
  }

  // --- red/white barriers on both edges, all the way round ---
  {
    const count = (SAMPLES / BARRIER_EVERY) * 2;
    const mesh = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), own(new THREE.MeshStandardMaterial({ roughness: 0.6 })), count);
    const red = new THREE.Color(0xe53935);
    const white = new THREE.Color(0xf5f5f5);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < SAMPLES; i += BARRIER_EVERY) {
      const s = segment(i, BARRIER_EVERY);
      for (const side of [-1, 1]) {
        const center = s.mid.clone().addScaledVector(s.x, side * (HALF + 0.45)).addScaledVector(s.y, 0.55);
        staticBox(center, 0.35, 0.55, s.length / 2 + 0.35, s.q);
        mesh.setMatrixAt(n, matrix.compose(center, s.q, scale.set(0.7, 1.1, s.length + 0.7)));
        mesh.setColorAt(n, (i / BARRIER_EVERY) % 2 ? red : white);
        n++;
      }
    }
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // --- start line and arch ---
  {
    const f = frames[0];
    const checker = canvasTexture(64, 16, g => {
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 2; y++) {
          g.fillStyle = (x + y) % 2 ? '#111111' : '#ffffff';
          g.fillRect(x * 8, y * 8, 8, 8);
        }
      }
    });
    checker.magFilter = THREE.NearestFilter;
    const checkerMaterial = own(new THREE.MeshStandardMaterial({ map: checker }));
    const line = new THREE.Mesh(own(new THREE.PlaneGeometry(ROAD_WIDTH, 2).rotateX(-Math.PI / 2)), checkerMaterial);
    line.position.set(f.point.x, f.point.y + 0.05, f.point.z);
    line.rotation.y = f.heading;
    scene.add(line);
    const arch = new THREE.Group();
    const postMaterial = own(new THREE.MeshStandardMaterial({ color: 0xe53935 }));
    const postGeometry = own(new THREE.BoxGeometry(0.6, 6, 0.6));
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(side * (HALF + 1.2), 3, 0);
      post.castShadow = true;
      arch.add(post);
    }
    const banner = new THREE.Mesh(own(new THREE.BoxGeometry(ROAD_WIDTH + 3, 1.4, 0.4)), checkerMaterial);
    banner.position.y = 6;
    arch.add(banner);
    arch.position.copy(f.point);
    arch.rotation.y = f.heading;
    scene.add(arch);
  }

  // --- a small jump on the right half of the start straight ---
  {
    const f = frames[Math.round(SAMPLES * 0.09)];
    const center = f.point.clone().addScaledVector(f.right, 3.2);
    center.y = 0.3;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, f.heading, 0, 'YXZ')); // nose up
    const stripes = canvasTexture(64, 64, g => {
      g.fillStyle = '#fdd835';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#263238';
      for (let k = -64; k < 64; k += 16) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 8, 0);
        g.lineTo(k + 72, 64);
        g.lineTo(k + 64, 64);
        g.fill();
      }
    });
    const ramp = new THREE.Mesh(own(new THREE.BoxGeometry(7, 0.5, 6)), own(new THREE.MeshStandardMaterial({ map: stripes })));
    ramp.position.copy(center);
    ramp.quaternion.copy(q);
    ramp.castShadow = ramp.receiveShadow = true;
    scene.add(ramp);
    staticBox(center, 3.5, 0.25, 3, q);
  }

  // --- cones that go flying when you hit them ---
  const coneGeometry = own(new THREE.ConeGeometry(0.3, 0.7, 12));
  const coneMaterial = own(new THREE.MeshStandardMaterial({ color: 0xfb8c00 }));
  const cones = CONE_SAMPLES.map((i, k) => {
    const f = frames[i];
    const p = f.point.clone().addScaledVector(f.right, k % 2 ? -4.5 : -3.5).addScaledVector(f.forward, (k % 3) * 0.8);
    const body = new CANNON.Body({ mass: 1.5, shape: new CANNON.Cylinder(0.06, 0.3, 0.7, 8) });
    body.position.set(p.x, p.y + 0.36, p.z);
    world.addBody(body);
    const mesh = new THREE.Mesh(coneGeometry, coneMaterial);
    mesh.castShadow = true;
    scene.add(mesh);
    return { body, mesh };
  });

  function nearest(x, z) {
    let index = 0;
    let best = Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const d = (points[i].x - x) ** 2 + (points[i].z - z) ** 2;
      if (d < best) { best = d; index = i; }
    }
    return { index, point: points[index], distance: Math.sqrt(best) };
  }

  // --- trees, kept well away from the road ---
  {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const spots = [];
    for (let tries = 0; spots.length < 70 && tries < 3000; tries++) {
      const x = -70 + random() * 230;
      const z = -130 + random() * 250;
      if (nearest(x, z).distance > HALF + 8 && Math.hypot(x - 78, z + 23) > 20) spots.push([x, z, 0.8 + random() * 0.6]);
    }
    const trunks = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.4, 0.5, 2, 8)), own(new THREE.MeshStandardMaterial({ color: 0x795548 })), spots.length);
    const leaves = new THREE.InstancedMesh(own(new THREE.ConeGeometry(2.2, 5, 8)), own(new THREE.MeshStandardMaterial({ color: 0x2e7d32 })), spots.length);
    const matrix = new THREE.Matrix4();
    spots.forEach(([x, z, s], i) => {
      trunks.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      leaves.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, 2 * s + 2.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
    });
    trunks.castShadow = leaves.castShadow = true;
    scene.add(trunks, leaves);
  }

  const checkpointSample = i => Math.round((i * SAMPLES) / CHECKPOINTS) % SAMPLES;
  const checkpoints = Array.from({ length: CHECKPOINTS }, (_, i) => {
    const p = frames[checkpointSample(i)].point;
    return { x: p.x, y: p.y, z: p.z };
  });

  return {
    width: ROAD_WIDTH,
    samples: points,
    checkpoints,
    racingLine: points.filter((_, i) => i % 2 === 0).map(p => ({ x: p.x, z: p.z })),
    nearest,
    startGrid(slot) {
      const f = frames[SAMPLES - 4 - Math.floor(slot / 2) * 7];
      const p = f.point.clone().addScaledVector(f.right, slot % 2 ? 3.2 : -3.2);
      return { position: { x: p.x, y: p.y + 1.2, z: p.z }, heading: f.heading };
    },
    respawnPoint(checkpoint) {
      const i = checkpointSample(checkpoint);
      const f = frames[i];
      return { position: { x: f.point.x, y: f.point.y + 1.2, z: f.point.z }, heading: f.heading, racingIndex: Math.floor(i / 2) };
    },
    update() {
      for (const cone of cones) {
        cone.mesh.position.copy(cone.body.position);
        cone.mesh.quaternion.copy(cone.body.quaternion);
      }
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
```

- [ ] **Step 2: Look at the track from above**

With the dev server running and the home screen open, paste into the browser console:

```js
const THREE = await import('three');
const CANNON = await import('cannon-es');
const { createTrack } = await import('/js/track.js');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6fbf5f, 2.5));
const track = createTrack(scene, new CANNON.World());
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 1000);
camera.position.set(39, 230, -8);
camera.lookAt(39, 0, -8);
brickRacers.setMode({ scene, camera, update() { track.update(); }, resize() {}, dispose() { track.dispose(); } });
```

(If the console can't resolve `'three'` from the import map, use the full URLs `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js` and `https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js`.)

Expected: one smooth closed grey loop with white edge lines and a yellow dashed centre line; red/white barriers along both edges with no big gaps on curves; a brown bridge deck with pillars over a blue river on the right-hand straight; a checkered start line and arch; a yellow/black striped ramp on one half of the start straight; orange cones; trees off the road. Also check: `track.checkpoints.length === 12`, `track.racingLine.length === 200`, `track.nearest(0, -40).distance < 1`.

Move the camera low (`camera.position.set(0, 4, -60); camera.lookAt(0, 1, 0)`) to see the start straight at driver height. If a curve looks kinked or the bridge ramps are too steep, adjust `CONTROL_POINTS` (keep the bridge y at 3.5 for two neighbouring points). Then go back with `brickRacers.goHome()`.

- [ ] **Step 3: Commit**

```bash
git add js/track.js
git commit -m "feat: race track with bridge, barriers, jump, cones and checkpoints"
```

---
### Task 14: Race mode

**Files:**
- Create: `js/race.js`
- Modify: `js/main.js` (replace the `startRace` placeholder)

**Interfaces:**
- Consumes: `createTrack` (track.js); `createVehicle` (vehiclePhysics.js); `createCarMesh`, `createWheelMesh` (brickMesh.js); `MODELS`, `modelToBricks` (instructions.js); `COLORS` (bricks.js); raceLogic.js; ai.js (`aiControl`, `rubberBand`); inputState.js; input.js (`attachDriveControls`); ui.js; audio.js; `app.goHome()`, `app.openGarage()`, `app.startRace(car)`.
- Produces: `createRace(app, playerCar) → Mode`. Each racer is `{ name, bricks, dot, human, id, car: Vehicle, mesh, wheels, state, aiIdx, offTime }`. A human racer reads a `ControlState`; everything else is driven by `aiControl`. For a future 2-player mode, add a second human racer with its own `ControlState` and camera — the race loop already treats racers uniformly.

- [ ] **Step 1: Write `js/race.js`**

```js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createTrack } from './track.js';
import { createVehicle } from './vehiclePhysics.js';
import { createCarMesh, createWheelMesh } from './brickMesh.js';
import { MODELS, modelToBricks } from './instructions.js';
import { COLORS } from './bricks.js';
import { newRaceState, advanceCheckpoint, progressValue, rankRacers, ordinal } from './raceLogic.js';
import { aiControl, rubberBand } from './ai.js';
import { createControlState, toDriveInput } from './inputState.js';
import { attachDriveControls } from './input.js';
import { $, el, hexCss, showScreen, openModal, toast } from './ui.js';
import { sfx, createEngineSound } from './audio.js';

const LAPS = 3;
const COUNTDOWN_SECONDS = 3;
const CHECKPOINT_RADIUS = 12;
const AI_PACE = 0.86; // "friendly" difficulty: AI cars aim for 86% of their top speed
const AUTOPILOT_PACE = 0.6; // the player's car cruises by itself after the finish line
const SKY = 0x8fd3ff;
const MEDALS = ['🥇', '🥈', '🥉', '🏅'];
const OPPONENTS = [
  { name: 'Turbo Tia', model: 'raceCar', recolor: { red: 'orange' }, color: 'orange' },
  { name: 'Mighty Max', model: 'monsterTruck', recolor: { blue: 'purple' }, color: 'purple' },
  { name: 'Bix the Buggy', model: 'buggy', recolor: { green: 'blue' }, color: 'blue' },
];

export function createRace(app, playerCar) {
  showScreen('race');
  document.body.classList.add('racing');
  const ui = $('#race');
  const abort = new AbortController();
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });

  // --- scene ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 90, 300);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6fbf5f, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 150 });
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

  // --- physics ---
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.25;
  const track = createTrack(scene, world);
  const cpCount = track.checkpoints.length;

  // --- racers: three AI cars on the front row, the player at the back so there's someone to overtake ---
  const entries = [
    ...OPPONENTS.map(o => ({ name: o.name, bricks: modelToBricks(MODELS[o.model], o.recolor), dot: COLORS[o.color].hex, human: false })),
    { name: playerCar.name, bricks: playerCar.bricks, dot: 0xffffff, human: true },
  ];
  const racers = entries.map((entry, slot) => {
    const car = createVehicle(world, entry.bricks, track.startGrid(slot));
    const mesh = new THREE.Group();
    const body = createCarMesh(entry.bricks, { includeWheels: false });
    const com = car.stats.centerOfMass;
    body.position.set(-com.x, -com.y, -com.z);
    mesh.add(body);
    scene.add(mesh);
    const wheels = car.stats.wheels.map(w => {
      const wheel = createWheelMesh(w.type, w.color);
      scene.add(wheel);
      return wheel;
    });
    return { ...entry, id: slot, car, mesh, wheels, state: newRaceState(), aiIdx: track.racingLine.length - 2, offTime: 0 };
  });
  const player = racers[racers.length - 1];

  const controls = createControlState();
  const pad = attachDriveControls(ui, controls, abort.signal);
  const engine = createEngineSound();
  const minimap = createMinimap($('#minimap', ui), track.samples);
  const positionEl = $('#hud-position', ui);
  const lapEl = $('#hud-lap', ui);
  const countdownEl = $('#countdown', ui);

  let phase = 'countdown'; // countdown → racing → finished
  let clock = 0;
  let raceTime = 0;
  let paused = false;
  let shownCount = 0;
  let hideCountdownAt = 0;
  let finishedAt = 0;
  let podiumShown = false;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  on(ui, 'click', e => {
    const action = e.target.closest('[data-race]')?.dataset.race;
    if (action === 'pause') pause();
    if (action === 'flip') {
      player.car.flip();
      sfx.flip();
    }
  });
  on(document, 'visibilitychange', () => {
    if (document.hidden) pause();
  });

  function pause() {
    if (paused || podiumShown) return;
    paused = true;
    controls.releaseAll();
    engine.silence();
    openModal({
      title: 'Paused',
      buttons: [
        { label: '🏠 Quit', onClick: () => app.goHome() },
        { label: '🔁 Restart', onClick: () => app.startRace(playerCar) },
        { label: '▶ Keep racing', kind: 'go', onClick: () => { paused = false; } },
      ],
    });
  }

  function driverInput(r) {
    if (phase === 'countdown') return { hold: true };
    if (r.human && r.state.finishTime === null) return toDriveInput(controls);
    const gap = progressValue(r.state, cpCount) - progressValue(player.state, cpCount);
    const pace = r.human ? AUTOPILOT_PACE : AI_PACE * rubberBand(gap);
    const out = aiControl({ ...r.car.pose(), topSpeed: r.car.stats.topSpeed }, track.racingLine, r.aiIdx, pace);
    r.aiIdx = out.idx;
    return out.input;
  }

  function syncMeshes(r) {
    r.mesh.position.copy(r.car.body.position);
    r.mesh.quaternion.copy(r.car.body.quaternion);
    r.car.vehicle.wheelInfos.forEach((info, i) => {
      r.car.vehicle.updateWheelTransform(i);
      r.wheels[i].position.copy(info.worldTransform.position);
      r.wheels[i].quaternion.copy(info.worldTransform.quaternion);
    });
  }

  function trackProgress(r) {
    if (phase === 'countdown') return;
    const before = r.state;
    r.state = advanceCheckpoint(before, r.car.body.position, track.checkpoints, CHECKPOINT_RADIUS, LAPS, raceTime);
    if (!r.human || r.state === before) return;
    if (r.state.finishTime !== null) {
      phase = 'finished';
      finishedAt = clock;
      sfx.fanfare();
      toast('Finish! 🏁');
    } else if (r.state.lapsDone > before.lapsDone) {
      sfx.success();
      toast(r.state.lapsDone === LAPS - 1 ? 'Last lap! 🏁' : `Lap ${r.state.lapsDone + 1}!`);
    }
  }

  // Off the road, under the bridge or off the world for 1.5 s → back to the last checkpoint passed.
  function keepOnTrack(r, dt) {
    const p = r.car.body.position;
    const near = track.nearest(p.x, p.z);
    const off = near.distance > track.width / 2 + 4 || p.y < near.point.y - 2.5 || p.y < -5;
    r.offTime = off ? r.offTime + dt : 0;
    if (r.offTime < 1.5) return;
    const spot = track.respawnPoint((r.state.nextCp - 1 + cpCount) % cpCount);
    r.car.resetTo(spot.position, spot.heading);
    r.aiIdx = spot.racingIndex;
    r.offTime = 0;
    if (r.human) {
      sfx.flip();
      toast('Back on the track!');
    }
  }

  function showBig(text) {
    countdownEl.textContent = text;
    countdownEl.classList.remove('hidden');
  }

  function updateCountdown() {
    if (phase === 'countdown') {
      const left = Math.ceil(COUNTDOWN_SECONDS - clock);
      if (left > 0 && left !== shownCount) {
        shownCount = left;
        showBig(String(left));
        sfx.beep();
      }
      if (clock >= COUNTDOWN_SECONDS) {
        phase = 'racing';
        showBig('GO!');
        sfx.go();
        hideCountdownAt = clock + 0.9;
      }
    } else if (hideCountdownAt && clock > hideCountdownAt) {
      countdownEl.classList.add('hidden');
      hideCountdownAt = 0;
    }
  }

  function ranking() {
    return rankRacers(racers.map(r => ({ id: r.id, state: r.state, pos: r.car.body.position })), track.checkpoints);
  }

  function updateHud() {
    const place = ranking().findIndex(x => x.id === player.id) + 1;
    const position = ordinal(place);
    const lap = `Lap ${Math.min(player.state.lapsDone + 1, LAPS)}/${LAPS}`;
    if (positionEl.textContent !== position) positionEl.textContent = position;
    if (lapEl.textContent !== lap) lapEl.textContent = lap;
    minimap.draw(racers);
  }

  function updateCamera(dt, snap = false) {
    const p = player.car.body.position;
    const h = player.car.pose().heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(tmpA.set(p.x - fx * 8.5, p.y + 3.6, p.z - fz * 8.5), k);
    camLook.lerp(tmpB.set(p.x + fx * 4, p.y + 1, p.z + fz * 4), k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sun.position.set(p.x + 30, p.y + 50, p.z + 20);
    sun.target.position.set(p.x, p.y, p.z);
  }

  function showPodium() {
    podiumShown = true;
    const ranked = ranking();
    const place = ranked.findIndex(x => x.id === player.id) + 1;
    openModal({
      title: place === 1 ? 'You won! 🏆' : `You came ${ordinal(place)}!`,
      body: [
        el('p', { text: place === 1 ? 'Amazing driving!' : 'Great race! Want to try again?' }),
        el('ol', { class: 'results' }, ranked.map((x, i) => el('li', {
          class: racers[x.id].human ? 'me' : '',
          text: `${MEDALS[i]} ${racers[x.id].name}`,
        }))),
      ],
      buttons: [
        { label: '🚗 Garage', onClick: () => app.openGarage() },
        { label: '🔁 Race again', kind: 'go', onClick: () => app.startRace(playerCar) },
      ],
    });
  }

  racers.forEach(syncMeshes);
  updateCamera(0, true);

  return {
    scene,
    camera,
    update(dt) {
      if (paused) return;
      clock += dt;
      if (phase !== 'countdown') raceTime += dt;
      updateCountdown();
      for (const r of racers) {
        const input = driverInput(r);
        r.car.applyInput(input);
        if (r.car.update(dt, input) && r.human) sfx.flip();
      }
      world.step(1 / 60, dt, 3);
      track.update();
      for (const r of racers) {
        syncMeshes(r);
        trackProgress(r);
        keepOnTrack(r, dt);
      }
      if (phase === 'finished' && !podiumShown && clock - finishedAt > 1.8) showPodium();
      updateHud();
      pad.refresh();
      updateCamera(dt);
      engine.setSpeed(Math.abs(player.car.forwardSpeed()));
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      abort.abort();
      controls.releaseAll();
      engine.stop();
      track.dispose();
      document.body.classList.remove('racing');
      countdownEl.classList.add('hidden');
    },
  };
}

// Top-down map, drawn at 2× for sharp lines. Mirrored so the driver's left (+x) is on the map's left and forward (+z) is up.
function createMinimap(canvas, points) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const pad = 28;
  const xs = points.map(p => p.x);
  const zs = points.map(p => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const offX = pad + (size - pad * 2 - (maxX - minX) * scale) / 2;
  const offY = pad + (size - pad * 2 - (maxZ - minZ) * scale) / 2;
  const toMap = (x, z) => [offX + (maxX - x) * scale, offY + (maxZ - z) * scale];
  const path = new Path2D();
  points.forEach((p, i) => {
    const [x, y] = toMap(p.x, p.z);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return {
    draw(racers) {
      ctx.clearRect(0, 0, size, size);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#55595f';
      ctx.lineWidth = 18;
      ctx.stroke(path);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke(path);
      for (const r of racers) {
        const p = r.car.body.position;
        const [x, y] = toMap(p.x, p.z);
        ctx.beginPath();
        ctx.arc(x, y, r.human ? 14 : 10, 0, Math.PI * 2);
        ctx.fillStyle = hexCss(r.dot);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = r.human ? '#e53935' : '#1d2a44';
        ctx.stroke();
      }
    },
  };
}
```

- [ ] **Step 2: Hook it into `js/main.js`**

Add the import below the `renderGarage` import:
```js
import { createRace } from './race.js';
```

Replace:
```js
  startRace() {
    toast('The race track is coming soon!');
  },
```
with:
```js
  startRace(car) {
    app.setMode(createRace(app, car));
  },
```

- [ ] **Step 3: Play a full race in the browser** (1024×768 landscape)

Expected:
- Garage → 🏁 Race: the track appears behind your car on the back row; three brick cars (orange race car, purple monster truck, blue buggy) in front. HUD: "4th", "Lap 1/3", mini-map top-right with four dots (yours white with a red ring), pause button top-left, Flip me! button, ◀ ▶ bottom-left, STOP/GO bottom-right.
- Big 3 … 2 … 1 with beeps, nobody moves; then GO! and the AI cars pull away.
- Arrow keys (and on touch, holding ◀/▶ with GO together) drive and steer; pressed buttons look pushed in; the engine hum rises with speed. STOP brakes, then reverses when stopped.
- Driving into a barrier stops you; cones go flying; the ramp gives a little jump; the bridge carries you over the river.
- Flipping the car over (or pressing Flip me!) puts it back on its wheels; getting stuck on its roof rights itself after ~2 s.
- Passing the start line after a full loop: "Lap 2!", then "Last lap! 🏁". Driving backwards over the start line does not count.
- Position updates as you pass AI cars; AI cars ease off when far ahead and close in when far behind.
- After lap 3: fanfare + "Finish! 🏁", your car keeps rolling on autopilot, and ~2 s later the podium shows "You won! 🏆" (or "You came 2nd!") with all four names and medals; your row highlighted. Race again restarts; Garage goes back.
- Pause → Keep racing resumes exactly where you were; Restart restarts; Quit goes home. Switching browser tabs pauses automatically.
- Console has no errors, and the frame rate stays smooth (check `performance` or just by eye).

- [ ] **Step 4: Commit**

```bash
git add js/race.js js/main.js
git commit -m "feat: race mode with AI opponents, HUD, mini-map and podium"
```

---
### Task 15: Ready for the iPad

**Files:**
- Create: `manifest.webmanifest`, `README.md`
- Modify: `index.html` (link the manifest)

**Interfaces:**
- Consumes: everything above.
- Produces: a game a parent can start on the Mac and open on the iPad over home Wi-Fi, add to the home screen, and play full screen.

- [ ] **Step 1: Add the web app manifest**

`manifest.webmanifest`:
```json
{
  "name": "Brick Racers",
  "short_name": "Brick Racers",
  "start_url": "./",
  "display": "fullscreen",
  "orientation": "landscape",
  "background_color": "#8fd3ff",
  "theme_color": "#8fd3ff"
}
```

In `index.html`, add below the `theme-color` meta tag:
```html
  <link rel="manifest" href="manifest.webmanifest">
```

- [ ] **Step 2: Write `README.md`**

````markdown
# Brick Racers

Build a car from toy bricks, then race it! Made for playing on an iPad.

## Start the game (on the Mac)

```bash
npm install
npm start
```

The terminal prints two addresses, for example:

```
On this computer: http://localhost:8080
On the iPad (same Wi-Fi): http://192.168.1.23:8080
```

## Play on the iPad

1. Make sure the iPad is on the same Wi-Fi as the Mac and the Mac is running `npm start`.
2. Open Safari on the iPad and type the "On the iPad" address.
3. Tap the Share button → **Add to Home Screen** so it opens full screen like an app.
4. Hold the iPad sideways.

The game needs the internet the first time it loads (it downloads the 3D engine). Cars are saved on the iPad itself.

## How to play

- **Build** → pick a Race Car, Monster Truck or Buggy and follow the steps (🔊 reads them out loud), or choose **Free Build** and make your own. A race car needs 4 wheels at the corners, an engine and a seat.
- **Race** → ◀ ▶ to steer, **GO** to drive, **STOP** to brake (hold it to go backwards). Stuck upside down? Press **Flip me!**
- **My Garage** → race, change or delete your cars.

On a computer the arrow keys (or W A S D) drive too.

## For grown-ups

- `npm test` runs the rule tests (snapping, instructions, saving, laps, AI, physics).
- Code lives in `js/`; the design is in `docs/superpowers/specs/`.
````

- [ ] **Step 3: Full check**

Run: `npm test`
Expected: PASS — every suite, 0 failures. Paste the summary line in the task report.

Then in the browser pane, at 1024×768 with touch emulation on (and once at 768×1024 portrait):
1. Fresh start (clear site data / `localStorage.clear()` then reload): home screen shows the demo race car on the turntable.
2. Build → Race Car → complete all 14 steps using only taps → name it → Race it! → finish a 3-lap race → podium → Garage shows the car.
3. Garage → New car → Free Build → build something tall and silly (a tower on top of the seat, 6 wheels) → Race! → it drives, tips in corners, flips back.
4. Garage → 🔧 Edit a car → Remove a brick → Race! → the same card updates.
5. Portrait during a race shows "Turn your iPad sideways to race!"; turning back to landscape continues the race.
6. Two fingers: hold GO and tap ◀ ▶ repeatedly — the car keeps accelerating while steering. Lift GO — it coasts.
7. No console errors through all of the above.

On the real iPad (if available): run `npm start`, open the printed iPad address in Safari, Add to Home Screen, and repeat steps 2 and 6 with real fingers. Check sounds play after the first tap and 🔊 speaks.

- [ ] **Step 4: Commit**

```bash
git add manifest.webmanifest README.md index.html
git commit -m "docs: how to play on the iPad, home-screen manifest"
```
