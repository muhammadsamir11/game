# Supercars + Install & Offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Brick Racers installable and fully offline in Chrome and Safari, and add six real-brand supercars with new supercar bricks, badges and top speed.

**Architecture:**
- **Offline:** the run-time libraries (three, cannon-es) and the Fredoka font are vendored into the repo by a node script, and a service worker precaches a generated file list.
- **Supercars:** new brick types plus a pure `brands.js`. `carStats` learns engine power and a V12 speed bonus. `brickMesh` draws the new kinds, with badge textures on canvas. Models are new `MODELS` entries with `brand` and `realTopSpeed`.

**Tech Stack:** Three.js 0.170, cannon-es 0.20, ES modules, node scripts (no run-time build), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-17-supercars-offline-design.md`

## Global Constraints
- No host other than the page's own in `index.html` or `css/*.css` (no CDN, no Google Fonts).
- `vendor/three/` keeps three's own folder shape (`build/three.module.js`, `examples/jsm/...`) so the `three/addons/` import paths keep working.
- The service worker serves cache-first. Cache name = `brick-racers-${hash}`, and `sw-files.js` holds `{ version: hash, files: [...] }`.
- **Brand names** (exact): Lamborghini, Ferrari, Bugatti, McLaren, `${HERO_NAME} Motors`. **Badges** are original canvas drawings, never official logo art.
- **Speed:** each engine part has `power` (engine 1, v12 2). `e = min(sum power, 3)`; top speed = `14 + 3(e − 1) + 2.5·min(v12 count, 2) − mass penalty`, clamped to 12–24 m/s; engine force as before, from `e`.
- **`realTopSpeed` km/h:** aventador 350, huracan 325, sf90 340, laferrari 350, chiron 420, p1 350.

## Review Focus
1. **First visit offline before the service worker has finished caching.** The game must not half-load or keep a broken cache. The next online visit fixes it.
2. **An update while installed.** A new version must replace the old cache, never mix old and new files (the module imports must all come from one version).
3. **Old saves:** cars saved before this change (no `badge` field, old engine without `power`) must still load, race and show stats.
4. **A badge brick with an unknown or missing brand** (old data, typed storage): it must draw the default badge, not crash.
5. **Safari specifics:** no `beforeinstallprompt`, standalone detection (`navigator.standalone`), and service workers inside a home-screen app.

---

### Task 1: Vendored libraries and font
**Files:** Create `scripts/vendor.mjs`, `vendor/` (generated), `fonts/` (generated), `tests/offline.test.js`. Modify `package.json` (devDependencies `three@0.170.0`, `@fontsource/fredoka`; script `"vendor": "node scripts/vendor.mjs"`), `index.html` (import map → `./vendor/...`; drop the Google Fonts links), `css/style.css` (`@font-face` for Fredoka 500/600/700 latin woff2 from `fonts/`).
- [ ] Test (fails first): `index.html` and every `css/*.css` contain no `http://` or `https://` URL; every import-map target exists on disk; `vendor/three/build/three.module.js`, `vendor/three/examples/jsm/controls/OrbitControls.js`, `vendor/three/examples/jsm/utils/BufferGeometryUtils.js` and `vendor/cannon-es/cannon-es.js` exist; each `@font-face` `url()` exists.
- [ ] `scripts/vendor.mjs` copies from `node_modules`: `three/build/three.module.js` (+ any sibling it imports), the `three/examples/jsm` files the game imports (follow their relative imports), `cannon-es/dist/cannon-es.js`, and the Fredoka latin 500/600/700 woff2 files.
- [ ] Browser: the game loads with no external requests (network list shows only localhost) and no console errors.
- [ ] Commit `feat: run without the internet: vendored three, cannon-es and Fredoka`.

### Task 2: Icons and manifest
**Files:** Create `scripts/icons.mjs` (pure node PNG encoder with zlib + crc32), `icons/icon-192.png`, `icons/icon-512.png`, `icons/maskable-512.png`, `icons/apple-touch-icon.png` (180). Modify `manifest.webmanifest`, `index.html` (`<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`).
- [ ] Test: the manifest has `id`, `scope: "./"`, `start_url: "./"`, `display: "fullscreen"`, `orientation: "landscape"`, and icons with sizes 192 / 512 (`purpose: "any"`) and 512 (`purpose: "maskable"`). Every icon file exists, is a PNG (signature check) and its IHDR width/height match the declared size. `index.html` links the apple-touch icon.
- [ ] Commit `feat: app icons and a full manifest`.

### Task 3: Service worker and install button
**Files:** Create `sw.js`, `scripts/sw-files.mjs` (writes `sw-files.js`), `sw-files.js`, `js/install.js`. Modify `js/main.js` (register the worker, wire install), `index.html` (`<button class="install-btn hidden" data-action="install">⬇ Install</button>` on home), `css/style.css`, `server.js` (`.woff2: font/woff2`, `.png` already), `package.json` (script `"sw": "node scripts/sw-files.mjs"`; `vendor` runs it too).
- **`sw-files.js`:** `self.SW_FILES = { version, files }`.
  - `files` = `./`, `index.html`, `manifest.webmanifest`, and every file under `css/`, `js/`, `vendor/`, `fonts/`, `icons/`.
  - `version` = the first 12 hex characters of the sha256 over the sorted (path + contents).
- **`sw.js`:**
  - `importScripts('sw-files.js')`;
  - install: `caches.open('brick-racers-' + version).addAll(files)` then `skipWaiting()`;
  - activate: delete other `brick-racers-*` caches, then `clients.claim()`;
  - fetch (GET, same origin): cache match, else network (and put same-origin 200s in the cache);
  - navigation requests fall back to the cached `index.html`.
- **`js/install.js`** (DOM):
  - `setupInstall({ button, tipEl, storage })` listens for `beforeinstallprompt` (stash it, show the button), and on click calls `prompt()`;
  - shows the Safari tip once when `/iPad|iPhone|iPod|Macintosh/` matches with `navigator.maxTouchPoints > 1` and the app isn't standalone (`navigator.standalone || matchMedia('(display-mode: standalone)').matches`). The once-flag is stored under `brickRacers.installTip.v1`.
- [ ] Test (fails first): `sw-files.js` lists exactly the files on disk (the same rule) and its version equals the recomputed hash; `sw.js` uses `SW_FILES`.
- [ ] Browser: the worker registers and activates. Then go offline (DevTools network offline via `navigator` check: stop the preview server), reload → the game still loads and runs the city. Restart the server, change a file + `npm run sw` → the new version activates on the next load and the old cache is gone.
- [ ] Commit `feat: installable, offline-ready app (service worker + install button)`.

### Task 4: Supercar data — bricks, brands, speed
**Files:** Modify `js/bricks.js`, `js/carStats.js`, `tests/carStats.test.js`, `tests/snapping.test.js` (or `tests/parts.test.js`). Create `js/brands.js`, `tests/brands.test.js`.
- **`COLORS.lime`** = `{ name: 'Lime', hex: 0x9ccc65 }`.
- **New `BRICK_TYPES`:**
  - `superNose` { 'Supercar Nose', 4, 2, 2, mass 5, kind 'wedge' };
  - `airScoop` { 'Air Scoop', 1, 2, 2, mass 1, kind 'scoop' };
  - `racingWing` { 'Racing Wing', 4, 1, 4, mass 2, kind 'spoiler', tall: true };
  - `scissorDoor` { 'Scissor Door', 1, 2, 3, mass 2, kind 'door' };
  - `v12` { 'V12 Engine', 2, 2, 2, mass 18, kind 'engine', power: 2 };
  - `superWheel` { 'Super Wheel', 1, 2, 3, mass 7, kind 'wheel', radius: 0.38, rim: true };
  - `badge` { 'Badge', 2, 1, 1, mass 1, kind 'badge', fixedColor: true };
  - `namePlate` { 'Name Plate', 4, 1, 1, mass 1, kind 'nameplate', fixedColor: true }.
- **Existing types:** `engine` gets `power: 1`.
- **Tray:** a new `TRAY_GROUPS` entry `{ key: 'supercar', label: '🏎 Supercar', types: [the 8] }`, after wheels.
- **`isValidBrick`:** also allows `b.badge === undefined || typeof b.badge === 'string'`.
- **`brands.js`:**
  - `BRANDS = { lamborghini, ferrari, bugatti, mclaren, hero }`, each `{ name, mark, bg, fg, shape: 'shield' | 'oval' | 'star' }`; `hero.name = `${HERO_NAME} Motors``;
  - `DEFAULT_BADGE = 'hero'`; `resolveBadge(key)` returns the brand, or the hero brand for unknown/missing keys.
- **`carStats`:**
  - engines counted by `power` (a type without `power` but with kind `engine` counts 1);
  - `raceReadiness.engine` true for any `power > 0` part;
  - the V12 bonus as in Global Constraints;
  - `stats.v12s` exposed.
- [ ] Tests (fail first):
  - a V12 alone makes a car race-ready;
  - one V12 = power 2, so `engineForce === 1050`;
  - the top speed with one V12 is 2.5 above two plain engines (same mass);
  - two V12s reach the cap of 24;
  - old cars without `power` give the same stats as before (the existing tests stay green);
  - `isValidBrick` accepts `badge` strings and rejects numbers;
  - every new type is in exactly one tray group;
  - `resolveBadge('nope')` → the hero brand; brand names exact.
- [ ] Commit `feat: supercar bricks, brands and V12 speed`.

### Task 5: Drawing the supercar parts
**Files:** Modify `js/brickMesh.js` (cases `wedge`, `scoop`, `door`, `badge`, `nameplate`; `spoiler` with `t.tall`; `engine` draws chrome cylinders when `t.power > 1`; `createWheelMesh` low-profile tyre and chrome rim when `t.rim`). Create `js/badgeArt.js` (DOM canvas → `drawBadge(ctx, brand, w, h)`, `drawNamePlate(ctx, brand, w, h)`; cached `CanvasTexture`s live in brickMesh).
- **Badge:** a shield / oval / star in `bg` with `mark` in `fg`, bold Fredoka, on a transparent background. It goes on a 2-stud plane at the front (+z) face, standing up.
- **Name plate:** `brand.name` in `fg` on `bg`, on the back (−z) face.
- **Wedge:** blockGeometry with a nose that drops from 2 layers to a sliver at +z, no studs on the front row.
- [ ] Browser: a free-build car with every new part, shown from the front and back. The badges and plate read clearly, nothing z-fights, and the thumbnails render. No console errors. `npm test` green.
- [ ] Commit `feat: draw the supercar parts, badges and name plates`.

### Task 6: Badge picker
**Files:** Create `js/badgePicker.js` (`pickBadge(app) → Promise<brandKey>`: a modal "Which badge?" with tiles of badge images and brand names). Modify `js/builder.js` (placing a `badge` or `namePlate` in free build sets `badge = DEFAULT_BADGE` then asks; tapping a placed badge brick asks again and redraws, mirroring the passenger-seat rider flow), `js/thumbnails.js` if a badge thumbnail helper is needed.
- [ ] Browser: placing a badge asks and shows the chosen brand; tapping it changes it; the car saves and reloads with its badge.
- [ ] Commit `feat: pick your supercar badge`.

### Task 7: The six supercars
**Files:** Modify `js/instructions.js` (`MODELS.aventador`, `huracan`, `sf90`, `laferrari`, `chiron`, `p1`, each with `name`, `brand`, `realTopSpeed`, and `steps`), `js/chooser.js` (supercar cards show the badge image and "🏁 {realTopSpeed} km/h"), `css/style.css`, `tests/instructions.test.js`, `tests/carStats.test.js`.
- **Shared layout** (chassis x −2..1, z −4..3):
  - 4 `superWheel` in the corner slots;
  - `v12` at (−1, 1, −4);
  - `airScoop` at (−2, 1, −4) and (1, 1, −4);
  - `seat` at (−1, 1, −1);
  - `scissorDoor` at (−2, 1, −1) and (1, 1, −1);
  - two `brick12` r=1 at (−2, 1, −2) and (0, 1, −2);
  - `steering` at (−1, 1, 1);
  - `superNose` at (−2, 1, 2);
  - `badge` at (−1, 3, 2);
  - `racingWing` (or `spoiler` for the Huracán / SF90) at (−2, 3, −3);
  - `namePlate` at (−2, 3, −4).
  - Each step carries `badge` = its brand.
  - The Chiron adds a second `v12` at (−1, 3, −4) and lifts its wing / plate to y = 5.
- **Colours:**
  - Aventador: orange, with black doors and wing;
  - Huracán: lime, with black;
  - SF90: red, with black, and a `spoiler`;
  - LaFerrari: red, with a black nose and doors;
  - Chiron: blue nose and doors, black body;
  - P1: yellow, with black.
- [ ] Tests (fail first):
  - every model step `canPlace`s in order (the existing test covers new models automatically);
  - each supercar is race-ready;
  - each uses `v12`, `superWheel`, `badge`, `namePlate`, and its steps' `badge` equals `model.brand`;
  - the brands and `realTopSpeed` match the Global Constraints;
  - the slowest supercar's `topSpeed` is above the fastest non-supercar model's;
  - the Chiron has the highest `topSpeed`;
  - `describeStep` for a badge step names the brand: "Find the Badge … The Lamborghini badge goes on it."
- [ ] Browser: build one of each step by step; the chooser shows the six cards with badges and km/h; race the Chiron (it's fastest); drive one in the city (jump + flip); no console errors.
- [ ] Commit `feat: six supercars to build — Lamborghini, Ferrari, Bugatti, McLaren`.

### Task 8: README and checks
**Files:** Modify `README.md` (supercars line; "Install it: Chrome → Install button; iPad Safari → Share → Add to Home Screen; works offline").
- [ ] Measure the frame time in the city with a supercar (< 8 ms). Re-run the offline check after all files changed (`npm run sw`, then the test).
- [ ] Commit `docs: supercars and installing the game`.
