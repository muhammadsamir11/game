# Trucks, Trailers and the Car Truck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Murad builds trucks and trailers from bricks, hooks trailers on in the city, and loads up to 8 of his garage cars onto a ready-made car truck and drives it.

**Architecture:** What a build *is* (car, truck or trailer) comes only from its chassis brick, so saves, storage and the server need no new fields. Pure rule modules (chassis areas, readiness, hitch maths, deck packing, Truck Yard bays) are tested with `node:test`. The city gets a Truck Yard on block (1, 0); trailers are still pictures with one static box while parked, and real `RaycastVehicle` bodies pinned to a truck with a `PointToPointConstraint` while hooked. Cars on the car truck are merged meshes parented to the trailer, with no physics of their own.

**Tech Stack:** Three.js 0.170, cannon-es 0.20, plain ES modules (no build step), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-22-trucks-trailers-design.md`

## Global Constraints

- Work on `main` in `~/Desktop/game`; no worktrees or feature branches. `npm test` passes before every commit (460 tests before this plan). Push to `origin/main` at the end.
- Pure rule modules import neither `three` nor the DOM.
- Old saves keep working: a saved build with a `chassis` brick is a car, exactly as today. No new fields on saved cars.
- Trucks are slower than cars: truck top speed ≤ 17 m/s; the Bugatti Chiron stays the fastest thing in the game.
- The car truck carries **8 cars**: 4 on the bottom deck, 4 on the top deck. Every ready-made model, supercar and prize car must fit; the limo may take two cars' room.
- Copy (exact): "Keep the hook clear for trailers!", "🔗 Hook on", "🔓 Unhook", "Unhook your trailer to race! 🔗", "The car truck stays in town! 🚚", "Unhook your trailer first! 🔗", "Only your own cars ride on the car truck! 😄", "This car is too big for the car truck!", "The car truck is full! 🚚", "🚗 3 / 8" (counter format), "MURAD TRANSPORT" (cab doors, never mentioned anywhere else).
- Hooked trailers and the car truck's load are never saved. Truck and trailer bays are saved like garage spots.
- Murad's name is never announced in UI text or speech.
- iPad performance: no physics bodies for loaded cars; parked trucks and trailers are static pictures like parked cars.

## Review Focus

- **A truck reversing into a trailer at an angle or too fast**: the hook must never fling either body; Hook on only shows when stopped-ish (|speed| < 1.5) and aligned within 70°, and the snap moves the trailer by at most `HOOK_REACH`.
- **Jack-knifed, tipped or wedged rig**: Flip me! must always leave the truck upright and the trailer straight behind it, still hooked, even when the trailer was upside down.
- **A car stopped half on the lift pad, at an angle, or moving slowly**: loading only starts below 1 m/s, takes any angle, and never loads a car while the lift is busy.
- **Leaving the city mid-lift, or pausing**: dispose must clean up the lift animation, constraint and trailer bodies; nothing is saved about the load.
- **A home-built truck so tall it can't get in the garage, or a trailer with an engine and seats**: Get in still works in the Truck Yard; the trailer never drives, never races, and its seats show empty.

Each of these has a test or a browser check in the task that owns it (Tasks 2, 6, 7 and 8).

---

### Task 1: Truck and trailer chassis, and where bricks may go

**Files:**
- Modify: `js/bricks.js`, `js/snapping.js`
- Modify: `tests/parts.test.js:21-30` (chassis pieces are not in the tray)
- Create: `tests/trucks.test.js`

**Interfaces:**
- Produces (bricks.js):
  - `BRICK_TYPES.truckChassis = { name: 'Truck Chassis', w: 4, d: 12, h: 1, mass: 60, kind: 'truckChassis', chassis: true }`
  - `BRICK_TYPES.trailerChassis = { name: 'Trailer Chassis', w: 4, d: 16, h: 1, mass: 40, kind: 'trailerChassis', chassis: true }`
  - `BRICK_TYPES.chassis` gains `chassis: true`
  - `isChassis(type: string) => boolean`
  - `buildKind(bricks) => 'car' | 'truck' | 'trailer'` (from the chassis brick; no chassis → `'car'`)
  - `makeChassis(kind = 'car')`: car `{ type: 'chassis', x: -2, z: -4 }`, truck `{ type: 'truckChassis', x: -2, z: -6 }`, trailer `{ type: 'trailerChassis', x: -2, z: -8 }`; all `color: 'black', y: 0, r: 0`
- Produces (snapping.js):
  - `BUILD_AREAS[kind] = { bounds, wheelSlots, hook: 'back' | 'front' | null }`:
    - car: today's `BOUNDS` and `WHEEL_SLOTS`, `hook: null`
    - truck: bounds `{ minX: -6, maxX: 6, minY: 0, maxY: 24, minZ: -6, maxZ: 10 }`, wheel slots `x ∈ {-3, 2}` × `z ∈ {3, -3, -5}`, `hook: 'back'`
    - trailer: bounds `{ minX: -6, maxX: 6, minY: 0, maxY: 24, minZ: -10, maxZ: 8 }`, wheel slots `x ∈ {-3, 2}` × `z ∈ {-5, -7}`, `hook: 'front'`
  - `BOUNDS` and `WHEEL_SLOTS` stay exported (the car's).
  - `canPlace(bricks, cand)` reads the area from `buildKind(bricks)`; new reason `'hookClear'` when the brick pokes past the hook end (truck: `cand.z < minZ`; trailer: `cand.z + d > maxZ`); any other overflow is still `'outOfBounds'`; the support rule skips every `isChassis` type, not just `'chassis'`.
  - `nearestWheelSlot(gx, gz, kind = 'car')`

- [ ] **Step 1: Write the failing tests** in `tests/trucks.test.js`:

```js
test('a build is a car, a truck or a trailer, from its chassis', () => {
  assert.equal(buildKind([makeChassis()]), 'car');
  assert.equal(buildKind([makeChassis('truck')]), 'truck');
  assert.equal(buildKind([makeChassis('trailer')]), 'trailer');
  assert.equal(buildKind([]), 'car');
  for (const kind of ['car', 'truck', 'trailer']) assert.ok(isValidBrick(makeChassis(kind)), kind);
});

test('truck wheels go at the front and two pairs at the back', () => {
  const truck = [makeChassis('truck')];
  for (const z of [3, -3, -5]) for (const x of [-3, 2]) assert.deepEqual(canPlace(truck, wheel(x, z)), { ok: true }, `${x},${z}`);
  assert.equal(canPlace(truck, wheel(-3, 0)).reason, 'wheelSlot');
});

test('trailer wheels go at the back only', () => {
  const trailer = [makeChassis('trailer')];
  for (const z of [-5, -7]) assert.deepEqual(canPlace(trailer, wheel(2, z)), { ok: true });
  assert.equal(canPlace(trailer, wheel(2, 3)).reason, 'wheelSlot');
});

test('nothing may poke past the hook end', () => {
  // a 2×4 brick lying across the back edge of the truck, and across the front edge of the trailer
  assert.equal(canPlace([makeChassis('truck')], part('brick24', -1, 1, -7)).reason, 'hookClear');
  assert.equal(canPlace([makeChassis('trailer')], part('brick24', -1, 1, 6)).reason, 'hookClear');
  assert.equal(canPlace([makeChassis('truck')], part('brick24', 4, 1, 0)).reason, 'outOfBounds');
});

test('nearestWheelSlot snaps to the right chassis', () => {
  assert.deepEqual(nearestWheelSlot(2.5, -2, 'truck'), { x: 2, y: 0, z: -3 });
  assert.deepEqual(nearestWheelSlot(-2.5, -6, 'trailer'), { x: -3, y: 0, z: -7 });
});
```

And in `tests/parts.test.js` change the tray test's filter to `k => !BRICK_TYPES[k].chassis && !BRICK_TYPES[k].prize` and add `assert.equal(groupOf('truckChassis'), null)`.

- [ ] **Step 2: Run** `npm test` → the new tests FAIL (`buildKind` is not exported).
- [ ] **Step 3: Implement** the Interfaces above in `js/bricks.js` and `js/snapping.js`. The chassis pieces stay out of `TRAY_GROUPS`.
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Commit** `feat: truck and trailer chassis pieces with their own wheel places and a clear hook`

---

### Task 2: Ready checklists, truck speed and hitch maths

**Files:**
- Modify: `js/carStats.js`
- Create: `js/hitch.js`
- Modify: `tests/instructions.test.js:9` (start each model from `makeChassis(model.kind)`)
- Test: `tests/trucks.test.js`

**Interfaces:**
- Consumes: `buildKind`, `BUILD_AREAS` from Task 1.
- Produces (carStats.js):
  - `raceReadiness(bricks)` keeps its keys `{ chassis, wheels, engine, seat, ready }`. For a truck, `wheels` means all 6 truck slots hold a wheel. For a trailer, `engine: false, seat: false, ready: false` (trailers never race).
  - `buildReadiness(bricks) => { kind, checks: { [need]: boolean }, ready }`. The checks are `{ wheels, engine, seat }` for a car or truck, and `{ wheels }` for a trailer, where `wheels` means some trailer slot row (`z = -5` or `z = -7`) has a wheel on both sides.
  - `TRUCK_TOP_SPEED = 17`. In `computeStats`, a truck's `topSpeed` is `Math.min(topSpeed, TRUCK_TOP_SPEED)`.
- Produces (hitch.js, pure, imports only `math.js`):
  - `HOOK = { y: 0.1, z: -3.3 }`: where a truck's hook pin is, in its brick space (metres; 0.3 m behind the 6 m chassis's back edge).
  - `RING = { y: 0.1, z: 5.5 }`: a brick trailer's towbar ring (1.5 m in front of the 8 m chassis's front edge).
  - `HOOK_REACH = 1.6` (m), `HOOK_ANGLE = 70 * Math.PI / 180`, `HOOK_SPEED = 1.5` (m/s).
  - `canHook({ hook, ring, truckHeading, trailerHeading, speed }) => boolean`: horizontal distance ≤ `HOOK_REACH`, `|hook.y - ring.y| < 0.8`, `|articulation| ≤ HOOK_ANGLE`, and `|speed| < HOOK_SPEED`.
  - `articulation(truckHeading, trailerHeading) = wrapAngle(truckHeading - trailerHeading)`
  - `TRAILER_STEER = 0.6`, `MAX_TRAILER_STEER = 0.5`, `TRAILER_STEER_SIGN = 1`, and `trailerSteer(angle) = clamp(TRAILER_STEER_SIGN * TRAILER_STEER * angle, ±MAX_TRAILER_STEER)`. The sign is confirmed in the browser in Task 7: the steering should make the trailer's back follow the truck's path more closely.
  - `towScale(truckMass, trailerMass) = Math.min(2.5, 1 + trailerMass / truckMass)`
  - `poseBehind(hookWorld: {x, z}, heading, ringToOrigin) => { x, z, heading }`: the trailer's origin, `ringToOrigin` metres straight behind the hook. Used by the hook snap and by Flip me!.

- [ ] **Step 1: Write the failing tests** (append to `tests/trucks.test.js`; `bigRig` is not built yet, so use a hand-made truck: `[makeChassis('truck'), ...six wheels, engine, seat]`):

```js
test('a truck needs all 6 wheels, an engine and a seat', () => {
  const truck = readyTruck();
  assert.equal(buildReadiness(truck).ready, true);
  assert.equal(raceReadiness(truck).ready, true);
  assert.equal(buildReadiness(truck.filter(b => !(b.type === 'wheelLarge' && b.z === -5 && b.x === 2))).checks.wheels, false);
});

test('a trailer needs only a pair of back wheels, and never races', () => {
  const trailer = [makeChassis('trailer'), wheel(-3, -7), wheel(2, -7)];
  assert.deepEqual(buildReadiness(trailer), { kind: 'trailer', checks: { wheels: true }, ready: true });
  assert.equal(buildReadiness([makeChassis('trailer'), wheel(-3, -7)]).ready, false);
  assert.equal(raceReadiness(trailer).ready, false);
});

test('trucks are slower than the fastest car', () => {
  assert.ok(computeStats(readyTruck()).topSpeed <= TRUCK_TOP_SPEED);
  assert.ok(TRUCK_TOP_SPEED < computeStats(modelToBricks(MODELS.chiron)).topSpeed);
});

test('hook on only when close, lined up and slow', () => {
  const base = { hook: { x: 0, y: 0.5, z: 0 }, ring: { x: 1, y: 0.5, z: 0.5 }, truckHeading: 0, trailerHeading: 0.3, speed: 0.4 };
  assert.equal(canHook(base), true);
  assert.equal(canHook({ ...base, ring: { x: 2, y: 0.5, z: 0 } }), false);
  assert.equal(canHook({ ...base, trailerHeading: 1.5 }), false);
  assert.equal(canHook({ ...base, speed: 3 }), false);
});

test('a trailer straightens out right behind the hook', () => {
  const p = poseBehind({ x: 10, z: 10 }, Math.PI / 2, 5.5); // truck facing +x
  assert.ok(Math.abs(p.x - 4.5) < 1e-9 && Math.abs(p.z - 10) < 1e-9 && p.heading === Math.PI / 2);
  assert.equal(trailerSteer(10), MAX_TRAILER_STEER * Math.sign(TRAILER_STEER_SIGN));
  assert.equal(towScale(100, 1000), 2.5);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `js/hitch.js` and the `carStats.js` changes. In `tests/instructions.test.js`, build from `makeChassis(model.kind)` (Task 3 adds `kind`; `undefined` gives `'car'`).
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Commit** `feat: truck and trailer checklists, slower trucks, and the maths of hooking on`

---

### Task 3: Building trucks and trailers, the Big Rig, and My cars

**Files:**
- Modify: `js/instructions.js` (`MODELS.bigRig`, `modelToBricks`), `js/builder.js`, `js/chooser.js`, `js/brickMesh.js`, `js/garageScreen.js`, `js/main.js` (`openBuilder`), `css/style.css`
- Test: `tests/trucks.test.js`, existing `tests/instructions.test.js` (it covers `bigRig` automatically)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `MODELS.bigRig = { name: 'Big Rig', kind: 'truck', steps: [...] }`: 10–16 steps on the truck chassis. It's a red cab with 6 `wheelLarge`, an engine, a seat, steering, a windshield, headlights and exhaust stacks, and it's ready by `buildReadiness`.
  - `modelToBricks(model, recolor)` starts from `makeChassis(model.kind ?? 'car')`.
  - `createBuilder(app, { car, modelKey, kind })`: kind comes from `car` (via `buildKind`), then from `MODELS[modelKey].kind`, then from the option, and defaults to `'car'`.
  - The chooser calls `app.openBuilder({ kind: 'truck' })` and `app.openBuilder({ kind: 'trailer' })`.
  - The builder's Done saves, then calls `app.openCity({ nearCarId: saved.id })` for a truck or trailer. Cars go to `app.startRace` as today.

- [ ] **Step 1: Write the failing test**:

```js
test('the Big Rig is a ready truck that every truck can copy', () => {
  const bricks = modelToBricks(MODELS.bigRig);
  assert.equal(buildKind(bricks), 'truck');
  assert.equal(buildReadiness(bricks).ready, true);
  assert.ok(bricks.filter(b => b.type === 'wheelLarge').length === 6);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Add `MODELS.bigRig`** and the `modelToBricks` change. Check that every other `MODELS` consumer (race opponents, traffic, chooser) still only picks cars: the supercar section filters by `brand`, and there's a new trucks section that filters by `kind === 'truck'`.
- [ ] **Step 4: Builder.**
  - Start from `makeChassis(kind)`.
  - Use `isChassis` for "The chassis has to stay!" and for Clear.
  - Add `hookClear: 'Keep the hook clear for trailers!'` to `REASONS`.
  - Pass `kind` to `nearestWheelSlot`.
  - The checklist comes from `buildReadiness`, with labels per kind: car `{ wheels: '4 wheels at the corners', engine: 'an engine', seat: 'a seat' }`, truck `{ wheels: '6 wheels', engine, seat }`, trailer `{ wheels: 'wheels at the back' }`.
  - The Done button reads `🏁 Race!` for a car, `🚚 Drive!` for a truck and `✔ Done!` for a trailer.
  - Default names are `My Truck` and `My Trailer`.
  - The guided "ready!" popup offers `🏙 Drive it!` (city near the saved truck) instead of `🏁 Race it!` for a truck.
  - The camera starts about 1.3× further back for a truck or trailer.
- [ ] **Step 5: brickMesh.js.**
  - The `truckChassis` kind draws a plate like `'plate'`, plus a hook pin at `HOOK` (a short dark cylinder with a ring).
  - The `trailerChassis` kind draws a plate, a dark A-frame towbar out to `RING`, and two landing legs just behind the front edge.
  - Both only change looks, so physics stays the plate box from `brickBox`.
- [ ] **Step 6: Chooser and My cars.**
  - Chooser: two more `big-btn` bricks after Free Build: `🚚 Truck` / "Build your own truck" (blue) and `🔗 Trailer` / "Build a trailer to pull" (yellow). Then a `🚚 Trucks, step by step` section with the Big Rig card, using the plain `model-card` style.
  - My cars: a 🚚 or 🔗 mark on truck and trailer cards, in the same corner as 🏆.
  - Trailer cards get `🏙 City` (`app.openCity({ nearCarId: car.id })`), Change and Delete, with no Race.
- [ ] **Step 7: Check in the browser.**
  - Start `preview_start {name: 'brick-racers'}`.
  - Build the Big Rig step by step and a free trailer.
  - Make sure "Keep the hook clear for trailers!" shows when a brick hangs past the hook end.
  - Check that the chooser and My cars fit at 1024×768 and 667×375. Screenshot both.
- [ ] **Step 8: Run** `npm test` → all pass. **Commit** `feat: build trucks and trailers, a step-by-step Big Rig, and trucks in My cars`

---

### Task 4: The Truck Yard on the map, its bays, and saving them

**Files:**
- Modify: `js/cityMap.js`, `js/cityState.js`, `js/missions.js:13`
- Modify: `tests/cityMap.test.js:21` (add `'truckYard'` to the block types), `tests/cityState.test.js`
- Test: `tests/trucks.test.js`

**Interfaces:**
- Produces (cityMap.js):
  - `LAYOUT[0][1] = 'truckYard'`
  - `TRUCK_YARD = { block: { bx: 1, bz: 0 }, rect, lot, truckBays, trailerBays, carTruck, fences, sign }`, built on `blockRect(1, 0)`, which is x 60–96, z 12–48 (lot x 63–93, z 15–45):
    - `truckBays`: 4 of `{ index, x: 65.5 + 4.6k, z: 19.5, heading: Math.PI, w: 4.4, d: 9 }`. `w` and `d` are the bay's x and z extents; trucks park nose to the north fence.
    - `trailerBays`: 4 of `{ index, x: 87.5, z: 18 + 4.6k, heading: -Math.PI / 2, w: 11, d: 4.4 }`, so towbars face the yard's middle.
    - `carTruck`: `{ x: 88, z: 40.5, heading: Math.PI / 2 }`, the cab's brick-space origin. The trailer behind it ends with its ramp foot at x ≥ 60.
    - `fences`: static boxes 0.3 m thick and 1.2 m tall along the north edge, the south edge, and the east edge from z 15 to 34. The west side is open toward the garage door, and the east side is open from z 34 to 45 for the rig to drive out.
  - `GARAGE_DOOR = { cx: 48.3, cy: 1.85, cz: 30, hx: 0.3, hy: 1.85, hz: 14 }`: the invisible barrier across the garage door that only a towing truck meets.
  - `truckBayAt(x, z) => index | null`, `trailerBayAt(x, z) => index | null`
  - `MAP_LANDMARKS` gains `{ kind: 'trucks', icon: '🚚', name: 'Trucks', x: 78, z: 30 }`.
- Produces (cityState.js):
  - `assignSpots(ids, saved, count = SPOT_COUNT)`
  - Saved data becomes `{ spots, truckBays, trailerBays }`. A save without the new keys loads as empty bays.
  - `store.baysFor(kind: 'truck' | 'trailer', ids) => { [id]: bay }` and `store.parkInBay(kind, id, bay) => boolean`, with the same rules as `spotsFor` and `park`.
- missions.js: in `DELIVERY_TARGETS`, `[1, 0]` becomes `[4, 2]` (a teal house on block (0, 1)). The six colours stay different.

- [ ] **Step 1: Write the failing tests**:

```js
test('the Truck Yard sits across the road from the garage door', () => {
  assert.equal(BLOCKS.find(b => b.bx === 1 && b.bz === 0).type, 'truckYard');
  assert.ok(TRUCK_YARD.rect.x0 - GARAGE.rect.x1 === ROAD);
  assert.equal(TRUCK_YARD.truckBays.length, 4);
  assert.equal(TRUCK_YARD.trailerBays.length, 4);
});

test('bays sit inside the lot, never overlap, and are found by position', () => {
  const all = [...TRUCK_YARD.truckBays, ...TRUCK_YARD.trailerBays];
  for (const b of all) assert.ok(b.x - b.w / 2 >= TRUCK_YARD.lot.x0 - 1e-9 && b.x + b.w / 2 <= TRUCK_YARD.lot.x1 + 1e-9 && b.z - b.d / 2 >= TRUCK_YARD.lot.z0 - 1e-9 && b.z + b.d / 2 <= TRUCK_YARD.lot.z1 + 1e-9);
  for (const a of all) for (const b of all) if (a !== b) assert.ok(Math.abs(a.x - b.x) * 2 >= a.w + b.w - 1e-9 || Math.abs(a.z - b.z) * 2 >= a.d + b.d - 1e-9);
  assert.equal(truckBayAt(TRUCK_YARD.truckBays[2].x, TRUCK_YARD.truckBays[2].z), 2);
  assert.equal(trailerBayAt(TRUCK_YARD.trailerBays[3].x, TRUCK_YARD.trailerBays[3].z), 3);
  assert.equal(truckBayAt(TRUCK_YARD.carTruck.x, TRUCK_YARD.carTruck.z), null);
});

test('trucks and trailers keep their own bays between visits', () => {
  const storage = memoryStorage();
  const store = createCityStore(storage);
  assert.deepEqual(store.baysFor('truck', ['t1', 't2']), { t1: 0, t2: 1 });
  assert.equal(store.parkInBay('truck', 't2', 3), true);
  assert.equal(store.parkInBay('trailer', 'x', 9), false);
  assert.deepEqual(createCityStore(storage).baysFor('truck', ['t1', 't2']), { t1: 0, t2: 3 });
  assert.deepEqual(createCityStore(storage).spotsFor(['c1']), { c1: 0 }); // garage spots untouched
});
```

Use `tests/cityState.test.js`'s existing in-memory storage helper.

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement.** Also look for every switch on `b.type` (`cityWorld.js`, `cityProps.js`, `cityGround.js` `grassy`, `cityMinimap.js`): the yard is paved like a plaza and gets no house dressing. In `cityProps.js` `inTheWay`, skip lamps on the yard's west and east sidewalks between z 24 and 45, so nothing stands in the gates.
- [ ] **Step 4: Run** `npm test` → all pass (including `missions.test.js`'s six-colours test).
- [ ] **Step 5: Commit** `feat: the Truck Yard's place on the map, its bays, and saving them`

---

### Task 5: Drawing the Truck Yard

**Files:**
- Create: `js/cityTruckYard.js` (`export function buildTruckYard({ kit, scene, own, staticBox, canvasTexture, sign })`, following `js/cityGarage.js`)
- Modify: `js/cityWorld.js` (call it, as for the garage; add the `🚚 TRUCK YARD` sign board on the west fence facing the garage, made with `sign(text, bg)`)

**Interfaces:**
- Consumes: `TRUCK_YARD` from Task 4.
- Produces: nothing new for later tasks. The fences are real `staticBox`es; everything else is only for looks.

- [ ] **Step 1: Build it.**
  - The lot gets dark asphalt.
  - Truck and trailer bays get white painted outlines with big numbers (1–4 blue for trucks, 1–4 orange for trailers), drawn like the garage spot paint in `cityWorld.js`.
  - The car truck's long bay gets a yellow outline and a painted 🚗 lane at its west end, where the ramp foot meets the yard.
  - Toy-brick fences with posts every 3 m, and the sign.
- [ ] **Step 2: Check in the browser.**
  - Open the city, then teleport with `brickRacers.currentMode().debug.teleport(70, 30)`.
  - Make sure the mini-map shows the 🚚 landmark, that he walks into the fences rather than through them, and that frame time hasn't got worse. `frameWatch` should not step down any further than it does today on the same view.
  - Screenshot it.
- [ ] **Step 3: Run** `npm test`, then **commit** `feat: draw the Truck Yard: bays, fences and sign`

---

### Task 6: The car truck's rules

**Files:**
- Create: `js/carTruck.js` (pure: imports `bricks.js`, `prizeCars.js` (`carBounds`) and `instructions.js`)
- Test: `tests/carTruck.test.js`

**Interfaces:**
- Produces:
  - `CAR_TRUCK_ID = 'carTruck'`
  - `CAR_TRUCK = { capacity: 8, perDeck: 4, deckLength: 19, deckWidth: 3.4, bottomDeckY: 0.9, topDeckY: 3.75, bottomRoom: 2.8, topRoom: 3.2, gap: 0.25, ramp: 3.5, ringAhead: 1.5, mass: 300 }`. The trailer's local frame has its origin on the ground line at the middle of the deck's **back** edge, with +z toward the cab. The deck runs over z 0…19 and the ring sits at `z = deckLength + ringAhead`.
  - `cabBricks() => bricks`: `modelToBricks(MODELS.bigRig, { red: 'blue' })`
  - `carSize(bricks) => { length, width, height }` (from `carBounds`)
  - `planLoad(loaded: Array<{ deck, z0, z1 }>, size) => { ok: true, deck: 0 | 1, z0, z1 } | { ok: false, reason: 'tooBig' | 'full' }`
    - `z0` and `z1` are measured back from the deck's front edge. A car's spot spans local z from `deckLength - z1` to `deckLength - z0`.
    - Decks fill bottom first, then top, each from the front backwards.
    - A deck takes the car if it has fewer than `perDeck` cars, the used length plus a `gap` plus the car's length is at most `deckLength`, `width ≤ deckWidth`, and `height ≤` that deck's room.
    - `'tooBig'` means it wouldn't fit even on an empty deck of either kind. `'full'` covers every other refusal.
  - `inLoadZone(local: { x, z }) => boolean`: `|x| ≤ 2.4` and `-(ramp + 4) ≤ z ≤ 1`. That covers the pad behind the ramp, the ramp itself, and the first metre of the deck.
  - `groundPoseBehind(trailerPose: { x, z, heading }) => { x, z, heading }`: where an unloaded car is put down. That's 3 m behind the ramp foot along the trailer's centre line, facing away from the truck (`heading + π`).

- [ ] **Step 1: Write the failing tests**:

```js
const sizeOf = key => carSize(modelToBricks(MODELS[key]));
test('every ready-made, super and prize car fits on an empty car truck', () => {
  for (const key of Object.keys(MODELS).filter(k => !MODELS[k].kind)) assert.equal(planLoad([], sizeOf(key)).ok, true, key);
  for (const { key } of PRIZE_CARS) assert.equal(planLoad([], carSize(prizeBricks(key))).ok, true, key);
});
test('8 ordinary cars fill it: bottom deck first, front to back, then the top; the 9th is told it is full', () => {
  const loaded = [];
  for (let i = 0; i < 8; i++) {
    const r = planLoad(loaded, sizeOf('raceCar'));
    assert.equal(r.ok, true);
    assert.equal(r.deck, i < 4 ? 0 : 1);
    if (i % 4) assert.ok(r.z0 > loaded[i - 1].z0);
    loaded.push(r);
  }
  assert.deepEqual(planLoad(loaded, sizeOf('raceCar')), { ok: false, reason: 'full' });
});
test('a deck never holds more than its length (the limo is long)', () => {
  const limo = carSize(prizeBricks('limo'));
  const loaded = [planLoad([], limo)];
  while (loaded.length < 8) {
    const r = planLoad(loaded, sizeOf('raceCar'));
    if (!r.ok) break;
    loaded.push(r);
  }
  for (const deck of [0, 1]) assert.ok(Math.max(0, ...loaded.filter(s => s.deck === deck).map(s => s.z1)) <= CAR_TRUCK.deckLength);
});
test('a car wider than the deck is too big', () => {
  assert.deepEqual(planLoad([], { length: 4, width: 4.5, height: 1.5 }), { ok: false, reason: 'tooBig' });
});
test('the G-Wagon fits under the top deck', () => {
  assert.equal(planLoad([], carSize(prizeBricks('gwagon'))).deck, 0);
});
test('the car truck cab is a ready truck', () => {
  assert.equal(buildKind(cabBricks()), 'truck');
  assert.equal(buildReadiness(cabBricks()).ready, true);
});
test('the load zone is the pad, the ramp and the deck\'s back edge', () => {
  assert.equal(inLoadZone({ x: 0, z: -5 }), true);
  assert.equal(inLoadZone({ x: 0, z: 5 }), false);
  assert.equal(inLoadZone({ x: 3, z: -2 }), false);
});
test('the car truck fits in its bay with the ramp inside the yard\'s block', () => {
  const hookX = TRUCK_YARD.carTruck.x + HOOK.z; // the cab faces +x
  const rampFoot = hookX - CAR_TRUCK.ringAhead - CAR_TRUCK.deckLength - CAR_TRUCK.ramp;
  assert.ok(rampFoot >= TRUCK_YARD.rect.x0);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `js/carTruck.js`. If the G-Wagon, a supercar with a tall wing, or another car doesn't fit, raise `bottomRoom`/`topDeckY` or `deckWidth`. Never shrink the check.
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Commit** `feat: car truck rules: 8 spots on two decks, what fits, and where cars come off`

---

### Task 7: Hooking, towing and the Truck Yard in the city

**Files:**
- Create: `js/towing.js` (three + cannon-es)
- Modify: `js/vehiclePhysics.js` (towing pull), `js/city.js`, `index.html` (city button), `css/style.css`

**Interfaces:**
- Consumes: `HOOK`, `RING`, `canHook`, `articulation`, `trailerSteer`, `towScale`, `poseBehind` (Task 2); `TRUCK_YARD`, `GARAGE_DOOR`, `truckBayAt`, `trailerBayAt`, `store.baysFor` / `parkInBay` (Task 4); `buildKind`, `buildReadiness`.
- Produces (vehiclePhysics.js): `vehicle.setTow(scale = 1)`. While it's set, `applyInput` multiplies engine force and brake force by `scale`.
- Produces (towing.js):
  - `trailerSpecFromBricks(bricks) => spec`
    - spec is `{ body: THREE.Object3D, boxes, wheels, mass, com, ring: {x, y, z}, halfWidth, halfLength, height }`.
    - Everything is in the trailer's own frame (brick space for a brick trailer), with `body` drawn without wheels and with empty seats (`createCarMesh(bricks, { includeWheels: false, emptySeat: true, merge: true })`).
    - `mass` is `computeStats(bricks).mass`, and `ring` is `RING`.
  - `createTrailer({ world, scene, spec, pose: { x, y, z, heading } }) => trailer`, where trailer is:
    - `spec`, `mesh` (a THREE.Group in the scene), `hookedTo` (a driven entry or null)
    - `ringWorld() => {x, y, z}`, `pose() => { x, y, z, heading, speed }`
    - `hook(entry)`
      - It needs `entry.driven`.
      - It moves the parked trailer so its ring sits on the hook, keeping its heading.
      - It swaps the static box for a dynamic `RaycastVehicle` (with spec wheels, rest length 0.3, the same suspension as cars) and adds `PointToPointConstraint(truckBody, HOOK - truckCom, trailerBody, ring - com, 1e6)` with `collideConnected = false`.
      - It calls `entry.driven.car.setTow(towScale(...))` and sets `entry.trailer = trailer`.
    - `unhook()`
      - Removes the constraint and calls `setTow(1)`.
      - Freezes the trailer as a parked picture at its current x, z and heading, level, with its legs on the ground (a raycast down finds the ground).
    - `update(dt, { braking: boolean })`
      - While hooked: steer the wheels by `trailerSteer(articulation(...))`, brake with the truck, roll freely otherwise, and sync the wheel meshes.
      - While the truck stands still with nobody in it: hold.
    - `straighten()`: put the trailer on `poseBehind(...)` of the truck, upright, at rest, still hooked.
    - `remove()`
- Produces (city.js), as behaviour:
  - Saved trucks and trailers park in the bays from `store.baysFor`. Trucks are ordinary entries; trailers live in a `trailers` list.
  - Garage spots and the "garage is full" message count cars only. Trucks and trailers that don't get a bay get the toast `The truck yard is full! N more wait in 🚗 My cars.`
  - `nearCarId` puts him `halfLength + 1.5` m behind a truck, or beside a trailer.
  - Get in works for trucks but never for trailers. The "too tall for the garage" refusal only applies to cars parked inside the garage.
  - A new `<button class="big-action hitch drive-only hidden" data-city="hitch">` shows `🔗 Hook on` when `canHook` holds for any unhooked trailer, and `🔓 Unhook` when the truck has a trailer and |speed| < 1. It's placed below Flip me! with the same short-screen media rules as `.flip-btn`.
  - Keyboard E hooks on when the button reads Hook on; otherwise it's Get out, as now.
  - Unhooking inside a trailer bay calls `parkInBay('trailer', …)`. Getting out of a truck inside a truck bay calls `parkInBay('truck', …)`. A truck stopping in a garage spot never parks there.
  - Flip me! also calls `driving.trailer?.straighten()`.
  - The race arch: towing gives `Unhook your trailer to race! 🔗` once per pass, and the cab gives `The car truck stays in town! 🚚`. A truck alone races.
  - A static body from `GARAGE_DOOR` has `collisionResponse = !!driving?.trailer` every frame. Being within 3 m of it while towing gives `Unhook your trailer first! 🔗` (at most every 3 s).
  - The camera pulls back by the trailer's length and 1.5 m higher while towing.
  - Trailers are drawn on the mini-map like parked cars.
  - Everything goes in `dispose()`.
  - Debug hooks: `debug.hookNearest()`, `debug.trailers` (poses and hooked state).

- [ ] **Step 1: Implement `setTow` and `towing.js`.** In `createTrailer`, a parked trailer is a still picture plus one static box sized from its bounds. Merge it with `mergeStaticParts`, the way `parkCar` does.
- [ ] **Step 2: Wire the Truck Yard into `city.js`**: parking trucks and trailers in bays, Get in for trucks, the hitch button and E, arch rules, the door barrier, Flip me!, camera, map and dispose. Keep `city.js` additions to wiring; put trailer behaviour in `towing.js`.
- [ ] **Step 3: Check in the browser** with `preview_start {name: 'brick-racers'}`. Seed a Big Rig and a trailer by building them, or with `brickRacers.garage.save` plus `modelToBricks`. Then:
  - Reverse up to the trailer and hook on. The snap should be small and nothing should fly.
  - Tow round three corners. Confirm the trailer's back follows the truck's path, not cutting further in than without steering. If it cuts in more, flip `TRAILER_STEER_SIGN` and record why in a comment.
  - Jack-knife it on purpose, then press Flip me!. It should come out straight and still hooked.
  - Tip the trailer with `debug` (or drive off the stunt park kicker), then press Flip me!.
  - Drive at the garage door: it should stop with the toast. Unhook, and the truck alone drives in.
  - Drive through the 🏁 arch while towing.
  - Unhook in trailer bay 3, leave the city, come back: the trailer is in bay 3 and the truck is in its bay.
  - Pause and resume mid-tow, and leave the city while towing. There should be no console errors.
  - Screenshot towing.
- [ ] **Step 4: Run** `npm test` → all pass. **Commit** `feat: hook trailers on and tow them round the city, parked in the Truck Yard`

---

### Task 8: The car truck in the city

**Files:**
- Create: `js/cityCarTruck.js` (three)
- Modify: `js/city.js`

**Interfaces:**
- Consumes: `createTrailer`, `trailer.hook/unhook/pose/mesh` (Task 7); `CAR_TRUCK`, `CAR_TRUCK_ID`, `cabBricks`, `carSize`, `planLoad`, `inLoadZone`, `groundPoseBehind` (Task 6); `createCarMesh`, `disposeMerged`.
- Produces (cityCarTruck.js):
  - `carTrailerSpec(kit) => spec`, in the same shape as `trailerSpecFromBricks`. It has:
    - brick-style decks, side rails, a front bulkhead, a sloped rear ramp (a real rotated box in `boxes`, so cars can drive up it), and 2 axles of big wheels at the back
    - `mass: CAR_TRUCK.mass`, and `ring` at `{ y: 0.1, z: deckLength + ringAhead }` in the local frame from Task 6
    - a counter sign on both sides that redraws to `🚗 n / 8`
  - `createCarTruckLoad({ scene, trailer, sfx, toast }) => load`, where load is:
    - `loaded`, an array of `{ entry, deck, z0, z1, mesh }`, and `busy` (true while the lift moves)
    - `tryLoad(entry, size) => 'loaded' | 'busy' | 'full' | 'tooBig'`. On `'loaded'` it adds a merged empty-seat mesh as a child of `trailer.mesh` at the ramp, and animates it: about 0.5 s up to deck height, then about 1.1 s rolling to its spot. Then the yellow straps show, the counter goes up, `sfx.snap()` plays and a toast says `🚗 n / 8`.
    - `takeLast() => entry | null`: removes the last car's mesh and returns its entry.
    - `padGlow(on)`, `update(dt)`, `dispose()`
- Produces (city.js), as behaviour:
  - At the start of every visit, the cab is an entry `{ car: { id: CAR_TRUCK_ID, name: 'Car truck', bricks: cabBricks(), updatedAt: 0 } }` at `TRUCK_YARD.carTruck`.
    - It's made driven right away with the driver hidden (`showDriver(false)`) and held, and the car trailer is created behind it and hooked.
    - Two small `MURAD TRANSPORT` sign planes go on the cab doors (children of `driven.mesh`).
  - Every frame, he's driving one of **his own** entries (a garage car, not a truck, trailer or cab). When its speed is under 1 and its trailer-local position is `inLoadZone` while the car trailer's speed is under 0.5, the car is loaded. `planLoad` gives the spot, and `tryLoad` does the rest.
    - He steps out onto the ground 2.8 m to the left of the ramp foot, on foot. This is factored out of `getOut` as `stepOut(position, heading)`.
    - `entry.driven` is removed and set to null, and `entry.loaded = true`.
    - Loaded entries are skipped by Get in, the mini-map and the hold loop.
  - A borrowed traffic car in the zone gets `Only your own cars ride on the car truck! 😄`. `tooBig` gives `This car is too big for the car truck!`, and `full` gives `The car truck is full! 🚚`. Each toast shows once per stop. The pad glows only when `loaded.length < 8` and the lift isn't busy.
  - On foot within 3.5 m of the ramp foot, with the car trailer stopped and cars on it, `nearestTarget` returns `{ unload: true }` and the button reads `🚗 Get in`.
    - Tapping it calls `takeLast()`, creates the driven car at `groundPoseBehind(trailer.pose())`, sets `entry.loaded = false` and `entry.tricks`, then `getIn(entry)`.
  - The car trailer can be unhooked from the cab, and any truck can hook it (Task 7 rules), with its load.
  - Leaving the city disposes everything. Nothing about the load is saved.
  - Debug hooks: `debug.carTruck` (`{ count, busy, hooked }`), `debug.loadNow()` (loads the car he's driving, wherever it is, for testing).

- [ ] **Step 1: Implement** `js/cityCarTruck.js` and the city wiring.
- [ ] **Step 2: Check in the browser.**
  - Seed 9 cars (the 3 prize cars via `debug.showroomReady` are optional) with `brickRacers.garage.save` plus `modelToBricks`.
  - Drive each from the garage, across the road and up the ramp, until the 9th says full.
  - The limo, if you have it, takes two cars' room.
  - Get into the cab and drive the full truck round a block and over a kerb-speed bump. No car should move or shake.
  - Unload two cars somewhere else, last on first off, and drive them off forwards.
  - Unhook the car trailer, hook it to the Big Rig, and drive.
  - Pause mid-lift, then leave mid-lift. There should be no console errors.
  - Screenshot the full car truck from the side and from above.
- [ ] **Step 3: Run** `npm test` → all pass. **Commit** `feat: the car truck: drive 8 garage cars onto it, drive them round town, and unload`

---

### Task 9: Play together, docs, final check, push

**Files:**
- Modify: `js/net/protocol.js:5` (`PROTOCOL_VERSION = 3`), `README.md` (How to play: trucks, trailers, the Truck Yard, the car truck; for grown-ups: what's not saved, friends see trucks but not trailers)

- [ ] **Step 1: Bump `PROTOCOL_VERSION` to 3.** `tests/rooms.test.js` already proves an old version is told to update.
- [ ] **Step 2: Check play together.** Use Playwright with two browser contexts (see memory: Testing Play together). Player A drives the Big Rig in the city; player B sees a truck with A's name tag and no errors.
- [ ] **Step 3: Update the README.** Keep the README's voice. Don't mention the cab doors' writing.
- [ ] **Step 4: Run** `npm test` → all pass, and paste the count.
- [ ] **Step 5: Commit** `feat: play together knows about trucks; README for trucks, trailers and the car truck`, then `git push origin main`.
