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
4. When you deploy a new version, the app picks it up by itself the next time it's opened online.

On a computer or Android, Chrome shows a **⬇ Install** button on the game's home screen (or an install icon in the address bar).

(While you run it on this Mac at `localhost`, the offline copy is switched off so changes show straight away.)

## How to play

- **First time:** make your own figure — hair or hat, face, skin, shirt and pants — and type your name. Your figure drives all your cars. Change it, or make friends, in **👤 My Figures**.
- **Build** → pick a car and follow the steps (🔊 reads them out loud), or choose **Free Build** and make your own. A race car needs 4 wheels at the corners, an engine and a seat.
- **Supercars** → Lamborghini Aventador and Huracán, Ferrari SF90 Stradale and LaFerrari, Bugatti Chiron and McLaren P1 are at the top of the build list — the fastest cars in the game (the Bugatti is fastest of all). The 🏎 Supercar tab has the noses, scoops, wings, scissor doors, V12 engines, super wheels, badges and name plates to make your own; tap a badge to pick its brand.
- **Race** → ◀ ▶ to steer, **GO** to drive, **STOP** to brake (hold it to go backwards). Stuck upside down? Press **Flip me!**
- **My Garage** → a little city! Walk around as your figure (thumb stick or arrow keys), walk up to one of your cars and tap **Get in** (or E). Drive around town, up the ramps of the parking garage, and stop in a numbered spot, then **Get out** to park it there. Drive through the 🏁 arch to race. **🚗 My cars** lists your cars to race, change or delete.
- In the city: grab gold coins 🪙, try the jumps in the stunt park (in the air, tap GO to flip, ◀ ▶ to spin), and drive into the glowing ring at the pizza shop for a mission.

On a computer the arrow keys (or W A S D) drive too.

## For grown-ups

- `npm test` runs the rule tests (snapping, instructions, saving, laps, AI, physics, offline file list).
- The offline file list and version are made by `server.js` when it starts, from the files it serves, so every deploy updates installed apps by itself. `npm run vendor` refreshes the bundled three / cannon-es / Fredoka copies.
- Brand names are used for a private family game; the badges are our own drawings, not the official logos. If the game is ever shared publicly or sold, swap the brand names.
- Code lives in `js/`; the design is in `docs/superpowers/specs/`.
