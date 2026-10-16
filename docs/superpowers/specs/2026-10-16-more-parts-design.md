# Brick Racers — More Parts Design Spec

Date: 2026-10-16
Builds on: `2026-10-15-brick-racers-design.md` and `2026-10-15-figure-builder-design.md`
Roadmap: this is **sub-project 2 of 3**. Sub-project 3 (mini city) comes later.

## Purpose

Give the 8-year-old many more things to put on his cars: passengers (his friend figures or ready-made characters), animals, gadgets — some of which do something in races — and fun extras. Four new step-by-step models show the new parts off.

Success means he can:
- find any new part quickly in a tabbed tray;
- seat a friend or a ready-made character as a passenger;
- build the four new models without help;
- in a race, press Boost, Honk, Siren and Confetti on a car that has those gadgets.

## Decisions (from the user)

- Add all four groups: passengers & figures, animals, gadgets, fun extras.
- Some gadgets do something in races; the rest are for looks.
- The child picks who rides in a passenger seat, from his friend figures plus ready-made characters, and can swap the rider later.
- New guided models: Police car, Fire truck, Rocket car, Pirate buggy.

## New parts

Sizes are grid units: `w` studs across × `d` studs long × `h` plate layers tall; a brick is 3 layers.

"Fixed colour" means the part always uses its own colours: the colour dots don't change it, and guided steps don't check colour for it.

| Key | Name | w×d×h | Mass | Group | Fixed colour | Notes |
|-----|------|-------|------|-------|--------------|-------|
| passengerSeat | Passenger Seat | 2×2×3 | 6 | people | no | Seat back + a rider figure |
| dog | Dog | 1×2×2 | 2 | people | yes | Brown with white muzzle |
| cat | Cat | 1×1×2 | 1 | people | yes | Orange tabby |
| parrot | Parrot | 1×1×3 | 1 | people | yes | Green and red, on a little perch |
| bunny | Bunny | 1×1×2 | 1 | people | yes | White, long ears |
| rocket | Rocket Booster | 2×2×2 | 6 | gadgets | no | Points backwards; flames while boosting |
| wings | Wings | 6×2×1 | 4 | gadgets | no | 6 studs wide, so it overhangs a 4-wide car by one stud each side |
| propeller | Propeller | 1×1×2 | 1 | gadgets | no | Spins while driving |
| siren | Siren Light | 2×1×1 | 1 | gadgets | yes | Red + blue domes; flash when on |
| horn | Horn | 1×1×1 | 1 | gadgets | yes | Chrome trumpet horn |
| exhaust | Exhaust Pipes | 1×1×3 | 1 | gadgets | yes | Two chrome pipes |
| flag | Flag | 1×1×5 | 1 | extras | no | Pole + flag in the chosen colour; flaps |
| ladder | Ladder | 1×6×1 | 3 | extras | yes | Silver |
| toolbox | Tool Box | 2×1×2 | 2 | extras | no | With handle |
| crate | Cargo Crate | 2×2×3 | 4 | extras | yes | Wooden |
| trophy | Trophy | 1×1×3 | 1 | extras | yes | Gold cup |
| cannon | Confetti Cannon | 1×2×2 | 3 | gadgets | no | Barrel points forward |
| windshield | Windshield | 4×1×2 | 1 | extras | yes | See-through |

Existing parts are grouped as: bricks = plate24, brick12, brick22, brick24, slope22; wheels = wheelSmall, wheelLarge; gadgets = engine, steering, spoiler, lights; people = seat.

All new parts follow the existing placement rules: on the stud grid, supported by a non-wheel brick below, no overlap, inside the baseplate bounds. Wings fit because they only need one supported stud. None of the new parts count toward race readiness.

## Tray

The tray gets five tabs above it — 🧱 Bricks · 🛞 Wheels · 🧑 People & animals · 🚀 Gadgets · 🎁 Extras — and shows only the parts in the chosen tab.

In guided mode the tray switches to the tab of the needed part automatically, so the highlighted part is always visible.

## Passengers

- Placing a passenger seat (free build) opens **"Who's riding?"**. It shows his friend figures and five ready-made characters: Police Officer, Firefighter, Astronaut, Pirate, Chef. Tapping one seats them; there is no cancel, because the seat needs a rider.
- With the Passenger Seat selected in the tray, tapping an existing passenger seat opens the same picker to swap the rider. Tapping it with any other part selected places on top as usual.
- A brick gains an optional `rider` field: `'preset:<key>'` or `'friend:<id>'`. It is saved with the car.
- A rider that can't be found (deleted friend, unknown preset, missing field) shows the Police Officer.
- Ready-made characters need four new heads, all fixed colour: police cap (navy), fire helmet (red), pirate hat (black), chef hat (white). They also need a new face, eye patch. These heads and the face become choices in the figure maker too.
- Guided steps for a passenger seat name the rider ("…and seat the Firefighter in it!"). The seat is placed with that preset rider; no picker opens in guided mode.

## Gadgets in races

A gadget button appears above the GO/STOP pad only if the player's car has that gadget.

| Button | Gadget | Effect |
|--------|--------|--------|
| 🚀 Boost | rocket | 2 s of ×1.6 engine force and +40% top speed, flames + whoosh. Then a 6 s recharge, during which the button fills back up. |
| 📯 Honk | horn | "Beep-beep" sound (0.3 s cooldown). |
| 🚨 Siren | siren | Toggles flashing red/blue siren lights and a wee-woo sound loop. |
| 🎉 Confetti | cannon | Confetti burst from the cannon + pop, then a 1.5 s cooldown. |

Keyboard (for testing): B boost, H horn, N siren, C confetti.

Looks-only animation: propellers spin with speed and flags flap. AI cars don't use gadgets.

AI drivers become fixed figures written in code — racing helmet, cowboy hat, spiky blonde hair — instead of random seeds, so new heads in the catalogue don't change them.

## New guided models

Each model is 12–16 steps, buildable in order under the existing rules, and race-ready at the end. These are verified by the existing per-model tests.

| Model | Main colour | Must include |
|-------|-------------|--------------|
| Police Car | blue + white | siren, passenger seat (Police Officer), dog |
| Fire Truck | red | ladder, passenger seat (Firefighter), siren, horn |
| Rocket Car | white + orange | rocket booster, wings, passenger seat (Astronaut) |
| Pirate Buggy | black + yellow | flag, confetti cannon, parrot, passenger seat (Pirate), cargo crate |

The chooser shows the 7 models + Free Build in a 3-column grid.

## Code structure (new / changed)

```
js/bricks.js        new BRICK_TYPES (+ group, fixedColor, action), TRAY_GROUPS; isValidBrick accepts optional rider
js/riders.js        PRESET_RIDERS, resolveRider(rider, friends) → figure                         (pure, tested)
js/gadgets.js       gadgetsOf(bricks), createCooldown, createBoost (timers)                       (pure, tested)
js/figures.js       new heads (policeCap, fireHelmet, pirateHat, chefHat) + eyepatch face
js/figureMesh.js    the new heads and face
js/instructions.js  4 new models; checkPlacement ignores colour for fixed-colour parts; describeStep names riders
js/storage.js       keeps the rider field
js/vehiclePhysics.js  boost input (force ×1.6, top speed +40%)                                     (tested)
js/brickMesh.js     meshes for all new parts; passenger seat draws its resolved rider; setRiderResolver
js/builder.js       tray tabs, passenger picker and swap
js/guide.js         auto-switch tray tab; riders in guided steps
js/race.js          gadget buttons, effects, sounds, propeller/flag animation, fixed AI drivers
js/audio.js         horn, siren loop, whoosh, pop
index.html / css    tray tabs, gadget buttons, rider picker
```

## Testing

**Automated (node:test):**
- Every new type has a valid footprint, mass and group; fixed-colour types ignore colour.
- Placement rules for the new parts, including overhanging wings.
- `isValidBrick` accepts a valid rider and rejects a non-string rider.
- Storage round-trips riders.
- `resolveRider`: a preset, a friend, a deleted friend → police, junk → police.
- `gadgetsOf` finds exactly the gadgets on a car.
- Boost timing: active 2 s, then recharge 6 s, and it can't re-trigger while active or recharging.
- Cooldown timing.
- Physics: a boosting car goes faster than the same car without boost.
- All 7 models build in order and are race-ready.
- `checkPlacement` ignores colour for fixed-colour parts.
- New heads and the new face are valid.

**In the browser:**
- Every new part's 3D look and tray picture.
- Tray tabs, and the guided auto-tab.
- Passenger picker and swap.
- All 4 new models built start to finish.
- Each gadget button in a race (simulated): boost raises speed, siren lights flash, confetti appears.
- No console errors.

## Out of scope

AI using gadgets; animals that move on their own; the mini city (sub-project 3).
