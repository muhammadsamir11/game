// Gold coins round the city: where they are, grabbing them, and bringing them back.
import { GARAGE, PITCH, roadCenter } from './cityMap.js';

export const COIN_RESPAWN = 90;
export const PICKUP = { foot: 1.2, car: 2 };

const coin = (x, y, z, value = 1) => ({ x, y, z, value });
const row5 = (place, mid) => [-6, -3, 0, 3, 6].map(d => place(mid + d));

// Rows of 5 down the middle of roads, between junctions: [road index, segment index].
const ACROSS_ROWS = [[1, 1], [1, 3], [2, 0], [2, 2], [3, 1], [4, 2]]; // along x, on z = roadCenter(i)
const DOWN_ROWS = [[3, 0]]; // along z, on x = roadCenter(i)
const segmentMid = k => k * PITCH + 30;

const roadCoins = [
  ...ACROSS_ROWS.flatMap(([i, k]) => row5(x => coin(x, 1, roadCenter(i)), segmentMid(k))),
  ...DOWN_ROWS.flatMap(([i, k]) => row5(z => coin(roadCenter(i), 1, z), segmentMid(k))),
];

// Little clusters of 3 on sidewalks, and two in the pond park.
const sidewalkCoins = [
  ...[170, 172, 174].map(x => coin(x, 1, 46.5)),
  ...[122, 124, 126].map(z => coin(46.5, 1, z)),
  ...[168, 170, 172].map(x => coin(x, 1, 109.5)),
  ...[74, 76, 78].map(x => coin(x, 1, 157.5)),
];
const parkCoins = [116, 136].flatMap(x => [170, 172, 174].map(z => coin(x, 1, z)));

// Up both garage ramps (1 m over the slope) and along the 1st and 2nd floors.
const rampCoins = GARAGE.rampPaths.flatMap(p => [0.1, 0.3, 0.5, 0.7, 0.9].map(t => coin(
  GARAGE.rect.x0 + (p.u0 + p.u1) / 2,
  p.y0 + (p.y1 - p.y0) * t + 1,
  GARAGE.rect.z0 + p.v0 + (p.v1 - p.v0) * t,
)));
const floorCoins = [1, 2].flatMap(floor => [20, 26, 32, 38].map(z => coin(24, floor * 4 + 1, z)));

// An arc over the stunt park's small kicker.
const arcCoins = [[78.5, 1.8], [80.5, 2.4], [82.5, 2.6], [84.5, 2.4], [86.5, 1.8]].map(([z, y]) => coin(75.5, y, z));

// Big coins (5) in tricky places.
const bigCoins = [
  coin(67.5, 3.4, 79, 5), coin(67.5, 3.2, 85, 5), // mid-air past the big kicker
  coin(14, 9, 14, 5), coin(14, 9, 46, 5), coin(45, 9, 46, 5), coin(45, 9, 14, 5), // corners of the garage's open top deck
  coin(190.5, 1, 78, 5), // on the sidewalk beside the race arch
  coin(86, 2.4, 66.6, 5), // high on the north quarter-pipe (1 m over its curve)
  coin(114, 1, 162, 5), coin(138, 1, 186, 5), // pond park
];

export const COIN_SPOTS = [...roadCoins, ...sidewalkCoins, ...parkCoins, ...rampCoins, ...floorCoins, ...arcCoins, ...bigCoins];

// Blue coins for the coin-trail mission: 10 per route, 10 m apart.
const line = (from, step, n, at) => Array.from({ length: n }, (_, i) => at(from + i * step));
export const TRAIL_ROUTES = [
  line(100, 10, 10, x => ({ x, y: 1, z: roadCenter(3) })),
  line(110, 10, 10, z => ({ x: roadCenter(2), y: 1, z })),
  line(60, 10, 10, x => ({ x, y: 1, z: roadCenter(2) + 3 })),
];

export function createCoinField(spots, { respawn = COIN_RESPAWN } = {}) {
  const waiting = spots.map(() => 0); // seconds until a taken coin comes back; 0 = there
  return {
    spots,
    isActive: i => waiting[i] === 0,
    activeCount: () => waiting.filter(w => w === 0).length,
    update(dt) {
      for (let i = 0; i < waiting.length; i++) if (waiting[i] > 0) waiting[i] = Math.max(0, waiting[i] - dt);
    },
    collect(pos, radius) {
      const got = [];
      spots.forEach((c, index) => {
        if (waiting[index] > 0) return;
        if (Math.hypot(c.x - pos.x, c.z - pos.z) > radius || Math.abs(c.y - pos.y) >= 3) return;
        waiting[index] = respawn;
        got.push({ index, value: c.value });
      });
      return got;
    },
  };
}
