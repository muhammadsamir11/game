# Brick Racers — Trucks, Trailers and the Car Truck — Design Spec

Date: 2026-10-22
Builds on: the base game, mini city, city garage, more parts, supercars, play-together and fancy-car-showroom specs.

## Purpose
- Murad (8, iPad) builds his own cars and parks them in the city garage. His parent asked for **trucks and trailers he can build**, and a **car truck** (a car transporter): he drives the cars from his garage onto it, then drives the truck with all of them on board.
- A truck pulling something adds a new kind of driving: reversing up to a trailer, hooking on, and swinging round corners with a long load behind.

## Decisions (from the user)
- He **builds trucks and trailers** from bricks ("trails" means trailers).
- A **car truck** he loads by **driving his garage cars onto it himself**, then drives.
- The car truck carries **8 cars** ("keep it 8").
- Everything else below was proposed by the designer and approved by the user ("That's the picture", "nothing" wrong or missing). Those calls are marked *(my call)* where it matters.

## Goals
- Building a truck or a trailer feels just like building a car: same tray, colours, gadgets, step-by-step guide.
- Hooking on is easy enough for an 8-year-old on an iPad: reverse roughly up to a trailer, a big button appears, *clunk*.
- Towing feels real but forgiving: the trailer swings behind, but never traps him. **Flip me!** always fixes any mess.
- Loading the car truck is the fun part: drive a car up the ramp, the lift takes it up, straps click, the counter goes up, and he runs back to the garage for the next one.
- A full car truck driving round town with 8 of his own cars on it.

## Non-goals
- Trailers are not driven on their own and never race.
- The car truck and its load don't go racing.
- Hooked trailers and the car truck's load are not remembered between visits. Every visit starts with his own trucks and trailers unhooked in their bays, the car truck empty and hooked to its cab, and every car back in its garage spot.
- **Play together:** friends see his truck (it's bricks, like any car) but not his trailer or the cars on the car truck. Sharing those is a later idea.
- No new money, prizes or missions for trucks in this batch.

## Anti-goals (it would be wrong if…)
- **A car is lost or changed.** Loading and unloading never touch his saved cars or their garage spots.
- **He gets stuck for good.** A jack-knifed, tipped or wedged truck and trailer must always come right with **Flip me!**, without leaving the city.
- **Physics blows up.** A trailer must never fling the truck into the air, shake, sink into the road or come unhooked by itself.
- **Trucks are faster than cars.** Trucks are a bit slower than cars. The Bugatti stays the fastest thing in the game.
- **The garage changes for cars.** His cars keep their numbered garage spots exactly as now.
- **Murad's name is announced.** If it appears (see the car truck), it's quietly painted on, never pointed out.
- **It's fiddly.** No precise driving along a narrow high deck, and no tiny buttons.

## Constraints
- Same stack: Three.js 0.170 + cannon-es 0.20, ES modules, no build step, `node:test`. Pure rule modules (sizes, slots, hitch reach, deck packing, bay assignment) stay free of three and the DOM so they can be tested.
- **iPad performance:** the city already runs close to the limit (see `js/frameWatch.js`). Loaded cars are drawn as merged static meshes (like parked cars) and add no physics bodies of their own.
- **Works offline**, and old saves keep working: every saved car stays a car.
- **Play together:** cars are sent as brick lists, and the server checks every brick with `isValidBrick` (`server/rooms.js`). New brick types must be valid there (same deploy). A tablet on an older version that meets an unknown brick type must skip it rather than break.
- **Garage size:** trucks with trailers don't fit the garage's 6 × 5 m spots or its turns, and the car truck is taller than the 3.7 m floors. Trucks, trailers and the car truck live outside, in a new Truck Yard.

## 1. Building trucks and trailers
- **Build chooser:** next to 🧱 Free Build, two more big brick buttons: **🚚 Truck** ("Build your own truck") and **🔗 Trailer** ("Build a trailer to pull"). Below the supercars, a new section **🚚 Trucks, step by step** with **one guided truck** (a big-rig cab) *(my call)*.
- **Each starts from its own pre-placed chassis**, a new chassis piece that can't be deleted (like today's chassis) and never appears in the tray:
  - **Truck chassis:** longer than a car's (about 2 m × 6 m) with a **tow hook at the back** and room for **6 wheels**: one pair at the front and two pairs at the back, like a big rig.
  - **Trailer chassis:** long and flat (about 2 m × 8 m) with a **towbar at the front** and wheel places **at the back only**.
- **Same tray, colours, gadgets and people** as a car. The builder area, baseplate and camera grow to fit the longer chassis.
- **Keep the hook clear:** nothing can be built where the trailer's towbar swings (the very back of a truck, the front of a trailer). The builder says so kindly ("Keep the hook clear for trailers!").
- **Ready checklist:**
  - Truck: **6 wheels** (front pair + both back pairs), **an engine**, **a seat**.
  - Trailer: **wheels at the back** (at least one pair). No engine or seat needed. An engine on a trailer is just for looks, and seats on a trailer stay empty.
- **Names:** default "My Truck" / "My Trailer".
- **When he taps Done:** a truck or trailer is saved, then the city opens with him **standing next to it in the Truck Yard** (instead of going straight to a race, as cars do). The guided truck's "ready!" popup offers 🏠 Home, 🔧 Build more, **🏙 Drive it!**.

## 2. Saving, My cars, races
- Trucks and trailers are saved in the same garage list as cars. **What it is comes from its chassis piece**, so old saves need nothing new.
- **🚗 My cars** lists them with the cars, marked **🚚** (truck) or **🔗** (trailer).
  - Trucks: 🏁 Race, 🔧 Change, 🗑 Delete.
  - Trailers: **🏙 City** (opens the city next to it), 🔧 Change, 🗑 Delete. No Race.
- **Trucks can race** like cars. Trailers never come into a race.
- **"New car"** in My cars still opens the build chooser, which now has Truck and Trailer too.

## 3. The Truck Yard
- **Where:** block (1, 0), just across the road from the garage's door. Today it's a houses block. Its houses go, and the pizza mission's delivery house on that block moves to a house of a different colour on another block (the delivery houses stay one of each colour).
- **Look:** a fenced yard with a wide gate facing the garage, painted numbered bays, and a big **🚚 TRUCK YARD** sign. It shows on the mini-map as a landmark.
- **Bays:** one long bay for the car truck, and numbered bays for **his own trucks and trailers**: at least 4 truck bays and 4 trailer bays *(my call; the builder may fit more)*. Like garage spots, each truck or trailer keeps its bay between visits. Any that don't fit wait in 🚗 My cars, with the same kind of message the garage gives.
- **Parking:** getting out of a truck in an empty truck bay parks it there. Unhooking a trailer in an empty trailer bay parks it there. Anywhere else, it just stays put for this visit, like a car left in the street.
- **His cars still live in the garage.** Trucks and trailers never take garage spots and don't count toward the "garage is full" message.

## 4. Hooking and towing
- **Any truck pulls any trailer:** his own trucks, the car truck's cab, his trailers, and the car truck's own car trailer. One hook size fits all.
- **Hooking on:** driving a truck with nothing behind it, he reverses up to the front of a trailer. When the hook is close to the towbar, a big **🔗 Hook on** button appears and the towbar glows. Tap, *clunk*, and the trailer is on. (On a keyboard, E hooks on whenever the button is showing.)
- **Unhooking:** when the truck is stopped with a trailer on, a **🔓 Unhook** button shows. The trailer stays where it is.
- **Towing:**
  - The trailer swings behind on a pivot at the hook, rides its own wheels with suspension, and brakes with the truck.
  - The truck pulls harder when towing, so it isn't sluggish.
  - Long trailers get **steering back wheels** (like real long trailers), so they don't cut across corners into buildings.
  - The camera pulls back and up so he can see the trailer.
- **Flip me!** sets the truck upright and the trailer straight behind it, still hooked.
- **Getting out** while towing is fine: the trailer stays hooked. Trailers themselves have no Get in.
- **The 🏁 arch:** a truck alone races, the same as a car. A truck with a trailer on gets a friendly toast instead: "Unhook your trailer to race! 🔗". The car truck's cab never races and gets "The car truck stays in town! 🚚".
- **The garage** *(my call)*:
  - **A truck on its own** may drive into the garage. Today's "too tall to drive in the garage" refusal at Get in stays for cars parked in the garage, but **never stops him getting into a truck in the Truck Yard**, however tall. A truck too tall for the garage just bumps against the first floor's edge at the door and backs out.
  - **Anything towing** gets a gentle stop at the garage door (an invisible barrier that only a towing truck meets) and a toast: "Unhook your trailer first! 🔗". Inside, the aisles are too tight for a rig, and Flip me! couldn't promise to find clear space.

## 5. The car truck
- **What it is:** a ready-made, toy-brick-style **big-rig cab** hooked to a **two-deck car trailer**: **4 cars on the bottom deck and 4 on the top deck, 8 in all**. At the back there's a **ramp** with a **lift**. It waits, empty and hooked up, in its long bay in the Truck Yard at the start of every visit.
- **A little surprise:** the cab doors say **MURAD TRANSPORT** in small letters *(my call)*. It's never mentioned anywhere.
- **Loading (he drives each car on himself):**
  1. He gets into one of **his own cars** in the garage, drives it across the road and up to the back of the car truck, onto the glowing lift pad at the foot of the ramp.
  2. When the car stops on the pad, he pops out onto the ground beside the ramp. The lift raises the car and rolls it to the **next free spot**: the bottom deck from the front backwards, then the top deck from the front backwards *(my call)*.
  3. Straps click shut. The counter painted on the trailer's side goes up ("🚗 3 / 8"), with a toast and a sound.
  4. He walks back to the garage for the next one.
- **Which cars can ride:** only his own cars (built cars, supercars, prize cars). A borrowed traffic car gets "Only your own cars ride on the car truck! 😄". Trucks and trailers can't go on it.
  - Every ready-made model, supercar and prize car must fit: deck spots are at least 3 m wide (every car is, counting its wheels), and the bottom deck leaves room for the tallest, the G-Wagon (about 2.6 m). The limo, being long, may use up two cars' room on its deck *(my call)*.
  - A home-built car that's too wide or too tall for any free spot gets "This car is too big for the car truck!".
- **When it's full:** "The car truck is full! 🚚". The lift pad stops glowing.
- **Driving it:** he gets into the cab and drives it like any truck with a trailer. Carried cars are strapped on: they stay put over bumps, ramps and jumps, and nobody sits in them.
- **Unloading:** with the car truck stopped anywhere (hooked or not), he walks to the back of the ramp. **🚗 Get in** appears for the **last car loaded**. Tapping it brings that car down on the lift, puts him in it on the ground behind the ramp, facing away from the truck, and he drives off forwards *(my call)*. Last on, first off.
- **Unloaded cars** are like any car he leaves in the street: they stay where he left them for this visit, and next visit they're back in their garage spots.
- **Another truck can pull the car trailer:** if he unhooks the car trailer from its cab, his own truck can hook it, load and all.

## 6. Play together
- Each tablet has its own Truck Yard and car truck. Nothing about trucks is shared except what's already shared for cars.
- Friends see his **truck** as his car (sent as bricks, like any car), but **not** a trailer behind it or the load on a car truck (non-goal, above).
- New chassis types must pass the server's `isValidBrick`. Older tablets today break on brick types they don't know, so the play-together protocol version goes up (as it did for the prize parts) and an older tablet is asked to update instead of meeting a truck.

## 7. Testing
- `npm test` keeps passing, plus new rule tests for: the new chassis pieces and wheel places, building rules (bounds, hook-clear zones, ready checklists), what a saved build is (car / truck / trailer), Truck Yard bays and their saving, hook reach, the car truck's deck packing (fits / too big / full / last-on-first-off), and the moved pizza delivery house.
- In the browser (the game's normal check): build a truck and a trailer, hook on, tow round a few corners, Flip me! with a trailer, load all 8 cars, drive the full car truck, unload, race a truck, and check My cars and the build chooser on an iPad-sized screen.

## Left to the builder
- Exact sizes of the chassis pieces, decks, ramp, lift and bays; how many bays fit (at least 4 + 4); colours and the yard's layout.
- Truck speeds and pulling strength (within the anti-goals), trailer masses, hook reach, the steering-trailer-wheels formula and the camera distances.
- The guided truck's recipe, the lift and strap animations, sounds, and how trucks, trailers and the car truck look on the mini-map.
- Whether the car truck's cab is built from bricks (a fixed recipe like the prize cars) or drawn like the city's buildings.
