import test from 'node:test';
import assert from 'node:assert/strict';
import { BRICK_TYPES, TRAY_GROUPS, COLORS, makeChassis, isValidBrick } from '../js/bricks.js';
import { raceReadiness, computeStats, LIMITS } from '../js/carStats.js';
import { BRANDS, DEFAULT_BADGE, resolveBadge } from '../js/brands.js';

const part = (type, x, y, z, color = 'black', r = 0) => ({ type, color, x, y, z, r });
const corners = (type = 'superWheel') => [part(type, -3, 0, 2), part(type, 2, 0, 2), part(type, -3, 0, -4), part(type, 2, 0, -4)];
const NEW = ['superNose', 'airScoop', 'racingWing', 'scissorDoor', 'v12', 'superWheel', 'badge', 'namePlate'];

test('the supercar parts exist with their sizes', () => {
  const size = k => [BRICK_TYPES[k].w, BRICK_TYPES[k].d, BRICK_TYPES[k].h];
  assert.deepEqual(size('superNose'), [4, 2, 2]);
  assert.deepEqual(size('airScoop'), [1, 2, 2]);
  assert.deepEqual(size('racingWing'), [4, 1, 4]);
  assert.deepEqual(size('scissorDoor'), [1, 2, 3]);
  assert.deepEqual(size('v12'), [2, 2, 2]);
  assert.deepEqual(size('badge'), [2, 1, 1]);
  assert.deepEqual(size('namePlate'), [4, 1, 1]);
  assert.equal(BRICK_TYPES.superWheel.kind, 'wheel');
  assert.equal(BRICK_TYPES.superWheel.radius, 0.38);
  assert.equal(BRICK_TYPES.racingWing.kind, 'spoiler');
  assert.equal(BRICK_TYPES.v12.power, 2);
  assert.equal(BRICK_TYPES.engine.power, 1);
});

test('a Supercar tray tab holds the new parts, after Wheels', () => {
  const g = TRAY_GROUPS.find(t => t.key === 'supercar');
  assert.equal(g.label, '🏎 Supercar');
  assert.deepEqual(g.types, NEW);
  assert.equal(TRAY_GROUPS.indexOf(g), TRAY_GROUPS.findIndex(t => t.key === 'wheels') + 1);
});

test('lime is a colour', () => assert.deepEqual(COLORS.lime, { name: 'Lime', hex: 0x9ccc65 }));

test('a badge brick may carry a brand key', () => {
  assert.ok(isValidBrick({ ...part('badge', -1, 3, 2), badge: 'ferrari' }));
  assert.ok(!isValidBrick({ ...part('badge', -1, 3, 2), badge: 7 }));
  assert.ok(isValidBrick(part('badge', -1, 3, 2)));
});

test('brands: real names, his own brand, and a safe default', () => {
  assert.deepEqual(Object.keys(BRANDS), ['lamborghini', 'ferrari', 'bugatti', 'mclaren', 'hero']);
  assert.deepEqual(['lamborghini', 'ferrari', 'bugatti', 'mclaren'].map(k => BRANDS[k].name), ['Lamborghini', 'Ferrari', 'Bugatti', 'McLaren']);
  assert.equal(BRANDS.hero.name, 'Murad Motors');
  assert.equal(DEFAULT_BADGE, 'hero');
  assert.equal(resolveBadge('nope'), BRANDS.hero);
  assert.equal(resolveBadge(undefined), BRANDS.hero);
  assert.equal(resolveBadge('ferrari'), BRANDS.ferrari);
  for (const b of Object.values(BRANDS)) assert.ok(b.mark && b.bg && b.fg && ['shield', 'oval', 'star'].includes(b.shape));
});

test('a V12 is an engine worth two', () => {
  const car = [makeChassis(), ...corners(), part('v12', -1, 1, -4), part('seat', -1, 1, -1, 'white')];
  assert.ok(raceReadiness(car).ready);
  const s = computeStats(car);
  assert.equal(s.engines, 2);
  assert.equal(s.v12s, 1);
  assert.equal(s.engineForce, 1050);
});

test('a V12 adds 2.5 m/s top speed on top of its engine power', () => {
  const penalty = m => Math.max(0, m - 130) / 25;
  const plain = computeStats([makeChassis(), ...corners(), part('engine', -1, 1, -4), part('engine', -1, 4, -4), part('seat', -1, 1, -1, 'white')]);
  const v12 = computeStats([makeChassis(), ...corners(), part('v12', -1, 1, -4), part('seat', -1, 1, -1, 'white')]);
  assert.ok(Math.abs(plain.topSpeed - (17 - penalty(plain.mass))) < 1e-9);
  assert.ok(Math.abs(v12.topSpeed - (17 + 2.5 - penalty(v12.mass))) < 1e-9);
});

test('two V12s reach the speed cap; more do not go past it', () => {
  const car = [makeChassis(), ...corners(), part('v12', -1, 1, -4), part('v12', -1, 3, -4), part('v12', -1, 5, -4), part('seat', -1, 1, -1, 'white')];
  const s = computeStats(car);
  assert.equal(s.topSpeed, LIMITS.maxTopSpeed);
  assert.equal(s.engineForce, 1350);
});

test('every new part is a valid brick type with a positive mass', () => {
  for (const k of NEW) assert.ok(BRICK_TYPES[k].mass > 0, k);
});

// --- the six supercar models ---
import { MODELS, modelToBricks, describeStep } from '../js/instructions.js';

const SUPERCARS = {
  aventador: ['Lamborghini Aventador', 'lamborghini', 350],
  huracan: ['Lamborghini Huracán', 'lamborghini', 325],
  sf90: ['Ferrari SF90 Stradale', 'ferrari', 340],
  laferrari: ['Ferrari LaFerrari', 'ferrari', 350],
  chiron: ['Bugatti Chiron', 'bugatti', 420],
  p1: ['McLaren P1', 'mclaren', 350],
};
const speed = key => computeStats(modelToBricks(MODELS[key])).topSpeed;

test('six supercars with their real names, brands and real top speeds', () => {
  for (const [key, [name, brand, kmh]] of Object.entries(SUPERCARS)) {
    assert.deepEqual([MODELS[key]?.name, MODELS[key]?.brand, MODELS[key]?.realTopSpeed], [name, brand, kmh], key);
  }
});

test('each supercar is built from the supercar parts and wears its own badge', () => {
  for (const [key, [, brand]] of Object.entries(SUPERCARS)) {
    const steps = MODELS[key].steps;
    for (const t of ['v12', 'superWheel', 'superNose', 'badge', 'namePlate']) assert.ok(steps.some(s => s.type === t), `${key} uses ${t}`);
    for (const s of steps.filter(s => s.type === 'badge' || s.type === 'namePlate')) assert.equal(s.badge, brand, key);
    assert.ok(raceReadiness(modelToBricks(MODELS[key])).ready, key);
  }
});

test('supercars are the fastest cars, and the Bugatti Chiron is the fastest of all', () => {
  const others = Object.keys(MODELS).filter(k => !(k in SUPERCARS));
  const slowestSuper = Math.min(...Object.keys(SUPERCARS).map(speed));
  const fastestOther = Math.max(...others.map(speed));
  assert.ok(slowestSuper > fastestOther, `${slowestSuper} vs ${fastestOther}`);
  for (const k of Object.keys(SUPERCARS)) if (k !== 'chiron') assert.ok(speed('chiron') > speed(k), k);
});

test('a badge step says whose badge it is', () => {
  const step = MODELS.aventador.steps.find(s => s.type === 'badge');
  assert.equal(describeStep(step), 'Find the Badge and put it on the glowing spot! It is the Lamborghini badge.');
  const plate = MODELS.chiron.steps.find(s => s.type === 'namePlate');
  assert.equal(describeStep(plate), 'Find the Name Plate and put it on the glowing spot! It says Bugatti.');
});
