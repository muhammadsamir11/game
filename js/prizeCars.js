// The showroom's prize cars: ready-made, in the order the turntable reveals them, each with the level of
// its math questions (mathQuiz.js).
// Not in MODELS, so they never show in the build chooser. Later batches add cars to the end of the list;
// the very last one of all gets `finale: true`.
import { makeChassis } from './bricks.js';
import { computeStats } from './carStats.js';

const step = (type, color, x, y, z, r = 0) => ({ type, color, x, y, z, r });
const both = (type, color, y, z, r = 0) => [step(type, color, -2, y, z, r), step(type, color, 1, y, z, r)];
const corners = (type, color) => [step(type, color, -3, 0, 2), step(type, color, 2, 0, 2), step(type, color, -3, 0, -4), step(type, color, 2, 0, -4)];
const branded = (brand, x, y, z, r = 0) => ({ ...step('badge', 'white', x, y, z, r), badge: brand });

// Rolls-Royce Phantom: long and black, a tall chrome grille with the flying lady on top, coach doors,
// a V12 under the bonnet, white pillars and the starlight roof. The double-R badge is on the boot.
const phantom = [
  ...corners('superWheel', 'white'),
  step('grille', 'white', -1, 1, 3),
  step('ornament', 'white', -1, 4, 3),
  step('v12', 'black', -1, 1, 1),
  ...both('brick12', 'black', 1, 2), // front wings, either side of the grille
  ...both('brick12', 'black', 1, 0),
  step('steering', 'black', -1, 1, 0),
  step('seat', 'white', -1, 1, -2),
  ...both('coachDoor', 'black', 1, -2),
  step('brick22', 'black', -2, 1, -4),
  step('brick22', 'black', 0, 1, -4),
  step('windshield', 'white', -2, 4, 0),
  ...both('brick12', 'white', 4, -3), // rear pillars
  step('starRoof', 'white', -2, 7, -3),
  branded('rollsRoyce', -1, 4, -4, 2),
];

// Mercedes-AMG G-Wagon: a tall black box on chunky off-road tyres, a V12 and a second engine for climbing,
// side pipes along the sills and a spare wheel on the back door.
const gwagon = [
  ...corners('wheelOffroad', 'black'),
  step('engine', 'black', -1, 1, 2),
  step('v12', 'black', -1, 1, -4),
  step('steering', 'black', -1, 1, 1),
  step('seat', 'white', -1, 1, -1),
  ...[-4, -2, 0, 2].flatMap(z => both('brick12', 'black', 1, z)),
  step('sidePipe', 'white', -3, 0, -2),
  step('sidePipe', 'white', 2, 0, -2),
  step('spareWheel', 'white', -1, 1, -5),
  ...[4, 7].flatMap(y => [
    step('brick22', 'black', -2, y, -4),
    step('brick22', 'black', 0, y, -4),
    ...both('brick12', 'black', y, -2),
    ...both('brick12', 'black', y, 0),
  ]),
  step('windshield', 'white', -2, 4, 2),
  step('plate24', 'black', -2, 10, -4),
  step('plate24', 'black', 0, 10, -4),
  step('plate24', 'black', -2, 10, 0, 1),
  branded('mercedes', -1, 4, 3),
];

// Stretch limo: white and long (limo plates stretch it 2 studs at each end, 12 in all), with disco lights
// along both sides that flash when he honks. Its whole body sits one plate up, so the long nose and tail
// clear the garage ramps. It wears the showroom's own badge.
const limo = [
  ...corners('superWheel', 'white'),
  step('limoPlate', 'white', -2, 1, 4),
  step('limoPlate', 'white', -2, 1, -6),
  ...[-4, 0].flatMap(z => [step('plate24', 'white', -2, 1, z), step('plate24', 'white', 0, 1, z)]),
  step('engine', 'black', -1, 2, 4),
  ...both('brick12', 'white', 2, 4),
  step('steering', 'black', -1, 2, 3),
  step('horn', 'white', 0, 2, 3),
  step('seat', 'white', -1, 2, 1),
  ...[-6, -4, -2, 0, 2].flatMap(z => both('brick12', 'white', 2, z)),
  ...[-6, -2].flatMap(z => both('discoPanel', 'white', 5, z)),
  ...[-6, -2].flatMap(z => [step('plate24', 'white', -2, 7, z), step('plate24', 'white', 0, 7, z)]),
  step('windshield', 'white', -2, 5, 2),
  branded('hero', -1, 5, 4),
];

export const PRIZE_CARS = [
  { key: 'phantom', name: 'Rolls-Royce Phantom', sayName: 'A Rolls-Royce Phantom!', level: 1, steps: phantom },
  { key: 'gwagon', name: 'Mercedes G-Wagon', sayName: 'A Mercedes G-Wagon!', level: 2, steps: gwagon },
  { key: 'limo', name: 'Stretch Limo', sayName: 'A stretch limousine!', level: 3, steps: limo },
];

export const prizeByKey = key => PRIZE_CARS.find(c => c.key === key) ?? null;

// The car's bricks: the usual chassis plus its recipe, as a fresh copy.
export function prizeBricks(key) {
  const car = prizeByKey(key);
  return car ? [makeChassis(), ...car.steps.map(s => ({ ...s }))] : [];
}

// How big the car is, in metres, wheels included: the showroom's sheet is cut to this size.
export function carBounds(bricks) {
  const { boxes, wheels } = computeStats(bricks);
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const grow = (x0, x1, y0, y1, z0, z1) => {
    min.x = Math.min(min.x, x0); max.x = Math.max(max.x, x1);
    min.y = Math.min(min.y, y0); max.y = Math.max(max.y, y1);
    min.z = Math.min(min.z, z0); max.z = Math.max(max.z, z1);
  };
  for (const b of boxes) grow(b.cx - b.hx, b.cx + b.hx, b.cy - b.hy, b.cy + b.hy, b.cz - b.hz, b.cz + b.hz);
  for (const w of wheels) grow(w.x - 0.25, w.x + 0.25, w.y - w.radius, w.y + w.radius, w.z - w.radius, w.z + w.radius);
  if (min.x === Infinity) return { length: 0, width: 0, height: 0 };
  return { length: max.z - min.z, width: max.x - min.x, height: max.y - min.y };
}
