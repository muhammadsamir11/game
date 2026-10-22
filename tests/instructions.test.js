import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis } from '../js/bricks.js';
import { canPlace } from '../js/snapping.js';
import { raceReadiness } from '../js/carStats.js';
import { MODELS, modelToBricks, describeStep, checkPlacement } from '../js/instructions.js';

for (const [key, model] of Object.entries(MODELS)) {
  test(`${key}: every step fits exactly where the instructions say`, () => {
    const built = [makeChassis(model.kind)];
    model.steps.forEach((step, i) => {
      const result = canPlace(built, step);
      assert.equal(result.ok, true, `step ${i + 1} (${step.type}) refused: ${result.reason}`);
      built.push(step);
    });
  });

  test(`${key}: the finished model is ready to race`, () => {
    assert.equal(raceReadiness(modelToBricks(model)).ready, true);
  });

  test(`${key}: has a kid-sized number of steps (10-16)`, () => {
    assert.ok(model.steps.length >= 10 && model.steps.length <= 16, `${model.steps.length} steps`);
  });
}

test('modelToBricks starts with the chassis and can repaint colours', () => {
  const bricks = modelToBricks(MODELS.raceCar, { red: 'orange' });
  assert.deepEqual(bricks[0], makeChassis());
  assert.equal(bricks.length, MODELS.raceCar.steps.length + 1);
  assert.ok(bricks.some(b => b.color === 'orange'));
  assert.ok(!bricks.some(b => b.color === 'red'));
  assert.ok(bricks.filter(b => b.type === 'wheelSmall').every(b => b.color === 'black'));
  assert.equal(MODELS.raceCar.steps.find(s => s.type === 'spoiler').color, 'red', 'original model is untouched');
});

test('describeStep reads like a friendly instruction', () => {
  assert.equal(describeStep({ type: 'brick24', color: 'red', x: 0, y: 1, z: 0, r: 0 }), 'Find a red Brick 2×4 and put it on the glowing spot!');
  assert.equal(describeStep({ type: 'slope22', color: 'orange', x: 0, y: 1, z: 0, r: 0 }), 'Find an orange Slope 2×2 and put it on the glowing spot!');
});

test('checkPlacement accepts the right brick on or near the glowing spot', () => {
  const step = { type: 'brick12', color: 'red', x: -2, y: 1, z: -2, r: 0 };
  assert.equal(checkPlacement(step, { type: 'brick12', color: 'red', at: { x: -2, y: 1, z: -2 } }), 'correct');
  assert.equal(checkPlacement(step, { type: 'brick12', color: 'red', at: { x: -1, y: 2, z: 0 } }), 'correct');
});

test('checkPlacement explains what is wrong, brick first, then colour, then spot', () => {
  const step = { type: 'brick12', color: 'red', x: -2, y: 1, z: -2, r: 0 };
  assert.equal(checkPlacement(step, { type: 'brick22', color: 'blue', at: { x: 3, y: 1, z: 3 } }), 'wrongBrick');
  assert.equal(checkPlacement(step, { type: 'brick12', color: 'blue', at: { x: -2, y: 1, z: -2 } }), 'wrongColor');
  assert.equal(checkPlacement(step, { type: 'brick12', color: 'red', at: { x: 3, y: 1, z: -2 } }), 'wrongSpot');
});

test('a wheel for the front-left slot is not accepted in the middle slot', () => {
  const step = { type: 'wheelSmall', color: 'black', x: -3, y: 0, z: 2, r: 0 };
  assert.equal(checkPlacement(step, { type: 'wheelSmall', color: 'black', at: { x: -3, y: 0, z: -1 } }), 'wrongSpot');
  assert.equal(checkPlacement(step, { type: 'wheelSmall', color: 'black', at: { x: 2, y: 0, z: 2 } }), 'wrongSpot');
});

test('the four new models exist and show off the new parts', () => {
  const types = key => MODELS[key].steps.map(s => s.type);
  assert.ok(['siren', 'passengerSeat', 'dog'].every(t => types('policeCar').includes(t)));
  assert.ok(['ladder', 'passengerSeat', 'siren', 'horn'].every(t => types('fireTruck').includes(t)));
  assert.ok(['rocket', 'wings', 'passengerSeat'].every(t => types('rocketCar').includes(t)));
  assert.ok(['flag', 'cannon', 'parrot', 'passengerSeat', 'crate'].every(t => types('pirateBuggy').includes(t)));
  const riders = Object.fromEntries(['policeCar', 'fireTruck', 'rocketCar', 'pirateBuggy'].map(k => [k, MODELS[k].steps.find(s => s.type === 'passengerSeat').rider]));
  assert.deepEqual(riders, { policeCar: 'preset:police', fireTruck: 'preset:firefighter', rocketCar: 'preset:astronaut', pirateBuggy: 'preset:pirate' });
});

test('colour does not matter for natural-coloured parts', () => {
  const step = { type: 'dog', color: 'white', x: 0, y: 1, z: -2, r: 0 };
  assert.equal(checkPlacement(step, { type: 'dog', color: 'purple', at: { x: 0, y: 1, z: -2 } }), 'correct');
  assert.equal(describeStep(step), 'Find the Dog and put it on the glowing spot!');
});

test('a passenger-seat step says who will ride', () => {
  const step = { type: 'passengerSeat', color: 'white', x: 0, y: 1, z: 0, r: 0, rider: 'preset:firefighter' };
  assert.equal(describeStep(step), 'Find a white Passenger Seat and put it on the glowing spot! The Firefighter rides in it.');
});

test('modelToBricks keeps the riders', () => {
  assert.equal(modelToBricks(MODELS.pirateBuggy).find(b => b.type === 'passengerSeat').rider, 'preset:pirate');
});
