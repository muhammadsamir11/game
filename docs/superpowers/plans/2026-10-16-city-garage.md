# Mini City 3a (City & Garage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "My Garage" opens a walkable toy city. The child walks as his figure, gets into his cars, and drives around a town with gentle traffic and people. He parks in a 3-floor garage with 12 spots, and a race gate at the city edge starts a race.

**Architecture:**
- **Pure modules, tested in Node:**
  - `cityMap.js`: blocks, garage geometry, spots, traffic loops, pedestrian paths, race gate;
  - `cityState.js`: spot assignment and saving;
  - `traffic.js`: lights, the stop rule, loop movement, people dodging;
  - `walker.js`: cannon walking body plus stick-to-world maths;
  - `joystick.js`: `stickVector`.
- **Three.js / DOM:**
  - `cityWorld.js`: static world and physics;
  - `cityTraffic.js`: traffic cars and people;
  - `drivenCar.js` + `gadgetHud.js`: shared with races, extracted from `race.js`;
  - `city.js`: the mode itself;
  - HUD markup and `main.js` wiring.

**Tech Stack:** Same as the game (Three.js 0.170.0, cannon-es 0.20.0, ES modules, node:test, Web Audio).

**Spec:** `docs/superpowers/specs/2026-10-16-city-garage-design.md`

## Global Constraints

- **Base rules still hold:** no build step, pinned CDN versions, pure modules free of `three` and the DOM, kid-friendly copy, no LEGO branding.
- **Physics:** every static cannon body that is positioned or rotated after construction gets `aabbNeedsUpdate = true`. This is the stale-bounds lesson from the base game.
- **City geometry:**
  - blocks 36 m, roads 12 m (lanes 3 m off the centre line), sidewalks 3 m, PITCH 48;
  - grid 4×4, SIZE 204;
  - FLOOR_HEIGHT 3; traffic drives on the right.
- **Garage:** block (0,0) with 12 spots, 4 per floor, along the west wall. Cars park facing west (heading −π/2).
- **Saving:** `localStorage` key `brickRacers.city.v1` = `{ spots: { [carId]: spotIndex } }`.
- **Distances:** get in within 3.5 m; traffic stops for anything within 7 m ahead in its lane (±2.5 m) and at red lights; people dodge within 4 m.
- **Speeds and timing:** lights switch every 8 s; traffic drives at 7 m/s; people walk at 1.4 m/s; he walks at 4 m/s.
- **Safety:** people have no physics bodies, so they can never be hit. Traffic bodies are kinematic.
- **Landscape:** the city mode sets `landscapeOnly: true`, so the existing portrait overlay and auto-pause apply.

## Review Focus

1. **Getting out against a wall or another car.** He appears on a free side and is never stuck inside geometry. Checked in Task 8.
2. **Parking in a spot that another car owns, or parking while still rolling.** No save happens and a friendly message shows. Pinned in Task 2 and checked in Task 8.
3. **Many cars:** more than 12, deleted cars, and cars added from the workshop while the city was closed. Spots stay consistent. Pinned in Task 2.
4. **Leaving the city mid-drive** (Home, My cars, race gate, app switch). No stuck sounds (siren, engine) or listeners. Checked in Task 8.
5. **iPad performance** with the whole city, traffic and people. The frame-time budget is measured in Task 9.

## File Map

```
js/cityMap.js       BLOCKS, INTERSECTIONS, GARAGE, RACE_GATE, TRAFFIC_LOOPS, PEDESTRIAN_PATHS, isOnRoad, isOnSidewalk, spotAt …
js/cityState.js     SPOT_COUNT, CITY_KEY, assignSpots, createCityStore
js/traffic.js       greenAxis, isGreen, shouldStop, obstacleAhead, createLoopMover, dodgeVector
js/walker.js        WALK_SPEED, stickToWorld, createWalker
js/joystick.js      stickVector, attachStick
js/drivenCar.js     collectFx, createDrivenCar
js/gadgetHud.js     animateFx, createGadgetHud
js/race.js          uses drivenCar + gadgetHud; { fromCity } option
js/brickMesh.js     emptySeat option
js/cityWorld.js     createCityWorld(scene, world)
js/cityTraffic.js   createCityTraffic(scene, world)
js/city.js          createCity(app, { nearCarId })
js/garageScreen.js  { fromCity } → "Back to city", Race returns to city
js/main.js, index.html, css/style.css, js/audio.js (sfx.whoa), README.md
tests/cityMap.test.js, tests/cityState.test.js, tests/traffic.test.js, tests/walker.test.js
```

---

### Task 1: City map

**Files:**
- Create: `js/cityMap.js`
- Test: `tests/cityMap.test.js`

**Interfaces:**
- Produces:
  - constants `BLOCK`, `ROAD`, `LANE`, `SIDEWALK`, `PITCH`, `GRID`, `SIZE`, `FLOOR_HEIGHT`;
  - `roadCenter(i)`, `blockRect(bx, bz) → { x0, z0, x1, z1 }`;
  - `BLOCKS: { bx, bz, type, rect }[]`, `INTERSECTIONS: { i, j, x, z }[]`;
  - `inCity`, `isOnRoad`, `blockAt`, `isOnSidewalk`;
  - `GARAGE = { rect, floors: Box[], ramps: Box[], rampPaths: RampPath[], walls: Box[], spots: Spot[], spawn }`, where:
    - `Box = { cx, cy, cz, hx, hy, hz, rotX }`;
    - `RampPath = { u0, u1, v0, y0, v1, y1 }` (block-local);
    - `Spot = { index, floor, x, y, z, heading, w, d }`;
  - `spotAt(x, y, z) → index | null`;
  - `RACE_GATE = { x, z, radius }`;
  - `TRAFFIC_LOOPS: { corners: {x,z}[4], start }[]` (6, clockwise, right-hand inner lanes);
  - `PEDESTRIAN_PATHS: { corners }[]` (5).

- [ ] **Step 1: Write the failing tests**

`tests/cityMap.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, PITCH, ROAD, LANE, FLOOR_HEIGHT, BLOCKS, INTERSECTIONS, GARAGE, RACE_GATE, TRAFFIC_LOOPS, PEDESTRIAN_PATHS,
  isOnRoad, isOnSidewalk, blockAt, spotAt, roadCenter,
} from '../js/cityMap.js';

const insideXZ = (b, x, z) => Math.abs(x - b.cx) <= b.hx + 1e-9 && Math.abs(z - b.cz) <= b.hz + 1e-9;
const slabsOn = floor => GARAGE.floors.filter(b => Math.abs(b.cy + b.hy - floor * FLOOR_HEIGHT) < 1e-9);
const samples = (corners, step = 1) => corners.flatMap((a, i) => {
  const b = corners[(i + 1) % corners.length];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  return Array.from({ length: Math.ceil(len / step) }, (_, k) => ({ x: a.x + (b.x - a.x) * (k * step / len), z: a.z + (b.z - a.z) * (k * step / len) }));
});

test('a 4×4 city, 204 m across, with exactly one garage at the corner', () => {
  assert.equal(SIZE, 204);
  assert.equal(BLOCKS.length, 16);
  assert.deepEqual(BLOCKS.filter(b => b.type === 'garage').map(b => [b.bx, b.bz]), [[0, 0]]);
  for (const type of ['houses', 'shops', 'towers', 'park', 'pizza', 'shopSoon']) assert.ok(BLOCKS.some(b => b.type === type), type);
});

test('roads, sidewalks and blocks are where they should be', () => {
  assert.equal(isOnRoad(roadCenter(2), 100), true);
  assert.equal(isOnRoad(30, 30), false);
  assert.equal(isOnSidewalk(ROAD + 1, ROAD + 10), true);
  assert.equal(isOnSidewalk(ROAD + 18, ROAD + 18), false);
  assert.equal(blockAt(ROAD + 18, ROAD + 18).type, 'garage');
  assert.equal(isOnRoad(-1, 50), false);
});

test('every intersection is listed (each gets a traffic light)', () => {
  assert.equal(INTERSECTIONS.length, 25);
  assert.ok(INTERSECTIONS.every(p => isOnRoad(p.x, p.z)));
});

test('12 garage spots, 4 per floor, inside the garage and apart from each other', () => {
  assert.equal(GARAGE.spots.length, 12);
  for (const f of [0, 1, 2]) assert.equal(GARAGE.spots.filter(s => s.floor === f).length, 4);
  const r = GARAGE.rect;
  for (const s of GARAGE.spots) {
    assert.ok(s.x > r.x0 && s.x < r.x1 && s.z > r.z0 && s.z < r.z1, `spot ${s.index}`);
    assert.equal(s.y, s.floor * FLOOR_HEIGHT);
    assert.equal(s.heading, -Math.PI / 2);
  }
  for (const a of GARAGE.spots) for (const b of GARAGE.spots) {
    if (a !== b && a.floor === b.floor) assert.ok(Math.abs(a.z - b.z) >= 5, `${a.index} vs ${b.index}`);
  }
});

test('upper-floor spots stand on a floor slab', () => {
  for (const s of GARAGE.spots.filter(s => s.floor > 0)) {
    assert.ok(slabsOn(s.floor).some(b => insideXZ(b, s.x, s.z)), `spot ${s.index}`);
  }
});

test('each ramp climbs exactly one floor, through a hole in the floor above, onto a slab edge', () => {
  assert.equal(GARAGE.rampPaths.length, 2);
  const { x0, z0 } = GARAGE.rect;
  for (const p of GARAGE.rampPaths) {
    assert.ok(Math.abs(p.y1 - p.y0 - FLOOR_HEIGHT) < 1e-9);
    const topFloor = Math.round(p.y1 / FLOOR_HEIGHT);
    const midU = x0 + (p.u0 + p.u1) / 2;
    const midV = z0 + (p.v0 + p.v1) / 2;
    assert.ok(!slabsOn(topFloor).some(b => insideXZ(b, midU, midV)), 'hole above the ramp');
    const beyond = z0 + p.v1 + Math.sign(p.v1 - p.v0) * 0.5;
    assert.ok(slabsOn(topFloor).some(b => insideXZ(b, midU, beyond)), 'floor continues at the top of the ramp');
  }
});

test('spotAt finds a spot only when a car is on it, at that floor', () => {
  const s = GARAGE.spots[5];
  assert.equal(spotAt(s.x, s.y + 0.6, s.z), 5);
  assert.equal(spotAt(s.x + 2.5, s.y + 0.6, s.z - 2), 5);
  assert.equal(spotAt(s.x, s.y + 0.6 + FLOOR_HEIGHT, s.z), 9);
  assert.equal(spotAt(s.x + 8, s.y + 0.6, s.z), null);
  assert.equal(spotAt(100, 0.6, 100), null);
});

test('the player starts inside the garage on the ground floor', () => {
  const { x, z, y } = GARAGE.spawn;
  assert.equal(y, 0);
  assert.equal(blockAt(x, z).type, 'garage');
});

test('six traffic loops drive clockwise on right-hand lanes of the roads', () => {
  assert.equal(TRAFFIC_LOOPS.length, 6);
  for (const loop of TRAFFIC_LOOPS) {
    assert.equal(loop.corners.length, 4);
    for (const p of samples(loop.corners)) assert.ok(isOnRoad(p.x, p.z), `${p.x},${p.z}`);
    const [a, b] = loop.corners;
    assert.ok(b.x > a.x && b.z === a.z, 'first leg heads east');
    const offsetFromCentre = a.z - roadCenter(Math.round((a.z - ROAD / 2) / PITCH));
    assert.equal(offsetFromCentre, LANE, 'east-bound traffic keeps to the +z (right) lane');
  }
});

test('people walk on sidewalks and only cross roads, never through buildings', () => {
  assert.equal(PEDESTRIAN_PATHS.length, 5);
  let crossings = 0;
  for (const path of PEDESTRIAN_PATHS) {
    for (const p of samples(path.corners)) {
      assert.ok(isOnSidewalk(p.x, p.z) || isOnRoad(p.x, p.z), `${p.x},${p.z}`);
      if (isOnRoad(p.x, p.z)) crossings++;
    }
  }
  assert.ok(crossings > 0, 'some people cross a road');
});

test('the race gate stands on a road at the city edge', () => {
  assert.ok(isOnRoad(RACE_GATE.x, RACE_GATE.z));
  assert.ok(RACE_GATE.x > SIZE - ROAD);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/cityMap.js`.

- [ ] **Step 3: Write `js/cityMap.js`**

```js
// The mini city as plain data, so it is the same every visit and can be checked by tests.
// x grows east, z grows south; the city covers 0..SIZE on both axes. Heading h means forward (sin h, 0, cos h).

export const BLOCK = 36;
export const ROAD = 12;
export const LANE = 3; // a lane's centre is this far from the road's centre line
export const SIDEWALK = 3;
export const PITCH = BLOCK + ROAD;
export const GRID = 4;
export const SIZE = GRID * PITCH + ROAD; // 204
export const FLOOR_HEIGHT = 3;

const LAYOUT = [ // LAYOUT[bz][bx]
  ['garage', 'houses', 'shops', 'towers'],
  ['houses', 'park', 'pizza', 'houses'],
  ['shops', 'towers', 'houses', 'shopSoon'],
  ['towers', 'houses', 'park', 'houses'],
];

export const roadCenter = i => i * PITCH + ROAD / 2;

export function blockRect(bx, bz) {
  const x0 = ROAD + bx * PITCH;
  const z0 = ROAD + bz * PITCH;
  return { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK };
}

export const BLOCKS = LAYOUT.flatMap((row, bz) => row.map((type, bx) => ({ bx, bz, type, rect: blockRect(bx, bz) })));

export const INTERSECTIONS = [];
for (let i = 0; i <= GRID; i++) {
  for (let j = 0; j <= GRID; j++) INTERSECTIONS.push({ i, j, x: roadCenter(i), z: roadCenter(j) });
}

export const inCity = (x, z) => x >= 0 && x <= SIZE && z >= 0 && z <= SIZE;
const inRoadStrip = v => (((v % PITCH) + PITCH) % PITCH) <= ROAD;
export const isOnRoad = (x, z) => inCity(x, z) && (inRoadStrip(x) || inRoadStrip(z));

export function blockAt(x, z) {
  return BLOCKS.find(b => x >= b.rect.x0 && x <= b.rect.x1 && z >= b.rect.z0 && z <= b.rect.z1) ?? null;
}

export function isOnSidewalk(x, z) {
  const b = blockAt(x, z);
  if (!b) return false;
  const { x0, z0, x1, z1 } = b.rect;
  return Math.min(x - x0, x1 - x, z - z0, z1 - z) <= SIDEWALK;
}

// --- Garage on block (0,0). u/v are block-local x/z (0..36); y is height. ---
const G = blockRect(0, 0);
const SLAB = 0.3;
const box = (u0, u1, y0, y1, v0, v1) => ({ cx: G.x0 + (u0 + u1) / 2, cy: (y0 + y1) / 2, cz: G.z0 + (v0 + v1) / 2, hx: (u1 - u0) / 2, hy: (y1 - y0) / 2, hz: (v1 - v0) / 2, rotX: 0 });
const slab = (floor, u0, u1, v0, v1) => box(u0, u1, floor * FLOOR_HEIGHT - SLAB, floor * FLOOR_HEIGHT, v0, v1);

// A ramp whose top surface runs from (v0, y0) up to (v1, y1) across u0..u1.
function rampBox({ u0, u1, v0, y0, v1, y1 }) {
  const run = Math.abs(v1 - v0);
  const angle = Math.atan2(y1 - y0, run);
  const rising = Math.sign(v1 - v0); // +1: climbs toward +z
  const ny = Math.cos(angle);
  const nz = -rising * Math.sin(angle);
  return {
    cx: G.x0 + (u0 + u1) / 2,
    cy: (y0 + y1) / 2 - (ny * SLAB) / 2,
    cz: G.z0 + (v0 + v1) / 2 - (nz * SLAB) / 2,
    hx: (u1 - u0) / 2,
    hy: SLAB / 2,
    hz: Math.hypot(run, y1 - y0) / 2,
    rotX: -rising * angle, // tips the climbing end up
  };
}

const RAMP_PATHS = [
  { u0: 22, u1: 28, v0: 4, y0: 0, v1: 24, y1: FLOOR_HEIGHT }, // ground → 1st, climbing south
  { u0: 29, u1: 35, v0: 32, y0: FLOOR_HEIGHT, v1: 12, y1: 2 * FLOOR_HEIGHT }, // 1st → 2nd, climbing north
];

export const GARAGE = {
  rect: G,
  floors: [
    // 1st floor, with a hole over ramp A (u 22..28, v 4..24)
    slab(1, 0, 22, 0, 36), slab(1, 28, 36, 0, 36), slab(1, 22, 28, 24, 36), slab(1, 22, 28, 0, 4),
    // 2nd floor, with a hole over ramp B (u 29..35, v 12..32)
    slab(2, 0, 29, 0, 36), slab(2, 35, 36, 0, 36), slab(2, 29, 35, 0, 12), slab(2, 29, 35, 32, 36),
  ],
  rampPaths: RAMP_PATHS,
  ramps: RAMP_PATHS.map(rampBox),
  walls: [
    box(-0.4, 0, 0, 9, 0, 36), // west
    box(0, 36, 0, 9, -0.4, 0), // north
    box(0, 36, 0, 9, 36, 36.4), // south
    box(36, 36.4, 0, 9, 0, 4), // east, either side of the entrance
    box(36, 36.4, 0, 9, 32, 36),
    box(36, 36.4, FLOOR_HEIGHT, FLOOR_HEIGHT + 1, 4, 32), // low walls on the upper floors' open side
    box(36, 36.4, 2 * FLOOR_HEIGHT, 2 * FLOOR_HEIGHT + 1, 4, 32),
  ],
  spots: Array.from({ length: 12 }, (_, index) => {
    const floor = Math.floor(index / 4);
    const k = index % 4;
    return { index, floor, x: G.x0 + 5, y: floor * FLOOR_HEIGHT, z: G.z0 + 6.5 + 6 * k, heading: -Math.PI / 2, w: 6, d: 5 };
  }),
  spawn: { x: G.x0 + 13, y: 0, z: G.z0 + 18, heading: -Math.PI / 2 },
};

// Which spot (if any) a car's centre at (x, y, z) is parked in.
export function spotAt(x, y, z) {
  const s = GARAGE.spots.find(spot => Math.abs(x - spot.x) <= spot.w / 2 && Math.abs(z - spot.z) <= spot.d / 2 && y >= spot.y - 0.5 && y <= spot.y + 2.5);
  return s ? s.index : null;
}

export const RACE_GATE = { x: roadCenter(GRID), z: roadCenter(1) + PITCH / 2, radius: 6 };

// Clockwise round a block on the right-hand (inner) lanes.
function laneLoop(bx, bz) {
  const x0 = roadCenter(bx) + LANE;
  const x1 = roadCenter(bx + 1) - LANE;
  const z0 = roadCenter(bz) + LANE;
  const z1 = roadCenter(bz + 1) - LANE;
  return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}
export const TRAFFIC_LOOPS = [[1, 0], [3, 0], [0, 2], [2, 1], [1, 3], [3, 2]].map(([bx, bz], i) => ({ corners: laneLoop(bx, bz), start: (i * 0.37) % 1 }));

// Round one block's sidewalk, or round two neighbouring blocks (which crosses the road between them).
function sidewalkLoop(bxA, bzA, bxB = bxA, bzB = bzA) {
  const a = blockRect(bxA, bzA);
  const b = blockRect(bxB, bzB);
  const x0 = Math.min(a.x0, b.x0) + 1.5;
  const x1 = Math.max(a.x1, b.x1) - 1.5;
  const z0 = Math.min(a.z0, b.z0) + 1.5;
  const z1 = Math.max(a.z1, b.z1) - 1.5;
  return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}
export const PEDESTRIAN_PATHS = [sidewalkLoop(1, 1, 2, 1), sidewalkLoop(0, 2, 0, 3), sidewalkLoop(2, 2), sidewalkLoop(3, 1), sidewalkLoop(1, 3)].map(corners => ({ corners }));
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 11 new tests plus all existing ones. If a geometry test fails, fix the data (slab pieces, ramp numbers), not the test.

- [ ] **Step 5: Commit**

```bash
git add js/cityMap.js tests/cityMap.test.js
git commit -m "feat: mini city map with garage floors, ramps, spots, traffic loops and sidewalks"
```

---

### Task 2: Parking spots that stick

**Files:**
- Create: `js/cityState.js`
- Test: `tests/cityState.test.js`

**Interfaces:**
- Produces:
  - `CITY_KEY = 'brickRacers.city.v1'`, `SPOT_COUNT = 12`;
  - `assignSpots(carIds, saved) → { [carId]: spot }`;
  - `createCityStore(storage) → { spotsFor(carIds) → { [carId]: spot }, park(carId, spot) → boolean }`.

- [ ] **Step 1: Write the failing tests**

`tests/cityState.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSpots, createCityStore, CITY_KEY, SPOT_COUNT } from '../js/cityState.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const ids = n => Array.from({ length: n }, (_, i) => `car-${i}`);

test('cars keep their saved spots and new cars get the lowest free spot', () => {
  assert.deepEqual(assignSpots(['a', 'b', 'c'], { a: 3, b: 0 }), { a: 3, b: 0, c: 1 });
});

test('a deleted car frees its spot for the next new car', () => {
  const first = assignSpots(['a', 'b'], {});
  assert.deepEqual(first, { a: 0, b: 1 });
  assert.deepEqual(assignSpots(['b', 'c'], first), { b: 1, c: 0 });
});

test('only 12 cars fit; extras get no spot', () => {
  const spots = assignSpots(ids(15), {});
  assert.equal(Object.keys(spots).length, SPOT_COUNT);
  assert.equal(spots['car-14'], undefined);
  assert.deepEqual(new Set(Object.values(spots)).size, SPOT_COUNT);
});

test('broken saved spots are ignored (out of range, duplicates, not numbers)', () => {
  assert.deepEqual(assignSpots(['a', 'b', 'c', 'd'], { a: 99, b: 2, c: 2, d: 'x' }), { b: 2, a: 0, c: 1, d: 3 });
  assert.deepEqual(assignSpots(['a'], null), { a: 0 });
});

test('the store saves spots and remembers them next visit', () => {
  const storage = memoryStorage();
  createCityStore(storage).spotsFor(['a', 'b']);
  assert.deepEqual(createCityStore(storage).spotsFor(['b', 'a']), { a: 0, b: 1 });
});

test('parking in a free spot moves the car there', () => {
  const store = createCityStore(memoryStorage());
  store.spotsFor(['a', 'b']);
  assert.equal(store.park('a', 7), true);
  assert.deepEqual(store.spotsFor(['a', 'b']), { a: 7, b: 1 });
});

test('parking in a spot another car owns is refused; parking in your own spot is fine', () => {
  const store = createCityStore(memoryStorage());
  store.spotsFor(['a', 'b']);
  assert.equal(store.park('a', 1), false);
  assert.equal(store.park('b', 1), true);
  assert.deepEqual(store.spotsFor(['a', 'b']), { a: 0, b: 1 });
});

test('a spot that does not exist cannot be parked in', () => {
  const store = createCityStore(memoryStorage());
  store.spotsFor(['a']);
  assert.equal(store.park('a', 12), false);
  assert.equal(store.park('a', -1), false);
});

test('unreadable saved data gives everyone a fresh spot', () => {
  const store = createCityStore(memoryStorage({ [CITY_KEY]: '{nope' }));
  assert.deepEqual(store.spotsFor(['a', 'b']), { a: 0, b: 1 });
});

test('works when storage refuses to save or does not exist', () => {
  const broken = createCityStore({ getItem: () => null, setItem: () => { throw new Error('full'); } });
  assert.deepEqual(broken.spotsFor(['a']), { a: 0 });
  assert.deepEqual(createCityStore(null).spotsFor(['a']), { a: 0 });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/cityState.js`.

- [ ] **Step 3: Write `js/cityState.js`**

```js
export const CITY_KEY = 'brickRacers.city.v1';
export const SPOT_COUNT = 12;

const validSpot = s => Number.isInteger(s) && s >= 0 && s < SPOT_COUNT;

// Cars keep valid saved spots; the rest fill the lowest free spots in order; extras beyond 12 get none.
export function assignSpots(carIds, saved) {
  const previous = saved && typeof saved === 'object' ? saved : {};
  const result = {};
  const used = new Set();
  for (const id of carIds) {
    const s = previous[id];
    if (validSpot(s) && !used.has(s)) {
      result[id] = s;
      used.add(s);
    }
  }
  for (const id of carIds) {
    if (result[id] !== undefined) continue;
    let s = 0;
    while (used.has(s)) s++;
    if (s >= SPOT_COUNT) continue;
    result[id] = s;
    used.add(s);
  }
  return result;
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function load(storage) {
  try {
    const data = JSON.parse(storage?.getItem(CITY_KEY) ?? 'null');
    return data && typeof data.spots === 'object' && data.spots ? data.spots : {};
  } catch {
    return {};
  }
}

export function createCityStore(storage = defaultStorage()) {
  let spots = load(storage);
  const persist = () => {
    try {
      storage?.setItem(CITY_KEY, JSON.stringify({ spots }));
    } catch {
      // Storage full or blocked: keep the spots for this visit.
    }
  };
  return {
    spotsFor(carIds) {
      spots = assignSpots(carIds, spots);
      persist();
      return { ...spots };
    },
    park(carId, spot) {
      if (!validSpot(spot)) return false;
      const owner = Object.keys(spots).find(id => spots[id] === spot);
      if (owner && owner !== carId) return false;
      spots[carId] = spot;
      persist();
      return true;
    },
  };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 10 new tests plus all existing ones.

- [ ] **Step 5: Commit**

```bash
git add js/cityState.js tests/cityState.test.js
git commit -m "feat: garage spots that stick between visits"
```

---

### Task 3: Traffic rules, lights and dodging

**Files:**
- Create: `js/traffic.js`
- Test: `tests/traffic.test.js`

**Interfaces:**
- Produces:
  - `LIGHT_PERIOD = 8`, `STOP_DISTANCE = 7`, `LANE_HALF_WIDTH = 2.5`, `DODGE_RADIUS = 4`, `TRAFFIC_SPEED = 7`, `PEDESTRIAN_SPEED = 1.4`;
  - `greenAxis(time) → 'x' | 'z'`, `isGreen(axis, time)`;
  - `obstacleAhead(pos, dir, obstacles) → boolean`;
  - `shouldStop(pose, time, obstacles) → boolean`, where `pose = { x, z, dir: {x,z}, axis, distToCorner }`;
  - `createLoopMover(corners, startFraction) → { length, s, advance(ds), pose() → { x, z, dir, axis, distToCorner, heading } }`;
  - `dodgeVector(person{x,z}, player{x,z}) → {x,z} | null`.

- [ ] **Step 1: Write the failing tests**

`tests/traffic.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { greenAxis, isGreen, obstacleAhead, shouldStop, createLoopMover, dodgeVector, LIGHT_PERIOD } from '../js/traffic.js';

const east = { x: 1, z: 0 };
const pose = (over = {}) => ({ x: 0, z: 0, dir: east, axis: 'x', distToCorner: 30, ...over });
const redForX = LIGHT_PERIOD + 1; // second phase: z is green

test('lights switch every 8 seconds and are never green both ways', () => {
  assert.equal(greenAxis(0), 'x');
  assert.equal(greenAxis(7.9), 'x');
  assert.equal(greenAxis(8), 'z');
  assert.equal(greenAxis(16.5), 'x');
  for (let t = 0; t < 40; t += 0.5) assert.notEqual(isGreen('x', t), isGreen('z', t));
});

test('something within 7 m ahead in the lane stops a car', () => {
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, [{ x: 5, z: 1 }]), true);
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, [{ x: 8, z: 0 }]), false, 'too far');
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, [{ x: -3, z: 0 }]), false, 'behind');
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, [{ x: 4, z: 6 }]), false, 'other lane');
  assert.equal(obstacleAhead({ x: 0, z: 0 }, east, []), false);
});

test('a red light stops cars just before the junction, not inside it', () => {
  assert.equal(shouldStop(pose({ distToCorner: 8 }), redForX, []), true);
  assert.equal(shouldStop(pose({ distToCorner: 8 }), 1, []), false, 'green');
  assert.equal(shouldStop(pose({ distToCorner: 3 }), redForX, []), false, 'already in the junction');
  assert.equal(shouldStop(pose({ distToCorner: 20 }), redForX, []), false, 'still far away');
  assert.equal(shouldStop(pose({ distToCorner: 20 }), 1, [{ x: 4, z: 0 }]), true, 'green but blocked');
});

test('the loop mover drives round the rectangle and wraps', () => {
  const m = createLoopMover([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 20 }, { x: 0, z: 20 }], 0);
  assert.equal(m.length, 60);
  assert.deepEqual([m.pose().x, m.pose().z, m.pose().axis], [0, 0, 'x']);
  assert.ok(Math.abs(m.pose().heading - Math.PI / 2) < 1e-9);
  m.advance(15);
  assert.deepEqual([m.pose().x, m.pose().z, m.pose().axis, m.pose().distToCorner], [10, 5, 'z', 15]);
  assert.ok(Math.abs(m.pose().heading) < 1e-9);
  m.advance(50);
  assert.deepEqual([m.pose().x, m.pose().z], [5, 0]);
  const half = createLoopMover([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 20 }, { x: 0, z: 20 }], 0.5);
  assert.deepEqual([half.pose().x, half.pose().z], [10, 20]);
});

test('a person dodges away only when the player is within 4 m', () => {
  const v = dodgeVector({ x: 0, z: 0 }, { x: 3, z: 0 });
  assert.deepEqual(v, { x: -1, z: 0 });
  assert.equal(dodgeVector({ x: 0, z: 0 }, { x: 5, z: 0 }), null);
  assert.deepEqual(dodgeVector({ x: 1, z: 1 }, { x: 1, z: 1 }), { x: 1, z: 0 });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/traffic.js`.

- [ ] **Step 3: Write `js/traffic.js`**

```js
export const LIGHT_PERIOD = 8;
export const STOP_DISTANCE = 7;
export const LANE_HALF_WIDTH = 2.5;
export const DODGE_RADIUS = 4;
export const TRAFFIC_SPEED = 7;
export const PEDESTRIAN_SPEED = 1.4;

// All lights switch together: traffic along x, then traffic along z.
export const greenAxis = time => (Math.floor(time / LIGHT_PERIOD) % 2 === 0 ? 'x' : 'z');
export const isGreen = (axis, time) => greenAxis(time) === axis;

export function obstacleAhead(pos, dir, obstacles) {
  return obstacles.some(o => {
    const rx = o.x - pos.x;
    const rz = o.z - pos.z;
    const ahead = rx * dir.x + rz * dir.z;
    const lateral = Math.abs(rx * dir.z - rz * dir.x);
    return ahead > 0.5 && ahead <= STOP_DISTANCE && lateral < LANE_HALF_WIDTH;
  });
}

// Stop at a red light before entering the junction (corner 4–10 m away), or for anything just ahead.
export function shouldStop(pose, time, obstacles) {
  if (!isGreen(pose.axis, time) && pose.distToCorner > 4 && pose.distToCorner <= 10) return true;
  return obstacleAhead(pose, pose.dir, obstacles);
}

export function createLoopMover(corners, startFraction = 0) {
  const segments = corners.map((a, i) => {
    const b = corners[(i + 1) % corners.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    return { a, len, dir: { x: (b.x - a.x) / len, z: (b.z - a.z) / len } };
  });
  const length = segments.reduce((total, seg) => total + seg.len, 0);
  let s = ((((startFraction % 1) + 1) % 1) * length) % length;
  return {
    length,
    get s() { return s; },
    advance(ds) { s = (s + ds) % length; },
    pose() {
      let d = s;
      for (const seg of segments) {
        if (d < seg.len) {
          return {
            x: seg.a.x + seg.dir.x * d,
            z: seg.a.z + seg.dir.z * d,
            dir: seg.dir,
            axis: Math.abs(seg.dir.x) > Math.abs(seg.dir.z) ? 'x' : 'z',
            distToCorner: seg.len - d,
            heading: Math.atan2(seg.dir.x, seg.dir.z),
          };
        }
        d -= seg.len;
      }
      const first = segments[0];
      return { x: first.a.x, z: first.a.z, dir: first.dir, axis: Math.abs(first.dir.x) > Math.abs(first.dir.z) ? 'x' : 'z', distToCorner: first.len, heading: Math.atan2(first.dir.x, first.dir.z) };
    },
  };
}

export function dodgeVector(person, player) {
  const dx = person.x - player.x;
  const dz = person.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= DODGE_RADIUS) return null;
  if (dist < 1e-6) return { x: 1, z: 0 };
  return { x: dx / dist, z: dz / dist };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 5 new tests plus all existing ones.

- [ ] **Step 5: Commit**

```bash
git add js/traffic.js tests/traffic.test.js
git commit -m "feat: traffic lights, stop rule, loop driving and people dodging"
```

---

### Task 4: Walking

**Files:**
- Create: `js/walker.js`, `js/joystick.js`
- Test: `tests/walker.test.js`

**Interfaces:**
- Produces:
  - `walker.js`:
    - `WALK_SPEED = 4`;
    - `stickToWorld({x,y}, yaw) → {x,z}` (stick up = camera forward, stick right = screen right);
    - `createWalker(world, { position, heading }) → { body, heading, move(stick, yaw), teleport(position, heading), remove() }`.
  - `joystick.js`:
    - `stickVector(dx, dy, radius) → {x,y}` (y up positive, length ≤ 1);
    - `attachStick(element, signal) → { value, reset() }`.

- [ ] **Step 1: Write the failing tests**

`tests/walker.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createWalker, stickToWorld, WALK_SPEED } from '../js/walker.js';
import { stickVector } from '../js/joystick.js';

const STEP = 1 / 60;

function makeWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  ground.aabbNeedsUpdate = true;
  world.addBody(ground);
  return world;
}

function staticBox(world, [cx, cy, cz], [hx, hy, hz], rotX = 0) {
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
  body.position.set(cx, cy, cz);
  body.quaternion.setFromEuler(rotX, 0, 0);
  body.aabbNeedsUpdate = true;
  world.addBody(body);
}

function walk(world, walker, stick, seconds, yaw = 0) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    walker.move(stick, yaw);
    world.step(STEP);
  }
}

test('stick up walks where the camera looks; stick right walks to the screen right', () => {
  const up = stickToWorld({ x: 0, y: 1 }, 0);
  assert.ok(Math.abs(up.x) < 1e-9 && Math.abs(up.z - 1) < 1e-9);
  const right = stickToWorld({ x: 1, y: 0 }, 0);
  assert.ok(Math.abs(right.x + 1) < 1e-9 && Math.abs(right.z) < 1e-9);
  const turned = stickToWorld({ x: 0, y: 1 }, Math.PI / 2);
  assert.ok(Math.abs(turned.x - 1) < 1e-9);
});

test('the joystick reading is clamped to the circle and y points up', () => {
  assert.deepEqual(stickVector(0, -50, 50), { x: 0, y: 1 });
  const far = stickVector(300, 0, 50);
  assert.ok(Math.abs(far.x - 1) < 1e-9 && far.y === 0);
  const v = stickVector(30, 40, 50);
  assert.ok(Math.abs(v.x - 0.6) < 1e-9 && Math.abs(v.y + 0.8) < 1e-9);
});

test('walking forward for a second covers about 4 m, then stops when the stick is let go', () => {
  const world = makeWorld();
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 } });
  walk(world, walker, { x: 0, y: 1 }, 1);
  assert.ok(walker.body.position.z > WALK_SPEED * 0.8, `z=${walker.body.position.z}`);
  walk(world, walker, { x: 0, y: 0 }, 0.3);
  assert.ok(Math.hypot(walker.body.velocity.x, walker.body.velocity.z) < 0.1);
  assert.ok(Math.abs(walker.heading) < 1e-9, 'faces where he walked');
});

test('a wall stops him', () => {
  const world = makeWorld();
  staticBox(world, [0, 2, 3], [5, 2, 0.5]);
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 } });
  walk(world, walker, { x: 0, y: 1 }, 2);
  assert.ok(walker.body.position.z < 2.3, `z=${walker.body.position.z}`);
});

test('he can walk up a garage ramp', () => {
  const world = makeWorld();
  const angle = Math.atan2(3, 20);
  staticBox(world, [0, 1.5 - 0.15, 12], [3, 0.15, Math.hypot(3, 20) / 2], -angle);
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 } });
  walk(world, walker, { x: 0, y: 1 }, 4); // ~16 m: well up the 20 m ramp, not off its top
  assert.ok(walker.body.position.y > 2, `y=${walker.body.position.y}`);
});

test('teleport moves him and stops him', () => {
  const world = makeWorld();
  const walker = createWalker(world, { position: { x: 0, y: 0.5, z: 0 } });
  walk(world, walker, { x: 0, y: 1 }, 0.5);
  walker.teleport({ x: 10, y: 1, z: 10 }, Math.PI);
  assert.deepEqual([walker.body.position.x, walker.body.position.z], [10, 10]);
  assert.equal(walker.body.velocity.length(), 0);
  assert.equal(walker.heading, Math.PI);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/walker.js`.

- [ ] **Step 3: Write `js/walker.js`**

```js
import * as CANNON from 'cannon-es';

export const WALK_SPEED = 4;
const RADIUS = 0.4;
const DEAD_ZONE = 0.05;

// Stick up walks where the camera looks (yaw); stick right walks to the screen's right.
export function stickToWorld({ x, y }, yaw) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return { x: fx * y - fz * x, z: fz * y + fx * x };
}

// He is a ball that never rolls: we set its sideways speed, physics does gravity, ramps and walls.
export function createWalker(world, { position = { x: 0, y: 1, z: 0 }, heading = 0 } = {}) {
  const body = new CANNON.Body({ mass: 60, shape: new CANNON.Sphere(RADIUS), fixedRotation: true });
  body.position.set(position.x, position.y, position.z);
  world.addBody(body);
  let facing = heading;
  return {
    body,
    get heading() { return facing; },
    move(stick, yaw) {
      const strength = Math.min(1, Math.hypot(stick.x, stick.y));
      if (strength < DEAD_ZONE) {
        body.velocity.x = 0;
        body.velocity.z = 0;
        return;
      }
      const dir = stickToWorld(stick, yaw);
      body.velocity.x = dir.x * WALK_SPEED;
      body.velocity.z = dir.z * WALK_SPEED;
      facing = Math.atan2(dir.x, dir.z);
    },
    teleport(p, h = facing) {
      body.position.set(p.x, p.y, p.z);
      body.velocity.setZero();
      facing = h;
    },
    remove() {
      world.removeBody(body);
    },
  };
}
```

- [ ] **Step 4: Write `js/joystick.js`**

```js
// Screen offset from the stick's centre → { x, y } inside the unit circle (y up).
export function stickVector(dx, dy, radius) {
  let x = dx / radius;
  let y = -dy / radius;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x: x || 0, y: y || 0 };
}

// A thumb stick on screen: drag the knob; it springs back when the finger lifts (or the app is switched away).
export function attachStick(element, signal) {
  const knob = element.querySelector('.knob');
  const value = { x: 0, y: 0 };
  let pointer = null;
  let cx = 0;
  let cy = 0;
  const reset = () => {
    pointer = null;
    value.x = 0;
    value.y = 0;
    knob.style.transform = '';
  };
  const follow = e => {
    const radius = element.clientWidth / 2;
    const v = stickVector(e.clientX - cx, e.clientY - cy, radius);
    value.x = v.x;
    value.y = v.y;
    knob.style.transform = `translate(${v.x * radius * 0.6}px, ${-v.y * radius * 0.6}px)`;
  };
  element.addEventListener('pointerdown', e => {
    e.preventDefault();
    pointer = e.pointerId;
    const r = element.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    follow(e);
  }, { signal });
  window.addEventListener('pointermove', e => { if (e.pointerId === pointer) follow(e); }, { signal });
  const end = e => { if (e.pointerId === pointer) reset(); };
  window.addEventListener('pointerup', end, { signal });
  window.addEventListener('pointercancel', end, { signal });
  window.addEventListener('blur', reset, { signal });
  document.addEventListener('visibilitychange', reset, { signal });
  return { value, reset };
}
```

- [ ] **Step 5: Run to see them pass**

Run: `npm test`
Expected: PASS — 6 new tests plus all existing ones. If the ramp test fails because he slides back, check that the walker sets velocity every step and that the ramp body has `aabbNeedsUpdate`.

- [ ] **Step 6: Commit**

```bash
git add js/walker.js js/joystick.js tests/walker.test.js
git commit -m "feat: walking figure physics and on-screen thumb stick"
```

---
### Task 5: Shared driven car and gadget HUD (moved out of the race)

**Files:**
- Create: `js/drivenCar.js`, `js/gadgetHud.js`
- Modify: `js/race.js`, `js/brickMesh.js`, `js/main.js`

**Interfaces:**
- Produces:
  - `drivenCar.js`:
    - `collectFx(object) → { spinners, flags, flames, sirens, muzzles }`;
    - `createDrivenCar({ world, scene, bricks, pose, driver }) → { car, mesh, wheels, fx, sync(), remove() }`.
  - `gadgetHud.js`:
    - `animateFx(fx, dt, { speed, clock, seed, boosting, sirenOn })`;
    - `createGadgetHud({ ui, scene, signal, canUse }) → { setCar(bricks, fx), clearCar(), use(action), setSiren(on), update(dt), boosting, sirenOn, dispose() }`;
    - it owns the gadget buttons' pointerdown and the B/H/N/C keys.
  - `createBrickMesh`/`createCarMesh` accept `emptySeat: true` (no driver drawn).
  - `createRace(app, car, { fromCity = false })`; `app.startRace(car, options)`.
- Behaviour: races play exactly as before.

- [ ] **Step 1: Write `js/drivenCar.js`**

```js
import * as THREE from 'three';
import { createVehicle } from './vehiclePhysics.js';
import { createCarMesh, createWheelMesh } from './brickMesh.js';

// Parts that move on their own: propellers, flags, rocket flames, siren domes, cannon muzzles.
export function collectFx(object) {
  const fx = { spinners: [], flags: [], flames: [], sirens: [], muzzles: [] };
  object.traverse(node => {
    if (node.userData.spin) fx.spinners.push(node);
    if (node.userData.flag) fx.flags.push(node);
    if (node.userData.flame) fx.flames.push(node);
    if (node.userData.sirenLight) fx.sirens.push(node);
    if (node.userData.muzzle) fx.muzzles.push(node);
  });
  return fx;
}

// A drivable brick car: physics vehicle + body mesh + spinning wheel meshes.
export function createDrivenCar({ world, scene, bricks, pose, driver = null }) {
  const car = createVehicle(world, bricks, pose);
  const mesh = new THREE.Group();
  const body = createCarMesh(bricks, { includeWheels: false, driver });
  const com = car.stats.centerOfMass;
  body.position.set(-com.x, -com.y, -com.z);
  mesh.add(body);
  scene.add(mesh);
  const wheels = car.stats.wheels.map(w => {
    const wheel = createWheelMesh(w.type, w.color);
    scene.add(wheel);
    return wheel;
  });
  const fx = collectFx(body);
  function sync() {
    mesh.position.copy(car.body.position);
    mesh.quaternion.copy(car.body.quaternion);
    car.vehicle.wheelInfos.forEach((info, i) => {
      car.vehicle.updateWheelTransform(i);
      wheels[i].position.copy(info.worldTransform.position);
      wheels[i].quaternion.copy(info.worldTransform.quaternion);
    });
  }
  function remove() {
    car.vehicle.removeFromWorld(world);
    scene.remove(mesh);
    for (const wheel of wheels) scene.remove(wheel);
  }
  sync();
  return { car, mesh, wheels, fx, sync, remove };
}
```

- [ ] **Step 2: Write `js/gadgetHud.js`**

```js
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
export function createGadgetHud({ ui, scene, signal, canUse }) {
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
    if (action === 'boost' && boost.trigger()) sfx.whoosh();
    if (action === 'horn' && horn.trigger()) sfx.horn();
    if (action === 'siren') setSiren(!sirenOn);
    if (action === 'confetti' && confettiCooldown.trigger()) {
      sfx.pop();
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
          button.style.setProperty('--charge', `${Math.round(boost.charge * 100)}%`);
          button.classList.toggle('on', boost.active);
        }
      }
    },
    dispose() {
      siren.stop();
      confetti.dispose();
    },
  };
}
```

- [ ] **Step 3: Empty seats for parked cars (`js/brickMesh.js`)**

Replace:
```js
export function createBrickMesh(brick, { ghost = null, driver = null } = {}) {
```
with:
```js
export function createBrickMesh(brick, { ghost = null, driver = null, emptySeat = false } = {}) {
```

In `case 'seat':` replace:
```js
      {
        const figure = createFigureMesh(driver ?? driverFigure, { pose: 'sit', pick });
```
with:
```js
      if (!emptySeat) {
        const figure = createFigureMesh(driver ?? driverFigure, { pose: 'sit', pick });
```

Replace:
```js
export function createCarMesh(bricks, { includeWheels = true, driver = null } = {}) {
  const car = new THREE.Group();
  for (const b of bricks) {
    if (includeWheels || BRICK_TYPES[b.type]?.kind !== 'wheel') car.add(createBrickMesh(b, { driver }));
```
with:
```js
export function createCarMesh(bricks, { includeWheels = true, driver = null, emptySeat = false } = {}) {
  const car = new THREE.Group();
  for (const b of bricks) {
    if (includeWheels || BRICK_TYPES[b.type]?.kind !== 'wheel') car.add(createBrickMesh(b, { driver, emptySeat }));
```

- [ ] **Step 4: The race uses the shared pieces (`js/race.js`)**

Make these replacements (each `old` text appears exactly once):

1. Imports. Replace:
```js
import { createVehicle } from './vehiclePhysics.js';
import { createCarMesh, createWheelMesh } from './brickMesh.js';
```
with:
```js
import { createDrivenCar } from './drivenCar.js';
```
Replace:
```js
import { gadgetsOf, createBoost, createCooldown } from './gadgets.js';
import { createConfetti } from './confetti.js';
```
with:
```js
import { createGadgetHud, animateFx } from './gadgetHud.js';
```
Replace:
```js
import { sfx, createEngineSound, createSirenSound } from './audio.js';
```
with:
```js
import { sfx, createEngineSound } from './audio.js';
```

2. Delete the line:
```js
const GADGET_KEYS = { KeyB: 'boost', KeyH: 'horn', KeyN: 'siren', KeyC: 'confetti' };
```

3. Replace the function header:
```js
export function createRace(app, playerCar) {
```
with:
```js
export function createRace(app, playerCar, { fromCity = false } = {}) {
```

4. Replace the whole body of the `entries.map((entry, slot) => { … })` callback (from `const car = createVehicle(` through the `return { ...entry, id: slot, car, mesh, wheels, fx, state: newRaceState(), …` line) with:
```js
    const driven = createDrivenCar({ world, scene, bricks: entry.bricks, pose: track.startGrid(slot), driver: entry.driver });
    return { ...entry, id: slot, car: driven.car, mesh: driven.mesh, wheels: driven.wheels, fx: driven.fx, sync: driven.sync, state: newRaceState(), aiIdx: track.racingLine.length - 2, offTime: 0, stuck: { slowFor: 0, reverseFor: 0 } };
```

5. Replace the block from `  // --- gadgets (player only) ---` through the end of the `animateParts` function (its closing `  }`) with:
```js
  // --- gadgets (player only) ---
  const hud = createGadgetHud({ ui, scene, signal: abort.signal, canUse: () => !paused && phase === 'racing' });
  hud.setCar(playerCar.bricks, player.fx);
  const setSiren = onNow => hud.setSiren(onNow);

  function animateParts(dt) {
    for (const r of racers) {
      animateFx(r.fx, dt, { speed: Math.abs(r.car.forwardSpeed()), clock, seed: r.id, boosting: r.human && hud.boosting, sirenOn: r.human && hud.sirenOn });
    }
  }
```

6. In the `on(ui, 'pointerdown', e => {` handler, delete these two lines (the hud listens itself):
```js
    const gadget = e.target.closest('[data-gadget]')?.dataset.gadget;
    if (gadget) useGadget(gadget);
```

7. Delete the keydown listener:
```js
  on(window, 'keydown', e => {
    if (GADGET_KEYS[e.code] && !e.repeat) useGadget(GADGET_KEYS[e.code]);
  });
```

8. In `driverInput`, replace `boost: boost.active` with `boost: hud.boosting`.

9. Replace the body of `syncMeshes(r)` with:
```js
  function syncMeshes(r) {
    r.sync();
  }
```

10. In `update`, replace:
```js
      boost.update(dt);
      horn.update(dt);
      confettiCooldown.update(dt);
      confetti.update(dt);
      animateParts(dt);
```
with:
```js
      hud.update(dt);
      animateParts(dt);
```

11. In `dispose`, replace:
```js
      siren.stop();
      confetti.dispose();
```
with:
```js
      hud.dispose();
```

12. Podium and pause go back to the city when the race started there. In `showPodium`, replace:
```js
        { label: '🚗 Garage', onClick: () => app.openGarage() },
        { label: '🔁 Race again', kind: 'go', onClick: () => app.startRace(playerCar) },
```
with:
```js
        fromCity
          ? { label: '🏙 Back to city', onClick: () => app.openCity({ nearCarId: playerCar.id }) }
          : { label: '🚗 Garage', onClick: () => app.openGarage() },
        { label: '🔁 Race again', kind: 'go', onClick: () => app.startRace(playerCar, { fromCity }) },
```
and in `pause()` replace:
```js
        { label: '🔁 Restart', onClick: () => app.startRace(playerCar) },
```
with:
```js
        { label: '🔁 Restart', onClick: () => app.startRace(playerCar, { fromCity }) },
```

- [ ] **Step 5: `js/main.js`**

Replace:
```js
  startRace(car) {
    app.setMode(createRace(app, car));
  },
```
with:
```js
  startRace(car, options = {}) {
    app.setMode(createRace(app, car, options));
  },
```

- [ ] **Step 6: Check races still work**

Run: `npm test`
Expected: PASS.

In the browser, use the race hook plus the simulation harness from the more-parts session (hook removed before commit).

Expected:
- a full simulated race with a gadget car finishes with a podium;
- boost raises speed (compare 2 s of full gas from GO, with and without B);
- the siren flashes and stops at the finish;
- confetti bursts;
- AI drivers are unchanged;
- no console errors.

- [ ] **Step 7: Commit**

```bash
git add js/drivenCar.js js/gadgetHud.js js/race.js js/brickMesh.js js/main.js
git commit -m "refactor: share the driven car and gadget buttons between race and city"
```

---

### Task 6: The 3D city

**Files:**
- Create: `js/cityWorld.js`

**Interfaces:**
- Consumes: cityMap.js, `greenAxis` (traffic.js).
- Produces: `createCityWorld(scene, world) → { update(time), dispose() }`. It adds to the scene and world:
  - the ground plane (physics + grass), asphalt and lane dashes, sidewalks;
  - buildings by block type, each with one static box;
  - the garage (floors, ramps, walls as static boxes, plus spot markings with numbers);
  - 25 traffic lights whose lamps follow `greenAxis(time)`;
  - the race gate arch;
  - curb walls round the city edge (physics);
  - a lake and trees outside.

- [ ] **Step 1: Write `js/cityWorld.js`**

```js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SIZE, ROAD, PITCH, GRID, SIDEWALK, BLOCK, BLOCKS, INTERSECTIONS, GARAGE, RACE_GATE, roadCenter } from './cityMap.js';
import { greenAxis } from './traffic.js';

const PALETTE = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xfb8c00, 0x8e24aa, 0x00acc1, 0xf06292];

export function createCityWorld(scene, world) {
  const disposables = [];
  const own = thing => { disposables.push(thing); return thing; };
  const materials = new Map();
  const material = (color, extra = {}) => {
    const key = `${color}:${JSON.stringify(extra)}`;
    if (!materials.has(key)) materials.set(key, own(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra })));
    return materials.get(key);
  };

  function staticBox({ cx, cy, cz, hx, hy, hz, rotX = 0 }, color = null, { physics = true, shadow = true } = {}) {
    if (physics) {
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
      body.position.set(cx, cy, cz);
      if (rotX) body.quaternion.setFromEuler(rotX, 0, 0);
      body.aabbNeedsUpdate = true;
      world.addBody(body);
    }
    if (color === null) return null;
    const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2)), typeof color === 'number' ? material(color) : color);
    mesh.position.set(cx, cy, cz);
    mesh.rotation.x = rotX;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const flat = (x0, z0, x1, z1, y, color) => {
    const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2)), typeof color === 'number' ? material(color) : color);
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'));
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const sign = (text, bg, fg = '#ffffff') => own(new THREE.MeshStandardMaterial({
    map: canvasTexture(512, 128, g => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = fg;
      g.font = 'bold 64px Fredoka, Arial Rounded MT Bold, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 68);
    }),
  }));

  // --- ground, roads, sidewalks ---
  const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  groundBody.aabbNeedsUpdate = true;
  world.addBody(groundBody);
  flat(-300, -300, SIZE + 300, SIZE + 300, 0, 0x6fcf5f);
  flat(0, 0, SIZE, SIZE, 0.01, 0x55595f);
  flat(-40, SIZE + 30, SIZE + 40, SIZE + 140, 0.02, material(0x29b6f6, { roughness: 0.2 })); // lake

  // White dashes down the middle of every road, skipping the junctions.
  const dashes = [];
  for (let i = 0; i <= GRID; i++) {
    for (let k = 0; k < GRID; k++) {
      for (let d = ROAD + 3; d < PITCH - 3; d += 6) {
        dashes.push([roadCenter(i), k * PITCH + d, 0]);
        dashes.push([k * PITCH + d, roadCenter(i), Math.PI / 2]);
      }
    }
  }
  const dashMesh = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(0.3, 3).rotateX(-Math.PI / 2)), material(0xffffff), dashes.length);
  const m4 = new THREE.Matrix4();
  dashes.forEach(([x, z, rot], n) => dashMesh.setMatrixAt(n, m4.makeRotationY(rot).setPosition(x, 0.02, z)));
  scene.add(dashMesh);

  // --- blocks ---
  const trees = [];
  BLOCKS.forEach((b, n) => {
    const { x0, z0, x1, z1 } = b.rect;
    flat(x0, z0, x1, z1, 0.03, 0xcfd8dc); // sidewalk
    const ix0 = x0 + SIDEWALK + 1;
    const iz0 = z0 + SIDEWALK + 1;
    const ix1 = x1 - SIDEWALK - 1;
    const iz1 = z1 - SIDEWALK - 1;
    const color = k => PALETTE[(n * 3 + k) % PALETTE.length];
    const building = (xa, za, xb, zb, h, c) => {
      staticBox({ cx: (xa + xb) / 2, cy: h / 2, cz: (za + zb) / 2, hx: (xb - xa) / 2, hy: h / 2, hz: (zb - za) / 2 }, c);
      staticBox({ cx: (xa + xb) / 2, cy: h + 0.2, cz: (za + zb) / 2, hx: (xb - xa) / 2 + 0.4, hy: 0.2, hz: (zb - za) / 2 + 0.4 }, 0xf5f5f5, { physics: false });
    };
    switch (b.type) {
      case 'houses':
        flat(ix0, iz0, ix1, iz1, 0.04, 0x8bd17c);
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([qx, qz], k) => {
          const xa = ix0 + qx * 15 + 1;
          const za = iz0 + qz * 15 + 1;
          const h = 5 + ((n + k) % 3);
          staticBox({ cx: xa + 5, cy: h / 2, cz: za + 5, hx: 5, hy: h / 2, hz: 5 }, color(k));
          const roof = new THREE.Mesh(own(new THREE.ConeGeometry(7.4, 3, 4)), material(0xb71c1c));
          roof.position.set(xa + 5, h + 1.5, za + 5);
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          scene.add(roof);
        });
        break;
      case 'shops':
        building(ix0, iz0, ix1, iz0 + 11, 7, color(0));
        building(ix0, iz1 - 11, ix1, iz1, 8, color(1));
        break;
      case 'towers': {
        const h = 24 + (n % 3) * 4;
        const windows = own(new THREE.MeshStandardMaterial({
          color: color(2),
          map: canvasTexture(64, 128, g => {
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, 64, 128);
            g.fillStyle = '#90caf9';
            for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 16) g.fillRect(x, y, 10, 10);
          }),
        }));
        staticBox({ cx: (ix0 + ix1) / 2, cy: h / 2, cz: (iz0 + iz1) / 2, hx: 10, hy: h / 2, hz: 10 }, windows);
        break;
      }
      case 'park':
        flat(ix0, iz0, ix1, iz1, 0.04, 0x66bb6a);
        flat(ix0 + 8, iz0 + 8, ix1 - 8, iz1 - 8, 0.05, material(0x4fc3f7, { roughness: 0.2 }));
        for (const [tx, tz] of [[2, 2], [26, 3], [3, 25], [25, 26], [14, 1], [1, 14]]) trees.push([ix0 + tx, iz0 + tz, 1]);
        break;
      case 'pizza': {
        building(ix0 + 2, iz0 + 2, ix1 - 2, iz0 + 18, 7, 0xfff3e0);
        const board = new THREE.Mesh(own(new THREE.PlaneGeometry(14, 3.5)), sign('PIZZA 🍕', '#e53935'));
        board.position.set((ix0 + ix1) / 2, 8.6, iz0 + 18.05);
        scene.add(board);
        break;
      }
      case 'shopSoon': {
        building(ix0 + 2, iz0 + 2, ix1 - 2, iz0 + 18, 7, 0xe1bee7);
        const board = new THREE.Mesh(own(new THREE.PlaneGeometry(16, 4)), sign('SHOP · coming soon', '#8e24aa'));
        board.position.set((ix0 + ix1) / 2, 8.8, iz0 + 18.05);
        scene.add(board);
        break;
      }
      case 'garage':
        flat(x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, 0.04, 0x9e9e9e);
        break;
    }
  });

  // --- garage building ---
  const concrete = material(0xb0bec5);
  for (const slab of GARAGE.floors) staticBox(slab, concrete);
  for (const ramp of GARAGE.ramps) staticBox(ramp, material(0x90a4ae));
  for (const wall of GARAGE.walls) staticBox(wall, material(0x78909c));
  const garageSign = new THREE.Mesh(own(new THREE.PlaneGeometry(14, 3.5)), sign('🅿️ GARAGE', '#1e88e5'));
  garageSign.position.set(GARAGE.rect.x1 + 0.45, 7.6, (GARAGE.rect.z0 + GARAGE.rect.z1) / 2);
  garageSign.rotation.y = Math.PI / 2;
  scene.add(garageSign);
  for (const spot of GARAGE.spots) {
    const lines = new THREE.Mesh(own(new THREE.PlaneGeometry(spot.w, spot.d).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({
      map: canvasTexture(192, 160, g => {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 8;
        g.strokeRect(4, 4, 184, 152);
        g.fillStyle = '#ffffff';
        g.font = 'bold 72px Fredoka, Arial Rounded MT Bold, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(spot.index + 1), 96, 84);
      }),
      transparent: true,
    })));
    lines.position.set(spot.x, spot.y + 0.06, spot.z);
    scene.add(lines);
  }

  // --- traffic lights: one lamp for traffic along x, one for traffic along z ---
  const green = material(0x00e676, { emissive: 0x00e676, emissiveIntensity: 1.2 });
  const red = material(0xff1744, { emissive: 0xff1744, emissiveIntensity: 1.2 });
  const poleGeometry = own(new THREE.CylinderGeometry(0.12, 0.12, 4, 8));
  const lampGeometry = own(new THREE.SphereGeometry(0.35, 12, 8));
  const lights = INTERSECTIONS.map(p => {
    const pole = new THREE.Mesh(poleGeometry, material(0x37474f));
    pole.position.set(p.x + ROAD / 2 + 0.6, 2, p.z + ROAD / 2 + 0.6);
    scene.add(pole);
    const lampX = new THREE.Mesh(lampGeometry, green);
    lampX.position.set(pole.position.x, 4.2, pole.position.z - 0.4);
    const lampZ = new THREE.Mesh(lampGeometry, red);
    lampZ.position.set(pole.position.x - 0.4, 4.2, pole.position.z);
    scene.add(lampX, lampZ);
    return { lampX, lampZ };
  });
  let shownAxis = null;

  // --- race gate ---
  const gate = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(own(new THREE.BoxGeometry(0.8, 7, 0.8)), material(0xe53935));
    post.position.set(side * (ROAD / 2 + 1), 3.5, 0);
    gate.add(post);
  }
  const banner = new THREE.Mesh(own(new THREE.BoxGeometry(ROAD + 3, 1.8, 0.4)), sign('🏁 RACE TRACK', '#111111'));
  banner.position.y = 7;
  gate.add(banner);
  gate.position.set(RACE_GATE.x, 0, RACE_GATE.z);
  scene.add(gate);

  // --- curb walls round the city ---
  const curb = 0xe53935;
  staticBox({ cx: -0.5, cy: 0.4, cz: SIZE / 2, hx: 0.5, hy: 0.4, hz: SIZE / 2 + 1 }, curb);
  staticBox({ cx: SIZE + 0.5, cy: 0.4, cz: SIZE / 2, hx: 0.5, hy: 0.4, hz: SIZE / 2 + 1 }, curb);
  staticBox({ cx: SIZE / 2, cy: 0.4, cz: -0.5, hx: SIZE / 2 + 1, hy: 0.4, hz: 0.5 }, curb);
  staticBox({ cx: SIZE / 2, cy: 0.4, cz: SIZE + 0.5, hx: SIZE / 2 + 1, hy: 0.4, hz: 0.5 }, curb);

  // --- trees: in the parks and in a ring outside the city ---
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * Math.PI * 2;
    const r = SIZE * 0.75 + (k % 5) * 6;
    trees.push([SIZE / 2 + Math.cos(a) * r, SIZE / 2 + Math.sin(a) * r, 1.2 + (k % 3) * 0.2]);
  }
  const trunks = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.4, 0.5, 2, 8)), material(0x795548), trees.length);
  const leaves = new THREE.InstancedMesh(own(new THREE.ConeGeometry(2.2, 5, 8)), material(0x2e7d32), trees.length);
  trees.forEach(([x, z, s], n) => {
    trunks.setMatrixAt(n, new THREE.Matrix4().compose(new THREE.Vector3(x, s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
    leaves.setMatrixAt(n, new THREE.Matrix4().compose(new THREE.Vector3(x, 4.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
  });
  trunks.castShadow = leaves.castShadow = true;
  scene.add(trunks, leaves);

  return {
    update(time) {
      const axis = greenAxis(time);
      if (axis === shownAxis) return;
      shownAxis = axis;
      for (const light of lights) {
        light.lampX.material = axis === 'x' ? green : red;
        light.lampZ.material = axis === 'z' ? green : red;
      }
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
```

- [ ] **Step 2: Look at the city in the browser**

Reload http://localhost:8080. In the console, build a viewing mode:

```js
const THREE = await import('three');
const CANNON = await import('cannon-es');
const { createCityWorld } = await import('/js/cityWorld.js');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6fbf5f, 2.2));
const world = new CANNON.World();
const city = createCityWorld(scene, world);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 2000);
camera.position.set(102, 260, 200);
camera.lookAt(102, 0, 102);
brickRacers.setMode({ scene, camera, update() { city.update(performance.now() / 1000); }, resize() {}, dispose() { city.dispose(); } });
```

Expected:
- a 4×4 grid of blocks: houses with pyramid roofs, shop rows, window towers, two parks with ponds, the PIZZA sign and the SHOP · coming soon sign;
- the grey garage block with its 3-floor structure;
- the red race arch on the east edge road;
- a red curb round the city, the lake to the south, trees outside;
- traffic-light lamps switch every 8 s;
- around 70 physics bodies (`world.bodies.length`), and no console errors.

Then move the camera into the garage at (`camera.position.set(30, 1.6, 14); camera.lookAt(30, 1.5, 40)`). Expected: ramp A rises to the 1st floor, the numbered spots 1–4 are along the west wall, and floors 2/3 show spots 5–12. Go home with `brickRacers.goHome()`.

- [ ] **Step 3: Commit**

```bash
git add js/cityWorld.js
git commit -m "feat: the 3D mini city with garage building, traffic lights and race gate"
```

---

### Task 7: Traffic and people

**Files:**
- Create: `js/cityTraffic.js`
- Modify: `js/audio.js` (`sfx.whoa`)

**Interfaces:**
- Consumes:
  - `TRAFFIC_LOOPS` and `PEDESTRIAN_PATHS` (cityMap.js);
  - `createLoopMover`, `shouldStop`, `dodgeVector`, `TRAFFIC_SPEED` and `PEDESTRIAN_SPEED` (traffic.js);
  - `createCarMesh` and `carLift` (brickMesh.js); `createFigureMesh` (figureMesh.js);
  - `MODELS` and `modelToBricks` (instructions.js); `randomFigure` (figures.js).
- Produces:
  - `createCityTraffic(scene, world) → { cars, people, update(dt, time, player, obstacles), dispose() }`;
  - `player` is `{x,z}` (his figure or his car) or `null`;
  - `obstacles` are extra `{x,z}` points that traffic must stop for (his car, his figure, parked-out cars).

- [ ] **Step 1: "Whoa!" sound (`js/audio.js`)**

Add to `sfx` after `whoosh()`:
```js
  whoa() { tone(480, 0.25, { type: 'triangle', volume: 0.12, slideTo: 880 }); },
```

- [ ] **Step 2: Write `js/cityTraffic.js`**

```js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TRAFFIC_LOOPS, PEDESTRIAN_PATHS } from './cityMap.js';
import { createLoopMover, shouldStop, dodgeVector, TRAFFIC_SPEED, PEDESTRIAN_SPEED } from './traffic.js';
import { createCarMesh, carLift } from './brickMesh.js';
import { createFigureMesh } from './figureMesh.js';
import { MODELS, modelToBricks } from './instructions.js';
import { randomFigure } from './figures.js';
import { sfx } from './audio.js';

const TRAFFIC_MODELS = [
  ['raceCar', { red: 'green' }],
  ['monsterTruck', { blue: 'orange' }],
  ['buggy', { green: 'red' }],
  ['policeCar', {}],
  ['fireTruck', {}],
  ['raceCar', { red: 'purple' }],
];

export function createCityTraffic(scene, world) {
  // Toy cars on fixed loops. Kinematic bodies: they nudge his car but can never be pushed or knocked over.
  const cars = TRAFFIC_LOOPS.map((loop, i) => {
    const [model, recolor] = TRAFFIC_MODELS[i % TRAFFIC_MODELS.length];
    const bricks = modelToBricks(MODELS[model], recolor);
    const mesh = createCarMesh(bricks, { driver: randomFigure(500 + i * 13, 'Driver') });
    const lift = carLift(bricks);
    const bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)), new CANNON.Vec3(center.x, center.y + lift, center.z));
    world.addBody(body);
    scene.add(mesh);
    return { mover: createLoopMover(loop.corners, loop.start), mesh, body, lift };
  });

  // People stroll round sidewalks; they have no physics, so nothing can hit them.
  const people = PEDESTRIAN_PATHS.flatMap((path, p) => [0, 0.5].map((start, k) => {
    const mesh = createFigureMesh(randomFigure(900 + p * 7 + k, 'Walker'));
    mesh.scale.setScalar(1.25);
    scene.add(mesh);
    return { mover: createLoopMover(path.corners, start), mesh, offset: { x: 0, z: 0 }, dodge: null, hop: 0, nextWhoa: 0 };
  }));

  function placeCar(car, dt) {
    const before = car.body.position.clone();
    const pose = car.mover.pose();
    car.mesh.position.set(pose.x, car.lift, pose.z);
    car.mesh.rotation.y = pose.heading;
    car.body.position.set(pose.x, 0, pose.z);
    car.body.quaternion.setFromEuler(0, pose.heading, 0);
    if (dt > 0) car.body.velocity.set((pose.x - before.x) / dt, 0, (pose.z - before.z) / dt);
  }
  for (const car of cars) placeCar(car, 0);

  return {
    cars,
    people,
    update(dt, time, player, obstacles = []) {
      const peopleSpots = people.map(p => p.mesh.position);
      for (const car of cars) {
        const others = [...obstacles, ...peopleSpots, ...cars.filter(c => c !== car).map(c => c.mesh.position)];
        if (!shouldStop(car.mover.pose(), time, others)) car.mover.advance(TRAFFIC_SPEED * dt);
        placeCar(car, dt);
      }
      for (const person of people) {
        const path = person.mover.pose();
        if (person.dodge) {
          person.dodge.t += dt;
          const k = Math.min(1, person.dodge.t / 0.5);
          person.offset.x = person.dodge.dir.x * 1.6 * k;
          person.offset.z = person.dodge.dir.z * 1.6 * k;
          person.hop = Math.sin(k * Math.PI) * 0.6;
          if (person.dodge.t > 1.2) person.dodge = null;
        } else {
          const dir = player ? dodgeVector({ x: path.x + person.offset.x, z: path.z + person.offset.z }, player) : null;
          if (dir) {
            person.dodge = { t: 0, dir };
            if (time > person.nextWhoa) {
              sfx.whoa();
              person.nextWhoa = time + 3;
            }
          } else {
            // Drift back onto the path and walk on.
            const back = Math.max(0, 1 - dt * 1.5);
            person.offset.x *= back;
            person.offset.z *= back;
            person.mover.advance(PEDESTRIAN_SPEED * dt);
          }
          person.hop = 0;
        }
        const pose = person.mover.pose();
        person.mesh.position.set(pose.x + person.offset.x, person.hop, pose.z + person.offset.z);
        person.mesh.rotation.y = pose.heading;
      }
    },
    dispose() {
      for (const car of cars) {
        world.removeBody(car.body);
        scene.remove(car.mesh);
      }
      for (const person of people) scene.remove(person.mesh);
    },
  };
}
```

- [ ] **Step 3: Watch the traffic in the browser**

Extend the Task 6 console viewer: also run `const traffic = (await import('/js/cityTraffic.js')).createCityTraffic(scene, world);` and step it in `update(dt)` with `traffic.update(1/60, t += 1/60, null, [])`, from a camera over the middle of the city.

Expected:
- 6 brick cars drive clockwise loops on the right-hand lanes, turning at corners;
- they stop before junctions on red and go on green;
- they queue behind each other;
- 10 people walk the sidewalks, and some cross the road between blocks 1,1 and 2,1;
- traffic stops for people crossing.

Then pass a fake player `{ x, z }` next to a person. Expected: the person hops away with a "whoa!" and later walks on. No console errors.

- [ ] **Step 4: Commit**

```bash
git add js/cityTraffic.js js/audio.js
git commit -m "feat: toy traffic that stops at lights and people who hop out of the way"
```

---
### Task 8: The city mode: walk, get in, drive, park

**Files:**
- Create: `js/city.js`
- Modify: `index.html`, `css/style.css`, `js/main.js`, `js/garageScreen.js`

**Interfaces:**
- Consumes everything from Tasks 1–7.
- Produces:
  - `createCity(app, { nearCarId }) → Mode` with `landscapeOnly: true`;
  - `app.openCity(options)`;
  - `app.openGarage({ fromCity })`;
  - `renderGarage(app, { fromCity })`.
- In `main.setMode`, the body class `racing` is set for `isRace || landscapeOnly`.

- [ ] **Step 1: City screen markup (`index.html`)**

After the closing `</section>` of `#race`, add:
```html
  <section id="city" class="screen hidden passthrough on-foot">
    <div class="city-top">
      <button class="icon-btn" data-city="home" aria-label="Home">🏠</button>
      <button class="icon-btn" data-city="pause" aria-label="Pause">⏸</button>
      <button class="tool-btn" data-city="cars">🚗<small>My cars</small></button>
    </div>
    <canvas id="city-map" width="300" height="300"></canvas>
    <div id="stick" class="stick foot-only"><div class="knob"></div></div>
    <button class="big-action foot-only hidden" data-city="enter">🚗 Get in</button>
    <button class="big-action exit drive-only" data-city="exit">🚶 Get out</button>
    <button class="flip-btn drive-only" data-city="flip">🙃 Flip me!</button>
    <div class="gadgets drive-only">
      <button class="gadget-btn hidden" data-gadget="boost">🚀<small>Boost</small></button>
      <button class="gadget-btn hidden" data-gadget="horn">📯<small>Honk</small></button>
      <button class="gadget-btn hidden" data-gadget="siren">🚨<small>Siren</small></button>
      <button class="gadget-btn hidden" data-gadget="confetti">🎉<small>Confetti</small></button>
    </div>
    <div class="pad left drive-only">
      <button class="pad-btn" data-control="left" aria-label="Steer left">◀</button>
      <button class="pad-btn" data-control="right" aria-label="Steer right">▶</button>
    </div>
    <div class="pad right drive-only">
      <button class="pad-btn stop" data-control="stop">STOP</button>
      <button class="pad-btn go" data-control="go">GO</button>
    </div>
  </section>
```

In the `#garage` header, replace:
```html
      <h2>My Garage</h2>
```
with:
```html
      <h2>My Cars</h2>
      <button class="tool-btn hidden" data-action="city">🏙<small>Back to city</small></button>
```

- [ ] **Step 2: Styles (append to `css/style.css`)**

```css
/* City */
#city .city-top { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 12px; display: flex; gap: 10px; }
#city-map { position: absolute; top: max(12px, env(safe-area-inset-top)); right: 12px; width: 150px; height: 150px; background: rgba(255, 255, 255, 0.6); border-radius: 22px; pointer-events: none !important; }
.stick { position: absolute; left: max(24px, env(safe-area-inset-left)); bottom: max(24px, env(safe-area-inset-bottom)); width: 170px; height: 170px; border-radius: 50%; background: rgba(255, 255, 255, 0.35); border: 4px solid rgba(255, 255, 255, 0.85); touch-action: none; }
.stick .knob { position: absolute; left: 50%; top: 50%; width: 76px; height: 76px; margin: -38px 0 0 -38px; border-radius: 50%; background: #fff; box-shadow: var(--shadow); pointer-events: none; }
.big-action { position: absolute; right: max(24px, env(safe-area-inset-right)); bottom: max(28px, env(safe-area-inset-bottom)); height: 84px; padding: 0 28px; font-size: 28px; font-weight: 700; color: #fff; background: var(--green); border-radius: 42px; box-shadow: var(--shadow); touch-action: none; }
.big-action.exit { top: 176px; bottom: auto; height: 60px; font-size: 22px; background: var(--blue); }
#city .flip-btn { top: 248px; }
#city.on-foot .drive-only, #city.driving .foot-only { display: none !important; }
#garage [data-action="city"] { margin-left: auto; }
@media (max-width: 760px), (max-height: 600px) {
  .stick { width: 140px; height: 140px; }
  #city-map { width: 120px; height: 120px; }
}
```

- [ ] **Step 3: Write `js/city.js`**

```js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCityWorld } from './cityWorld.js';
import { createCityTraffic } from './cityTraffic.js';
import { GARAGE, RACE_GATE, SIZE, GRID, PITCH, ROAD, spotAt } from './cityMap.js';
import { createCityStore } from './cityState.js';
import { createWalker } from './walker.js';
import { attachStick } from './joystick.js';
import { createDrivenCar } from './drivenCar.js';
import { createGadgetHud, animateFx } from './gadgetHud.js';
import { createCarMesh, carLift } from './brickMesh.js';
import { createFigureMesh } from './figureMesh.js';
import { createControlState, toDriveInput } from './inputState.js';
import { attachDriveControls } from './input.js';
import { $, showScreen, openModal, toast, confirmDialog } from './ui.js';
import { sfx, createEngineSound } from './audio.js';
import { DEFAULT_FIGURE } from './figures.js';
import { wrapAngle } from './math.js';

const SKY = 0x8fd3ff;
const GET_IN_DISTANCE = 3.5;

export function createCity(app, { nearCarId = null } = {}) {
  showScreen('city');
  const ui = $('#city');
  const abort = new AbortController();
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });

  // --- scene and physics ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 80, 260);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6fbf5f, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.25;
  const city = createCityWorld(scene, world);
  const traffic = createCityTraffic(scene, world);
  const store = createCityStore();

  // --- his cars, each in its garage spot (just a picture + a box until he gets in) ---
  const savedCars = app.garage.list();
  const spots = store.spotsFor(savedCars.map(c => c.id));
  const entries = savedCars.filter(c => spots[c.id] !== undefined).map(c => parkCar(c, spots[c.id]));

  function parkCar(car, spotIndex) {
    const spot = GARAGE.spots[spotIndex];
    const mesh = createCarMesh(car.bricks, { emptySeat: true });
    const bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    mesh.position.set(spot.x, spot.y + carLift(car.bricks), spot.z);
    mesh.rotation.y = spot.heading;
    scene.add(mesh);
    const body = new CANNON.Body({ type: CANNON.Body.STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)), new CANNON.Vec3(center.x, center.y, center.z));
    body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    body.quaternion.setFromEuler(0, spot.heading, 0);
    body.aabbNeedsUpdate = true;
    world.addBody(body);
    return { car, spotIndex, mesh, body, driven: null, halfWidth: size.x / 2 };
  }

  const entryPos = e => (e.driven ? e.driven.car.body.position : e.mesh.position);

  // --- him, on foot ---
  const figureMesh = createFigureMesh(app.figures.getMain() ?? DEFAULT_FIGURE);
  scene.add(figureMesh);
  const near = entries.find(e => e.car.id === nearCarId);
  const start = near
    ? { x: near.mesh.position.x + 4.5, y: GARAGE.spots[near.spotIndex].y, z: near.mesh.position.z, heading: -Math.PI / 2 }
    : GARAGE.spawn;
  let walker = createWalker(world, { position: { x: start.x, y: start.y + 0.6, z: start.z }, heading: start.heading });
  let driving = null;
  let camYaw = start.heading;
  let paused = false;
  let clock = 0;
  let leaving = false;

  const controls = createControlState();
  const pad = attachDriveControls(ui, controls, abort.signal);
  const stick = attachStick($('#stick', ui), abort.signal);
  const hud = createGadgetHud({ ui, scene, signal: abort.signal, canUse: () => !!driving && !paused });
  const engine = createEngineSound();
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
  const enterBtn = $('[data-city="enter"]', ui);

  function setModeClass() {
    ui.classList.toggle('driving', !!driving);
    ui.classList.toggle('on-foot', !driving);
  }

  function nearestCar() {
    if (driving || !walker) return null;
    const p = walker.body.position;
    let best = null;
    let bestDist = GET_IN_DISTANCE;
    for (const e of entries) {
      const q = entryPos(e);
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bestDist && Math.abs(q.y - p.y) < 2) {
        best = e;
        bestDist = d;
      }
    }
    return best;
  }

  function getIn(entry) {
    if (!entry.driven) {
      world.removeBody(entry.body);
      scene.remove(entry.mesh);
      const p = entry.mesh.position;
      entry.driven = createDrivenCar({ world, scene, bricks: entry.car.bricks, pose: { position: { x: p.x, y: p.y + 0.5, z: p.z }, heading: entry.mesh.rotation.y } });
    }
    walker.remove();
    walker = null;
    figureMesh.visible = false;
    driving = entry;
    hud.setCar(entry.car.bricks, entry.driven.fx);
    setModeClass();
    sfx.snap();
  }

  // Is the straight line from the car's middle to a door spot free of walls and other cars?
  function isClear(from, to) {
    const body = driving.driven.car.body;
    const result = new CANNON.RaycastResult();
    body.collisionResponse = false;
    world.raycastClosest(new CANNON.Vec3(from.x, from.y + 0.3, from.z), new CANNON.Vec3(to.x, from.y + 0.3, to.z), { skipBackfaces: true }, result);
    body.collisionResponse = true;
    return !result.hasHit;
  }

  function getOut() {
    const entry = driving;
    const car = entry.driven.car;
    const pose = car.pose();
    const rightX = -Math.cos(pose.heading);
    const rightZ = Math.sin(pose.heading);
    const side = entry.halfWidth + 0.9;
    const doors = [1, -1, 0].map(s => (s === 0
      ? { x: pose.x - Math.sin(pose.heading) * 3.5, z: pose.z - Math.cos(pose.heading) * 3.5 } // behind the car
      : { x: pose.x + rightX * side * s, z: pose.z + rightZ * side * s }));
    const door = doors.find(d => isClear(pose, d)) ?? doors[0];
    const speed = Math.abs(car.forwardSpeed());
    walker = createWalker(world, { position: { x: door.x, y: pose.y + 0.2, z: door.z }, heading: pose.heading });
    figureMesh.visible = true;
    driving = null;
    hud.clearCar();
    engine.silence();
    setModeClass();
    camYaw = pose.heading;
    const spot = spotAt(pose.x, pose.y, pose.z);
    if (spot === null) return;
    if (speed >= 1) {
      toast('Stop in the spot to park!');
    } else if (store.park(entry.car.id, spot)) {
      entry.spotIndex = spot;
      toast(`Parked in spot ${spot + 1}! 🅿️`);
      sfx.success();
    } else {
      toast('That spot belongs to another car.');
    }
  }

  function pause() {
    if (paused) return;
    paused = true;
    controls.releaseAll();
    stick.reset();
    hud.setSiren(false);
    engine.silence();
    openModal({
      title: 'Paused',
      buttons: [
        { label: '🏠 Home', onClick: () => app.goHome() },
        { label: '▶ Keep going', kind: 'go', onClick: () => { paused = false; } },
      ],
    });
  }

  async function goHome() {
    if (driving && !(await confirmDialog('Leave the city?', { yes: 'Leave', no: 'Stay' }))) return;
    app.goHome();
  }

  on(ui, 'pointerdown', ev => {
    const action = ev.target.closest('[data-city]')?.dataset.city;
    if (!action) return;
    if (action === 'enter') {
      const entry = nearestCar();
      if (entry) getIn(entry);
    }
    if (action === 'exit' && driving) getOut();
    if (action === 'flip' && driving) {
      driving.driven.car.flip();
      sfx.flip();
    }
    if (action === 'pause') pause();
    if (action === 'home') goHome();
    if (action === 'cars') app.openGarage({ fromCity: true });
  });
  on(window, 'keydown', ev => {
    if (ev.code !== 'KeyE' || ev.repeat || paused) return;
    if (driving) getOut();
    else {
      const entry = nearestCar();
      if (entry) getIn(entry);
    }
  });
  on(document, 'visibilitychange', () => { if (document.hidden) pause(); });

  // Keyboard arrows/WASD walk too; the on-screen stick wins when it is used.
  function walkInput() {
    if (Math.hypot(stick.value.x, stick.value.y) > 0.05) return stick.value;
    const k = toDriveInput(controls);
    return { x: -k.steer, y: k.throttle - k.brake };
  }

  const insideGarage = p => p.x > GARAGE.rect.x0 && p.x < GARAGE.rect.x1 && p.z > GARAGE.rect.z0 && p.z < GARAGE.rect.z1;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function updateCamera(dt, snap = false) {
    const p = driving ? driving.driven.car.body.position : walker.body.position;
    const targetYaw = driving ? driving.driven.car.pose().heading : walker.heading;
    const moving = driving || Math.hypot(walker.body.velocity.x, walker.body.velocity.z) > 0.5;
    if (snap) camYaw = targetYaw;
    else if (moving) camYaw += wrapAngle(targetYaw - camYaw) * (1 - Math.exp(-dt * (driving ? 5 : 1.5)));
    const indoor = insideGarage(p);
    const dist = driving ? (indoor ? 6 : 8.5) : (indoor ? 3.8 : 5.5);
    const height = driving ? (indoor ? 2.2 : 3.6) : (indoor ? 1.7 : 2.8);
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    camPos.lerp(tmp.set(p.x - fx * dist, p.y + height, p.z - fz * dist), k);
    camLook.lerp(tmp.set(p.x + fx * 3, p.y + 0.8, p.z + fz * 3), k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sun.position.set(p.x + 30, p.y + 50, p.z + 20);
    sun.target.position.set(p.x, p.y, p.z);
  }

  // Mini-map: roads, the garage, the race gate and him (north up).
  const map = $('#city-map', ui);
  const g = map.getContext('2d');
  const scale = map.width / (SIZE + 24);
  const toMap = v => (v + 12) * scale;
  function drawMap() {
    g.clearRect(0, 0, map.width, map.height);
    g.fillStyle = '#9e9e9e';
    for (let i = 0; i <= GRID; i++) {
      g.fillRect(toMap(i * PITCH), toMap(0), ROAD * scale, SIZE * scale);
      g.fillRect(toMap(0), toMap(i * PITCH), SIZE * scale, ROAD * scale);
    }
    g.fillStyle = '#1e88e5';
    g.fillRect(toMap(GARAGE.rect.x0), toMap(GARAGE.rect.z0), 36 * scale, 36 * scale);
    g.fillStyle = '#e53935';
    g.beginPath();
    g.arc(toMap(RACE_GATE.x), toMap(RACE_GATE.z), 9, 0, Math.PI * 2);
    g.fill();
    const p = driving ? driving.driven.car.body.position : walker.body.position;
    const heading = driving ? driving.driven.car.pose().heading : walker.heading;
    g.save();
    g.translate(toMap(p.x), toMap(p.z));
    g.rotate(-heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#e53935';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 14);
    g.lineTo(9, -9);
    g.lineTo(-9, -9);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  function syncFigure() {
    const p = walker.body.position;
    if (p.y < -5) walker.teleport({ x: GARAGE.spawn.x, y: 1, z: GARAGE.spawn.z }, GARAGE.spawn.heading);
    const moving = Math.hypot(walker.body.velocity.x, walker.body.velocity.z) > 0.3;
    figureMesh.position.set(p.x, p.y - 0.4 + (moving ? Math.abs(Math.sin(clock * 10)) * 0.06 : 0), p.z);
    figureMesh.rotation.y = walker.heading;
  }

  // Driving through the race gate takes this car to the race track.
  function reachedRaceGate() {
    if (!driving || leaving) return false;
    const p = driving.driven.car.body.position;
    if (Math.hypot(p.x - RACE_GATE.x, p.z - RACE_GATE.z) > RACE_GATE.radius) return false;
    leaving = true;
    app.startRace(driving.car, { fromCity: true });
    return true;
  }

  setModeClass();
  syncFigure();
  updateCamera(0, true);

  return {
    scene,
    camera,
    landscapeOnly: true,
    update(dt) {
      if (paused) return;
      if (portrait.matches) {
        pause();
        return;
      }
      clock += dt;
      if (driving) {
        const input = { ...toDriveInput(controls), boost: hud.boosting };
        driving.driven.car.applyInput(input);
        if (driving.driven.car.update(dt, input)) sfx.flip();
      } else {
        walker.move(walkInput(), camYaw);
      }
      for (const e of entries) if (e.driven && e !== driving) e.driven.car.applyInput({ hold: true });
      const player = driving ? driving.driven.car.body.position : walker.body.position;
      const looseCars = entries.filter(e => e.driven && e !== driving).map(e => e.driven.car.body.position);
      traffic.update(dt, clock, player, [player, ...looseCars]);
      world.step(1 / 60, dt, 3);
      for (const e of entries) {
        if (!e.driven) continue;
        e.driven.sync();
        animateFx(e.driven.fx, dt, { speed: Math.abs(e.driven.car.forwardSpeed()), clock, seed: e.spotIndex, boosting: e === driving && hud.boosting, sirenOn: e === driving && hud.sirenOn });
      }
      if (!driving) syncFigure();
      hud.update(dt);
      pad.refresh();
      city.update(clock);
      enterBtn.classList.toggle('hidden', !nearestCar());
      if (reachedRaceGate()) return;
      updateCamera(dt);
      drawMap();
      if (driving) engine.setSpeed(Math.abs(driving.driven.car.forwardSpeed()));
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      abort.abort();
      controls.releaseAll();
      engine.stop();
      hud.dispose();
      traffic.dispose();
      city.dispose();
      sun.dispose();
    },
  };
}
```

- [ ] **Step 4: Cars list knows about the city (`js/garageScreen.js`)**

Replace:
```js
export function renderGarage(app) {
  const cars = app.garage.list().reverse();
```
with:
```js
export function renderGarage(app, { fromCity = false } = {}) {
  const cars = app.garage.list().reverse();
  $('#garage [data-action="city"]').classList.toggle('hidden', !fromCity);
```

Replace:
```js
      el('button', { class: 'go-btn', text: '🏁 Race', onclick: () => app.startRace(car) }),
```
with:
```js
      el('button', { class: 'go-btn', text: '🏁 Race', onclick: () => app.startRace(car, { fromCity }) }),
```

Replace:
```js
          renderGarage(app);
```
with:
```js
          renderGarage(app, { fromCity });
```

- [ ] **Step 5: Wire it up (`js/main.js`)**

Add the import:
```js
import { createCity } from './city.js';
```

Replace:
```js
  openGarage() {
    if (!mode?.isShowroom) app.setMode(createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE));
    showScreen('garage');
    renderGarage(app);
  },
```
with:
```js
  openGarage(options = {}) {
    if (!mode?.isShowroom) app.setMode(createShowroom(showroomBricks(), app.figures.getMain() ?? DEFAULT_FIGURE));
    showScreen('garage');
    renderGarage(app, options);
  },
  openCity(options = {}) {
    app.setMode(createCity(app, options));
  },
```

Replace:
```js
    document.body.classList.toggle('racing', !!next.isRace);
```
with:
```js
    document.body.classList.toggle('racing', !!(next.isRace || next.landscapeOnly));
```

In the home click handler, replace:
```js
  if (action === 'garage') app.openGarage();
```
with:
```js
  if (action === 'garage') app.openCity();
```

Replace:
```js
for (const id of ['garage', 'rotate-hint', 'figures']) {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.closest('[data-action="home"]')) app.goHome();
  });
}
```
with:
```js
for (const id of ['garage', 'rotate-hint', 'figures']) {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.closest('[data-action="home"]')) app.goHome();
    if (e.target.closest('[data-action="city"]')) app.openCity();
  });
}
```

- [ ] **Step 6: Play it in the browser** (1024×768; temporary hook `window.__city = { entries, get walker() { return walker; }, get driving() { return driving; }, store }` in `createCity`, removed before commit)

Save two cars first (e.g. Police Car and Rocket Car from `modelToBricks`). Expected:
1. Home → 🚗 My Garage opens the city on foot in the garage. The two cars stand in spots 1 and 2 with empty driver seats. The joystick shows bottom-left; the mini-map shows the garage and his arrow.
2. Walk with the arrow keys/WASD (and drag the stick) toward a car → **🚗 Get in** appears → press E. He drives (pads, Get out, Flip me!, the car's gadgets). His figure sits in the seat.
3. Drive out of the garage onto the road, around a block and back. Traffic stops at red and for his car. People near him hop away with a "whoa".
4. Drive up ramp A to the 1st floor, into spot 7, stop, press E → "Parked in spot 7! 🅿️". `__city.store.spotsFor([...])` shows the car in spot 6 (index).
5. Get out against a wall: he appears on the free side.
6. Get out while rolling in a spot → "Stop in the spot to park!".
7. Get out in spot 1 (the other car's spot) → "That spot belongs to another car.".
8. 🚗 My cars → the list with "🏙 Back to city" → back: the city is rebuilt and the parked car is in spot 7.
9. Drive to the 🏁 arch → a race starts with that car → podium "🏙 Back to city" → back in the city next to that car's spot.
10. 🏠 while driving asks "Leave the city?". Pause stops the siren and engine. Leaving the city with the siren on → silence.
11. No console errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html css/style.css js/city.js js/garageScreen.js js/main.js
git commit -m "feat: My Garage is now a mini city: walk, get in, drive, park in the garage, race gate"
```

---

### Task 9: Speed check and README

**Files:**
- Modify: `README.md` (and any performance fix the measurement calls for)

- [ ] **Step 1: Measure**

In the browser at 1024×768, open the city, then from the console time 300 steps of `mode.update(1/60)` and 60 renders. Get the mode object by building it directly as in Task 8's hook.

Expected: update + render under 8 ms per frame on the Mac. If it is over, apply in this order and re-measure, logging each as a ruling:
1. turn off `castShadow` on the trees and lane dashes;
2. lower the sun shadow map to 512 in the city;
3. merge the building boxes per block.

- [ ] **Step 2: README**

In `README.md`, under `## How to play`, replace the `**My Garage**` line with:
```markdown
- **My Garage** → a little city! Walk around as your figure (thumb stick or arrow keys), walk up to one of your cars and tap **Get in** (or E). Drive around town, up the ramps of the parking garage, and stop in a numbered spot, then **Get out** to park it there. Drive through the 🏁 arch to race. **🚗 My cars** lists your cars to race, change or delete.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: how to play in the mini city"
```
