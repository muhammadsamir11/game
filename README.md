# Brick Racers

Build a car from toy bricks, then race it! Made for playing on an iPad.

## Start the game (on the Mac)

```bash
npm install
npm start
```

The terminal prints two addresses, for example:

```
On this computer: http://localhost:8080
On the iPad (same Wi-Fi): http://192.168.1.23:8080
```

## Play on the iPad

1. Make sure the iPad is on the same Wi-Fi as the Mac and the Mac is running `npm start`.
2. Open Safari on the iPad and type the "On the iPad" address.
3. Tap the Share button → **Add to Home Screen** so it opens full screen like an app.
4. Hold the iPad sideways.

The game needs the internet the first time it loads (it downloads the 3D engine). Cars are saved on the iPad itself.

## How to play

- **Build** → pick a Race Car, Monster Truck or Buggy and follow the steps (🔊 reads them out loud), or choose **Free Build** and make your own. A race car needs 4 wheels at the corners, an engine and a seat.
- **Race** → ◀ ▶ to steer, **GO** to drive, **STOP** to brake (hold it to go backwards). Stuck upside down? Press **Flip me!**
- **My Garage** → race, change or delete your cars.

On a computer the arrow keys (or W A S D) drive too.

## For grown-ups

- `npm test` runs the rule tests (snapping, instructions, saving, laps, AI, physics).
- Code lives in `js/`; the design is in `docs/superpowers/specs/`.
