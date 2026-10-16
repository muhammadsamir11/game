# Brick Racers — Mini City 3a: City & Garage Design Spec

Date: 2026-10-16
Builds on: the base game, the figure builder and the more-parts specs.
Roadmap: the mini city (sub-project 3) is split in three steps, each designed, built and reviewed on its own:
- **3a City & garage** (this spec)
- **3b Things to do:** coins, stunt park, missions
- **3c Shop & unlocks**

## Purpose

"My Garage" becomes a kid-friendly mini city, like a toy GTA without crime or violence. The 8-year-old walks around as his own figure, gets into any of his cars, drives around a toy-brick town with gentle traffic and people, and parks his cars in a multi-storey garage building.

Success: from the home screen he can open the city, walk to a car, get in, drive out of the garage, around the town and back, park in a spot, get out, and find the car there next visit. He can also reach the cars list (race, change, delete, new) and the race track from the city.

## Decisions (from the user)

- Walk and drive. He gets in and out of his cars, GTA-style.
- Some traffic and people. Traffic stops at lights and for things in front of it; people hop out of the way; nobody gets hurt.
- The city is split into 3a, 3b and 3c, starting with 3a.
- Boost keeps working only while GO is held (decided after sub-project 2).

## The city

- **Grid:** 4 × 4 blocks. Each block is 36 m square, with 3 m sidewalks on its edges. Roads are 12 m wide (two 6 m lanes). One block plus one road is 48 m, so the city spans about 204 m.
- **The map is written in code** (`cityMap.js`), the same every visit. It lists:
  - what each block holds: garage, houses, shops, towers, park, pizza shop (for 3b), shop "coming soon" (for 3c);
  - the race gate;
  - spawn points;
  - traffic loops;
  - pedestrian paths.
- **Edges:** a low curb wall around the city keeps cars in. Grass, trees and a lake lie outside it.
- **Buildings:** bright toy-brick look with studded roofs. Each has one static physics box, and similar meshes are merged or instanced to keep draw calls low.
- **Traffic lights:** at every intersection. They show red/green and switch direction every 8 s; the two directions are never green together.

## Garage building

- Occupies one corner block.
- Has 3 floors (ground, 1st, 2nd), each 3 m high, linked by driveable ramps. Physics uses static boxes for floors, ramps and walls.
- Has 12 numbered parking spots, 4 per floor, each painted with its number.
- **Spot assignment** (saved in `localStorage` under `brickRacers.city.v1` as `{ spots: { [carId]: spotIndex } }`):
  - cars keep their spot;
  - a new car gets the lowest free spot;
  - deleting a car frees its spot;
  - with more than 12 cars, the extras aren't placed in the city but stay in the cars list;
  - unreadable data → cars get spots in garage order, with no crash.
- Parked cars are drawn and given a static collision box. One becomes a real vehicle only when he gets into it, which keeps physics cheap.

## Walking and driving

**Arriving:** "🚗 My Garage" on the home screen opens the city. He starts on foot on the garage ground floor, near his cars. The Race button still goes straight to a race, as before.

**On foot:**
- He is his main figure on a physics body (cannon sphere, radius 0.4 m, no rotation).
- A thumb joystick (bottom-left) sets walking direction and speed, up to about 4 m/s.
- He walks up ramps, is blocked by walls, buildings and cars, and the figure faces where he walks.
- Keyboard: WASD/arrows.

**Getting in:**
- Within 3 m of one of his cars, a big **🚗 Get in** button appears (keyboard: E).
- Getting in turns the car into a vehicle; his figure is the driver.

**Driving:**
- The same vehicle physics as races, and the same drive pad and keys.
- Plus **🚶 Get out** (E), **🙃 Flip me!**, and that car's gadget buttons (boost, horn, siren, confetti). The gadget code moves into a shared module used by both race and city.

**Getting out:**
- The figure appears beside the driver's door, on a free side.
- The car stays where it is, braked.
- If it is inside a garage spot, nearly stopped (< 1 m/s) and the spot is free or already his, it is saved there: "Parked in spot 7! 🅿️".

**Next visit:** every car starts back in its saved spot.

## Traffic and people

**Traffic:**
- 6 toy cars, each a simple brick-car mesh with a kinematic physics box, driving fixed lane loops at 7 m/s.
- They stop at a red light, and when anything is within 7 m ahead in their lane: his car, him, a person, or another traffic car.
- They start again when the way is clear.
- Kinematic bodies push his car gently but are never pushed or knocked over themselves.

**People:**
- 10 figures walking sidewalk paths at 1.4 m/s, crossing at crossings.
- When he comes within 4 m (on foot or driving), a person hops sideways away from him with a small jump and a "whoa!" sound, then carries on.
- People have no physics, so nobody can be hit or hurt.

## Screen

- **Top:** 🏠 Home (with "Leave the city?" when driving), ⏸ Pause (Keep going / Home), **🚗 My cars**, and a city mini-map.
- **🚗 My cars** opens the existing garage list as a screen on top of the city; "🏙 Back to city" returns.
  - From the list: Race works as before; Change opens the workshop; Delete works as before.
  - Coming back to the city rebuilds the parked cars.
- **Mini-map:** roads, the garage, the race gate, his position and heading.
- **Portrait:** the existing "turn sideways" overlay, with Home, also covers the city.

## Race gate

A big 🏁 arch at the edge of the city. Driving through it with his car starts a race with that car. After the podium, "Back to city" returns to the city on foot beside that car's spot.

## Code structure (new / changed)

```
js/cityMap.js       blocks, roads, intersections, garage spots, spawn points, traffic loops, pedestrian paths   (pure, tested)
js/cityState.js     spot assignment + save/load                                                                   (pure, tested)
js/traffic.js       traffic stopping rule, light phases, pedestrian dodge                                         (pure, tested)
js/walker.js        cannon body for walking + joystick → velocity                                                 (cannon only, tested in Node)
js/joystick.js      on-screen joystick (DOM) → { x, y }
js/gadgetHud.js     gadget buttons/keys/effects shared by race and city (moved out of race.js)
js/cityWorld.js     Three.js + physics for roads, buildings, garage, lights, gate, edges
js/city.js          the city mode: walking/driving, get in/out, parking, traffic, people, HUD
js/race.js          uses gadgetHud; "Back to city" when started from the city
js/main.js, index.html, css   My Garage opens the city; city HUD markup
```

## Testing

**Automated (node:test):**
- `cityMap`:
  - 16 blocks, with exactly one garage, one race gate and 12 spots, none overlapping;
  - each traffic loop is closed and stays on road lanes;
  - every intersection has a light;
  - spawn points and pedestrian paths are on sidewalks, not inside buildings.
- `cityState`: keep, assign new, free on delete, more than 12 cars, corrupt data.
- `traffic`:
  - stops for an obstacle ahead within 7 m, but not one behind or in the other lane;
  - stops at red and goes on green;
  - lights are never green both ways;
  - a person dodges away from the player only within 4 m.
- `walker` (cannon in Node): moves with the joystick, stops when released, is blocked by a wall, climbs a ramp.

**In the browser:**
- walk, get in/out, drive up to the 2nd floor and park in a spot, get out, leave and come back → the car is in that spot;
- traffic stops at lights and for him;
- people hop away;
- My cars list round trip;
- race gate → race → back to city;
- frame time measured (< 8 ms update + render on the Mac at 1024×768);
- no console errors.

## Out of scope (later steps)

Coins, stunt park, missions (3b); the shop and unlocks (3c); weather and day/night; other players.
