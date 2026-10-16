# Play Together — online multiplayer design

Date: 2026-10-17

## Context

The user has two kids: one on an iPad, one on an Android tablet. They want to play Brick Racers together, and with friends in other homes. They want to drive around the city together and race each other. They asked for something creative.

What exists today:
- A plain web game (three.js + cannon-es, ES modules, no bundler).
- Installed as a PWA from the https Dokploy site. `server.js` is a tiny static `node:http` server.
- No networking at all. The original spec ruled out online play, but the race loop already treats every racer the same, so more human racers fit without a rewrite.

Decisions from the user:
- **Talking:** emoji stickers only, with no typing.
- **City games:** all four — Police tag, Coin rush, Follow the leader, Treasure hunt.

My calls (marked so the user can push back):
- **Joining:** a secret **4-picture room code**, because kids can't type codes. There is no public lobby and no list of rooms.
- **Room size:** up to 4 players, which is the race grid size.
- **Server:** the existing `server.js`. It gets a WebSocket relay at `/play`, so the Dokploy site serves both the game and the multiplayer, with no new service and no accounts.
- **Physics:** each tablet runs its own physics for its own car. Friends' cars are smoothed copies, built as kinematic bodies like city traffic, so you can still bump into them.
- **Shared events:** the server referees anything that must be fair (who grabbed a coin, who got tagged, who found the treasure, race finish order).
- **Room owner:** the player who makes the room (👑) can send a player out of the room. This is a parent safety valve.
- **Offline:** single player is unchanged and still works offline. **Play together** simply says "Needs internet" when it can't connect.

## What the kids see

1. **Home → 👫 Play together** (a new big button).
   - **Make a room:** shows 4 big pictures (e.g. 🦖🍕🚀⭐) and a "Tell your friend these pictures!" line, read aloud with the existing `speak()`.
   - **Join a room:** a grid of 12 big picture buttons. Tap 4, and wrong codes shake.
   - A **Rejoin** button appears when this tablet was in a room that is still open.
2. **Room lobby.**
   - Each player shows as a figure-head card with their name and chosen car.
   - **Choose my car:** picks from My cars. With an empty garage, the player gets the ready-made race car.
   - The room owner taps **🏙 City** or **🏁 Race**, and everyone goes there together.
3. **City together.**
   - Friends drive or walk around with a name tag above them.
   - Stickers: tap 😀 and pick one of 8 big stickers, which pops above your head on every screen.
   - Your horn, siren, boost flames and confetti show and sound on friends' screens.
   - Friends appear as coloured dots on the mini-map.
   - Tap a friend's chip to **zap next to them**, for when someone gets lost.
   - Driving through the 🏁 arch starts **Race everyone!** for the whole room.
   - A 🎮 button opens the city games. Anyone can start one; there's a 3-2-1 banner, then a timer and a scoreboard, and a podium at the end.
     - **Police tag (2+ players):** one player is the police, with the siren and flashing lights forced on. Drive within about 4 m of someone to tag them, and there are no tag-backs for 3 s. Score is the seconds you were *not* the police. 2-minute rounds.
     - **Coin rush:** 30 big sparkly rush coins appear on `COIN_SPOTS`. The first player to reach one gets it, and it vanishes for everyone. The most coins wins, and rush coins also go into your own coin pile. 2 minutes.
     - **Follow the leader (2+ players):** the leader rotates every 30 s, so everyone leads once, and leaves a sparkle trail. Followers within 12 m earn a ⭐ every second.
     - **Treasure hunt:** a chest with a light beam appears, and an on-screen arrow points to it, beeping faster as you get closer. The first player to reach it scores, then it moves. Best of 5 chests or 3 minutes.
   - Coin rush and Treasure hunt also work with one player.
   - Personal coins, stunts and pizza missions stay per tablet, as they are today.
4. **Race together.**
   - Human players take grid slots first, and computer cars fill the empty slots. Every tablet moves the computer cars the same way along the track, so they look identical everywhere.
   - The server waits until every tablet has loaded the track (10 s timeout), then everyone gets the same countdown.
   - The position HUD and the podium include everyone.
   - After the race, the owner chooses **Race again** or **Back to city**.
5. **Friend leaves or loses Wi-Fi:** their car fades out with "👋 Name left". The game reconnects by itself and rejoins the room if it's still open. A player whose app is in the background shows 💤 to the others.

## How it's built

### Server: `server.js` + new `server/` folder
- Add the `ws` package as a real dependency, and attach a `WebSocketServer` at `/play` on the existing http server.
- Block `server/` in the static file handler, next to the existing `node_modules` and `.git` check. It's already outside the offline list, because `scripts/swManifest.mjs` only walks css/js/vendor/fonts/icons.
- **`server/rooms.js`** holds pure, testable logic. It covers:
  - Room registry and code generation (12⁴ = 20,736 codes, and never a live duplicate).
  - Join and leave, and moving the owner role on when the owner leaves.
  - Rooms deleted 2 minutes after they empty.
  - Kicking a player.
  - Limits: 4 players per room, 64 KB per message, a state rate cap of about 20/s, and 10 join attempts per minute per IP so codes can't be brute-forced.
  - Only known message types are accepted. Names are cut to 24 characters, sticker ids are checked against the list, and bricks are checked with the existing `isValidBrick` from `js/bricks.js`.
- **`server/games.js`** holds pure referee state machines for tag, rush, follow, treasure and the race. They are driven by `event(...)` and `tick(now)`, and return the messages to send.
- **Relay:** player `state` messages are relayed to the rest of the room and never stored.

### Shared: `js/net/protocol.js`
Used by both the client and the server. It holds:
- The 12 code pictures and the 8 stickers.
- Message type names, limits, the state send rate (15 Hz) and the game lengths.
- Small helpers: `packState` / `unpackState`, which round numbers to keep messages small.

**Messages, client → server:**
- `hello{playerId, name, figure, car}`
- `create`, `join{code}`, `leave`, `kick{id}`
- `car{...}`, `state{...}`, `sticker{id}`, `fx{kind}`
- `go{place}`, `game.start{kind}`, `game.claim{...}`
- `race.ready`, `race.progress`, `race.finish{time}`

**Messages, server → client:**
- `welcome`, `joined`, `left`, `updated`
- `state` (relayed)
- `go{place, slots}`
- `game.*`
- `race.countdown`, `race.results`
- `error{reason}`

**`car` payload:**
- `{name, bricks, riders}`, where `riders` maps each `friend:<id>` rider to an inline figure, so passengers look right on other tablets.
- `js/brickMesh.js` `createCarMesh` / `createBrickMesh` get an optional `resolveRider` override, so a remote car doesn't use the global resolver.
- The remote driver is passed with the existing `driver` option.

### Client
- **`js/net/connection.js`:** a WebSocket wrapper.
  - Uses `wss://` on https pages and `ws://` on http pages, both same-origin.
  - Reconnects automatically with backoff, and resumes with a `playerId` kept in `sessionStorage`, so each tab or tablet counts as its own player.
  - Reports `online` and `offline`.
- **`js/net/room.js`:** the room state store (players, owner, place, current game) and a small event emitter. `app.room` lives on the `app` object in `js/main.js`.
- **`js/net/interp.js`:** pure snapshot interpolation, tested.
  - Renders 100 ms in the past and extrapolates by velocity for up to 250 ms.
  - Snaps on a teleport (a jump of more than 10 m) and blends heading through `wrapAngle` from `js/math.js`.
- **`js/net/remotePlayers.js`:** draws each friend in the three.js scene.
  - The car comes from `createCarMesh` plus `createWheelMesh` (wheels spun from speed), driven by their figure. The figure on foot comes from `createFigureMesh`, `applyPose` and `stepGait`.
  - A canvas-sprite name tag, a sticker bubble and a 💤 marker.
  - A **kinematic** `CANNON.Body` box for the car. It is set the same way as `placeCar` in `js/cityTraffic.js`, with its velocity set, so bumps push your car.
  - The car they last got out of stays parked as a static picture.
  - Remote fx are played back through the existing `animateFx` and `sfx` from `js/gadgetHud.js` and `js/audio.js`, with volume falling off over distance.
- **`js/playTogether.js`:** the new screen (make, join, rejoin, lobby, choose car, kick), plus a new `<section id="together">` in `index.html` and its styles in `css/`.
- **`js/cityGames.js`:** the client side of the four games.
  - The 3-2-1 banner, timer, scoreboard and podium modal (reusing `openModal` and `confetti` from `js/confetti.js`).
  - Rush coin meshes, reusing the coin look from `js/cityCoins.js`.
  - The treasure chest, light beam and HUD arrow; the forced police siren and lights; the leader's sparkle trail.
  - Local proximity checks that send `game.claim` to the server.
- **`js/city.js`:** `createCity(app, { room })`.
  - When there is a room, it builds `remotePlayers` and `cityGames`.
  - It sends the local state at 15 Hz from `update()`: car pose, quaternion and velocity from `driving.driven.car.body`, or the walker's `shown` position and `heading`, plus `onFoot`, `siren` and `boost`.
  - It forwards horn, siren and confetti events from `hud`.
  - It adds friend dots to `drawMap()`, the sticker tray, the 🎮 button and the friend chips (zap = `walker.teleport` / `car.resetTo` near them).
  - `reachedRaceGate()` sends `go{place:'race'}` instead of starting a solo race.
- **`js/race.js`:** `createRace(app, car, { room, slots })`.
  - Remote humans are `remotePlayers` cars, not physics racers.
  - Computer cars follow the rule in "Fixes from the plan review" below.
  - It sends `race.ready` after the track is built and waits for `race.countdown`.
  - Progress for remote racers comes from `race.progress` messages, so `rankRacers` from `js/raceLogic.js` ranks everyone.
  - The podium uses `race.results`. While in a room, pause becomes "Leave room", so the room never freezes for everyone else.
- **`js/main.js`:**
  - `app.room`, plus `app.openTogether()`.
  - Room `go` events call `app.openCity({room})` / `app.startRace(car, {room,...})`.
  - The home button is wired up.

### Fixes from the plan review (builder must follow)

**Race**
- **Who is who.** `race.js` assumes the player is `racers[racers.length-1]` and that `r.human` means "me". Split that into `r.local` and `r.remote`, and find yourself with `slot === mySlot`.
- **Remote racers in the loop.** Remote racers get a small adapter that has `body.position` and `forwardSpeed()`. They skip `driverInput`, `keepOnTrack` and `trackProgress`.
- **Countdown.** Add a `waiting` phase in front of `countdown`. It ends only when `race.countdown` arrives.
- **No bumping in races.** Remote and computer cars have no collisions in a race. They drive through each other and fade a little when they overlap, which avoids being rammed by ghosts that are 100 ms behind.
- **Computer cars.** In a room race, computer cars are not physics cars and nobody "owns" them. Every tablet moves them along `track.racingLine` with the same time-based pace formula, starting from the shared countdown. They are identical on every tablet, need no network and keep going when the owner pauses. Solo races keep today's physics AI.
- **Finish order.** The server sets finish order and times from its own clock (`race.finish` arrival time minus the countdown's go time). The computer cars' finish times come from the same formula.
- **Buttons after the race.** Restart, Race again and Back to city all go through the room.
- **Pause.** In a room, pause is "Leave race".
- **Podium thumbnails.** Key them on a hash of the bricks, and pass the rider resolver through `js/thumbnails.js`.

**City**
- **Kinematic car bodies.** Build them from the shapes in `computeStats(bricks)`, centred on the centre of mass, and offset the mesh by `-com`, the way `drivenCar.js` does. Use the full quaternion and y, not the traffic's `y=0` / heading-only shortcut.
- **Inside the garage.** Turn off collisions with friends' cars when either player is inside `GARAGE.rect` (`insideGarage`).
- **Pauses keep the room alive.** Run the network send, `remotePlayers.update` and game timers *before* `if (paused) return`, in both `city.js` and `race.js`. That covers pause, phone upright and pizza-mission popups, so they never freeze friends' cars.
- **Race gate.** Send `go` once, reset `leaving` if the server refuses, and race with the car being driven.
- **Changing cars.** Send `car{}` on every `getIn`, because kids switch cars in the city.
- **Room `go` elsewhere.** Follow `go` only while in the lobby, the city or a race. Anywhere else, especially the builder with unsaved work, show a "Your friends went to the City — join them?" banner.
- **Gadgets.** `createGadgetHud` gets an `onUse(kind)` hook so gadget events can be broadcast.
- **Police lights.** Police tag uses its own police light bar mesh, because `setSiren` needs a siren brick on the car.
- **Zap.** Pick a clear spot 4 m behind the friend, using the raycast idea from `findExit` in `js/walker.js`. Then call `walker.teleport` or `car.resetTo` and snap the camera.
- **Coin rush.** Hide personal coins while Coin rush runs, so the two kinds don't overlap on `COIN_SPOTS`.
- **Sound by distance.** `sfx` in `js/audio.js` gets an optional volume, so friends' horns get quieter with distance. Stop remote siren sounds in `dispose`.

**Server, offline copy and connection**
- **Version check.** `hello` carries a `PROTOCOL_VERSION`. When it doesn't match, the server replies "New version — tap to reload", because an installed offline copy can be older than the server.
- **Loading `ws`.** `server.js` loads `ws` with a dynamic `import()` inside try/catch. If it's missing, the game is still served and Play together says it's unavailable. Update `package-lock.json`.
- **Join limit.** Count join attempts per connection, plus per `X-Forwarded-For` IP with a generous limit of 30/min, because family tablets share one IP.
- **Heartbeat.** Ping every 20 s and drop connections that don't answer, so a dead iPad tab doesn't hold one of the 4 places.
- **`playerId`.** Keep it in `localStorage`, because an installed iPad app loses `sessionStorage` when it is relaunched.
- **Car message limits.** At most 400 bricks, each checked with `isValidBrick`. Riders are at most 6 figures, each passed through `normaliseFigure`.

### Docs
- Write this design to `docs/superpowers/specs/2026-10-16-play-together-design.md` as the first commit.
- Add a "Play together" section to `README.md`: both tablets use the **https Dokploy address**, and the Mac `.local` address only works when everyone is on the same Wi-Fi as the Mac. Explain how to redeploy.

## Build order (each step: tests, then commit to `main`)

Per the user's standing rule, the work happens in `~/Desktop/game` on `main`, not in this worktree. Main is at the same commit (d2d5e07).

1. Spec doc, then `js/net/protocol.js` and `server/rooms.js` with `tests/rooms.test.js`, then `ws` wired into `server.js`.
2. `js/net/connection.js`, `js/net/room.js` and the Play together screen; two tabs can make and join a room.
3. `js/net/interp.js` (tests), `remotePlayers.js` and city together: see each other, stickers, fx, map dots, zap, leave and rejoin.
4. Race together: server race referee with tests, the `race.js` room path, and rail-following computer cars.
5. `server/games.js` with tests, then `js/cityGames.js`, one game at a time: Treasure hunt → Coin rush → Police tag → Follow the leader.
6. README, a full run of `npm test`, end-to-end checks, then push `main`.

## Verification
- **`npm test`** covers:
  - Room codes, the join limit, moving the owner role, and kicking.
  - Message validation.
  - Interpolation and extrapolation, and snapping on a teleport.
  - Each game referee: first claim wins, tag cooldown, leader rotation, scores, and timers ending.
  - Race slots and results ordering.
- **Two players on one Mac:** `preview_start brick-racers`, with one tab on `http://localhost:8080` and one on `http://127.0.0.1:8080`. They are different origins, so they get different saves, figures and cars.
  - Make a room in tab A and join with the pictures in tab B.
  - Go to the city, drive in A, and screenshot B to show A's car moving and the name tag.
  - Send a sticker, honk, and zap.
  - Run each of the four games to its podium.
  - Race together to the finish with 2 humans and 2 computer cars, and check that both podiums match.
  - Close tab B and check the "left" message, then reopen it and rejoin.
- **Offline:** turn off the network in devtools; Play together shows "Needs internet" and the single-player game still works.
- **After deploy:** on the real iPad and Android over the https Dokploy site, check that WebSockets get through Dokploy's proxy (Traefik passes them by default). If not, the README notes the setting to check.
