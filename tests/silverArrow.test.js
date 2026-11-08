import test from 'node:test';
import assert from 'node:assert/strict';
import { BRICK_TYPES, TRAY_GROUPS } from '../js/bricks.js';
import { raceReadiness, computeStats, isElectric } from '../js/carStats.js';
import { MODELS, modelToBricks, describeStep } from '../js/instructions.js';

const speed = key => computeStats(modelToBricks(MODELS[key])).topSpeed;
const NEW = ['arrowNose', 'lightPanel', 'turbineWheel'];

test('the Silver Arrow parts exist and sit in the Supercar tab', () => {
  for (const k of NEW) {
    const t = BRICK_TYPES[k];
    for (const n of [t.w, t.d, t.h]) assert.ok(Number.isInteger(n) && n > 0, `${k} size`);
    assert.ok(t.mass > 0, k);
  }
  assert.equal(BRICK_TYPES.turbineWheel.kind, 'wheel');
  assert.ok(BRICK_TYPES.turbineWheel.turbine);
  assert.deepEqual(TRAY_GROUPS.find(g => g.key === 'supercar').types.slice(-3), NEW);
});

test('the Silver Arrow: its real name, the Mercedes star, electric and ready to race', () => {
  const m = MODELS.silverArrow;
  assert.deepEqual([m.name, m.brand, m.realTopSpeed, m.electric], ['Mercedes-Benz EQ Silver Arrow', 'mercedes', 400, true]);
  const bricks = modelToBricks(m);
  assert.ok(isElectric(bricks));
  assert.ok(!bricks.some(b => b.type === 'engine' || b.type === 'v12'));
  assert.equal(bricks.find(b => b.type === 'badge').badge, 'mercedes');
  assert.ok(raceReadiness(bricks).ready);
});

test('it is silver, on turbine wheels, with the arrow nose at the front and turned round as the tail', () => {
  const steps = MODELS.silverArrow.steps;
  assert.deepEqual(steps.filter(s => s.type === 'turbineWheel').map(s => s.color), ['silver', 'silver', 'silver', 'silver']);
  assert.deepEqual(steps.filter(s => s.type === 'arrowNose').map(s => [s.color, s.r]), [['silver', 0], ['silver', 2]]);
  assert.equal(steps.filter(s => s.type === 'lightPanel').length, 2);
});

test('as fast as the Tesla Roadster, faster than the other supercars, but not the Bugatti', () => {
  assert.ok(speed('silverArrow') > speed('aventador'));
  assert.ok(speed('silverArrow') < speed('chiron'));
});

test('the steps name the new parts', () => {
  assert.equal(describeStep(MODELS.silverArrow.steps.find(s => s.type === 'arrowNose')), 'Find a silver Arrow Nose and put it on the glowing spot!');
  assert.equal(describeStep(MODELS.silverArrow.steps.find(s => s.type === 'badge')), 'Find the Badge and put it on the glowing spot! It is the Mercedes-Benz badge.');
});
