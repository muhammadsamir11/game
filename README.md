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

The game needs the internet the first time it loads (it downloads the 3D engine). Cars are saved on the iPad itself.

## How to play

- **First time:** make your own figure — hair or hat, face, skin, shirt and pants — and type your name. Your figure drives all your cars. Change it, or make friends, in **👤 My Figures**.
- **Build** → pick a Race Car, Monster Truck or Buggy and follow the steps (🔊 reads them out loud), or choose **Free Build** and make your own. A race car needs 4 wheels at the corners, an engine and a seat.
- **Race** → ◀ ▶ to steer, **GO** to drive, **STOP** to brake (hold it to go backwards). Stuck upside down? Press **Flip me!**
- **My Garage** → race, change or delete your cars.

On a computer the arrow keys (or W A S D) drive too.

## For grown-ups

- `npm test` runs the rule tests (snapping, instructions, saving, laps, AI, physics).
- Code lives in `js/`; the design is in `docs/superpowers/specs/`.
