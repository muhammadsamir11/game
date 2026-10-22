// The car truck: a big-rig cab pulling a two-deck car trailer that carries 8 of his own cars. Where each car
// goes, what fits, and where a car comes off again. Pure maths (no three.js), so it can be checked by tests.
//
// The trailer's own frame: origin on the ground at the middle of the decks' back edge, +z toward the cab.
// The decks run over z 0..deckLength; the ramp runs down behind them to the ground; the towbar ring is in front.
import { carBounds } from './prizeCars.js';
import { MODELS, modelToBricks } from './instructions.js';
import { wrapAngle } from './math.js';

export const CAR_TRUCK_ID = 'carTruck';
export const CAR_TRUCK = {
  capacity: 8,
  perDeck: 4,
  deckLength: 18, // four 4 m cars nose to tail; the 6 m limo takes two cars' room
  deckWidth: 3.4, // every car is 3 m wide, counting its wheels
  bottomDeckY: 0.9, // top of the bottom deck
  topDeckY: 3.85, // top of the top deck
  bottomRoom: 2.8, // the tallest car under the top deck (the G-Wagon is 2.6 m)
  topRoom: 3.2, // the tallest car on top
  gap: 0.25, // between cars on a deck
  ramp: 3.5, // from the decks' back edge down to the ground
  ringAhead: 1.5, // the towbar ring, in front of the decks
  ringY: 0.5, // the height of a big rig's hook
  mass: 300,
};

// The car truck's cab: the Big Rig, in blue.
export const cabBricks = () => modelToBricks(MODELS.bigRig, { red: 'blue' });

// How much room a car needs on a deck, in metres.
export function carSize(bricks) {
  const { length, width, height } = carBounds(bricks);
  return { length, width, height };
}

const DECKS = [{ deck: 0, room: CAR_TRUCK.bottomRoom }, { deck: 1, room: CAR_TRUCK.topRoom }];

// loaded: [{ deck, z0, z1 }] already on board; z0..z1 is measured back from the decks' front edge.
// The bottom deck fills first, from the front backwards, then the top deck.
export function planLoad(loaded, size) {
  const { deckLength, deckWidth, perDeck, gap } = CAR_TRUCK;
  if (size.width > deckWidth || size.length > deckLength || !DECKS.some(d => size.height <= d.room)) return { ok: false, reason: 'tooBig' };
  for (const { deck, room } of DECKS) {
    const on = loaded.filter(s => s.deck === deck);
    if (on.length >= perDeck || size.height > room) continue;
    const z0 = on.length ? Math.max(...on.map(s => s.z1)) + gap : 0;
    const z1 = z0 + size.length;
    if (z1 <= deckLength) return { ok: true, deck, z0, z1 };
  }
  return { ok: false, reason: 'full' };
}

// A car stopped here (in the trailer's frame) gets loaded: the pad behind the ramp, the ramp, the decks' back edge.
const PAD = 4; // m of lift pad behind the ramp's foot
export const inLoadZone = ({ x, z }) => Math.abs(x) <= 2.4 && z >= -(CAR_TRUCK.ramp + PAD) && z <= 1;

// Where an unloaded car is put down: just past the lift pad, facing away from the truck, ready to drive off
// (outside the loading zone, so it doesn't ride straight back up). trailerPose: the trailer frame's origin.
export function groundPoseBehind({ x, z, heading }) {
  const back = CAR_TRUCK.ramp + PAD + 2;
  return { x: x - Math.sin(heading) * back, z: z - Math.cos(heading) * back, heading: wrapAngle(heading + Math.PI) };
}
