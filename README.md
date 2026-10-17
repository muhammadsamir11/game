# Brick Racers

Build a car from toy bricks, then race it! Made for playing on an iPad.

## Start the game (on the Mac)

```bash
npm install
npm start
```

The terminal prints the addresses, for example:

```
On this computer: http://localhost:8080
On the iPad (best, same Wi-Fi): http://Your-Mac.local:8080
Or by number: http://192.168.1.23:8080
```

Use the `.local` address on the iPad: it stays the same even when your router gives the Mac a new number, and the saved cars belong to the address they were made on.

## Play on the iPad

1. Make sure the iPad is on the same Wi-Fi as the Mac and the Mac is running `npm start`.
2. Open Safari on the iPad and type the "On the iPad (best)" address.
3. Tap the Share button → **Add to Home Screen** so it opens full screen like an app.
4. From now on, always start the game from that home-screen icon. Safari can clear cars made in a normal Safari tab if the site isn't visited for a while; the home-screen app keeps them.
5. Hold the iPad sideways.

### Play offline (from your Dokploy site)

Offline play needs the game's **https** address (your Dokploy domain). It can't work from the Mac's `http://….local` address above: browsers only allow offline copies on secure (https) sites.

1. On the iPad, open the https address in Safari → Share → **Add to Home Screen**.
2. Open the game **once from the new home-screen icon while online**. It saves a copy of itself, and from then on it works with no internet.
3. Build and play from that icon. The home-screen app keeps its **own** saves: cars made in a normal Safari tab (or at the Mac's `.local` address) don't show up in it, and the other way round.
4. When you deploy a new version, the app picks it up by itself: it checks every time it's brought back to the front while online, then reloads on the home screen (never mid-race or in a room) and says "✨ The game just got an update!".

On a computer or Android, Chrome shows a **⬇ Install** button on the game's home screen (or an install icon in the address bar).

(While you run it on this Mac at `localhost`, the offline copy is switched off so changes show straight away.)

## Play together (iPad + Android, or friends at their homes)

Up to 4 players can drive around the city together or race each other, each on their own tablet.

1. Every tablet opens the game from the **same https Dokploy address** (the home-screen app installed from it is fine). The Mac's `http://….local` address also works, but only for tablets on the same Wi-Fi as the Mac.
2. One player taps **🤝 Play together → ✨ Make a room**. Four big pictures appear, for example 🦖🍕🚀⭐ (🔊 reads them out).
3. The others tap **🔑 Join a room** and tap the same four pictures.
4. The 👑 player picks **🏙 City** or **🏁 Race**, and everyone goes there together.

In the city with friends:
- You see each other's cars and figures with name tags, and can bump into each other.
- **😀 Stickers** pop above your head on everyone's screen. Nothing can be typed, so there's no chat.
- Honks, sirens, boost and confetti show and sound on friends' tablets.
- Tap a friend's face on the left to **zap** next to them.
- Driving through the 🏁 arch asks "Race everyone?"
- **🎮 Games** has four games:
  - **Treasure hunt:** be first to the chest; the arrow and the beeping help.
  - **Coin rush:** grab the most sparkly coins.
  - **Police tag:** the police catches someone by driving up to them.
  - **Follow the leader:** stay close to the ⭐ leader to earn stars.

In a race together, computer cars fill the empty places, and everyone gets the same countdown and podium.

For grown-ups:
- **Safety.** Rooms are private: there is no list of rooms, only the four-picture code. The 👑 player can **Send out** anyone from the room screen, and someone sent out can't come back to that room.
- **Losing Wi-Fi.** A tablet that loses Wi-Fi gets its place back if it returns within 30 seconds. The game also reconnects by itself the next time it's opened.
- **Server.** Play together runs on the same `server.js` as the game, at `/play`. It needs the `ws` package, so the deploy must run `npm install` (or `npm ci`). Without it the game still works, just alone.
- **Dokploy.** Its proxy (Traefik) passes WebSockets through by default. If **Play together** says "needs the internet" while the game itself loads fine, check that the domain's proxy allows WebSocket upgrades.
- **Cloudflare.** The game works behind Cloudflare's proxy with the default cache settings. Turn on **WebSockets** (Network tab) for Play together. New versions reach the tablets even if a "Cache Everything" rule is on, because the app downloads each version's files at their own address (`file?v=<version>`). The two update-check files (`sw.js`, `sw-files.js`) are sent as never-store; just don't add a rule that forces caching on `/sw.js` or `/sw-files.js`.
- **Offline.** Single-player stays fully offline. Only Play together needs the internet.

## How to play

- **First time:** make your own figure — hair or hat, face, skin, shirt and pants — and type your name. Your figure drives all your cars. Tap your face at the top of the home screen to change it or make friends.
- **Build** → pick a car and follow the steps (🔊 reads them out loud), or choose **Free Build** and make your own. A race car needs 4 wheels at the corners, an engine and a seat.
- **Supercars** → Lamborghini Aventador and Huracán, Ferrari SF90 Stradale and LaFerrari, Bugatti Chiron and McLaren P1 are at the top of the build list — the fastest cars in the game (the Bugatti is fastest of all). The 🏎 Supercar tab has the noses, scoops, wings, scissor doors, V12 engines, super wheels, badges and name plates to make your own; tap a badge to pick its brand.
- **Race** → ◀ ▶ to steer, **GO** to drive, **STOP** to brake (hold it to go backwards). Stuck upside down? Press **Flip me!**
- **City** → a little city with your garage! Walk around as your figure (thumb stick or arrow keys), walk up to one of your cars and tap **Get in** (or E). Drive around town, up the ramps of the parking garage, and stop in a numbered spot, then **Get out** to park it there. Drive through the 🏁 arch to race. **🚗 My cars** lists your cars to race, change or delete.
- **The map** in the corner turns with you (up is the way you're looking) and shows your parked cars. Tap it to see the whole city. Each garage floor has its own colour and number (1 blue, 2 orange, 3 green), and the ramp up is painted in the next floor's colour.
- In the city: grab gold coins 🪙, try the jumps in the stunt park (in the air, tap GO to flip, ◀ ▶ to spin), and drive into the glowing ring at the pizza shop for a mission.
- **The showroom ❓** → something is hiding under the silk sheet at the car showroom. Walk up to it, tap **🧮 Let's go!** and answer 3 math questions (🔊 reads them out) to find out what it is. Whatever's under the sheet goes to your garage with a ribbon on it 🏆 — and a new mystery arrives the next day.

On a computer the arrow keys (or W A S D) drive too.

## For grown-ups

- **Showroom (for grown-ups, spoilers):** the mystery cars are ready-made prize cars, one a day: each is won by answering 3 math questions for about age 9 (adding and taking away, times tables, and dividing for the last car; a little harder with each car). A wrong answer means try again; a second miss shows the answer and gives a new question. They're in `js/prizeCars.js`, the questions in `js/mathQuiz.js`. To try it without waiting for tomorrow or answering, open the city, run `brickRacers.currentMode().debug.showroomReady()` in the browser console, walk up to the turntable and tap Let's go! Prize cars can be raced but not changed or deleted, and come back by themselves if they ever go missing.
- `npm test` runs the rule tests (snapping, instructions, saving, laps, AI, physics, offline file list, play-together rooms and games).
- The offline file list and version are made by `server.js` when it starts, from the files it serves, so every deploy updates installed apps by itself. `npm run vendor` refreshes the bundled three / cannon-es / Fredoka copies.
- Brand names are used for a private family game; the badges are our own drawings, not the official logos. If the game is ever shared publicly or sold, swap the brand names.
- Code lives in `js/`; the design is in `docs/superpowers/specs/`.
