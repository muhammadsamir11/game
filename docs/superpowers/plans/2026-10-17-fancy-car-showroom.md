# Fancy Car Showroom (Batch 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Murad Motors showroom in the city where a mystery car under a silk sheet is revealed by collecting coins. Batch 1 has three ready-made prize cars, each with its own tricks: the Rolls-Royce Phantom, the Mercedes-AMG G-Wagon and a stretch limousine.

**Architecture:**
- **Pure rule modules, no three or DOM,** each tested with `node:test`:
  - `js/prizeCars.js`: the lineup and recipes;
  - `js/prizeShowroom.js`: progress, status and the saved store;
  - `js/carTricks.js`: timing of the moving parts on a car's nodes.
- **`js/cityShowroom.js`** draws the turntable, the sheet, the goal panel and the reveal. It plugs into `js/city.js` the same way `createCityMissions` does.
- **New prize-only brick types** live in `js/bricks.js`, drawn by `js/brickMesh.js`. They are kept out of the builder tray and the badge picker.

**Tech Stack:** Three.js 0.170, cannon-es 0.20, ES modules (no build step), `node:test`, `node server.js`.

**Spec:** `docs/superpowers/specs/2026-10-17-fancy-car-showroom-design.md`

## Global Constraints

- **Coins:** coins never go down. Nothing calls anything that lowers `progress` coins, and the words "buy", "price" and "cost" never appear on screen.
- **No spoilers:** no text, card, voice or tray shows what's under the sheet before its reveal. Prize pieces and prize badges never appear in the builder tray, the "Which badge?" picker or the build chooser.
- **The name:** "Murad" appears only as the existing `HERO_NAME` on the showroom sign (`MURAD MOTORS`). Nothing points it out.
- **Speed:** every prize car passes `raceReadiness` and stays inside `LIMITS`, and its `topSpeed` is below the Bugatti Chiron's (`modelToBricks(MODELS.chiron)`).
- **Coin goals in lineup order:** Phantom 150, G-Wagon 200, Limo 250.
- **Kid-facing copy:**
  - goal line: `What's under the sheet? Collect 150 coins to find out!` (the number is that car's goal);
  - coming soon: `More cars coming soon ✨`;
  - names spoken at the reveal: `A Rolls-Royce Phantom!`, `A Mercedes G-Wagon!`, `A stretch limousine!`.
- **Name clash:** `js/showroom.js` already exists (the home background), so the new city module is `js/cityShowroom.js`.
- **Badges:** they are drawn in code as look-alikes (double-R monogram, three-pointed star in a ring). No logo files are downloaded.
- **Version:** `PROTOCOL_VERSION` goes from 1 to 2, so older tablets are told to update before they meet the new brick types.
- **Saves:** they live in localStorage under a new key, `brickRacers.showroom.v1`. A save that is missing or broken loads as a fresh state and never throws.
- **Branch:** work on `main` in `~/Desktop/game`, with no feature branches or worktrees. Run `npm test` before every commit.

## Review Focus

- **Leaving mid-reveal** (🏠 Home, pause, or the iPad sleeping during the drumroll): the prize must already be his. The unlock (`store.reveal` + `garage.save`) happens at the **start** of the reveal, and the animation is only for show. *Test: Task 3, `reveal persists before any animation`.*
- **Reaching the goal during a pizza mission or a 🎮 room game:** the reveal must not start until he's free and back in the zone. *Test: Task 3, `shouldStartReveal` cases.*
- **Garage full (24 cars):** the prize car must still appear, waiting on the showroom forecourt, and must not be counted in the "garage is full" toast. *Tests: Task 5 (`SHOWROOM.waiting` slots) and Task 4 (`missingPrizes` restores, `assignSpots` leaves it unparked).*
- **A prize car missing from the saved garage** (storage trimmed, or an old export): it comes back the next time he opens the city. *Test: Task 4, `missingPrizes`.*
- **Old saves with no showroom key, or he already has 3,000 coins:** the first mystery starts from today's pile, so it isn't revealed the instant he opens the city. *Test: Task 3, `fresh store counts from coinsNow`.*

---

### Task 1: Prize-only pieces and badges

**Files:**
- Modify: `js/bricks.js` (new types, `prize: true`; the tray rule comment)
- Modify: `js/brickMesh.js` (draw cases for the new kinds)
- Modify: `js/brands.js` (two prize brands, two emblems)
- Modify: `js/badgeArt.js` (draw `rr` and `tristar`)
- Modify: `js/badgePicker.js` (use `pickerBrandKeys()`, which leaves out prize brands)
- Modify: `js/net/protocol.js` (`PROTOCOL_VERSION = 2`)
- Test: `tests/parts.test.js`, `tests/supercars.test.js`, `tests/badgeArt.test.js`, `tests/rooms.test.js`

**Interfaces:**
- **Produces**, in `BRICK_TYPES`. Every new type has `prize: true`.

  | key | name | w×d×h | kind | other |
  |---|---|---|---|---|
  | `grille` | Grille | 2×1×3 | `grille` | fixedColor, chrome |
  | `ornament` | Flying Lady | 1×1×2 | `ornament` | fixedColor, silver |
  | `coachDoor` | Coach Door | 1×2×3 | `coachDoor` | painted |
  | `starRoof` | Starlight Roof | 4×4×1 | `starRoof` | fixedColor, navy with stars on top |
  | `wheelOffroad` | Off-road Wheel | 1×2×3 | `wheel` | radius 0.5, `tread: true` |
  | `spareWheel` | Spare Wheel | 2×1×3 | `spare` | fixedColor, *not* a physics wheel |
  | `sidePipe` | Side Pipe | 1×2×1 | `sidePipe` | fixedColor, chrome |
  | `limoPlate` | Limo Plate | 4×3×1 | `plate` | painted |
  | `discoPanel` | Disco Lights | 1×4×2 | `disco` | fixedColor |

- **Produces, `isPrizePart(type) => boolean`** exported from `js/bricks.js`, and `pickerBrandKeys() => string[]` exported from `js/brands.js`.
- **Produces, node `userData` marks set by `createBrickMesh`** (Task 6 reads them through `collectFx`):
  - `ornament`: the statue mesh, with `userData.ornament = { low, high }` (y positions);
  - `coachDoor`: a door group pivoting on its rear edge, with `userData.coachDoor = { side: -1 | 1 }`, where `side` comes from `brick.x < 0 ? -1 : 1`;
  - `starRoof`: star dots, with `userData.stars = true` (they twinkle);
  - `disco`: each panel mesh, with `userData.disco = true` and its own `MeshStandardMaterial` (emissive changes per car);
  - `sidePipe`: a hidden puff mesh, with `userData.puff = true`.
- **Produces, in `BRANDS`:**
  - `rollsRoyce`: `{ name: 'Rolls-Royce', emblem: 'rr', prize: true, colors: { main: '#1b1b1b', accent: '#e0e0e0' }, card: {...} }`;
  - `mercedes`: `{ name: 'Mercedes-Benz', emblem: 'tristar', prize: true, colors: { main: '#c0c6cc', accent: '#1b1b1b' }, card: {...} }`;
  - `EMBLEMS` gains `'rr'` and `'tristar'`.

- [ ] **Step 1: Write the failing tests**

In `tests/parts.test.js`, replace `every part except the chassis is in exactly one tray tab` with:
```js
test('every part except the chassis and prize parts is in exactly one tray tab', () => {
  const keys = Object.keys(BRICK_TYPES).filter(k => k !== 'chassis' && !BRICK_TYPES[k].prize);
  for (const key of keys) assert.equal(TRAY_GROUPS.filter(g => g.types.includes(key)).length, 1, key);
  assert.equal(TRAY_ORDER.length, keys.length);
});
test('prize parts are in no tray tab', () => {
  const prize = ['grille', 'ornament', 'coachDoor', 'starRoof', 'wheelOffroad', 'spareWheel', 'sidePipe', 'limoPlate', 'discoPanel'];
  for (const key of prize) {
    assert.ok(BRICK_TYPES[key]?.prize, key);
    assert.ok(isPrizePart(key), key);
    assert.equal(groupOf(key), null, key);
  }
  assert.equal(BRICK_TYPES.spareWheel.kind, 'spare'); // decoration, never a physics wheel
  assert.equal(BRICK_TYPES.wheelOffroad.radius, 0.5);
});
```
In `tests/supercars.test.js`, change the brand-key assertion to `['lamborghini', 'ferrari', 'bugatti', 'mclaren', 'hero', 'rollsRoyce', 'mercedes']`, and add:
```js
test('prize brands are marked and the badge picker leaves them out', () => {
  assert.equal(BRANDS.rollsRoyce.prize, true);
  assert.equal(BRANDS.mercedes.prize, true);
  assert.deepEqual(pickerBrandKeys(), ['hero', 'lamborghini', 'ferrari', 'bugatti', 'mclaren']);
  assert.ok(EMBLEMS.includes('rr') && EMBLEMS.includes('tristar'));
});
```
(`pickerBrandKeys()` is a new export from `js/brands.js`, which loads in node: `['hero', ...the other non-prize keys]`. `pickBadge` in `js/badgePicker.js` uses it.)

In `tests/badgeArt.test.js`, the existing all-brands loop already covers the new brands. Add a test that the `rr` badge has `fillText` with `RR` and the `tristar` badge strokes a ring (an `arc` call).

In `tests/rooms.test.js`, add: `assert.equal(PROTOCOL_VERSION, 2)`.

- [ ] **Step 2: Run the tests and check they fail**

Run: `npm test`
Expected: FAIL in parts, supercars, badgeArt and rooms (`isPrizePart` / `pickerBrandKeys` not defined, brand list differs).

- [ ] **Step 3: Implement**
- Add the types and `isPrizePart` to `js/bricks.js`. The tray comment becomes "Every part except the chassis and prize parts is in exactly one".
- Add the draw cases to `js/brickMesh.js`, keeping the existing toy look (`blockGeometry`, `chrome()`, `fixed(...)`):
  - `wheelOffroad`: `createWheelMesh` gets a chunky-tread branch for `t.tread`;
  - `ornament`: drawn at its `high` position by default, so friends see it up;
  - `coachDoor`: closed.
- Add the brands, emblems and badge drawings.
- `pickBadge` uses `pickerBrandKeys()`.
- Bump `PROTOCOL_VERSION`.

- [ ] **Step 4: Run the tests and check they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add js/bricks.js js/brickMesh.js js/brands.js js/badgeArt.js js/badgePicker.js js/net/protocol.js tests/
git commit -m "feat: prize-only car pieces and the Rolls-Royce and Mercedes badges"
```

---

### Task 2: The prize lineup and its recipes

**Files:**
- Create: `js/prizeCars.js`
- Test: `tests/prizeCars.test.js`

**Interfaces:**
- **Consumes:** Task 1's brick types and brands, plus `makeChassis` (`js/bricks.js`), `computeStats`, `raceReadiness` and `LIMITS` (`js/carStats.js`).
- **Produces:**
  - `PRIZE_CARS`: an ordered array `[{ key, name, sayName, goal, steps }]`. The keys are `'phantom'`, `'gwagon'` and `'limo'`. Names are `'Rolls-Royce Phantom'`, `'Mercedes G-Wagon'` and `'Stretch Limo'`; `sayName` is the reveal line from Global Constraints. Goals are 150, 200 and 250. There is no `finale` flag in batch 1. The last car of batch 3 will have `finale: true`.
  - `prizeByKey(key) => entry | null`
  - `prizeBricks(key) => Brick[]`: the chassis plus the steps, the same shape as `modelToBricks`.
  - `carBounds(bricks) => { length, width, height }` in metres. It comes from `computeStats(bricks).boxes` plus the wheel radii, and the sheet's shape uses it.
- **Recipe requirements:**
  - **Brick positions are the implementer's choice.** The car keeps the usual chassis and the four corner wheel slots.
  - **Phantom:** black and white, `v12` ×1, `grille`, `ornament` above the grille, two `coachDoor` (one per side), `starRoof` on top, and a `badge` with `badge: 'rollsRoyce'`.
  - **G-Wagon:** black, four `wheelOffroad`, `v12` + `engine`, `spareWheel` on the back face, two `sidePipe`, boxy `brick24` / `brick22` sides, and a `badge` with `badge: 'mercedes'`.
  - **Limo:** white, `limoPlate` at the front (z 4..6) and the back (z −7..−5), so it is 14 studs long, with two `discoPanel` along the sides, `engine` ×1, a `horn`, and a `badge` with `badge: 'hero'`. If it scrapes on the garage ramps in Task 7's check, shorten each limo plate to 2 studs (12 studs in all) and change this test's number to match.

- [ ] **Step 1: Write the failing tests** (`tests/prizeCars.test.js`)
```js
test('three prize cars in order with goals 150, 200, 250', () => {
  assert.deepEqual(PRIZE_CARS.map(c => [c.key, c.goal]), [['phantom', 150], ['gwagon', 200], ['limo', 250]]);
});
test('every prize car is race-ready, valid, within limits and slower than the Chiron', () => {
  const chiron = computeStats(modelToBricks(MODELS.chiron)).topSpeed;
  for (const { key } of PRIZE_CARS) {
    const bricks = prizeBricks(key);
    assert.ok(raceReadiness(bricks).ready, key);
    assert.ok(bricks.every(isValidBrick) && bricks.length <= MAX_BRICKS, key);
    const s = computeStats(bricks);
    assert.ok(s.topSpeed >= LIMITS.minTopSpeed && s.topSpeed < chiron, key);
    assert.ok(carBounds(bricks).height < 3.2, `${key} fits under a garage floor`);
    assert.ok(cleanCar({ name: key, bricks }), `${key} can be sent to friends`);
  }
});
test('each car carries its trick pieces and badge', () => {
  const has = (key, type, n = 1) => prizeBricks(key).filter(b => b.type === type).length >= n;
  assert.ok(has('phantom', 'grille') && has('phantom', 'ornament') && has('phantom', 'coachDoor', 2) && has('phantom', 'starRoof'));
  assert.ok(has('gwagon', 'wheelOffroad', 4) && has('gwagon', 'spareWheel') && has('gwagon', 'sidePipe', 2));
  assert.ok(has('limo', 'limoPlate', 2) && has('limo', 'discoPanel', 2) && has('limo', 'horn'));
  assert.equal(prizeBricks('phantom').find(b => b.type === 'badge').badge, 'rollsRoyce');
  assert.equal(prizeBricks('gwagon').find(b => b.type === 'badge').badge, 'mercedes');
});
test('the G-Wagon pulls hardest and the limo is clearly the longest', () => {
  const force = k => computeStats(prizeBricks(k)).engineForce;
  assert.ok(force('gwagon') > force('phantom') && force('gwagon') > force('limo'));
  assert.ok(carBounds(prizeBricks('limo')).length >= 6.5);
  assert.ok(carBounds(prizeBricks('limo')).length > carBounds(prizeBricks('phantom')).length + 2);
});
test('prize cars are not in the build chooser', () => {
  for (const { key } of PRIZE_CARS) assert.equal(MODELS[key], undefined);
});
```

- [ ] **Step 2: Run** `npm test` and check it fails, with `js/prizeCars.js` not found.

- [ ] **Step 3: Implement `js/prizeCars.js`** using the `step(...)` style of `js/instructions.js`. Don't add the cars to `MODELS`.

- [ ] **Step 4: Run** `npm test` and check it passes. If the Chiron or `LIMITS` checks fail, change the engines or the mass, not the limits.

- [ ] **Step 5: Commit**
```bash
git add js/prizeCars.js tests/prizeCars.test.js
git commit -m "feat: the Rolls-Royce Phantom, G-Wagon and stretch limo recipes"
```

---

### Task 3: Showroom progress (pure rules + save)

**Files:**
- Create: `js/prizeShowroom.js`
- Test: `tests/prizeShowroom.test.js`

**Interfaces:**
- **Consumes:** `PRIZE_CARS` (Task 2).
- **Produces:**
  - `SHOWROOM_KEY = 'brickRacers.showroom.v1'`
  - `createShowroomStore(storage = defaultStorage(), { coinsNow, lineup = PRIZE_CARS } = {})`, using the same `defaultStorage` as `js/progress.js`. It returns:
    - `get() => { startCoins, unlocked: string[], driven: string[], starsSeen: boolean }`. It is a copy, and `startCoins` is set to `coinsNow` when there is no valid save.
    - `status(coins) => { mode: 'mystery' | 'ready' | 'soon' | 'done', next: key | null, have, goal }`:
      - with a car next: `have = clamp(coins - startCoins, 0, goal)`; `mode` is `'ready'` when `have >= goal`;
      - with no car next: `mode` is `lineup.at(-1)?.finale ? 'done' : 'soon'`, `next` is `null`, and `have` and `goal` are `0`.
    - `reveal(coins) => key | null`: only when `'ready'`. It pushes the key, sets `startCoins = coins` and saves straight away.
    - `markDriven(key)` and `seeStars()`, both saved.
    - `debugReady(coins)`: sets `startCoins = coins - goal`, for the console hook. It never touches the coins.
  - `shouldStartReveal({ mode, inZone, speed, busy }) => boolean`: true only when `mode === 'ready'`, `inZone`, `speed < 1` and `!busy`.
- **Loading:** `unlocked` and `driven` keep only known keys, in lineup order, without repeats. `unlocked` must be a prefix of the lineup, so it is cut at the first gap. A broken save becomes a fresh state.

- [ ] **Step 1: Write the failing tests**, using the `memoryStorage` helper from `tests/progress.test.js`:
```js
test('fresh store counts from coinsNow', () => {
  const s = createShowroomStore(memoryStorage(), { coinsNow: 3000 });
  assert.deepEqual(s.status(3000), { mode: 'mystery', next: 'phantom', have: 0, goal: 150 });
  assert.deepEqual(s.status(3149).mode, 'mystery');
  assert.deepEqual(s.status(3150), { mode: 'ready', next: 'phantom', have: 150, goal: 150 });
});
test('reveal persists before any animation, and the next goal counts from that moment', () => {
  const mem = memoryStorage();
  const s = createShowroomStore(mem, { coinsNow: 0 });
  assert.equal(s.reveal(100), null);
  assert.equal(s.reveal(170), 'phantom');
  const again = createShowroomStore(mem, { coinsNow: 9999 });
  assert.deepEqual(again.get().unlocked, ['phantom']);
  assert.deepEqual(again.status(170), { mode: 'mystery', next: 'gwagon', have: 0, goal: 200 });
});
test('after the batch the turntable says coming soon, and a later car counts from the last reveal', () => {
  const mem = memoryStorage();
  const s = createShowroomStore(mem, { coinsNow: 0 });
  s.reveal(150); s.reveal(350); s.reveal(600);
  assert.deepEqual(s.status(5000), { mode: 'soon', next: null, have: 0, goal: 0 });
  const later = [...PRIZE_CARS, { key: 'bentley', goal: 300 }];
  assert.deepEqual(createShowroomStore(mem, { coinsNow: 0, lineup: later }).status(900), { mode: 'ready', next: 'bentley', have: 300, goal: 300 });
  assert.equal(createShowroomStore(mem, { coinsNow: 0, lineup: [...PRIZE_CARS, { key: 'gold', goal: 450, finale: true }] }).status(600).mode, 'mystery');
});
test('odd saves load as fresh or are tidied', () => {
  for (const raw of ['{oops', '[]', '{"startCoins":-1}', '{"unlocked":"x"}']) {
    assert.deepEqual(createShowroomStore(memoryStorage({ [SHOWROOM_KEY]: raw }), { coinsNow: 7 }).get(), { startCoins: 7, unlocked: [], driven: [], starsSeen: false }, raw);
  }
  const tidy = createShowroomStore(memoryStorage({ [SHOWROOM_KEY]: '{"startCoins":5,"unlocked":["phantom","nope","phantom","limo"],"driven":["limo","zz"],"starsSeen":1}' }), { coinsNow: 0 }).get();
  assert.deepEqual(tidy, { startCoins: 5, unlocked: ['phantom'], driven: [], starsSeen: false });
});
test('coins are never touched', () => {
  const s = createShowroomStore(memoryStorage(), { coinsNow: 40 });
  s.debugReady(40);
  assert.equal(s.status(40).mode, 'ready');
});
test('shouldStartReveal waits for a ready goal, the zone, a stop and no mission or game', () => {
  const ok = { mode: 'ready', inZone: true, speed: 0, busy: false };
  assert.equal(shouldStartReveal(ok), true);
  for (const change of [{ mode: 'mystery' }, { inZone: false }, { speed: 3 }, { busy: true }]) assert.equal(shouldStartReveal({ ...ok, ...change }), false);
});
```
(In the tidy case, `driven: ['limo']` is dropped because the limo isn't unlocked, and `starsSeen: 1` isn't `true`. The implementer keeps `driven` limited to unlocked keys.)

- [ ] **Step 2: Run** `npm test` and check it fails.
- [ ] **Step 3: Implement `js/prizeShowroom.js`**, following the load/persist pattern of `js/progress.js`.
- [ ] **Step 4: Run** `npm test` and check it passes.
- [ ] **Step 5: Commit**
```bash
git add js/prizeShowroom.js tests/prizeShowroom.test.js
git commit -m "feat: showroom progress — coin goals, reveals and coming soon, saved on the tablet"
```

---

### Task 4: Prize cars in the garage and My cars

**Files:**
- Modify: `js/storage.js` (`save` keeps `prize` when it is a known string key)
- Modify: `js/garageScreen.js` (🏆 mark; no Change or Delete for prize cars)
- Modify: `js/prizeShowroom.js` (add `missingPrizes`, `prizeCarFor`)
- Modify: `css/` (whichever file styles `.car-card`, for the 🏆 mark)
- Test: `tests/storage.test.js`, `tests/prizeShowroom.test.js`

**Interfaces:**
- **Consumes:** `prizeBricks`, `prizeByKey` (Task 2) and `createShowroomStore` (Task 3).
- **Produces:**
  - `garage.save({ id, name, bricks, prize })`: keeps `prize` when `prizeByKey(prize)` is non-null, and drops it otherwise;
  - `prizeCarFor(key) => { name, bricks, prize: key }`, ready for `garage.save`;
  - `missingPrizes(cars, unlocked) => key[]`: the unlocked keys with no car where `car.prize === key`.

- [ ] **Step 1: Write the failing tests**
- `storage.test.js`, `prize cars keep their prize mark; unknown marks are dropped`: save with `prize: 'phantom'` → `list()[0].prize === 'phantom'`, and with `prize: 'nope'` → there is no `prize` field.
- `prizeShowroom.test.js`, `missingPrizes finds unlocked cars that are gone`:
  - `missingPrizes([{ prize: 'phantom' }, {}], ['phantom', 'gwagon'])` → `['gwagon']`;
  - `missingPrizes([], [])` → `[]`.
- `prizeShowroom.test.js`, `a prize car waits unparked when all 24 spots are taken`: `assignSpots([...24 ids, 'prize'], {})` has no `prize` entry. (This pins the existing behaviour Task 7 relies on.)

- [ ] **Step 2: Run** `npm test` and check it fails.
- [ ] **Step 3: Implement.** In `renderGarage`, a car with `car.prize` gets a `🏆` corner mark and only the `🏁 Race` button.
- [ ] **Step 4: Run** `npm test` and check it passes.
- [ ] **Step 5: Commit**
```bash
git add js/storage.js js/garageScreen.js js/prizeShowroom.js css/ tests/
git commit -m "feat: prize cars in My cars with a trophy, and safe from Change and Delete"
```

---

### Task 5: The showroom on the city map

**Files:**
- Modify: `js/cityMap.js`:
  - `LAYOUT` cell `'shopSoon'` → `'showroom'`;
  - new `SHOWROOM`;
  - a `MAP_LANDMARKS` entry.
- Modify: `js/cityGround.js` (`grassy`: `'shopSoon'` → `'showroom'`)
- Modify: `js/cityWorld.js`: the `'showroom'` case replaces `'shopSoon'`. It draws the posh building with a glass front and the sign `${HERO_NAME.toUpperCase()} MOTORS`, and has no scaffold.
- Modify: `js/cityProps.js` (the `'showroom'` case: no cones or loose bricks; a round display platform and a glass canopy over the turntable spot)
- Test: `tests/cityMap.test.js`

**Interfaces:**
- **Produces**, in `js/cityMap.js`:
  - `SHOWROOM = { block: { bx: 3, bz: 2 }, turntable: { x, z, radius: 3.2 }, zoneRadius: 7, waiting: [{ x, z, heading } ×3] }`.
  - **The turntable** sits on the forecourt between the building's front (`iz0 + 18`) and the south sidewalk, centred across the block.
  - **The `waiting` slots** are beside the platform, facing the road.
  - **The map:** `MAP_LANDMARKS` gains `{ kind: 'showroom', icon: '❓', name: 'Showroom', ...blockMiddle(3, 2) }`.

- [ ] **Step 1: Write the failing tests** in `cityMap.test.js`:
  - change `'shopSoon'` to `'showroom'` in the block-types test;
  - add `the showroom's turntable, zone and waiting slots are on its block, off the road and apart`:
    - every point is in `blockRect(3, 2)` and `!isOnRoad`;
    - each waiting slot is ≥ `turntable.radius + 3` from the turntable centre, and the slots are ≥ 3 m apart;
    - `SHOWROOM.waiting.length >= PRIZE_CARS.length`;
    - `MAP_LANDMARKS` has a `showroom` entry.
- [ ] **Step 2: Run** `npm test` and check it fails.
- [ ] **Step 3: Implement.** Keep the building's static collider where the old one was (`iz0 + 2 .. iz0 + 18`), so the forecourt stays open to walk and drive on.
- [ ] **Step 4: Run** `npm test` and check it passes.
- [ ] **Step 5: Commit**
```bash
git add js/cityMap.js js/cityGround.js js/cityWorld.js js/cityProps.js tests/cityMap.test.js
git commit -m "feat: Murad Motors showroom replaces the building site"
```

---

### Task 6: Car tricks

**Files:**
- Create: `js/carTricks.js` (pure timing, plus driving the marked nodes)
- Modify: `js/drivenCar.js` (`collectFx` gathers the new marks)
- Modify: `js/brickMesh.js` (add `createUmbrellaMesh()`)
- Modify: `js/audio.js` (`createEngineSound` gains `setSoft(on)`: lower gain and a lower filter)
- Modify: `js/city.js` (wire the tricks: see Step 3)
- Test: `tests/carTricks.test.js`

**Interfaces:**
- **Consumes:** Task 1's `userData` marks.
- **Produces:**
  - `collectFx(object)` also returns `ornaments`, `coachDoors`, `stars`, `discos` and `puffs` (arrays of nodes).
  - In `js/carTricks.js`:
    - constants: `DOOR_TIME = 1.2`, `DOOR_OPEN = 1.2` (radians), `ORNAMENT_TIME = 0.6`, `UMBRELLA_TIME = 3`, `DISCO_TIME = 2`, `PUFF_TIME = 1`;
    - `doorAngle(t) => number`: 0 at t=0, `DOOR_OPEN` from t=0.3 to t=0.8, back to 0 by `DOOR_TIME`, and 0 after;
    - `ornamentLevel(t, up) => 0..1`: eases toward `up ? 1 : 0` over `ORNAMENT_TIME`;
    - `discoOn(t) => boolean`: true while `t < DISCO_TIME`.
    - `createTricks(fx) => { has: { umbrella, stars, disco }, getIn(), getOut(), honk(), park(), update(dt) }`.
  - **What `createTricks` does to the nodes:**
    - it only sets `position.y`, `rotation.y`, `visible`, `scale` and `material.emissive.setHex`;
    - `park()` drops the ornament to `low` straight away;
    - `getIn()` raises the ornament, swings the coach doors and puffs the side pipes;
    - `getOut()` lowers the ornament and swings the doors;
    - `honk()` flashes the disco panels through party colours (`0xff1744, 0x00e5ff, 0xffea00, 0x76ff03, 0xd500f9`) every 0.15 s for `DISCO_TIME`, then back to a soft glow;
    - the stars twinkle all the time.

- [ ] **Step 1: Write the failing tests** (`tests/carTricks.test.js`), with stub nodes like `{ position: { y: 0 }, rotation: { y: 0 }, scale: { setScalar() {} }, visible: true, userData: { ornament: { low: 0, high: 0.3 } }, material: { emissive: { setHex(h) { this.h = h; } } } }`:
  - `doorAngle(0) === 0`, `doorAngle(0.5) === DOOR_OPEN`, `doorAngle(DOOR_TIME) === 0`, `doorAngle(5) === 0`.
  - `ornament goes down on park, rises after getIn, sinks after getOut`: after `park()`, `y === low`; after `getIn(); update(ORNAMENT_TIME)`, `y === high`; after `getOut(); update(ORNAMENT_TIME)`, `y === low`.
  - `coach doors swing the opposite way on each side`: mid-swing, the two doors' `rotation.y` have opposite signs and match `side * doorAngle(t)`.
  - `honk flashes disco colours, then settles`: after `honk(); update(0.2)`, `h` is one of the party colours; after `update(DISCO_TIME)`, `h` is the glow colour.
  - `has` flags: `umbrella` is true iff there are coach doors, `stars` iff there are star nodes, and `disco` iff there are disco nodes.
- [ ] **Step 2: Run** `npm test` and check it fails.
- [ ] **Step 3: Implement**, then wire it into `js/city.js`:
  - **Parked cars:** in `parkCar`, call `createTricks(collectFx(mesh)).park()`.
  - **Driven cars:** where `entry.driven` is created, add `entry.tricks = createTricks(entry.driven.fx)`.
  - **Getting in:** `getIn` calls `entry.tricks.getIn()` and `engine.setSoft(entry.car.bricks.some(b => b.type === 'grille'))`.
  - **Getting out:** `getOut` calls `entry.tricks.getOut()`. If `has.umbrella`, it adds `createUmbrellaMesh()` to `figureMesh` beside the right hand, open above his head, and removes it after `UMBRELLA_TIME` (every time).
  - **Honking:** the hud `onUse` also calls `driving?.tricks.honk()` when `kind === 'horn'`.
  - **Every frame:** call `e.tricks?.update(dt)` next to `animateFx`.
  - **The showroom store:** create it near `progress` with `const showroom = createShowroomStore(undefined, { coinsNow: progress.get().coins })`. Task 7 reuses this `showroom`.
  - **Starry roof:** on `getIn`, if `has.stars` and `!showroom.get().starsSeen`, run a 2.5 s camera shot above the roof looking down (through the camera-shot hook from Task 7), then `showroom.seeStars()`. If Task 7 hasn't landed yet, add the hook here: `updateCamera` uses `cameraShot()` when it returns `{ pos, look }`.
- [ ] **Step 4: Run** `npm test` and check it passes.
- [ ] **Step 5: Commit**
```bash
git add js/carTricks.js js/drivenCar.js js/brickMesh.js js/audio.js js/city.js tests/carTricks.test.js
git commit -m "feat: car tricks — flying lady, coach doors, door umbrella, starry roof, disco lights"
```

---

### Task 7: The turntable, the sheet and the reveal

**Files:**
- Create: `js/cityShowroom.js`
- Modify: `js/city.js` (create it, feed it, the camera hook, parking a new or waiting prize car, restoring missing prizes, the debug hook, dispose)
- Modify: `index.html` + CSS (a `#showroom-panel` goal card, styled like `#mission-banner`)
- Modify: `README.md` (one "How to play" line on the showroom, with no spoilers of which cars, and the debug hook under "For grown-ups")

**Interfaces:**
- **Consumes:**
  - `SHOWROOM` (Task 5);
  - `createShowroomStore`, `shouldStartReveal`, `prizeCarFor` and `missingPrizes` (Tasks 3 and 4);
  - `prizeBricks`, `prizeByKey` and `carBounds` (Task 2);
  - `createCarMesh` and `createTricks`.
- **Produces:**
  - `createCityShowroom({ scene, ui, showroom, coins: () => number, onPause, onResume, celebrate, deliver }) => { update(dt, { player, speed, busy, clock }), cameraShot() => { pos, look } | null, drawMap(g, toMap, scale, clock), revealing: boolean, dispose() }`.
  - `deliver(key)`, owned by `city.js`: it saves the car with `app.garage.save(prizeCarFor(key))`, then parks it in a free spot through the city's own `store.spotsFor`/`parkCar` (the garage-spot store, not `showroom`) or in the next `SHOWROOM.waiting` slot, adds a gold ribbon if `!driven.includes(key)`, and toasts `🎀 Your <name> is in the garage, spot N!` (or `🎀 Your <name> is waiting at the showroom!`).
- **Behaviour:**
  - **The sheet:** a soft draped box sized from `carBounds(prizeBricks(next))` plus 0.3 m, with a big "?" decal, on a turntable spinning at 0.3 rad/s.
  - **The goal panel** shows inside `zoneRadius`: 🪙 `have / goal`, a progress bar, and the goal line from Global Constraints spoken once per approach. When the goal is reached it says `Ready! 🎁` instead.
  - **On the map**, the landmark gently sparkles while `mode === 'ready'`.
  - **When `shouldStartReveal` is true:**
    1. call `const key = showroom.reveal(coins())` and `deliver(key)` straight away (the save first);
    2. if he's driving, `car.resetTo` his current pose so he stops;
    3. call `onPause()`;
    4. drumroll 1.5 s → the sheet flies up and fades over 1 s → the car spins in a spotlight for 4 s, with confetti, a fanfare and `speak(sayName)`;
    5. fade 0.6 s → the car is gone from the turntable (it's already parked) → the next sheet appears → `onResume()`.
  - **`busy`** comes from `city.js`: a pizza mission running, a 🎮 game running, or paused.
  - **`'soon'` / `'done'`:** the turntable shows his unlocked prize cars taking turns every 8 s, with no sheet and no goal. `'soon'` adds the `More cars coming soon ✨` sign.
  - **Opening the city:**
    - add back every `missingPrizes` car with `garage.save(prizeCarFor(key))` *before* the garage list is read;
    - prize cars without a spot park in `SHOWROOM.waiting` and don't count in the "garage is full" toast.
  - **Ribbon:** when he gets into a ribboned car, call `showroom.markDriven(key)` (the ribbon is on the parked mesh, which getting in removes).
  - **Debug:** `debug.showroomReady()` calls `showroom.debugReady(progress.get().coins)`.
  - **Not in this plan:** the limo's "bendy corners" (the spec lets the builder drop it). The limo is one rigid body.

- [ ] **Step 1: Write the failing test.** The rules are already pinned in Tasks 3 to 5. Add one to `tests/prizeShowroom.test.js`, `restoring a missing prize gives a garage car with its mark`:
  - `const g = createGarage(memoryStorage()); for (const k of missingPrizes(g.list(), ['phantom'])) g.save(prizeCarFor(k));`
  - assert `g.list()[0].prize === 'phantom'`;
  - assert `g.list()[0].bricks.length === prizeBricks('phantom').length`.
- [ ] **Step 2: Run** `npm test` and check it fails. (It may already pass if Task 4 covered it. If so, leave it as a guard and move on.)
- [ ] **Step 3: Implement `js/cityShowroom.js` and the `city.js` wiring.** Model the module on `createCityMissions` (owned geometry, `dispose`, and a DOM card toggled with `.hidden`).
- [ ] **Step 4: Run** `npm test` and check it passes.
- [ ] **Step 5: Check it in the browser** (`preview_start`, the game at `localhost`):
  1. open the city and walk to the ❓ showroom: the sheet spins, and the panel shows `🪙 0 / 150`;
  2. in the console, `brickRacers.currentMode().debug.showroomReady()`, step out of the zone and back in: the reveal plays, the Phantom is in the garage with a ribbon, and the G-Wagon sheet (tall, boxy) appears with `/ 200`;
  3. get into the Phantom: the flying lady rises, the doors swing, and the camera looks down at the stars the first time;
  4. get out: the umbrella opens;
  5. repeat for the G-Wagon (side-pipe puff; climbs the stunt-park ramp) and the limo (disco lights on honk; drive up the garage ramps without scraping, or else apply Task 2's 12-stud fallback);
  6. after the limo: the turntable rotates the three cars, and the sign says `More cars coming soon ✨`;
  7. 🏠 Home in the middle of a reveal, then reopen the city: the car is in My cars with 🏆, and the next sheet is on the turntable;
  8. check `read_console_messages` for errors; take a screenshot of the reveal and of the limo with disco lights.
- [ ] **Step 6: Commit**
```bash
git add js/cityShowroom.js js/city.js index.html css/ README.md tests/
git commit -m "feat: the showroom reveal — mystery sheet, coin goal, drumroll and the prize car in your garage"
```

---

### Task 8: Play together check and final pass

**Files:** none new (fixes only, if anything is found).

- [ ] **Step 1:** Run `npm test` and check that everything passes.
- [ ] **Step 2: Two-player check.** Use Playwright with two browser contexts, as the testing-play-together memory describes. Player A has the Phantom unlocked (via `debug.showroomReady()` + reveal) and drives it in a room city. Player B sees the Phantom's look: grille, the flying lady up, the badge. Neither console shows errors, and B's own showroom still shows its own first sheet.
- [ ] **Step 3: Spoiler sweep:**
  - the builder tray has no prize pieces;
  - "Which badge?" has no Rolls-Royce or Mercedes;
  - the build chooser has no prize cars;
  - `README.md` doesn't name the cars under the sheets.
- [ ] **Step 4: Commit** any fixes: `git commit -m "fix: <what>"`.
