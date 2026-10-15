# Brick Racers — Design Spec

Date: 2026-10-15

## Purpose

A 3D web game for an 8-year-old: build a car from toy bricks (LEGO-style, but
generic — no LEGO name or logo), with step-by-step instructions to help, then
drive it and race computer cars. Played mainly on an **iPad** (touch).

Success looks like: he can, without adult help, pick a model, follow the
instructions to build it, race it on a track against computer cars, and finish
a race; or free-build his own car and race that.

## Decisions (from the user)

- Device: iPad / tablet, touch-first.
- Opponents: computer cars now; 2-player (friend) mode later — design must
  allow adding it without a rewrite. Not online.
- Building: guided models **and** free build.
- Physics: a real physics engine (chosen over arcade physics).

## Assumptions

- No accounts, no server, no internet needed beyond loading the page.
- Saved cars live in the browser's local storage on that iPad.
- English text; instruction text can also be read aloud via the browser's
  built-in speech (`speechSynthesis`).

## Screens

1. **Home** — big buttons: Build, Race, My Garage.
2. **Garage** — saved cars (thumbnail + name). Pick one to Race or Edit, or
   delete with a confirm.
3. **Build** — 3D workbench: car on a baseplate. One-finger drag orbits the
   camera, two-finger pinch zooms.
4. **Race** — track, touch controls, HUD.

## Building

### Bricks

About 10 brick types on a stud grid (1 stud = 1 grid unit; bricks are 1.2
units tall, plates 0.4):

| Brick         | Size (studs) | Role                                    |
|---------------|--------------|-----------------------------------------|
| Chassis plate | 4×8 plate    | Base; car must start from exactly one   |
| Plate         | 2×4 plate    | Filler                                  |
| Brick 1×2     | 1×2          | Body                                    |
| Brick 2×2     | 2×2          | Body                                    |
| Brick 2×4     | 2×4          | Body                                    |
| Slope         | 2×2 slope    | Body / looks                            |
| Wheel         | small, large | Attach to chassis sides; become physics wheels |
| Engine        | 2×2          | Adds engine force                       |
| Seat + driver | 2×2          | Required for racing                     |
| Steering wheel| 1×1          | Looks                                   |
| Spoiler       | 1×4          | Looks + a little downforce               |
| Headlights    | 1×2          | Looks                                   |

Eight bright colors. Each brick type defines size, mass and any stat effects in
one data table (`bricks.js`).

### Placement (tap-based)

- Tap a brick in the bottom tray (and a color swatch), then tap a spot on the
  car. A translucent **ghost** brick shows the snapped position before placing.
- Snapping: brick sits on top of the stud grid of whatever surface was tapped;
  placement is rejected (red ghost) if it overlaps an existing brick or floats.
- Buttons: Rotate (90°), Delete mode, Undo, Clear (with confirm).

### Guided mode

- Choose one of 3 models: **Race Car**, **Monster Truck**, **Buggy**. Each is a
  list of steps: `{type, color, position, rotation}`.
- Instruction card shows "Step N of M", a picture of the brick in its color,
  and short text ("Put a red 2×4 brick here"). Speaker button reads it aloud.
- The target spot shows a glowing, bouncing ghost. The tray highlights the
  needed brick and color.
- Tapping the correct spot with the correct brick: snap, click sound, small
  confetti, advance. Wrong brick/spot: gentle wiggle + hint, nothing placed.
- Finish: celebration, name the car, save to Garage, "Race it!" button.

### Free build

- Any placement allowed by snapping rules.
- Race-ready check shown as a hint bubble checklist: chassis, 4 wheels (≥2 per
  side, front and back), an engine, a seat. Race button enabled only when all
  pass.

## Car from bricks (physics)

- Engine: **cannon-es** `RaycastVehicle`.
- Chassis body: compound of box shapes, one per non-wheel brick; mass = sum of
  brick masses; center of mass is the real computed center (so tall/heavy
  builds tip more — intended).
- Wheels: each wheel brick becomes a raycast wheel at its position; large
  wheels have bigger radius and suspension travel.
- Stats from bricks: engine force from engine count (capped), grip from wheel
  count/size, top speed limited by mass/engine ratio. Every race-ready car must
  be drivable — values clamped to a safe range.
- Anti-frustration: if upside down or stuck (near-zero speed while throttling)
  for 2 s, auto-right the car in place. A **Flip me!** button does it
  immediately. Falling off the world → reset to last checkpoint.

## Racing

- **Controls (touch):** left side ◀ ▶ steering; right side GO (gas) and STOP
  (brake / reverse when stopped); Flip me!; Pause. Large hit areas,
  multi-touch (steer + gas together). Keyboard arrows also work (for testing
  on a computer).
- **Camera:** chase camera behind the car, smoothed.
- **Track:** one toy-like loop: flat road with curbs, gentle curves, a ramp, a
  bridge, cones, and a small jump. Built from simple meshes plus static physics
  bodies; walls/barriers keep cars on the road in most places.
- **Race:** 3-2-1-GO countdown, 3 laps, 4 cars (player + 3 AI).
- **Checkpoints:** ordered gates around the track; a lap counts only after
  passing all in order. Position = laps, then checkpoint index, then distance
  to next checkpoint.
- **AI cars:** ready-made brick cars (the 3 guided models in different colors)
  that steer toward points on a racing line using the same vehicle physics.
  "Friendly" difficulty with rubber-banding: slower when far ahead of the
  player, slightly faster when far behind.
- **HUD:** position (1st/2nd…), lap N/3, mini-map with car dots.
- **Finish:** podium screen with trophy for top 3, "Race again" and "Back to
  garage".
- **Future 2-player:** each racer is a `Racer` object with an input source
  (touch, keyboard, AI) and its own camera; adding a second human racer and a
  split viewport should not require changing race logic.

## Code structure

Plain HTML + ES modules, no build step. Three.js and cannon-es loaded via an
import map from a CDN with pinned versions.

```
index.html
css/style.css
js/main.js          screen switching
js/bricks.js        brick types, colors, stats table, mesh factory
js/builder.js       workbench scene, placement, ghost, undo
js/snapping.js      pure grid/overlap logic (testable)
js/instructions.js  guided models + step checking
js/car.js           bricks -> cannon-es vehicle + three meshes
js/carStats.js      pure stat calculation (testable)
js/track.js         track meshes, physics bodies, checkpoints, racing line
js/race.js          countdown, laps, positions, finish
js/ai.js            AI driver input source
js/input.js         touch + keyboard input sources
js/ui.js            HUD, menus, instruction card
js/audio.js         generated sound effects (Web Audio)
js/storage.js       save/load garage (localStorage)
tests/              Node test runner tests for pure logic
```

A small static dev server (`npx serve` or similar) lets the iPad open it on the
home Wi-Fi.

## Testing

- **Automated (node:test):** snapping/overlap, guided step checking, race-ready
  check, car stats clamping, lap/checkpoint and position ordering, storage
  round-trip.
- **Manual in browser at iPad size:** complete a guided build, free-build a
  car, finish a full 3-lap race, flip recovery, save/load from Garage.

## Out of scope (for now)

Online multiplayer, accounts, multiple tracks, 2-player split screen (designed
for, not built), in-game purchases or ads.
