# More Parts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 18 new car parts (passengers he picks, animals, gadgets, extras) in a tabbed tray; four gadgets that work in races (boost, horn, siren, confetti); four new step-by-step models.

**Architecture:**
- **Pure modules, tested in Node:** the catalogue in `bricks.js`, plus `riders.js` (who sits in a passenger seat), `gadgets.js` (which buttons a car gets and their timers), the new models and step checks in `instructions.js`, and boost support in `vehiclePhysics.js`.
- **Three.js / DOM, checked in the browser:** `brickMesh.js` gets the new part models; the builder gets tray tabs and the rider picker; `race.js` gets gadget buttons and effects.

**Tech Stack:** Same as the game (Three.js 0.170.0, cannon-es 0.20.0, ES modules, node:test, Web Audio).

**Spec:** `docs/superpowers/specs/2026-10-16-more-parts-design.md`

## Global Constraints

- **Base plans still hold:** no build step, pinned CDN versions, pure modules free of `three` and the DOM, kid-friendly copy, no LEGO branding.
- **Fixed colours:** dog, cat, parrot, bunny, siren, horn, exhaust, ladder, crate, trophy and windshield always use their own colours, and guided steps never check colour for them.
- **Riders:**
  - A rider is stored on the brick as `rider: 'preset:<key>' | 'friend:<id>'`.
  - Presets: police, firefighter, astronaut, pirate, chef.
  - An unknown or missing rider shows the Police Officer.
- **Boost:**
  - active for 2 s, then recharges for 6 s;
  - engine force ×1.6 and top speed ×1.4 while active.
- **Cooldowns:** horn 0.3 s, confetti 1.5 s; the siren toggles on and off.
- **Testing keys:** B boost, H horn, N siren, C confetti.
- **AI cars** don't use gadgets. AI drivers are fixed figure objects.
- **Readiness:** new parts never count toward race readiness.

## Review Focus

1. **Old saved cars** (no `rider`, or a non-string `rider`) and cars whose rider friend was deleted. Old cars still load; a missing rider shows the Police Officer. Pinned in Tasks 1–2.
2. **The guided tray shows the needed part** even when it's on another tab. Checked in Task 6.
3. **Gadget buttons pressed many times, or during the countdown or pause.** No stacking boosts, no stuck siren sound after leaving the race. Pinned in Task 3 and checked in Task 7.
4. **Swapping a rider vs. stacking a brick on a passenger seat.** Only the Passenger Seat selection opens the picker; anything else stacks normally. Checked in Task 6.
5. **Wide parts** (wings) next to wheels and the baseplate edge follow the normal placement rules. Pinned in Task 1.

## File Map

```
js/bricks.js        new BRICK_TYPES (group, fixedColor, action), TRAY_GROUPS, TRAY_ORDER, groupOf; rider in isValidBrick
js/storage.js       keeps rider
js/figures.js       heads policeCap/fireHelmet/pirateHat/chefHat, face eyepatch
js/riders.js        PRESET_RIDERS, DEFAULT_RIDER, resolveRider, riderName
js/figureMesh.js    new heads + eyepatch face
js/gadgets.js       GADGET_ORDER, BOOST, gadgetsOf, createCooldown, createBoost
js/vehiclePhysics.js  boost input
js/instructions.js  4 models; fixed-colour check; rider wording
js/brickMesh.js     18 part meshes, setRiderResolver, add(…, parent)
js/riderPicker.js   pickRider(app) → Promise<rider string>
js/builder.js       tray tabs, rider picker + swap, keeps rider; guide hooks
js/guide.js         uses builder's showNeeded; adds rider
js/chooser.js / css 3-column chooser
js/race.js          gadget buttons/keys/effects, animations, fixed AI drivers
js/audio.js         horn, whoosh, siren loop
js/main.js          rider resolver; figure version bump on friend changes
index.html          tray tabs, gadget buttons
tests/parts.test.js, tests/riders.test.js, tests/gadgets.test.js (+ additions to existing tests)
```

---

### Task 1: Parts catalogue

**Files:**
- Modify: `js/bricks.js`, `js/storage.js`
- Test: `tests/parts.test.js` (new), `tests/storage.test.js` (one new test)

**Interfaces:**
- Produces:
  - `BRICK_TYPES[key] = { name, w, d, h, mass, kind, radius?, fixedColor?, action? }`;
  - `TRAY_GROUPS: { key, label, types[] }[]`;
  - `TRAY_ORDER` (all tray types, group order);
  - `groupOf(type) → group key | null`;
  - `isValidBrick` accepts an optional string `rider`;
  - `garage.save` keeps `rider`.
- New `kind` values equal the type key for every new part. Example: `kind: 'dog'`; the passenger seat's kind is `'passenger'`.

- [ ] **Step 1: Write the failing tests**

`tests/parts.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { BRICK_TYPES, TRAY_GROUPS, TRAY_ORDER, groupOf, makeChassis, isValidBrick } from '../js/bricks.js';
import { canPlace } from '../js/snapping.js';
import { raceReadiness } from '../js/carStats.js';

const NEW_PARTS = ['passengerSeat', 'dog', 'cat', 'parrot', 'bunny', 'rocket', 'wings', 'propeller', 'siren', 'horn', 'exhaust', 'flag', 'ladder', 'toolbox', 'crate', 'trophy', 'cannon', 'windshield'];
const FIXED = ['dog', 'cat', 'parrot', 'bunny', 'siren', 'horn', 'exhaust', 'ladder', 'crate', 'trophy', 'windshield'];
const part = (type, x, y, z, extra = {}) => ({ type, color: 'red', x, y, z, r: 0, ...extra });

test('all 18 new parts exist with whole-number sizes and a weight', () => {
  for (const key of NEW_PARTS) {
    const t = BRICK_TYPES[key];
    assert.ok(t, key);
    for (const n of [t.w, t.d, t.h]) assert.ok(Number.isInteger(n) && n > 0, `${key} size`);
    assert.ok(t.mass > 0, `${key} mass`);
  }
});

test('every part except the chassis is in exactly one tray tab', () => {
  const keys = Object.keys(BRICK_TYPES).filter(k => k !== 'chassis');
  for (const key of keys) assert.equal(TRAY_GROUPS.filter(g => g.types.includes(key)).length, 1, key);
  assert.equal(TRAY_ORDER.length, keys.length);
  assert.deepEqual(TRAY_GROUPS.map(g => g.key), ['bricks', 'wheels', 'people', 'gadgets', 'extras']);
  assert.equal(groupOf('dog'), 'people');
  assert.equal(groupOf('rocket'), 'gadgets');
  assert.equal(groupOf('crate'), 'extras');
  assert.equal(groupOf('chassis'), null);
});

test('exactly the natural-coloured parts ignore the colour choice', () => {
  const fixed = Object.keys(BRICK_TYPES).filter(k => BRICK_TYPES[k].fixedColor);
  assert.deepEqual(fixed.sort(), [...FIXED].sort());
});

test('four gadgets do something in races', () => {
  const actions = Object.fromEntries(Object.entries(BRICK_TYPES).filter(([, t]) => t.action).map(([k, t]) => [k, t.action]));
  assert.deepEqual(actions, { rocket: 'boost', horn: 'horn', siren: 'siren', cannon: 'confetti' });
});

test('wings may stick out one stud past each side of the car', () => {
  const chassis = makeChassis();
  assert.deepEqual(canPlace([chassis], part('wings', -3, 1, -2)), { ok: true });
  const frontWheel = part('wheelSmall', -3, 0, 2, { color: 'black' });
  assert.equal(canPlace([chassis, frontWheel], part('wings', -3, 1, 2)).reason, 'overlap');
  assert.equal(canPlace([chassis], part('wings', 1, 1, 0)).reason, 'outOfBounds'); // x 1..6 runs past the edge at 6
});

test('tall and long extras follow the normal rules', () => {
  const chassis = makeChassis();
  assert.deepEqual(canPlace([chassis], part('flag', 1, 1, -4)), { ok: true });
  assert.deepEqual(canPlace([chassis], part('ladder', -1, 1, -4)), { ok: true });
  assert.equal(canPlace([chassis], part('trophy', 0, 4, 0)).reason, 'floating');
});

test('passengers and animals do not make a car race-ready', () => {
  const car = [makeChassis(), part('passengerSeat', -1, 1, 0), part('dog', 0, 1, -2)];
  assert.equal(raceReadiness(car).seat, false);
});

test('a brick may carry a rider name; anything else there is rejected', () => {
  assert.equal(isValidBrick(part('passengerSeat', 0, 1, 0, { rider: 'preset:pirate' })), true);
  assert.equal(isValidBrick(part('passengerSeat', 0, 1, 0)), true);
  assert.equal(isValidBrick(part('passengerSeat', 0, 1, 0, { rider: 42 })), false);
});
```

Add to `tests/storage.test.js`:
```js
test('a passenger seat keeps its rider when the car is saved and loaded', () => {
  const storage = memoryStorage();
  const bricks = [makeChassis(), { type: 'passengerSeat', color: 'white', x: 0, y: 1, z: 0, r: 0, rider: 'preset:chef' }];
  const saved = createGarage(storage).save({ name: 'Taxi', bricks });
  assert.equal(createGarage(storage).get(saved.id).bricks[1].rider, 'preset:chef');
  assert.equal('rider' in createGarage(storage).get(saved.id).bricks[0], false);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'TRAY_GROUPS'` (and the storage test fails on `rider`).

- [ ] **Step 3: Extend `js/bricks.js`**

Add these entries at the end of `BRICK_TYPES` (after `lights`):
```js
  passengerSeat: { name: 'Passenger Seat', w: 2, d: 2, h: 3, mass: 6, kind: 'passenger' },
  dog: { name: 'Dog', w: 1, d: 2, h: 2, mass: 2, kind: 'dog', fixedColor: true },
  cat: { name: 'Cat', w: 1, d: 1, h: 2, mass: 1, kind: 'cat', fixedColor: true },
  parrot: { name: 'Parrot', w: 1, d: 1, h: 3, mass: 1, kind: 'parrot', fixedColor: true },
  bunny: { name: 'Bunny', w: 1, d: 1, h: 2, mass: 1, kind: 'bunny', fixedColor: true },
  rocket: { name: 'Rocket Booster', w: 2, d: 2, h: 2, mass: 6, kind: 'rocket', action: 'boost' },
  wings: { name: 'Wings', w: 6, d: 2, h: 1, mass: 4, kind: 'wings' },
  propeller: { name: 'Propeller', w: 1, d: 1, h: 2, mass: 1, kind: 'propeller' },
  siren: { name: 'Siren Light', w: 2, d: 1, h: 1, mass: 1, kind: 'siren', fixedColor: true, action: 'siren' },
  horn: { name: 'Horn', w: 1, d: 1, h: 1, mass: 1, kind: 'horn', fixedColor: true, action: 'horn' },
  exhaust: { name: 'Exhaust Pipes', w: 1, d: 1, h: 3, mass: 1, kind: 'exhaust', fixedColor: true },
  flag: { name: 'Flag', w: 1, d: 1, h: 5, mass: 1, kind: 'flag' },
  ladder: { name: 'Ladder', w: 1, d: 6, h: 1, mass: 3, kind: 'ladder', fixedColor: true },
  toolbox: { name: 'Tool Box', w: 2, d: 1, h: 2, mass: 2, kind: 'toolbox' },
  crate: { name: 'Cargo Crate', w: 2, d: 2, h: 3, mass: 4, kind: 'crate', fixedColor: true },
  trophy: { name: 'Trophy', w: 1, d: 1, h: 3, mass: 1, kind: 'trophy', fixedColor: true },
  cannon: { name: 'Confetti Cannon', w: 1, d: 2, h: 2, mass: 3, kind: 'cannon', action: 'confetti' },
  windshield: { name: 'Windshield', w: 4, d: 1, h: 2, mass: 1, kind: 'windshield', fixedColor: true },
```

Replace:
```js
// Everything except the chassis, in the order the tray shows it.
export const TRAY_ORDER = ['plate24', 'brick12', 'brick22', 'brick24', 'slope22', 'wheelSmall', 'wheelLarge', 'engine', 'seat', 'steering', 'spoiler', 'lights'];
```
with:
```js
// The tray's tabs. Every part except the chassis is in exactly one.
export const TRAY_GROUPS = [
  { key: 'bricks', label: '🧱 Bricks', types: ['plate24', 'brick12', 'brick22', 'brick24', 'slope22'] },
  { key: 'wheels', label: '🛞 Wheels', types: ['wheelSmall', 'wheelLarge'] },
  { key: 'people', label: '🧑 People', types: ['seat', 'passengerSeat', 'dog', 'cat', 'parrot', 'bunny'] },
  { key: 'gadgets', label: '🚀 Gadgets', types: ['engine', 'steering', 'spoiler', 'lights', 'rocket', 'wings', 'propeller', 'siren', 'horn', 'exhaust', 'cannon'] },
  { key: 'extras', label: '🎁 Extras', types: ['flag', 'ladder', 'toolbox', 'crate', 'trophy', 'windshield'] },
];
export const TRAY_ORDER = TRAY_GROUPS.flatMap(g => g.types);
export const groupOf = type => TRAY_GROUPS.find(g => g.types.includes(type))?.key ?? null;
```

Replace the body of `isValidBrick`:
```js
  return !!b && Object.hasOwn(BRICK_TYPES, b.type) && Object.hasOwn(COLORS, b.color)
    && [b.x, b.y, b.z].every(Number.isInteger) && [0, 1, 2, 3].includes(b.r);
```
with:
```js
  return !!b && Object.hasOwn(BRICK_TYPES, b.type) && Object.hasOwn(COLORS, b.color)
    && [b.x, b.y, b.z].every(Number.isInteger) && [0, 1, 2, 3].includes(b.r)
    && (b.rider === undefined || typeof b.rider === 'string');
```

- [ ] **Step 4: Keep riders when saving (`js/storage.js`)**

Replace:
```js
        bricks: bricks.map(b => ({ type: b.type, color: b.color, x: b.x, y: b.y, z: b.z, r: b.r })),
```
with:
```js
        bricks: bricks.map(b => ({ type: b.type, color: b.color, x: b.x, y: b.y, z: b.z, r: b.r, ...(typeof b.rider === 'string' ? { rider: b.rider } : {}) })),
```

- [ ] **Step 5: Run to see them pass**

Run: `npm test`
Expected: PASS — 9 new tests plus all existing ones (the builder still uses `TRAY_ORDER`, which now lists 30 parts).

- [ ] **Step 6: Commit**

```bash
git add js/bricks.js js/storage.js tests/parts.test.js tests/storage.test.js
git commit -m "feat: 18 new parts in five tray groups; riders saved with cars"
```

---

### Task 2: Ready-made characters and who rides

**Files:**
- Modify: `js/figures.js`, `js/figureMesh.js`
- Create: `js/riders.js`
- Test: `tests/riders.test.js`

**Interfaces:**
- Produces:
  - in `HEADS`: `policeCap` (navy `0x1a237e`), `fireHelmet` (red `0xd32f2f`), `pirateHat` (black `0x212121`) and `chefHat` (white `0xfafafa`), all `kind: 'fixed'`;
  - `FACES.eyepatch`;
  - `riders.js`: `PRESET_RIDERS: { key: { name, figure } }`, `DEFAULT_RIDER = 'preset:police'`, `resolveRider(rider, friends = []) → Figure`, `riderName(rider, friends = []) → string`.

- [ ] **Step 1: Write the failing tests**

`tests/riders.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESET_RIDERS, DEFAULT_RIDER, resolveRider, riderName } from '../js/riders.js';
import { HEADS, FACES, headColorOptions, normaliseFigure } from '../js/figures.js';

test('the five ready-made characters are valid figures', () => {
  assert.deepEqual(Object.keys(PRESET_RIDERS), ['police', 'firefighter', 'astronaut', 'pirate', 'chef']);
  for (const [key, preset] of Object.entries(PRESET_RIDERS)) {
    const f = resolveRider(`preset:${key}`);
    assert.deepEqual(normaliseFigure(f), f, key);
    assert.equal(f.name, preset.name);
  }
});

test('the new hats are fixed-colour and the eye patch is a face', () => {
  for (const head of ['policeCap', 'fireHelmet', 'pirateHat', 'chefHat']) {
    assert.equal(HEADS[head].kind, 'fixed', head);
    assert.deepEqual(headColorOptions(head), []);
  }
  assert.ok(FACES.eyepatch);
  assert.equal(resolveRider('preset:pirate').head, 'pirateHat');
  assert.equal(resolveRider('preset:pirate').face, 'eyepatch');
});

test('a friend rider looks like that friend', () => {
  const friends = [{ id: 'fig-1', name: 'Ana', head: 'crown', face: 'grin', skin: 'brown', shirt: 'purple', print: 'star', pants: 'white' }];
  const f = resolveRider('friend:fig-1', friends);
  assert.equal(f.name, 'Ana');
  assert.equal(f.head, 'crown');
  assert.equal(riderName('friend:fig-1', friends), 'Ana');
});

test('a deleted friend, unknown preset, junk or missing rider shows the Police Officer', () => {
  for (const rider of ['friend:gone', 'preset:wizard', 'nonsense', '', undefined, null, 42]) {
    assert.equal(resolveRider(rider, []).head, 'policeCap', String(rider));
  }
  assert.equal(DEFAULT_RIDER, 'preset:police');
  assert.equal(riderName(undefined), 'Police Officer');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/riders.js`.

- [ ] **Step 3: New heads and face (`js/figures.js`)**

In `HEADS`, add after `astronaut`:
```js
  policeCap: { name: 'Police Cap', kind: 'fixed', hex: 0x1a237e },
  fireHelmet: { name: 'Fire Helmet', kind: 'fixed', hex: 0xd32f2f },
  pirateHat: { name: 'Pirate Hat', kind: 'fixed', hex: 0x212121 },
  chefHat: { name: 'Chef Hat', kind: 'fixed', hex: 0xfafafa },
```

In `FACES`, add after `surprised`:
```js
  eyepatch: { name: 'Eye Patch' },
```

- [ ] **Step 4: Write `js/riders.js`**

```js
import { normaliseFigure } from './figures.js';

// Ready-made characters that can ride in a passenger seat.
export const PRESET_RIDERS = {
  police: { name: 'Police Officer', figure: { head: 'policeCap', face: 'determined', skin: 'classic', shirt: 'blue', print: 'badge', pants: 'black' } },
  firefighter: { name: 'Firefighter', figure: { head: 'fireHelmet', face: 'happy', skin: 'tan', shirt: 'black', print: 'stripe', pants: 'black' } },
  astronaut: { name: 'Astronaut', figure: { head: 'astronaut', face: 'grin', skin: 'light', shirt: 'white', print: 'star', pants: 'white' } },
  pirate: { name: 'Pirate', figure: { head: 'pirateHat', face: 'eyepatch', skin: 'brown', shirt: 'red', print: 'stripe', pants: 'black' } },
  chef: { name: 'Chef', figure: { head: 'chefHat', face: 'happy', skin: 'dark', shirt: 'white', print: 'plain', pants: 'black' } },
};

export const DEFAULT_RIDER = 'preset:police';

const presetFigure = key => normaliseFigure({ ...PRESET_RIDERS[key].figure, name: PRESET_RIDERS[key].name });

// rider is 'preset:<key>' or 'friend:<id>'; anything that can't be found rides as the Police Officer.
export function resolveRider(rider, friends = []) {
  if (typeof rider === 'string') {
    const colon = rider.indexOf(':');
    const kind = rider.slice(0, colon);
    const key = rider.slice(colon + 1);
    if (kind === 'preset' && Object.hasOwn(PRESET_RIDERS, key)) return presetFigure(key);
    if (kind === 'friend') {
      const friend = friends.find(f => f.id === key);
      if (friend) return normaliseFigure(friend, 'Friend');
    }
  }
  return presetFigure('police');
}

export const riderName = (rider, friends = []) => resolveRider(rider, friends).name;
```

- [ ] **Step 5: Run to see them pass**

Run: `npm test`
Expected: PASS — 4 new tests plus all existing ones (the figure tests still pass with the bigger catalogue).

- [ ] **Step 6: Draw the new hats and face (`js/figureMesh.js`)**

In `faceTexture`'s `switch (face)`, add before `default:`:
```js
      case 'eyepatch':
        dot(cx - 18, 50, 7);
        g.beginPath(); g.ellipse(cx + 18, 50, 13, 11, 0, 0, Math.PI * 2); g.fill();
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(cx - 60, 26); g.lineTo(cx + 60, 70); g.stroke();
        g.lineWidth = 6;
        smile();
        break;
```

In `addHeadgear`'s `switch (f.head)`, add before the closing `}` of the switch:
```js
    case 'policeCap':
      add(head, geo('policeTop', () => new THREE.CylinderGeometry(R + 0.035, R + 0.015, 0.08, 20)), m, 0, H * 0.85, 0);
      add(head, geo('policeBrim', () => new THREE.BoxGeometry(0.2, 0.015, 0.09)), mat(0x111111), 0, H * 0.79, R + 0.02);
      add(head, geo('policeBadge', () => new THREE.BoxGeometry(0.05, 0.04, 0.01)), mat(0xffc107, { metalness: 0.6, roughness: 0.3 }), 0, H * 0.86, R + 0.045);
      break;
    case 'fireHelmet':
      add(head, geo('fireDome', () => new THREE.SphereGeometry(R + 0.03, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, H * 0.7, 0);
      add(head, geo('fireBrim', () => new THREE.CylinderGeometry(R + 0.07, R + 0.07, 0.015, 24)), m, 0, H * 0.7, -0.02);
      add(head, geo('fireBadge', () => new THREE.BoxGeometry(0.06, 0.07, 0.01)), mat(0xffc107, { metalness: 0.6, roughness: 0.3 }), 0, H * 0.7 + 0.08, R + 0.035);
      break;
    case 'pirateHat':
      add(head, geo('pirateBrim', () => new THREE.CylinderGeometry(0.22, 0.22, 0.03, 3)), m, 0, H * 0.82, 0); // three corners, one pointing forward
      add(head, geo('pirateCrown', () => new THREE.CylinderGeometry(R - 0.01, R + 0.02, 0.1, 18)), m, 0, H * 0.82 + 0.06, 0);
      add(head, geo('pirateSkull', () => new THREE.SphereGeometry(0.025, 8, 6)), mat(0xffffff), 0, H * 0.82 + 0.06, R + 0.01);
      break;
    case 'chefHat': {
      add(head, geo('chefBand', () => new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.07, 20)), m, 0, H * 0.86, 0);
      const puff = add(head, geo('chefPuff', () => new THREE.SphereGeometry(R + 0.06, 18, 12)), m, 0, H * 0.86 + 0.12, 0);
      puff.scale.y = 0.8;
      break;
    }
```

Check in the browser:
```js
const { figureThumbnail } = await import('/js/thumbnails.js');
const { resolveRider } = await import('/js/riders.js');
```
Then show `figureThumbnail(resolveRider('preset:' + k))` for each preset key, using the strip snippet from the figure-builder plan.

Expected:
- the officer has a navy cap with a gold badge;
- the firefighter has a red helmet with a brim;
- the astronaut has the space helmet;
- the pirate has a black three-cornered hat and an eye patch;
- the chef has a tall white hat.

- [ ] **Step 7: Commit**

```bash
git add js/figures.js js/figureMesh.js js/riders.js tests/riders.test.js
git commit -m "feat: ready-made characters (police, firefighter, astronaut, pirate, chef) and rider lookup"
```

---

### Task 3: Gadget logic and boost

**Files:**
- Create: `js/gadgets.js`
- Modify: `js/vehiclePhysics.js`
- Test: `tests/gadgets.test.js`, one new test in `tests/vehiclePhysics.test.js`

**Interfaces:**
- Produces:
  - `GADGET_ORDER = ['boost', 'horn', 'siren', 'confetti']`;
  - `BOOST = { duration: 2, recharge: 6, force: 1.6, topSpeed: 1.4 }`;
  - `gadgetsOf(bricks) → action[]` in `GADGET_ORDER` order, each listed once;
  - `createCooldown(seconds) → { trigger() → boolean, update(dt), ready }`;
  - `createBoost() → { trigger() → boolean, update(dt), active, ready, charge }` (`charge` runs 0…1 while recharging and is 1 when ready);
  - `vehicle.applyInput({ …, boost: true })` multiplies engine force and top speed.

- [ ] **Step 1: Write the failing tests**

`tests/gadgets.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { gadgetsOf, createCooldown, createBoost, BOOST, GADGET_ORDER } from '../js/gadgets.js';
import { makeChassis } from '../js/bricks.js';

const part = (type, x = 0, y = 1, z = 0) => ({ type, color: 'red', x, y, z, r: 0 });

test('gadgetsOf lists each gadget once, in button order', () => {
  const car = [makeChassis(), part('cannon'), part('horn'), part('rocket'), part('rocket'), part('dog')];
  assert.deepEqual(gadgetsOf(car), ['boost', 'horn', 'confetti']);
  assert.deepEqual(gadgetsOf([makeChassis()]), []);
  assert.deepEqual(GADGET_ORDER, ['boost', 'horn', 'siren', 'confetti']);
});

test('boost lasts 2 seconds, then recharges for 6, and cannot be re-triggered meanwhile', () => {
  const boost = createBoost();
  assert.equal(boost.ready, true);
  assert.equal(boost.charge, 1);
  assert.equal(boost.trigger(), true);
  assert.equal(boost.active, true);
  boost.update(1.5);
  assert.equal(boost.trigger(), false, 'not while boosting');
  assert.equal(boost.active, true);
  boost.update(0.5);
  assert.equal(boost.active, false);
  assert.equal(boost.charge, 0);
  assert.equal(boost.trigger(), false, 'not while recharging');
  boost.update(3);
  assert.equal(boost.charge, 0.5);
  boost.update(3);
  assert.equal(boost.ready, true);
  assert.equal(boost.trigger(), true);
  assert.deepEqual(BOOST, { duration: 2, recharge: 6, force: 1.6, topSpeed: 1.4 });
});

test('a cooldown blocks repeat presses until it has passed', () => {
  const cd = createCooldown(1.5);
  assert.equal(cd.trigger(), true);
  assert.equal(cd.trigger(), false);
  cd.update(1);
  assert.equal(cd.ready, false);
  cd.update(0.5);
  assert.equal(cd.ready, true);
  assert.equal(cd.trigger(), true);
});
```

Add to `tests/vehiclePhysics.test.js`:
```js
test('boost makes the car faster than the same car without it', () => {
  const plain = settledCar();
  const boosted = settledCar();
  drive(plain.world, plain.car, { throttle: 1 }, 4);
  drive(boosted.world, boosted.car, { throttle: 1, boost: true }, 4);
  assert.ok(boosted.car.forwardSpeed() > plain.car.forwardSpeed() + 2, `${boosted.car.forwardSpeed()} vs ${plain.car.forwardSpeed()}`);
  assert.ok(boosted.car.forwardSpeed() <= boosted.car.stats.topSpeed * 1.4 + 1.5);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/gadgets.js`, and the boost physics test fails because boost has no effect.

- [ ] **Step 3: Write `js/gadgets.js`**

```js
import { BRICK_TYPES } from './bricks.js';

export const GADGET_ORDER = ['boost', 'horn', 'siren', 'confetti'];
export const BOOST = { duration: 2, recharge: 6, force: 1.6, topSpeed: 1.4 };

// Which race buttons a car gets, from the gadgets built onto it.
export function gadgetsOf(bricks) {
  const found = new Set(bricks.map(b => BRICK_TYPES[b.type]?.action).filter(Boolean));
  return GADGET_ORDER.filter(action => found.has(action));
}

export function createCooldown(seconds) {
  let left = 0;
  return {
    trigger() {
      if (left > 0) return false;
      left = seconds;
      return true;
    },
    update(dt) { left = Math.max(0, left - dt); },
    get ready() { return left <= 0; },
  };
}

// Boost runs for BOOST.duration seconds, then needs BOOST.recharge seconds before it can run again.
export function createBoost() {
  let active = 0;
  let charging = 0;
  return {
    trigger() {
      if (active > 0 || charging > 0) return false;
      active = BOOST.duration;
      return true;
    },
    update(dt) {
      if (active > 0) {
        active -= dt;
        if (active <= 0) {
          active = 0;
          charging = BOOST.recharge;
        }
      } else if (charging > 0) {
        charging = Math.max(0, charging - dt);
      }
    },
    get active() { return active > 0; },
    get ready() { return active <= 0 && charging <= 0; },
    get charge() { return active > 0 ? 0 : 1 - charging / BOOST.recharge; },
  };
}
```

- [ ] **Step 4: Boost in the physics (`js/vehiclePhysics.js`)**

Add the import:
```js
import { BOOST } from './gadgets.js';
```

Replace:
```js
  function applyInput({ steer = 0, throttle = 0, brake = 0, hold = false } = {}) {
    const speed = forwardSpeed();
```
with:
```js
  function applyInput({ steer = 0, throttle = 0, brake = 0, hold = false, boost = false } = {}) {
    const speed = forwardSpeed();
    const engineForce = stats.engineForce * (boost ? BOOST.force : 1);
    const topSpeed = stats.topSpeed * (boost ? BOOST.topSpeed : 1);
```

In the same function, replace:
```js
    else if (throttle > 0) force = speed < stats.topSpeed ? stats.engineForce * throttle : 0;
```
with:
```js
    else if (throttle > 0) force = speed < topSpeed ? engineForce * throttle : 0;
```

- [ ] **Step 5: Run to see them pass**

Run: `npm test`
Expected: PASS — 3 gadget tests and the boost physics test, plus everything else.

- [ ] **Step 6: Commit**

```bash
git add js/gadgets.js js/vehiclePhysics.js tests/gadgets.test.js tests/vehiclePhysics.test.js
git commit -m "feat: gadget buttons logic and rocket boost physics"
```

---
### Task 4: Four new step-by-step models

**Files:**
- Modify: `js/instructions.js`
- Test: `tests/instructions.test.js` (new tests; the existing per-model loop covers the new models automatically)

**Interfaces:**
- Consumes: `BRICK_TYPES` (bricks.js), `riderName` (riders.js).
- Produces:
  - `MODELS.policeCar`, `MODELS.fireTruck`, `MODELS.rocketCar`, `MODELS.pirateBuggy`;
  - passenger-seat steps carry `rider: 'preset:<key>'`;
  - `checkPlacement` skips the colour check for fixed-colour parts;
  - `describeStep` leaves the colour out for fixed-colour parts and names the rider.

Layout reminder: the chassis covers x −2..1, z −4..3, layer 0; front is +z; corner wheel slots are x −3/2, z 2/−4.

- [ ] **Step 1: Write the failing tests**

Add to `tests/instructions.test.js`:
```js
test('the four new models exist and show off the new parts', () => {
  const types = key => MODELS[key].steps.map(s => s.type);
  assert.ok(['siren', 'passengerSeat', 'dog'].every(t => types('policeCar').includes(t)));
  assert.ok(['ladder', 'passengerSeat', 'siren', 'horn'].every(t => types('fireTruck').includes(t)));
  assert.ok(['rocket', 'wings', 'passengerSeat'].every(t => types('rocketCar').includes(t)));
  assert.ok(['flag', 'cannon', 'parrot', 'passengerSeat', 'crate'].every(t => types('pirateBuggy').includes(t)));
  const riders = Object.fromEntries(['policeCar', 'fireTruck', 'rocketCar', 'pirateBuggy'].map(k => [k, MODELS[k].steps.find(s => s.type === 'passengerSeat').rider]));
  assert.deepEqual(riders, { policeCar: 'preset:police', fireTruck: 'preset:firefighter', rocketCar: 'preset:astronaut', pirateBuggy: 'preset:pirate' });
});

test('colour does not matter for natural-coloured parts', () => {
  const step = { type: 'dog', color: 'white', x: 0, y: 1, z: -2, r: 0 };
  assert.equal(checkPlacement(step, { type: 'dog', color: 'purple', at: { x: 0, y: 1, z: -2 } }), 'correct');
  assert.equal(describeStep(step), 'Find the Dog and put it on the glowing spot!');
});

test('a passenger-seat step says who will ride', () => {
  const step = { type: 'passengerSeat', color: 'white', x: 0, y: 1, z: 0, r: 0, rider: 'preset:firefighter' };
  assert.equal(describeStep(step), 'Find a white Passenger Seat and put it on the glowing spot! The Firefighter rides in it.');
});

test('modelToBricks keeps the riders', () => {
  assert.equal(modelToBricks(MODELS.pirateBuggy).find(b => b.type === 'passengerSeat').rider, 'preset:pirate');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — `Cannot read properties of undefined (reading 'steps')` for `policeCar`, and the dog step returns `'wrongColor'`.

- [ ] **Step 3: Models and rules (`js/instructions.js`)**

Add the import:
```js
import { riderName } from './riders.js';
```

Add to `MODELS` after `buggy`:
```js
  policeCar: {
    name: 'Police Car',
    steps: [
      ...cornerWheels('wheelSmall'),
      step('engine', 'black', -1, 1, -4),
      step('seat', 'white', -2, 1, 0),
      { ...step('passengerSeat', 'white', 0, 1, 0), rider: 'preset:police' },
      step('steering', 'black', -2, 1, 2),
      step('brick12', 'blue', -1, 1, 2),
      step('slope22', 'blue', 0, 1, 2),
      step('brick12', 'blue', -2, 1, -4),
      step('brick12', 'blue', 1, 1, -4),
      step('dog', 'white', 0, 1, -2),
      step('siren', 'white', -1, 4, -4),
    ],
  },
  fireTruck: {
    name: 'Fire Truck',
    steps: [
      ...cornerWheels('wheelLarge'),
      step('engine', 'black', -1, 1, 2),
      step('seat', 'white', -2, 1, 0),
      { ...step('passengerSeat', 'white', 0, 1, 0), rider: 'preset:firefighter' },
      step('steering', 'black', -2, 1, 2),
      step('brick24', 'red', -2, 1, -4),
      step('brick24', 'red', 0, 1, -4),
      step('brick22', 'red', -1, 4, -4),
      step('ladder', 'white', -1, 7, -4),
      step('siren', 'white', 0, 4, -2),
      step('horn', 'white', 1, 1, 2),
    ],
  },
  rocketCar: {
    name: 'Rocket Car',
    steps: [
      ...cornerWheels('wheelSmall'),
      step('engine', 'black', -1, 1, -4),
      step('rocket', 'orange', -1, 4, -4),
      step('seat', 'white', -2, 1, 0),
      { ...step('passengerSeat', 'white', 0, 1, 0), rider: 'preset:astronaut' },
      step('steering', 'black', -2, 1, 2),
      step('wings', 'white', -3, 1, -2),
      step('brick12', 'orange', -1, 1, 2),
      step('slope22', 'orange', 0, 1, 2),
      step('brick12', 'white', -2, 1, -4),
      step('brick12', 'white', 1, 1, -4),
    ],
  },
  pirateBuggy: {
    name: 'Pirate Buggy',
    steps: [
      step('wheelSmall', 'black', -3, 0, 2),
      step('wheelSmall', 'black', 2, 0, 2),
      step('wheelLarge', 'black', -3, 0, -4),
      step('wheelLarge', 'black', 2, 0, -4),
      step('engine', 'black', -1, 1, -4),
      step('seat', 'white', -2, 1, 0),
      { ...step('passengerSeat', 'yellow', 0, 1, 0), rider: 'preset:pirate' },
      step('steering', 'black', -2, 1, 2),
      step('cannon', 'black', 0, 1, 2),
      step('crate', 'white', -2, 1, -2),
      step('parrot', 'white', -2, 4, -2),
      step('flag', 'black', 1, 1, -4),
      step('brick12', 'yellow', 1, 1, -2),
      step('brick12', 'yellow', -2, 1, -4),
    ],
  },
```

Replace `describeStep`:
```js
export function describeStep(s) {
  const color = COLORS[s.color].name.toLowerCase();
  const article = /^[aeiou]/.test(color) ? 'an' : 'a';
  return `Find ${article} ${color} ${BRICK_TYPES[s.type].name} and put it on the glowing spot!`;
}
```
with:
```js
export function describeStep(s) {
  const type = BRICK_TYPES[s.type];
  let text;
  if (type.fixedColor) {
    text = `Find the ${type.name} and put it on the glowing spot!`;
  } else {
    const color = COLORS[s.color].name.toLowerCase();
    const article = /^[aeiou]/.test(color) ? 'an' : 'a';
    text = `Find ${article} ${color} ${type.name} and put it on the glowing spot!`;
  }
  if (s.rider) text += ` The ${riderName(s.rider)} rides in it.`;
  return text;
}
```

In `checkPlacement` replace:
```js
  if (color !== s.color) return 'wrongColor';
```
with:
```js
  if (!BRICK_TYPES[s.type].fixedColor && color !== s.color) return 'wrongColor';
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS — 4 new tests, plus 12 new per-model tests (3 for each of the 4 models), plus everything else. If a model step is refused, fix that step's coordinates; never loosen `canPlace`.

- [ ] **Step 5: Commit**

```bash
git add js/instructions.js tests/instructions.test.js
git commit -m "feat: police car, fire truck, rocket car and pirate buggy models"
```

---

### Task 5: 3D models for the 18 parts

**Files:**
- Modify: `js/brickMesh.js`

**Interfaces:**
- Consumes: `resolveRider` (riders.js).
- Produces:
  - `setRiderResolver(fn)` (main.js passes friends in Task 6);
  - meshes for every new kind;
  - markers for the race (Task 7): `userData.flame` on the rocket flame (hidden at first), `userData.spin` on the propeller hub group, `userData.flag` on the flag cloth, `userData.sirenLight = hex` on the two siren domes (each with its own material), `userData.muzzle` on the cannon barrel.

- [ ] **Step 1: Rider resolver and an `add` that can target a sub-group**

Add the import:
```js
import { resolveRider } from './riders.js';
```

Below `getDriverVersion`, add:
```js
// Who sits in a passenger seat; main.js swaps this for one that also knows the friend figures.
let riderResolver = rider => resolveRider(rider);
export function setRiderResolver(fn) {
  riderResolver = fn;
  driverVersion++;
}
```

In `createBrickMesh` replace:
```js
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, pick(material));
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = ghost === null;
    group.add(mesh);
    return mesh;
  };
```
with:
```js
  const add = (geometry, material, x = 0, y = 0, z = 0, parent = group) => {
    const mesh = new THREE.Mesh(geometry, pick(material));
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = ghost === null;
    parent.add(mesh);
    return mesh;
  };
  const twoSided = color => cached(materials, `color2:${color}`, () => new THREE.MeshStandardMaterial({ color: COLORS[color].hex, roughness: 0.4, side: THREE.DoubleSide }));
```

- [ ] **Step 2: Add the new cases to the `switch (t.kind)` in `createBrickMesh`** (before its closing `}`)

```js
    case 'passenger': {
      add(geo('seat:base', () => box(W, LAYER, D)), paint, 0, LAYER / 2, 0);
      add(geo('seat:back', () => box(W, H, LAYER)), paint, 0, H / 2, -D / 2 + LAYER / 2);
      const rider = createFigureMesh(riderResolver(brick.rider), { pose: 'sit', pick });
      rider.position.set(0, LAYER, 0.02);
      if (ghost !== null) rider.traverse(node => { node.castShadow = false; });
      group.add(rider);
      break;
    }
    case 'dog': {
      const brown = fixed('dogBrown', { color: 0x8d5a3b, roughness: 0.7 });
      const white = fixed('furWhite', { color: 0xf5f5f5, roughness: 0.7 });
      add(geo('dog:body', () => box(0.26, 0.2, 0.5)), brown, 0, 0.2, -0.1);
      add(geo('dog:head', () => box(0.22, 0.2, 0.2)), brown, 0, 0.33, 0.23);
      add(geo('dog:snout', () => box(0.12, 0.09, 0.1)), white, 0, 0.29, 0.37);
      add(geo('dog:nose', () => box(0.05, 0.04, 0.03)), dark(), 0, 0.32, 0.43);
      for (const x of [-0.05, 0.05]) add(geo('dog:eye', () => box(0.03, 0.03, 0.01)), dark(), x, 0.37, 0.335);
      for (const x of [-0.125, 0.125]) add(geo('dog:ear', () => box(0.04, 0.13, 0.08)), dark(), x, 0.33, 0.21);
      for (const [x, z] of [[-0.08, 0.08], [0.08, 0.08], [-0.08, -0.28], [0.08, -0.28]]) add(geo('dog:leg', () => box(0.07, 0.12, 0.07)), brown, x, 0.06, z);
      const tail = add(geo('dog:tail', () => new THREE.CylinderGeometry(0.02, 0.03, 0.16, 6)), brown, 0, 0.32, -0.38);
      tail.rotation.x = -0.7;
      break;
    }
    case 'cat': {
      const orange = fixed('catOrange', { color: 0xf39c3d, roughness: 0.7 });
      add(geo('cat:body', () => box(0.2, 0.18, 0.3)), orange, 0, 0.12, -0.03);
      add(geo('cat:head', () => box(0.18, 0.16, 0.15)), orange, 0, 0.29, 0.1);
      for (const x of [-0.055, 0.055]) add(geo('cat:ear', () => new THREE.ConeGeometry(0.035, 0.07, 4)), orange, x, 0.4, 0.1);
      for (const x of [-0.04, 0.04]) add(geo('cat:eye', () => box(0.025, 0.025, 0.01)), dark(), x, 0.31, 0.18);
      const tail = add(geo('cat:tail', () => new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6)), orange, 0, 0.25, -0.2);
      tail.rotation.x = -0.4;
      break;
    }
    case 'parrot': {
      add(geo('parrot:perch', () => new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6)), dark(), 0, 0.15, 0);
      add(geo('parrot:bar', () => new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6).rotateZ(Math.PI / 2)), dark(), 0, 0.3, 0);
      const body = add(geo('parrot:body', () => new THREE.SphereGeometry(0.08, 12, 8)), fixed('parrotGreen', { color: 0x2e9d48, roughness: 0.5 }), 0, 0.4, 0);
      body.scale.set(1, 1.4, 1);
      add(geo('parrot:head', () => new THREE.SphereGeometry(0.06, 12, 8)), fixed('parrotRed', { color: 0xe53935, roughness: 0.5 }), 0, 0.53, 0.03);
      const beak = add(geo('parrot:beak', () => new THREE.ConeGeometry(0.025, 0.06, 6)), fixed('beak', { color: 0xfdd835, roughness: 0.5 }), 0, 0.52, 0.1);
      beak.rotation.x = Math.PI / 2;
      const tail = add(geo('parrot:tail', () => box(0.06, 0.18, 0.02)), fixed('parrotBlue', { color: 0x1e88e5, roughness: 0.5 }), 0, 0.3, -0.07);
      tail.rotation.x = 0.3;
      break;
    }
    case 'bunny': {
      const white = fixed('furWhite', { color: 0xf5f5f5, roughness: 0.7 });
      add(geo('bunny:body', () => new THREE.SphereGeometry(0.12, 12, 8)), white, 0, 0.12, -0.03);
      add(geo('bunny:head', () => new THREE.SphereGeometry(0.08, 12, 8)), white, 0, 0.27, 0.08);
      for (const x of [-0.035, 0.035]) add(geo('bunny:ear', () => new THREE.CylinderGeometry(0.02, 0.025, 0.16, 6)), white, x, 0.4, 0.06);
      add(geo('bunny:nose', () => new THREE.SphereGeometry(0.015, 6, 4)), fixed('pink', { color: 0xf48fb1, roughness: 0.6 }), 0, 0.27, 0.16);
      for (const x of [-0.03, 0.03]) add(geo('bunny:eye', () => box(0.02, 0.02, 0.01)), dark(), x, 0.3, 0.155);
      break;
    }
    case 'rocket': {
      add(geo('rocket:tube', () => new THREE.CylinderGeometry(0.17, 0.17, 0.6, 16).rotateX(Math.PI / 2)), paint, 0, 0.2, 0);
      add(geo('rocket:nose', () => new THREE.ConeGeometry(0.17, 0.25, 16).rotateX(Math.PI / 2)), fixed('rocketNose', { color: 0xf5f5f5, roughness: 0.4 }), 0, 0.2, 0.42);
      add(geo('rocket:nozzle', () => new THREE.CylinderGeometry(0.12, 0.17, 0.12, 16).rotateX(Math.PI / 2)), dark(), 0, 0.2, -0.36);
      for (const x of [-0.17, 0.17]) add(geo('rocket:fin', () => box(0.02, 0.14, 0.18)), dark(), x, 0.2, -0.22);
      if (ghost === null) {
        const flame = new THREE.Mesh(geo('rocket:flame', () => new THREE.ConeGeometry(0.13, 0.5, 12).rotateX(-Math.PI / 2)),
          fixed('flame', { color: 0xff9800, emissive: 0xff5722, emissiveIntensity: 1.5, transparent: true, opacity: 0.85 }));
        flame.position.set(0, 0.2, -0.65);
        flame.visible = false;
        flame.userData.flame = true;
        group.add(flame);
      }
      break;
    }
    case 'wings':
      add(geo('wings:main', () => box(W, 0.06, D * 0.8)), paint, 0, 0.05, 0);
      for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) add(geo('wings:tip', () => box(0.04, 0.16, D * 0.6)), paint, x, 0.13, 0);
      break;
    case 'propeller': {
      add(geo('prop:mount', () => box(0.12, 0.2, 0.12)), dark(), 0, 0.1, -0.05);
      const spinner = new THREE.Group();
      spinner.position.set(0, 0.24, 0.05);
      spinner.userData.spin = true;
      group.add(spinner);
      add(geo('prop:hub', () => new THREE.ConeGeometry(0.05, 0.08, 10).rotateX(Math.PI / 2)), chrome(), 0, 0, 0.04, spinner);
      add(geo('prop:blade', () => box(0.06, 0.4, 0.015)), paint, 0, 0, 0, spinner);
      break;
    }
    case 'siren':
      add(geo('siren:base', () => box(W * 0.9, 0.08, D * 0.8)), dark(), 0, 0.04, 0);
      for (const [x, color] of [[-0.22, 0xe53935], [0.22, 0x1e88e5]]) {
        // Each dome gets its own material so the race can flash them.
        const dome = add(geo('siren:dome', () => new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.3 }), x, 0.08, 0);
        dome.userData.sirenLight = color;
      }
      break;
    case 'horn':
      add(geo('horn:base', () => box(0.1, 0.06, 0.1)), dark(), 0, 0.03, -0.05);
      add(geo('horn:bell', () => new THREE.ConeGeometry(0.09, 0.24, 14, 1, true).rotateX(-Math.PI / 2)),
        fixed('chromeTwoSided', { color: 0xdddddd, roughness: 0.2, metalness: 0.9, side: THREE.DoubleSide }), 0, 0.12, 0.04);
      break;
    case 'exhaust':
      for (const x of [-0.08, 0.08]) {
        add(geo('exhaust:pipe', () => new THREE.CylinderGeometry(0.05, 0.05, H, 12)), chrome(), x, H / 2, 0);
        add(geo('exhaust:tip', () => new THREE.CylinderGeometry(0.056, 0.056, 0.03, 12)), dark(), x, H, 0);
      }
      break;
    case 'flag': {
      add(geo('flag:pole', () => new THREE.CylinderGeometry(0.02, 0.02, H, 8)), fixed('pole', { color: 0xb0bec5, metalness: 0.6, roughness: 0.3 }), 0, H / 2, 0);
      const cloth = add(geo('flag:cloth', () => new THREE.PlaneGeometry(0.4, 0.26).rotateY(Math.PI / 2).translate(0, 0, -0.2)), twoSided(brick.color), 0, H - 0.14, 0);
      cloth.userData.flag = true;
      break;
    }
    case 'ladder': {
      const silver = fixed('silver', { color: 0xcfd8dc, metalness: 0.7, roughness: 0.3 });
      for (const x of [-0.18, 0.18]) add(geo('ladder:rail', () => box(0.04, 0.06, D)), silver, x, 0.1, 0);
      for (let i = 0; i < 6; i++) add(geo('ladder:rung', () => new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6).rotateZ(Math.PI / 2)), silver, 0, 0.1, -D / 2 + 0.25 + i * 0.5);
      break;
    }
    case 'toolbox':
      add(geo('toolbox:box', () => box(W * 0.95, H * 0.75, D * 0.9)), paint, 0, H * 0.375, 0);
      add(geo('toolbox:lid', () => box(W * 0.97, 0.03, D * 0.92)), dark(), 0, H * 0.76, 0);
      add(geo('toolbox:handle', () => new THREE.TorusGeometry(0.1, 0.015, 6, 12, Math.PI)), chrome(), 0, H * 0.78, 0);
      break;
    case 'crate': {
      const wood = fixed('wood', { color: 0xb07a43, roughness: 0.8 });
      const plank = fixed('woodDark', { color: 0x7a4f26, roughness: 0.8 });
      add(geo('crate:box', () => box(W * 0.96, H * 0.96, D * 0.96)), wood, 0, H / 2, 0);
      for (const y of [0.04, H - 0.04]) for (const z of [-1, 1]) add(geo('crate:strip', () => box(W * 0.98, 0.06, 0.02)), plank, 0, y, z * D * 0.49);
      for (const z of [-1, 1]) {
        const brace = add(geo('crate:brace', () => box(Math.hypot(W, H) * 0.85, 0.05, 0.02)), plank, 0, H / 2, z * D * 0.49);
        brace.rotation.z = Math.atan2(H, W);
      }
      break;
    }
    case 'trophy': {
      const gold = fixed('gold', { color: 0xffc107, metalness: 0.8, roughness: 0.25 });
      add(geo('trophy:base', () => box(0.22, 0.08, 0.22)), dark(), 0, 0.04, 0);
      add(geo('trophy:stem', () => new THREE.CylinderGeometry(0.025, 0.04, 0.2, 10)), gold, 0, 0.18, 0);
      add(geo('trophy:cup', () => new THREE.CylinderGeometry(0.13, 0.06, 0.2, 16)), gold, 0, 0.38, 0);
      for (const x of [-0.14, 0.14]) add(geo('trophy:handle', () => new THREE.TorusGeometry(0.05, 0.012, 6, 12)), gold, x, 0.4, 0);
      break;
    }
    case 'cannon': {
      const barrel = add(geo('cannon:barrel', () => new THREE.CylinderGeometry(0.08, 0.1, 0.7, 14).rotateX(Math.PI / 2)), paint, 0, 0.24, 0.1);
      barrel.userData.muzzle = true;
      add(geo('cannon:ring', () => new THREE.TorusGeometry(0.085, 0.015, 6, 14)), fixed('gold', { color: 0xffc107, metalness: 0.8, roughness: 0.25 }), 0, 0.24, 0.44);
      for (const x of [-0.13, 0.13]) add(geo('cannon:wheel', () => new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14).rotateZ(Math.PI / 2)), fixed('wood', { color: 0xb07a43, roughness: 0.8 }), x, 0.11, -0.05);
      break;
    }
    case 'windshield': {
      const glass = add(geo('windshield:glass', () => box(W * 0.95, H, 0.03)), fixed('glass', { color: 0xbfe6ff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 }), 0, H / 2, 0);
      glass.rotation.x = -0.35; // leans back toward the driver
      add(geo('windshield:frame', () => box(W * 0.97, 0.04, 0.06)), dark(), 0, 0.02, 0);
      break;
    }
```

- [ ] **Step 3: Check every part in the browser**

Reload http://localhost:8080 and, in the console, add a strip of `brickThumbnail(type, 'orange')` pictures for all 18 new types (the same strip snippet as before).

Expected:
- **Passenger seat:** the Police Officer sits in it.
- **Animals:** a brown dog with a white snout, floppy ears and a tail; an orange cat with pointy ears; a green parrot with a red head on a perch; a white bunny with long ears.
- **Rocket:** an orange tube with a white nose cone pointing forward and a dark nozzle at the back.
- **Wings:** wide and orange.
- **Propeller:** an orange blade at the front.
- **Siren:** red and blue domes.
- **Horn:** a chrome trumpet facing forward.
- **Exhaust:** two chrome pipes.
- **Flag:** a pole with an orange flag trailing backwards.
- **Ladder:** silver rails and rungs.
- **Tool box:** orange, with a handle.
- **Crate:** wooden with planks.
- **Trophy:** a gold cup.
- **Cannon:** an orange barrel on wooden wheels, facing forward.
- **Windshield:** see-through and leaning back.
- **Fixed colours:** the fixed-colour parts look the same when drawn in 'purple'.

Also expected: no console errors and `npm test` passes.

- [ ] **Step 4: Commit**

```bash
git add js/brickMesh.js
git commit -m "feat: 3D models for passengers, animals, gadgets and extras"
```

---
### Task 6: Workshop — tray tabs, passenger picker, guided riders

**Files:**
- Create: `js/riderPicker.js`
- Modify: `index.html`, `css/style.css`, `js/builder.js`, `js/guide.js`, `js/chooser.js`, `js/figuresScreen.js`, `js/main.js`

**Interfaces:**
- Consumes:
  - `TRAY_GROUPS` and `groupOf` (bricks.js);
  - `PRESET_RIDERS`, `DEFAULT_RIDER` and `resolveRider` (riders.js);
  - `setRiderResolver` and `createBrickMesh` (brickMesh.js);
  - `figureThumbnail` (thumbnails.js).
- Produces:
  - `pickRider(app) → Promise<rider string>`;
  - the guide context gains `showNeeded({ type, color } | null)`;
  - `app.figuresChanged()`, which bumps picture caches after friend changes.

- [ ] **Step 1: Tray tabs in `index.html`**

Replace:
```html
      <div id="colors" class="colors"></div>
      <div id="tray" class="tray"></div>
```
with:
```html
      <div id="colors" class="colors"></div>
      <div id="tray-tabs" class="tray-tabs"></div>
      <div id="tray" class="tray"></div>
```

- [ ] **Step 2: Styles (append to `css/style.css`)**

```css
/* More parts */
.tray-tabs { display: flex; justify-content: center; gap: 8px; margin-bottom: 6px; }
.tray-tab { height: 44px; padding: 0 14px; font-size: 16px; font-weight: 700; border-radius: 14px; background: var(--card); box-shadow: 0 3px 0 rgba(0, 0, 0, 0.18); }
.tray-tab.selected { color: #fff; background: var(--blue); }
.place-btn { bottom: 268px; }
.model-grid.three { grid-template-columns: repeat(3, 1fr); }
.model-grid.three img, .model-grid.three .free { width: 96px; height: 96px; }
@media (max-width: 760px), (max-height: 600px) {
  .tray-tab { height: 38px; padding: 0 8px; font-size: 13px; }
  .place-btn { bottom: 230px; }
}
```

- [ ] **Step 3: Write `js/riderPicker.js`**

```js
import { el, openModal } from './ui.js';
import { figureThumbnail } from './thumbnails.js';
import { PRESET_RIDERS, resolveRider } from './riders.js';

// "Who's riding?": friend figures first, then the ready-made characters. A seat needs a rider, so there is no cancel.
export function pickRider(app) {
  return new Promise(resolve => {
    const friends = app.figures.listFriends();
    let close = () => {};
    const tile = (rider, label) => el('button', {
      class: 'model-card',
      onclick: () => { close(); resolve(rider); },
    }, [el('img', { src: figureThumbnail(resolveRider(rider, friends)), alt: '' }), el('span', { text: label })]);
    const tiles = [
      ...friends.map(f => tile(`friend:${f.id}`, f.name)),
      ...Object.entries(PRESET_RIDERS).map(([key, preset]) => tile(`preset:${key}`, preset.name)),
    ];
    close = openModal({ title: "Who's riding?", body: [el('div', { class: 'model-grid three' }, tiles)] });
  });
}
```

- [ ] **Step 4: Builder changes (`js/builder.js`)**

Replace the bricks.js import line:
```js
import { BRICK_TYPES, COLORS, COLOR_KEYS, TRAY_ORDER, STUD, LAYER, makeChassis } from './bricks.js';
```
with:
```js
import { BRICK_TYPES, COLORS, COLOR_KEYS, TRAY_GROUPS, groupOf, STUD, LAYER, makeChassis } from './bricks.js';
import { DEFAULT_RIDER } from './riders.js';
import { pickRider } from './riderPicker.js';
```

After the line `const deleteBtn = $('[data-tool="delete"]', ui);` add:
```js
  const trayTabs = $('#tray-tabs', ui);
```

After `let dirty = false;` (in the state block) add:
```js
  let trayGroup = 'bricks';
  let needed = null; // guided mode: { type, color } of the part to highlight
```

After the `removeBrick` function add:
```js
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
```

In `tryPlace`, replace:
```js
    const brick = { type: cand.type, color: cand.color, x: cand.x, y: cand.y, z: cand.z, r: cand.r };
    addBrick(brick);
    undoStack.push({ op: 'add', brick });
    sfx.snap();
    hideGhost();
    return true;
```
with:
```js
    const brick = { type: cand.type, color: cand.color, x: cand.x, y: cand.y, z: cand.z, r: cand.r };
    if (brick.type === 'passengerSeat') brick.rider = DEFAULT_RIDER;
    addBrick(brick);
    undoStack.push({ op: 'add', brick });
    sfx.snap();
    hideGhost();
    if (brick.type === 'passengerSeat') chooseRider(brick);
    return true;
```

In `onTap`, replace:
```js
    lastHit = hit;
    const { cand } = candidateFor(hit);
    if (pointerType === 'mouse' || sameBrick(cand, ghostCand)) tryPlace(cand);
```
with:
```js
    // With the Passenger Seat selected, tapping a passenger seat swaps who rides instead of stacking on it.
    if (selectedType === 'passengerSeat' && hit.brick?.type === 'passengerSeat') {
      hideGhost();
      chooseRider(hit.brick);
      return;
    }
    lastHit = hit;
    const { cand } = candidateFor(hit);
    if (pointerType === 'mouse' || sameBrick(cand, ghostCand)) tryPlace(cand);
```

Replace the whole `buildTray` and `refreshTray` functions with:
```js
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
```

In the `createGuide({ … })` call, replace:
```js
      modelKey, scene, carGroup, ui, pick, candidateFor, addBrick,
```
with:
```js
      modelKey, scene, carGroup, ui, pick, candidateFor, addBrick, showNeeded,
```

- [ ] **Step 5: Guide uses the builder's highlighting and seats riders (`js/guide.js`)**

Replace the function signature line:
```js
export function createGuide({ modelKey, scene, carGroup, ui, pick, candidateFor, addBrick, selection, onComplete }) {
```
with:
```js
export function createGuide({ modelKey, scene, carGroup, ui, pick, candidateFor, addBrick, showNeeded, selection, onComplete }) {
```

In `showStep`, replace:
```js
    for (const item of ui.querySelectorAll('.tray-item')) item.classList.toggle('needed', item.dataset.type === step.type);
    for (const swatch of ui.querySelectorAll('.swatch')) swatch.classList.toggle('needed', swatch.dataset.color === step.color);
    ui.querySelector('.tray-item.needed')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
```
with:
```js
    showNeeded({ type: step.type, color: step.color });
```

Replace the `clearHighlights` function body:
```js
  function clearHighlights() {
    for (const node of ui.querySelectorAll('.needed')) node.classList.remove('needed');
  }
```
with:
```js
  function clearHighlights() {
    showNeeded(null);
  }
```

Replace:
```js
      addBrick({ type: step.type, color: step.color, x: step.x, y: step.y, z: step.z, r: step.r });
```
with:
```js
      addBrick({ type: step.type, color: step.color, x: step.x, y: step.y, z: step.z, r: step.r, ...(step.rider ? { rider: step.rider } : {}) });
```

- [ ] **Step 6: Three-column chooser (`js/chooser.js`)**

Replace:
```js
  close = openModal({ title: 'What do you want to build?', body: [el('div', { class: 'model-grid' }, cards)], buttons: [{ label: 'Back' }] });
```
with:
```js
  close = openModal({ title: 'What do you want to build?', body: [el('div', { class: 'model-grid three' }, cards)], buttons: [{ label: 'Back' }] });
```

- [ ] **Step 7: Riders know the friends; pictures refresh when friends change (`js/main.js`, `js/figuresScreen.js`)**

In `js/main.js` replace:
```js
import { setDriverFigure } from './brickMesh.js';
```
with:
```js
import { setDriverFigure, setRiderResolver } from './brickMesh.js';
import { resolveRider } from './riders.js';
```

Add to `app` after `figures: createFigureStore(),`:
```js
  // Car pictures show friends as passengers, so redraw them when friends change.
  figuresChanged() {
    setDriverFigure(app.figures.getMain() ?? DEFAULT_FIGURE);
  },
```

Replace:
```js
          app.figures.saveFriend({ ...saved, id: id ?? undefined });
```
with:
```js
          app.figures.saveFriend({ ...saved, id: id ?? undefined });
          app.figuresChanged();
```

Replace:
```js
setDriverFigure(app.figures.getMain() ?? DEFAULT_FIGURE);
```
with:
```js
setRiderResolver(rider => resolveRider(rider, app.figures.listFriends()));
setDriverFigure(app.figures.getMain() ?? DEFAULT_FIGURE);
```

In `js/figuresScreen.js` replace:
```js
          app.figures.removeFriend(figure.id);
```
with:
```js
          app.figures.removeFriend(figure.id);
          app.figuresChanged();
```

- [ ] **Step 8: Check it in the browser** (1024×768)

1. Free build: the tray shows tabs 🧱 🛞 🧑 🚀 🎁, and each tab shows only its parts.
2. 🧑 → Passenger Seat → place it → "Who's riding?" with friends + 5 characters, and no Cancel. Pick Pirate → the pirate sits in the seat.
3. With Passenger Seat still selected, tap that seat → the picker opens again; pick Chef → swapped. Select a Brick 2×2 and tap the seat → a ghost on top (stacking), with no picker.
4. Save the car → the garage picture shows the chef. Undo right after placing a seat → no stray picker effects.
5. Build → the chooser shows 7 models + Free Build in 3 columns.
6. Guided **Fire Truck**: each step switches the tray to the needed part's tab and highlights it. Colour dots are not highlighted for fixed-colour parts (ladder, siren, horn). The passenger step says "The Firefighter rides in it." and places the firefighter. Finish all 14 steps.
7. Repeat for Police Car, Rocket Car and Pirate Buggy. Use the temporary target-tapping hook from the figure-builder session, then remove it before committing.
8. Delete a friend who rides in a saved car → the garage picture shows the Police Officer instead.

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add index.html css/style.css js/riderPicker.js js/builder.js js/guide.js js/chooser.js js/figuresScreen.js js/main.js
git commit -m "feat: tabbed tray, choose who rides, new models in the chooser"
```

---

### Task 7: Gadgets in races

**Files:**
- Modify: `index.html`, `css/style.css`, `js/audio.js`, `js/race.js`, `tests/figures.test.js` (rename one test)

**Interfaces:**
- Consumes:
  - `gadgetsOf`, `createBoost` and `createCooldown` (gadgets.js);
  - `createConfetti` (confetti.js);
  - the part markers from Task 5;
  - `boost` input (vehiclePhysics.js).
- Produces:
  - `sfx.horn()`, `sfx.whoosh()`;
  - `createSirenSound() → { start(), stop() }`;
  - gadget buttons and keys in races.

- [ ] **Step 1: Gadget buttons (`index.html`)**

Inside `<section id="race" …>`, after the `flip-btn` button, add:
```html
    <div class="gadgets">
      <button class="gadget-btn hidden" data-gadget="boost">🚀<small>Boost</small></button>
      <button class="gadget-btn hidden" data-gadget="horn">📯<small>Honk</small></button>
      <button class="gadget-btn hidden" data-gadget="siren">🚨<small>Siren</small></button>
      <button class="gadget-btn hidden" data-gadget="confetti">🎉<small>Confetti</small></button>
    </div>
```

- [ ] **Step 2: Styles (append to `css/style.css`)**

```css
.gadgets { position: absolute; right: max(20px, env(safe-area-inset-right)); bottom: 180px; display: flex; flex-direction: row-reverse; gap: 10px; }
.gadget-btn { position: relative; width: 76px; height: 76px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 30px; line-height: 1; border-radius: 22px; box-shadow: var(--shadow); touch-action: none;
  background: linear-gradient(to top, #ffe082 var(--charge, 100%), var(--card) var(--charge, 100%)); }
.gadget-btn small { margin-top: 4px; font-size: 12px; font-weight: 700; }
.gadget-btn.on { background: var(--yellow); box-shadow: 0 0 0 4px #fff, var(--shadow); }
@media (max-width: 760px), (max-height: 600px) {
  .gadgets { bottom: 140px; }
  .gadget-btn { width: 62px; height: 62px; font-size: 24px; }
}
```

- [ ] **Step 3: Sounds (`js/audio.js`)**

Add to `sfx` after `flip()`:
```js
  horn() { tone(415, 0.14, { type: 'square', volume: 0.16 }); tone(415, 0.2, { type: 'square', volume: 0.16, delay: 0.2 }); },
  whoosh() { tone(180, 0.6, { type: 'sawtooth', volume: 0.12, slideTo: 60 }); tone(900, 0.4, { volume: 0.06, slideTo: 300 }); },
```

Append:
```js
// Wee-woo: a tone that hops between two notes until stopped.
export function createSirenSound() {
  let osc = null;
  let gain = null;
  let timer = 0;
  return {
    start() {
      if (!ctx || osc) return;
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      osc.type = 'triangle';
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      let high = false;
      const hop = () => {
        high = !high;
        osc.frequency.setTargetAtTime(high ? 960 : 650, ctx.currentTime, 0.05);
      };
      hop();
      timer = setInterval(hop, 450);
    },
    stop() {
      if (!osc) return;
      clearInterval(timer);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      osc.stop(ctx.currentTime + 0.2);
      osc = null;
    },
  };
}
```

- [ ] **Step 4: Race changes (`js/race.js`)**

Replace the imports:
```js
import { randomFigure } from './figures.js';
```
and
```js
import { sfx, createEngineSound } from './audio.js';
```
with:
```js
import { gadgetsOf, createBoost, createCooldown } from './gadgets.js';
import { createConfetti } from './confetti.js';
```
and
```js
import { sfx, createEngineSound, createSirenSound } from './audio.js';
```

Replace:
```js
// Picked so the AI drivers look different: racing helmet, cowboy hat, spiky blonde hair.
const AI_DRIVER_SEEDS = [8, 6, 7];
```
with:
```js
// Written out (not random) so new hats in the catalogue never change them.
const AI_DRIVERS = [
  { name: 'Turbo Tia', head: 'racing', headColor: 'green', face: 'grin', skin: 'tan', shirt: 'orange', print: 'badge', pants: 'black' },
  { name: 'Mighty Max', head: 'cowboy', headColor: 'orange', face: 'grin', skin: 'dark', shirt: 'yellow', print: 'stripe', pants: 'blue' },
  { name: 'Bix', head: 'spiky', headColor: 'blonde', face: 'determined', skin: 'light', shirt: 'white', print: 'star', pants: 'green' },
];
const GADGET_KEYS = { KeyB: 'boost', KeyH: 'horn', KeyN: 'siren', KeyC: 'confetti' };
```

Replace:
```js
driver: randomFigure(AI_DRIVER_SEEDS[i], o.name) })),
```
with:
```js
driver: AI_DRIVERS[i] })),
```

Replace:
```js
    mesh.add(body);
    scene.add(mesh);
```
with:
```js
    mesh.add(body);
    scene.add(mesh);
    const fx = { spinners: [], flags: [], flames: [], sirens: [], muzzles: [] };
    body.traverse(node => {
      if (node.userData.spin) fx.spinners.push(node);
      if (node.userData.flag) fx.flags.push(node);
      if (node.userData.flame) fx.flames.push(node);
      if (node.userData.sirenLight) fx.sirens.push(node);
      if (node.userData.muzzle) fx.muzzles.push(node);
    });
```
and in the racer object returned by that map, replace:
```js
    return { ...entry, id: slot, car, mesh, wheels, state: newRaceState(),
```
with:
```js
    return { ...entry, id: slot, car, mesh, wheels, fx, state: newRaceState(),
```

After the line `const countdownEl = $('#countdown', ui);` add:
```js
  // --- gadgets (player only) ---
  const gadgets = gadgetsOf(playerCar.bricks);
  const boost = createBoost();
  const horn = createCooldown(0.3);
  const confettiCooldown = createCooldown(1.5);
  const siren = createSirenSound();
  const confetti = createConfetti(scene);
  let sirenOn = false;
  const gadgetButtons = [...ui.querySelectorAll('[data-gadget]')];
  for (const button of gadgetButtons) {
    button.classList.toggle('hidden', !gadgets.includes(button.dataset.gadget));
    button.classList.remove('on');
  }

  function setSiren(onNow) {
    sirenOn = onNow;
    if (sirenOn) siren.start();
    else siren.stop();
  }

  function useGadget(action) {
    if (!gadgets.includes(action) || paused || phase !== 'racing') return;
    if (action === 'boost' && boost.trigger()) sfx.whoosh();
    if (action === 'horn' && horn.trigger()) sfx.horn();
    if (action === 'siren') setSiren(!sirenOn);
    if (action === 'confetti' && confettiCooldown.trigger()) {
      sfx.pop();
      for (const muzzle of player.fx.muzzles) confetti.burst(muzzle.localToWorld(new THREE.Vector3(0, 0, 0.4)), 60);
    }
  }

  function animateParts(dt) {
    for (const r of racers) {
      const speed = Math.abs(r.car.forwardSpeed());
      for (const s of r.fx.spinners) s.rotation.z += dt * (4 + speed * 2);
      for (const f of r.fx.flags) f.rotation.y = Math.sin(clock * 8 + r.id) * (0.15 + Math.min(speed, 15) * 0.02);
      for (const f of r.fx.flames) {
        f.visible = r.human && boost.active;
        f.scale.setScalar(0.85 + Math.random() * 0.3);
      }
    }
    const redTurn = Math.floor(clock * 4) % 2 === 0;
    for (const dome of player.fx.sirens) {
      const isRed = dome.userData.sirenLight === 0xe53935;
      dome.material.emissiveIntensity = !sirenOn ? 0.15 : isRed === redTurn ? 2.5 : 0.1;
    }
    for (const button of gadgetButtons) {
      if (button.dataset.gadget === 'boost') {
        button.style.setProperty('--charge', `${Math.round(boost.charge * 100)}%`);
        button.classList.toggle('on', boost.active);
      }
      if (button.dataset.gadget === 'siren') button.classList.toggle('on', sirenOn);
    }
  }
```

In the `on(ui, 'pointerdown', e => {` handler, add as its first line inside the function:
```js
    const gadget = e.target.closest('[data-gadget]')?.dataset.gadget;
    if (gadget) useGadget(gadget);
```

After that handler, add:
```js
  on(window, 'keydown', e => {
    if (GADGET_KEYS[e.code] && !e.repeat) useGadget(GADGET_KEYS[e.code]);
  });
```

In `pause()`, replace:
```js
    paused = true;
    controls.releaseAll();
```
with:
```js
    paused = true;
    controls.releaseAll();
    setSiren(false);
```

In `driverInput`, replace:
```js
    if (r.human && r.state.finishTime === null) return toDriveInput(controls);
```
with:
```js
    if (r.human && r.state.finishTime === null) return { ...toDriveInput(controls), boost: boost.active };
```

In `update(dt)`, replace:
```js
      if (phase === 'finished' && !podiumShown && clock - finishedAt > 1.8) showPodium();
```
with:
```js
      boost.update(dt);
      horn.update(dt);
      confettiCooldown.update(dt);
      confetti.update(dt);
      animateParts(dt);
      if (phase === 'finished' && !podiumShown && clock - finishedAt > 1.8) showPodium();
```

In `dispose()`, replace:
```js
      engine.stop();
```
with:
```js
      engine.stop();
      siren.stop();
      confetti.dispose();
```

- [ ] **Step 5: Tidy a test name (`tests/figures.test.js`)**

Replace:
```js
test('small seeds still give varied figures (AI drivers use seeds like 101, 138, 175)', () => {
```
with:
```js
test('small seeds still give varied figures', () => {
```

- [ ] **Step 6: Check it in the browser**

Save a car built from `modelToBricks(MODELS.rocketCar)` plus a horn, a siren and a cannon, then start a race with it.

Expected:
- 🚀 🎉 🚨 📯 buttons sit in a row above GO; a car without gadgets shows none.
- During the countdown, buttons do nothing.
- Using the temporary race hook (removed before commit) and `mode.update(1/60)` steps:
  - holding GO and pressing Boost (B) lights the button, shows flames, and gives a higher top speed than without boost;
  - the button fills back up over 6 s, and pressing again meanwhile does nothing.
- Siren (N) toggles: the domes flash red/blue and the button is highlighted. Pause stops the siren, and so does leaving the race.
- Confetti (C) bursts from the cannon; pressing again within 1.5 s does nothing.
- The propeller spins and flags flap on a car that has them.
- AI drivers are still racing helmet, cowboy hat and spiky blonde.
- No console errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html css/style.css js/audio.js js/race.js tests/figures.test.js
git commit -m "feat: boost, horn, siren and confetti buttons in races; spinning propellers, flapping flags"
```
