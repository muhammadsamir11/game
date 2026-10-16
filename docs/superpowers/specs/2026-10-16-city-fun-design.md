# Brick Racers — Mini City 3b: Coins, Stunt Park, Missions — Design Spec

Date: 2026-10-16
Builds on: the mini city 3a spec (`2026-10-16-city-garage-design.md`) and everything before it.
Roadmap: 3a City & garage (done) → **3b Things to do** (this spec) → 3c Shop & unlocks.

## Purpose

3a gave Murad (8, plays on an iPad) a toy city to walk and drive around. 3b gives him reasons to keep driving:
- coins to grab;
- a stunt park where jumps and flips get cheered;
- short, friendly missions from the pizza shop.

Hidden in the city are a few surprises with **his own name** on them, for him to discover.

Success looks like this:
- He drives out of the garage and chases a line of coins.
- He finds the stunt park, lands a jump and sees "AWESOME FLIP! +20 🪙".
- He takes a pizza mission and delivers it.
- He notices his name on the signs, then finds a gold statue of himself after his first mission. He shouts for his dad.
- He wants to come back tomorrow to grow his coin pile, which 3c will let him spend.

## Decisions

- **From the user:**
  - All three parts: coins, the stunt park and missions.
  - Murad's name appears somewhere in the city as a surprise.
- **Earlier constraints (still binding):**
  - Kid-safe: no crime, weapons or hurting anyone.
  - Missions never punish.
  - iPad, touch-first, landscape.
  - Boost works only while GO is held.
- **Everything else here is the designer's call** (the user said "keep improving"), marked *(designer's call)* where it matters.

## Goals, non-goals, anti-goals

**Goals:**
- Things to do everywhere in the city, so free driving always has a small reward nearby.
- Stunts feel big and generous: easy to trigger, loud celebration.
- Missions are short (1–2 minutes), clear without reading (a big emoji plus a spoken line), and always end happily.
- Coins persist, ready for the 3c shop.
- The "Murad" surprises are discovered, never announced.

**Non-goals (later or never):**
- Spending coins, the shop and unlocks (3c).
- New cars or parts.
- Leaderboards, sharing, multiplayer.
- Day/night and weather.

**Anti-goals** (failure even if it works):
- He loses coins, or anything gets taken away.
- Failure screens that feel like losing. A run-out timer only says "So close! Try again?".
- Missions that pop up and pull him away from what he's doing. Missions start only when he chooses one at the pizza shop.
- Walls of text he must read.
- Spoiling the surprise. No on-screen text says "your name is hidden".
- Anything scary or violent.

## Constraints

- **Same stack as before:** Three.js + cannon-es from the import map, ES modules, no build step, `node:test`.
- **Module rules:**
  - Pure logic goes in pure modules: no three, no DOM.
  - The city mode keeps its pattern.
  - Shared DOM must not be touched after `dispose` (new mode built before old disposed).
- **Performance:** frame time stays < 8 ms (update + render) at 1024×768 on the Mac. Coins must be instanced.
- **Physics:** new static bodies carry `SURFACE_MATERIAL` and `aabbNeedsUpdate = true`.
- **Kids:** touch targets ≥ 60 px. Text is short and big. Key lines are also spoken with the game's existing speech helper in `audio.js`.

## The city additions

### 1. Coins
- **Spread:** about 70 small gold coins (worth 1) and 10 big gold coins (worth 5) on fixed spots, written in code like the rest of the map:
  - rows of 5 down the middle of roads;
  - little clusters on sidewalks and in the pond park;
  - lines up the garage ramps and on its floors, including the open-air top deck;
  - arcs over the stunt park jumps.
- **Big coins sit in tricky places** *(designer's call)*: mid-air over the jumps, the corners of the garage's open-air top deck (the 2nd floor; there is no roof level above it), behind the race arch, the top of the half-pipe.
- **Look:** spinning, bobbing gold discs with a soft glow. Every coin of one kind is drawn by one `InstancedMesh`.
- **Collecting:** touching a coin (his figure within 1.2 m, or his car's centre within 2 m, height difference < 3 m; < 1.5 m for the two mid-air coins past the big kicker, so they need a jump) grabs it.
  - A "ding" plays: a brighter chord for big coins.
  - A "+1" or "+5" floats up.
  - The counter bumps.
- **Respawn:** a collected coin comes back 90 s later. Every coin is fresh on each visit *(designer's call)*: the city never runs dry, and only the total is saved.
- **Counter:** "🪙 123" in the city's top bar, next to 🚗 My cars.

### 2. Murad's Stunt Park
- **Where:** the park block at grid (1,1), next to the pizza shop. It loses its pond and trees and becomes a stunt park. The park at (2,3) keeps its pond.
- **Entrance:** a big arch reading **MURAD'S STUNT PARK** stands over the entrance.
- **Contents** *(designer's call; sizes are the builder's to tune so every stock model can do them)*:
  - **A small kicker and a big kicker** facing each other, each with a landing slope. Getting air is easy at normal speed.
  - **A half-pipe:** two banked walls facing each other, built from 3 tilted slabs each at increasing angles (about 20°, 40°, 60°), so a car can swing up one side and back down.
  - **A ring of fire:** an upright brick hoop with flickering toy flames, placed in the flight path after the big kicker. It is decoration only; its posts are solid.
- **Physics:** all of it is static boxes, like the garage ramps.
- **Stunts count anywhere in the city.** The park just makes them easy.

**Air control** *(designer's call; without it a car can never flip or spin, because a RaycastVehicle only steers through wheels on the ground)*:
- **Controls:** while the car is airborne (the same 0.15 s rule as below), the **same drive pad and keys** turn the car in the air, so there are no new buttons to learn:
  - ◀ / ▶ spin it left or right (around its up axis);
  - GO tips the nose down (a front flip);
  - STOP tips the nose up (a back flip).
- **Where it lives:** the torque is added in `vehiclePhysics` as an option the city turns on (`airControl`). Races stay as they are.
- **Tuning:** holding one button through a HUGE AIR jump gives about one full turn (roughly 0.9 s per turn). A flip off the big kicker is easy but not automatic.
- **Landing helper:** with no air button held and the car within 60° of upright, a gentle torque levels it, so plain jumps land on the wheels.
- **Tests** (cannon in Node):
  - a car launched into the air with GO held turns ≥ 300° forward within 1.2 s;
  - with nothing held, a tilted airborne car ends up more level;
  - on the ground, air control does nothing.
- **First-time tip:** the first time he gets BIG AIR, a tip card says (and speaks) "In the air, hold GO to flip!" *(designer's call)*.

**Stunt detection** goes in a pure module, fed each frame with:
- whether any wheel touches the ground (RaycastVehicle wheel contact);
- the car's up vector;
- how far the car has turned this frame around its forward, right and up axes.

**Rules:**
- **Airborne:** no wheel in contact for more than 0.15 s.
- **Landing:** at least 2 wheels back in contact while upright (up·y > 0.7). It scores what happened in the air:

| Stunt | Condition | Reward |
|---|---|---|
| BIG AIR! | air time ≥ 0.7 s | +5 |
| HUGE AIR! | air time ≥ 1.4 s (replaces BIG AIR) | +10 |
| FLIP! | turned ≥ 300° around the right axis | +20 |
| BARREL ROLL! | turned ≥ 300° around the forward axis | +20 |
| 360 SPIN! | turned ≥ 330° around the up axis | +15 |
| RING OF FIRE! | the car centre passes through the hoop while airborne | +10 (awarded immediately) |

- Combos add up and show as one line, e.g. "HUGE AIR + FLIP! +30 🪙".
- **Landing on the roof or side** (not upright within 1 s of touching down) shows "Oops! 🙃" and awards nothing. "Flip me!" is still there.
- **Celebration:**
  - a big bouncy popup in the middle of the screen;
  - confetti at the car;
  - a cheer sound;
  - the coins are added.
- **Tests** feed made-up frame sequences, e.g. a 1 s jump with a full forward rotation landing upright → FLIP + BIG AIR.

### 3. Missions from MURAD'S PIZZA
- **Start point:** the pizza shop's sign now reads **MURAD'S PIZZA 🍕**. On the sidewalk in front of it, a glowing ring pulses when a mission is ready.
- **Opening:** driving or walking into the ring opens a mission card:
  - a big emoji, a one-line title, and the line spoken aloud;
  - **Let's go! ▶** and **Not now**.
- **While a mission runs:**
  - a banner at the top centre shows its emoji, a short line and the timer if it has one, plus a small ✖ to quit;
  - the target shows as a tall glowing beam in the world, a flashing star on the mini-map, and a big arrow floating over him or his car pointing at it *(designer's call)*.
- **Mission kinds** *(designer's call)*:

| Kind | What he does | Timer | Reward |
|---|---|---|---|
| 🍕 Pizza delivery | "Take this pizza to the {colour} house!" A pizza box sits on his car roof, or in his hands on foot. Reach the target's front door (within 4 m). Targets are 6 fixed house fronts, with the house colour named. | 25 s + 1 s per 5 m of straight-line distance | +30 |
| 🐶 Lost puppy | "Biscuit the puppy is lost! Can you find him?" A little brick puppy hides at one of 6 fixed spots. The mini-map shows a big search circle (25 m) around it, not the exact spot. Within 15 m he hears woofs. Within 3 m the puppy jumps happily: "You found Biscuit!" | none | +40 |
| 🔵 Coin trail | "Grab all 10 blue coins!" 10 blue coins appear along a fixed route (one of 3). Blue coins also count +1 each. | 60 s | +30 |
| 🤸 Stunt star | "Do a FLIP in Murad's Stunt Park!" (or BIG AIR, or RING OF FIRE, rotating). | none | +40 |

- **Order:** missions come round in a fixed rotation (pizza, puppy, coin trail, stunt, pizza…). Each time it picks the next target or variant, so it doesn't repeat back-to-back.
- **After a mission ends:** the ring lights up again 5 s later.
- **Success:** fanfare, confetti, and "Mission complete! +30 🪙".
- **Timer runs out:** "So close! Try again?" with **Try again** (same mission, fresh timer) and **Not now**. Nothing is lost.
- **Leaving the city** (Home, My cars, race gate) quietly cancels the active mission.

### 4. The Murad surprises
- **The name lives in one constant**, `HERO_NAME = 'Murad'`, used for:
  - the **MURAD'S PIZZA 🍕** sign;
  - the **MURAD'S STUNT PARK** arch;
  - the statue's plaque.
- **The statue:**
  - **What:** a **gold statue of his own main figure** (the figure mesh with a shiny gold material, about 3× size) on a pedestal in the pond park at (2,3). A plaque reads "MURAD 🏆".
  - **When it appears:** after his **first** completed mission. It stays forever after, because missions done ≥ 1 is saved.
  - **The hint:** the moment it appears, a toast says "Something shiny appeared in the park… ✨". It doesn't name him, so the discovery stays his.
- The name is fixed as "Murad" whatever he named his figure *(designer's call)*: the user asked for his name.

## Screen changes
- **Top bar:** gains the 🪙 counter.
- **Mini-map:**
  - a 🍕 marker at the mission ring (glowing when a mission is ready);
  - a stunt-park icon;
  - the mission target star and search circle while a mission runs.
- **New pieces:** the mission banner (top centre), the stunt popup (centre) and the floating "+N" coin numbers.
- **Old pieces:** everything from 3a keeps working: walking, driving, gadgets, parking, race gate, My cars, pause and portrait overlay.

## Saving
- **Key:** a new localStorage key `brickRacers.progress.v1` holds `{ coins, missionsDone }`.
- **Store:** a pure store, like `cityState`.
- **Bad data:** unreadable or missing data is treated as `{ coins: 0, missionsDone: 0 }`, with no crash. Values that aren't whole numbers ≥ 0 are reset to 0.
- **Coins only go up** in 3b.

## Sounds
New `sfx` entries:
- `coin` (bright ding);
- `bigCoin` (chord);
- `cheer` (stunt);
- `woof` (puppy);
- `tick` (last 5 s of a timer, gentle).

Mission titles and "Mission complete!" are spoken.

## Code structure (new / changed)
```
js/coins.js          coin spots (map data), pickup rule, respawn timers        (pure, tested)
js/stunts.js         airtime/rotation tracker → stunt events                   (pure, tested)
js/vehiclePhysics.js airControl option: the pad turns the car while airborne, plus a landing helper (tested in Node)
js/vehiclePhysics.js airControl option: pad turns the car while airborne + landing helper (tested in Node)
js/missions.js       mission definitions, rotation, run state machine           (pure, tested)
js/progress.js       coins + missionsDone save/load                             (pure, tested)
js/stuntPark.js      stunt park geometry as static boxes (data)                 (pure, tested)
js/cityFun.js        Three.js side: coin instances, stunt park meshes, mission ring/beam/arrow,
                     puppy, pizza box, statue, signs; wires the pure modules into the city
js/cityWorld.js      park (1,1) becomes the stunt park; pizza sign text uses HERO_NAME
js/city.js           creates cityFun, feeds it the player/car each frame, HUD hooks
js/audio.js          new sfx
index.html, css      coin counter, mission banner, mission card, stunt popup
```

## Testing
**Automated (`node:test`):**
- **`coins`:**
  - every spot is somewhere reachable (road, sidewalk, park, garage floor or open-air top deck, or the airspace over a stunt park jump), never inside a building or garage wall;
  - pickup radius on foot vs car;
  - respawn after 90 s.
- **`stunts`:**
  - small hops (< 0.7 s) give nothing;
  - BIG and HUGE AIR boundaries;
  - flip, roll and spin thresholds;
  - combos add;
  - an upside-down landing gives "oops" and no coins;
  - ring detection only while airborne.
- **`missions`:**
  - the rotation order;
  - no target repeats back-to-back;
  - start → complete pays once;
  - timer out → try again restarts the same mission with a fresh timer;
  - cancel pays nothing;
  - the 5 s ready delay;
  - delivery timer formula.
- **`progress`:** load/save, corrupt data, coins never negative.
- **`stuntPark`:**
  - every box lies inside the park block's inner area;
  - the half-pipe slabs face each other;
  - the hoop's flight-path point lies on the big kicker's line.

**In the browser:**
- drive through a coin row: the counter rises, and coins respawn after 90 s;
- all 4 stock models (race car, monster truck, buggy, police car) get BIG AIR off the big kicker at normal top speed;
- a flip off the big kicker by holding GO in the air, a spin by holding ◀, and plain jumps landing on the wheels with nothing held;
- each mission kind can be completed;
- a delivery timeout shows "So close!", then Try again works;
- the statue appears after the first mission and is still there on the next visit;
- both Murad signs are visible;
- leaving mid-mission cancels it cleanly;
- the frame time budget is measured;
- no console errors.

## Left to the builder
- Exact coin coordinates, coin routes, puppy hiding spots and the 6 delivery houses, within the rules above.
- Stunt park dimensions and angles, tuned so the stunts are fun and reachable with every stock car.
- Colours, glow, sounds and popup animation, in the game's existing bright toy style.
- Small tuning of thresholds, with the tests updated to match.
