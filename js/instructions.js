import { BRICK_TYPES, COLORS, makeChassis } from './bricks.js';
import { footprint } from './snapping.js';
import { riderName } from './riders.js';
import { resolveBadge } from './brands.js';

const step = (type, color, x, y, z, r = 0) => ({ type, color, x, y, z, r });
const cornerWheels = type => [step(type, 'black', -3, 0, 2), step(type, 'black', 2, 0, 2), step(type, 'black', -3, 0, -4), step(type, 'black', 2, 0, -4)];

// A supercar on the usual chassis: chrome wheels, a V12, scoops, scissor doors, a wedge nose with its badge,
// a rear wing and a name plate. `twin` adds a second V12 (the Bugatti), which lifts the wing and plate.
function supercar({ name, brand, realTopSpeed, body, trim, wheels = 'black', wing = 'racingWing', twin = false }) {
  const top = twin ? 5 : 3;
  const branded = (type, x, y, z) => ({ ...step(type, 'white', x, y, z), badge: brand });
  return {
    name,
    brand,
    realTopSpeed,
    steps: [
      ...['superWheel'].flatMap(type => [step(type, wheels, -3, 0, 2), step(type, wheels, 2, 0, 2), step(type, wheels, -3, 0, -4), step(type, wheels, 2, 0, -4)]),
      step('v12', 'black', -1, 1, -4),
      ...(twin ? [step('v12', 'black', -1, 3, -4)] : []),
      step('airScoop', trim, -2, 1, -4),
      step('airScoop', trim, 1, 1, -4),
      step('seat', 'white', -1, 1, -1),
      step('scissorDoor', trim, -2, 1, -1),
      step('scissorDoor', trim, 1, 1, -1),
      step('steering', 'black', -1, 1, 1),
      step('superNose', body, -2, 1, 2),
      branded('badge', -1, 3, 2),
      step(wing, trim === body ? 'black' : trim, -2, top, -3),
      branded('namePlate', -2, top, -4),
    ],
  };
}

// A Tesla on the usual chassis. It's electric: a battery pack in the floor instead of an engine, and 1-3
// electric motors at the back (more motors, more speed). A smooth nose with no grille and the T badge,
// a door down each side, the glass roof and aero wheels. suv: a tall hatchback instead of a low boot.
// falcon: falcon-wing doors (the Model X). plate: the TESLA name plate on the back (the Plaid's three
// motors leave no room for it in 16 steps).
const MOTOR_SPOTS = [[-2, -4], [0, -4], [-1, -3]];
const motorSpots = n => (n === 1 ? [[-1, -4]] : MOTOR_SPOTS.slice(0, n));
const teslaPart = (type, x, y, z, r = 0) => ({ ...step(type, 'white', x, y, z, r), badge: 'tesla' });
const bothSides = (type, color, y, z) => [step(type, color, -2, y, z), step(type, color, 1, y, z)];
const painted = (steps, color) => steps.map(s => ({ ...s, color }));
function tesla({ name, realTopSpeed, body, wheels = 'silver', motors = 1, suv = false, falcon = false, plate = true }) {
  return {
    name,
    brand: 'tesla',
    electric: true,
    realTopSpeed,
    steps: [
      ...painted(cornerWheels('aeroWheel'), wheels),
      step('battery', 'black', -2, 1, -2),
      ...motorSpots(motors).map(([x, z]) => step('eMotor', 'black', x, 1, z)),
      step('smoothNose', body, -2, 1, 2),
      teslaPart('badge', -1, 3, 2),
      step('seat', 'white', -1, 2, -1),
      step('steering', 'black', -1, 2, 1),
      ...bothSides(falcon ? 'falconDoor' : 'sideDoor', body, 2, -2),
      step('glassRoof', 'white', -2, 5, -2),
      step(suv ? 'brick24' : 'plate24', body, -2, 2, -4, 1),
      ...(plate ? [teslaPart('namePlate', -2, suv ? 5 : 3, -4)] : []),
    ],
  };
}

// Guided models. Steps run in order on top of the pre-placed chassis (x -2..1, z -4..3, layer 0).
export const MODELS = {
  raceCar: {
    name: 'Race Car',
    steps: [
      ...cornerWheels('wheelSmall'),
      step('engine', 'black', -1, 1, -4),
      step('seat', 'white', -1, 1, -1),
      step('steering', 'black', -1, 1, 1),
      step('brick12', 'red', -2, 1, -2),
      step('brick12', 'red', 1, 1, -2),
      step('brick12', 'red', -2, 1, -4),
      step('brick12', 'red', 1, 1, -4),
      step('slope22', 'red', -2, 1, 2),
      step('slope22', 'red', 0, 1, 2),
      step('spoiler', 'red', -2, 4, -4),
    ],
  },
  monsterTruck: {
    name: 'Monster Truck',
    steps: [
      ...cornerWheels('wheelLarge'),
      step('plate24', 'blue', -2, 1, -4),
      step('plate24', 'blue', 0, 1, -4),
      step('engine', 'black', -1, 2, -4),
      step('seat', 'white', -1, 1, 0),
      step('steering', 'black', -1, 1, 2),
      step('brick12', 'blue', -2, 1, 0),
      step('brick12', 'blue', 1, 1, 0),
      step('brick12', 'blue', -2, 1, 2),
      step('brick22', 'blue', 0, 1, 2),
      step('lights', 'yellow', 0, 4, 3),
    ],
  },
  buggy: {
    name: 'Buggy',
    steps: [
      step('wheelSmall', 'black', -3, 0, 2),
      step('wheelSmall', 'black', 2, 0, 2),
      step('wheelLarge', 'black', -3, 0, -4),
      step('wheelLarge', 'black', 2, 0, -4),
      step('engine', 'black', -1, 1, -4),
      step('seat', 'white', -1, 1, -2),
      step('steering', 'black', -1, 1, 0),
      step('slope22', 'green', -1, 1, 2),
      step('brick12', 'green', -2, 1, -2),
      step('brick12', 'green', 1, 1, -2),
      step('brick12', 'green', -2, 4, -2),
      step('brick12', 'green', 1, 4, -2),
      step('plate24', 'green', -2, 7, -2, 1),
    ],
  },
  policeCar: {
    name: 'Police Car',
    steps: [
      ...cornerWheels('wheelSmall'),
      step('engine', 'black', -1, 1, -4),
      step('seat', 'white', -2, 1, 0),
      { ...step('passengerSeat', 'white', 0, 1, 0), rider: 'preset:police' },
      step('steering', 'black', -2, 1, 2),
      step('brick12', 'blue', -1, 1, 2),
      step('slope22', 'blue', 0, 1, 2),
      step('brick12', 'blue', -2, 1, -4),
      step('brick12', 'blue', 1, 1, -4),
      step('dog', 'white', 0, 1, -2),
      step('siren', 'white', -1, 4, -4),
    ],
  },
  fireTruck: {
    name: 'Fire Truck',
    steps: [
      ...cornerWheels('wheelLarge'),
      step('engine', 'black', -1, 1, 2),
      step('seat', 'white', -2, 1, 0),
      { ...step('passengerSeat', 'white', 0, 1, 0), rider: 'preset:firefighter' },
      step('steering', 'black', -2, 1, 2),
      step('brick24', 'red', -2, 1, -4),
      step('brick24', 'red', 0, 1, -4),
      step('brick22', 'red', -1, 4, -4),
      step('ladder', 'white', -1, 7, -4),
      step('siren', 'white', 0, 4, -2),
      step('horn', 'white', 1, 1, 2),
    ],
  },
  rocketCar: {
    name: 'Rocket Car',
    steps: [
      ...cornerWheels('wheelSmall'),
      step('engine', 'black', -1, 1, -4),
      step('rocket', 'orange', -1, 4, -4),
      step('seat', 'white', -2, 1, 0),
      { ...step('passengerSeat', 'white', 0, 1, 0), rider: 'preset:astronaut' },
      step('steering', 'black', -2, 1, 2),
      step('wings', 'white', -3, 1, -2),
      step('brick12', 'orange', -1, 1, 2),
      step('slope22', 'orange', 0, 1, 2),
      step('brick12', 'white', -2, 1, -4),
      step('brick12', 'white', 1, 1, -4),
    ],
  },
  pirateBuggy: {
    name: 'Pirate Buggy',
    steps: [
      step('wheelSmall', 'black', -3, 0, 2),
      step('wheelSmall', 'black', 2, 0, 2),
      step('wheelLarge', 'black', -3, 0, -4),
      step('wheelLarge', 'black', 2, 0, -4),
      step('engine', 'black', -1, 1, -4),
      step('seat', 'white', -2, 1, 0),
      { ...step('passengerSeat', 'yellow', 0, 1, 0), rider: 'preset:pirate' },
      step('steering', 'black', -2, 1, 2),
      step('cannon', 'black', 0, 1, 2),
      step('crate', 'white', -2, 1, -2),
      step('parrot', 'white', -2, 4, -2),
      step('flag', 'black', 1, 1, -4),
      step('brick12', 'yellow', 1, 1, -2),
      step('brick12', 'yellow', -2, 1, -4),
    ],
  },
  aventador: supercar({ name: 'Lamborghini Aventador', brand: 'lamborghini', realTopSpeed: 350, body: 'orange', trim: 'black' }),
  huracan: supercar({ name: 'Lamborghini Huracán', brand: 'lamborghini', realTopSpeed: 325, body: 'lime', trim: 'lime', wing: 'spoiler' }),
  sf90: supercar({ name: 'Ferrari SF90 Stradale', brand: 'ferrari', realTopSpeed: 340, body: 'red', trim: 'red', wheels: 'yellow', wing: 'spoiler' }),
  laferrari: supercar({ name: 'Ferrari LaFerrari', brand: 'ferrari', realTopSpeed: 350, body: 'red', trim: 'black' }),
  chiron: supercar({ name: 'Bugatti Chiron', brand: 'bugatti', realTopSpeed: 420, body: 'blue', trim: 'black', wheels: 'blue', twin: true }),
  p1: supercar({ name: 'McLaren P1', brand: 'mclaren', realTopSpeed: 350, body: 'yellow', trim: 'black' }),
  teslaModelS: tesla({ name: 'Tesla Model S Plaid', realTopSpeed: 322, body: 'black', motors: 3, plate: false }),
  teslaModel3: tesla({ name: 'Tesla Model 3', realTopSpeed: 225, body: 'blue' }),
  teslaModelX: tesla({ name: 'Tesla Model X', realTopSpeed: 262, body: 'white', motors: 2, suv: true, falcon: true }),
  teslaModelY: tesla({ name: 'Tesla Model Y', realTopSpeed: 217, body: 'silver', wheels: 'black', suv: true }),
  // The Roadster: low and open, with two battery packs (front and back), three motors and the SpaceX
  // rocket on the back.
  teslaRoadster: {
    name: 'Tesla Roadster',
    brand: 'tesla',
    electric: true,
    realTopSpeed: 400,
    steps: [
      ...painted(cornerWheels('aeroWheel'), 'silver'),
      step('battery', 'black', -2, 1, 0),
      step('battery', 'black', -2, 1, -4),
      ...MOTOR_SPOTS.map(([x, z]) => step('eMotor', 'black', x, 2, z)),
      step('rocket', 'white', -1, 3, -4),
      step('smoothNose', 'red', -2, 2, 2),
      teslaPart('badge', -1, 4, 2),
      step('seat', 'white', -1, 2, -2),
      step('steering', 'black', -1, 2, 0),
      ...bothSides('airScoop', 'red', 2, -2),
    ],
  },
  // The Cybertruck: flat stainless-steel panels and sharp wedges. The front wedge's light bar shines white;
  // the same wedge turned round over the truck bed is the sloping back, with a red light bar.
  cybertruck: {
    name: 'Tesla Cybertruck',
    brand: 'tesla',
    electric: true,
    realTopSpeed: 209,
    steps: [
      ...painted(cornerWheels('wheelLarge'), 'silver'),
      step('battery', 'black', -2, 1, -2),
      step('eMotor', 'black', -1, 1, -4),
      ...bothSides('brick12', 'silver', 1, -4), // the sides of the truck bed
      step('cyberWedge', 'silver', -2, 1, 2),
      step('seat', 'white', -1, 2, -1),
      step('steering', 'black', -1, 2, 1),
      ...bothSides('sideDoor', 'silver', 2, -2),
      step('glassRoof', 'white', -2, 5, -2),
      step('cyberWedge', 'silver', -2, 4, -4, 2),
      teslaPart('badge', -1, 4, 2),
    ],
  },
  // A big-rig cab on the truck chassis: six big wheels, the engine under a short bonnet, a tall cab with
  // exhaust stack, and the back of the frame left open for the hook.
  bigRig: {
    name: 'Big Rig',
    kind: 'truck',
    steps: [
      ...[3, -3, -5].flatMap(z => [step('wheelLarge', 'black', -3, 0, z), step('wheelLarge', 'black', 2, 0, z)]),
      step('engine', 'black', -1, 1, 4),
      step('brick12', 'red', -2, 1, 4),
      step('brick12', 'red', 1, 1, 4),
      step('lights', 'yellow', -1, 4, 5),
      step('seat', 'white', -1, 1, 1),
      step('steering', 'black', -1, 1, 3),
      step('windshield', 'white', -2, 4, 3),
      step('brick24', 'red', -2, 1, -1, 1),
      step('brick24', 'red', -2, 4, -1, 1),
      step('exhaust', 'white', 1, 7, -1),
    ],
  },
};

export function modelToBricks(model, recolor = {}) {
  return [makeChassis(model.kind ?? 'car'), ...model.steps.map(s => ({ ...s, color: recolor[s.color] ?? s.color }))];
}

export function describeStep(s) {
  const type = BRICK_TYPES[s.type];
  let text;
  if (type.fixedColor) {
    text = `Find the ${type.name} and put it on the glowing spot!`;
  } else {
    const color = COLORS[s.color].name.toLowerCase();
    const article = /^[aeiou]/.test(color) ? 'an' : 'a';
    text = `Find ${article} ${color} ${type.name} and put it on the glowing spot!`;
  }
  if (s.rider) text += ` The ${riderName(s.rider)} rides in it.`;
  if (s.badge && s.type === 'badge') text += ` It is the ${resolveBadge(s.badge).name} badge.`;
  if (s.badge && s.type === 'namePlate') text += ` It says ${resolveBadge(s.badge).name}.`;
  return text;
}

function nearTarget(s, at, tolerance) {
  const { w, d, h } = footprint(s.type, s.r);
  return at.x >= s.x - tolerance && at.x < s.x + w + tolerance
    && at.y >= s.y - tolerance && at.y < s.y + h + tolerance
    && at.z >= s.z - tolerance && at.z < s.z + d + tolerance;
}

export function checkPlacement(s, { type, color, at }, tolerance = 2) {
  if (type !== s.type) return 'wrongBrick';
  if (!BRICK_TYPES[s.type].fixedColor && color !== s.color) return 'wrongColor';
  if (!nearTarget(s, at, tolerance)) return 'wrongSpot';
  return 'correct';
}
