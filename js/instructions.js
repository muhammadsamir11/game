import { BRICK_TYPES, COLORS, makeChassis } from './bricks.js';
import { footprint } from './snapping.js';

const step = (type, color, x, y, z, r = 0) => ({ type, color, x, y, z, r });
const cornerWheels = type => [step(type, 'black', -3, 0, 2), step(type, 'black', 2, 0, 2), step(type, 'black', -3, 0, -4), step(type, 'black', 2, 0, -4)];

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
};

export function modelToBricks(model, recolor = {}) {
  return [makeChassis(), ...model.steps.map(s => ({ ...s, color: recolor[s.color] ?? s.color }))];
}

export function describeStep(s) {
  const color = COLORS[s.color].name.toLowerCase();
  const article = /^[aeiou]/.test(color) ? 'an' : 'a';
  return `Find ${article} ${color} ${BRICK_TYPES[s.type].name} and put it on the glowing spot!`;
}

function nearTarget(s, at, tolerance) {
  const { w, d, h } = footprint(s.type, s.r);
  return at.x >= s.x - tolerance && at.x < s.x + w + tolerance
    && at.y >= s.y - tolerance && at.y < s.y + h + tolerance
    && at.z >= s.z - tolerance && at.z < s.z + d + tolerance;
}

export function checkPlacement(s, { type, color, at }, tolerance = 2) {
  if (type !== s.type) return 'wrongBrick';
  if (color !== s.color) return 'wrongColor';
  if (!nearTarget(s, at, tolerance)) return 'wrongSpot';
  return 'correct';
}
