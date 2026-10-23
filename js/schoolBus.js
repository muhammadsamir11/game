// The school bus: a yellow brick bus on the truck chassis, waiting in its bay in front of the school. Built
// like the car truck's cab (a ready-made build he can drive, never saved), so the tests can check it's a
// proper truck: six wheels, the engine at the back, his seat at the front and two classmates riding behind.
import { makeChassis } from './bricks.js';

export const SCHOOL_BUS_ID = 'schoolBus';

const step = (type, color, x, y, z, r = 0) => ({ type, color, x, y, z, r });
const bothSides = (type, color, y, z) => [step(type, color, -2, y, z), step(type, color, 1, y, z)];

// friends: his friend figures; the first two ride the bus, or a classmate and the teacher if he has none.
export function busBricks(friends = []) {
  const riders = [...friends.slice(0, 2).map(f => `friend:${f.id}`), 'preset:classmate', 'preset:teacher'].slice(0, 2);
  return [
    makeChassis('truck'),
    ...[3, -3, -5].flatMap(z => [step('wheelLarge', 'black', -3, 0, z), step('wheelLarge', 'black', 2, 0, z)]),
    // Downstairs: yellow sides, the engine at the back, two passengers, his seat and the wheel, a flat front.
    ...[-6, -4, -2, 0].flatMap(z => bothSides('brick12', 'yellow', 1, z)),
    ...bothSides('brick11', 'yellow', 1, 2),
    step('engine', 'black', -1, 1, -6),
    { ...step('passengerSeat', 'white', -1, 1, -4), rider: riders[0] },
    { ...step('passengerSeat', 'white', -1, 1, -2), rider: riders[1] },
    step('seat', 'white', -1, 1, 0),
    step('steering', 'black', -1, 1, 2),
    step('brick24', 'yellow', -2, 1, 3, 1),
    ...bothSides('brick11', 'black', 1, 5), // bumpers either side of the headlights
    step('lights', 'yellow', -1, 1, 5),
    // Upstairs: 1×1 pillars with open windows between, the big windscreen, and a flat yellow roof.
    ...[-6, -3, 0, 2, 5].flatMap(z => bothSides('brick11', 'yellow', 4, z)),
    step('brick12', 'yellow', -1, 4, -6, 1), // the back, over the engine
    step('plate24', 'yellow', -2, 4, 3, 1),
    step('windshield', 'white', -2, 5, 4),
    ...[-6, -2, 2].flatMap(z => [step('plate24', 'yellow', -2, 7, z), step('plate24', 'yellow', 0, 7, z)]),
    step('horn', 'black', 1, 8, 4),
  ];
}
