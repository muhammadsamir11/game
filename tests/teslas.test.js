import test from 'node:test';
import assert from 'node:assert/strict';
import { BRICK_TYPES, TRAY_GROUPS, COLORS, makeChassis, isValidBrick } from '../js/bricks.js';
import { raceReadiness, buildReadiness, computeStats, isElectric } from '../js/carStats.js';
import { BRANDS, EMBLEMS, resolveBadge, pickerBrandKeys } from '../js/brands.js';
import { TESLA_T, tracePath, drawBadge, drawNamePlate } from '../js/badgeArt.js';
import { MODELS, modelToBricks, describeStep } from '../js/instructions.js';

const part = (type, x, y, z, color = 'black', r = 0) => ({ type, color, x, y, z, r });
const corners = (type = 'aeroWheel') => [part(type, -3, 0, 2), part(type, 2, 0, 2), part(type, -3, 0, -4), part(type, 2, 0, -4)];
const NEW = ['battery', 'eMotor', 'smoothNose', 'aeroWheel', 'sideDoor', 'falconDoor', 'glassRoof', 'cyberWedge'];
const TESLAS = {
  teslaModelS: ['Tesla Model S Plaid', 322],
  teslaModel3: ['Tesla Model 3', 225],
  teslaModelX: ['Tesla Model X', 262],
  teslaModelY: ['Tesla Model Y', 217],
  teslaRoadster: ['Tesla Roadster', 400],
  cybertruck: ['Tesla Cybertruck', 209],
};
const speed = key => computeStats(modelToBricks(MODELS[key])).topSpeed;
const seat = part('seat', -1, 2, -1, 'white');

test('the Tesla parts exist with whole-number sizes and a weight, in a ⚡ Tesla tab after the Supercar tab', () => {
  for (const k of NEW) {
    const t = BRICK_TYPES[k];
    assert.ok(t, k);
    for (const n of [t.w, t.d, t.h]) assert.ok(Number.isInteger(n) && n > 0, `${k} size`);
    assert.ok(t.mass > 0, k);
  }
  const g = TRAY_GROUPS.find(t => t.key === 'tesla');
  assert.equal(g.label, '⚡ Tesla');
  assert.deepEqual(g.types, NEW);
  assert.equal(TRAY_GROUPS.indexOf(g), TRAY_GROUPS.findIndex(t => t.key === 'supercar') + 1);
  assert.equal(BRICK_TYPES.aeroWheel.kind, 'wheel');
});

test('silver is a colour, so a Cybertruck can be stainless steel', () => {
  assert.equal(COLORS.silver.name, 'Silver');
  assert.ok(isValidBrick(part('brick12', -2, 1, 0, 'silver')));
});

test('a battery pack counts as the engine, with or without motors', () => {
  const car = [makeChassis(), ...corners(), part('battery', -2, 1, -2), seat];
  assert.ok(raceReadiness(car).ready);
  assert.ok(buildReadiness(car).checks.engine);
  assert.equal(computeStats(car).engines, 1);
  assert.ok(isElectric(car));
  assert.ok(!isElectric([...car, part('engine', -1, 1, -4)]), 'with a fuel engine too it still roars');
});

test('an electric motor alone is not an engine: it needs a battery', () => {
  const car = [makeChassis(), ...corners(), part('eMotor', -1, 1, -4), part('seat', -1, 1, -1, 'white')];
  assert.equal(raceReadiness(car).engine, false);
  assert.equal(computeStats(car).motors, 0);
});

test('each motor (up to three) adds top speed and quick get-up-and-go', () => {
  const withMotors = n => computeStats([makeChassis(), ...corners(), part('battery', -2, 1, -2), seat,
    ...[[-2, -4], [0, -4], [-1, -3], [-2, -3]].slice(0, n).map(([x, z]) => part('eMotor', x, 1, z))]);
  const [none, one, two, three, four] = [0, 1, 2, 3, 4].map(withMotors);
  assert.ok(one.topSpeed > none.topSpeed && two.topSpeed > one.topSpeed && three.topSpeed > two.topSpeed);
  assert.ok(one.engineForce > none.engineForce && three.engineForce > two.engineForce);
  assert.equal(four.motors, 3);
  assert.ok(Math.abs(four.topSpeed - three.topSpeed) < 0.2, 'a fourth motor only adds its weight');
});

test('Tesla brand: its name, the red T, Tesla red, and it is in the badge picker', () => {
  assert.equal(BRANDS.tesla.name, 'Tesla');
  assert.equal(BRANDS.tesla.emblem, 'teslaT');
  assert.equal(BRANDS.tesla.colors.main, '#e82127');
  assert.ok(!BRANDS.tesla.prize);
  assert.ok(EMBLEMS.includes('teslaT'));
  assert.ok(pickerBrandKeys().includes('tesla'));
  assert.equal(resolveBadge('tesla'), BRANDS.tesla);
});

// A stand-in for a canvas 2D context that records every call and every point drawn.
function fakeContext() {
  const calls = [];
  const points = [];
  const at = (x, y) => points.push([x, y]);
  const g = {
    calls, points, font: '',
    moveTo: at, lineTo: at,
    quadraticCurveTo: (ax, ay, x, y) => { at(ax, ay); at(x, y); },
    measureText: text => ({ width: text.length * (parseFloat(g.font.match(/(\d+(\.\d+)?)px/)?.[1]) || 10) * 0.6 }),
  };
  return new Proxy(g, { get: (target, name) => (name in target ? target[name] : (...args) => calls.push([name, ...args])) });
}

test('the T badge is red and white with no letters, inside the badge; the plate says TESLA', () => {
  const grid = fakeContext();
  tracePath(grid, TESLA_T);
  for (const [x, y] of grid.points) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${x},${y}`);
  const g = fakeContext();
  drawBadge(g, BRANDS.tesla, 256, 256);
  assert.ok(g.calls.some(([c]) => c === 'fill'));
  assert.ok(g.calls.some(([c]) => c === 'stroke'));
  assert.ok(!g.calls.some(([c]) => c === 'fillText'));
  assert.equal(g.fillStyle, '#e82127');
  for (const [x, y] of g.points) assert.ok(x >= 0 && x <= 256 && y >= 0 && y <= 256, `${x},${y}`);
  const plate = fakeContext();
  drawNamePlate(plate, BRANDS.tesla, 512, 128);
  assert.equal(plate.calls.filter(([c]) => c === 'fillText').map(([, t]) => t).join(''), 'TESLA');
});

test('six Teslas with their real names and top speeds, near the supercars at the top of the build list', () => {
  for (const [key, [name, kmh]] of Object.entries(TESLAS)) {
    assert.deepEqual([MODELS[key]?.name, MODELS[key]?.brand, MODELS[key]?.realTopSpeed, MODELS[key]?.electric], [name, 'tesla', kmh, true], key);
  }
  const keys = Object.keys(MODELS);
  assert.deepEqual(keys.slice(keys.indexOf('p1') + 1, keys.indexOf('p1') + 7), Object.keys(TESLAS));
});

test('every Tesla is electric (a battery, no engine), wears the T badge and is ready to race', () => {
  for (const key of Object.keys(TESLAS)) {
    const bricks = modelToBricks(MODELS[key]);
    assert.ok(isElectric(bricks), key);
    assert.ok(bricks.some(b => b.type === 'eMotor'), `${key} has a motor`);
    assert.ok(!bricks.some(b => b.type === 'engine' || b.type === 'v12' || b.type === 'exhaust'), `${key} has no engine`);
    assert.ok(bricks.some(b => b.type === 'badge' && b.badge === 'tesla'), `${key} badge`);
    for (const b of bricks.filter(b => b.badge)) assert.equal(b.badge, 'tesla', key);
    assert.ok(raceReadiness(bricks).ready, key);
  }
  for (const key of ['teslaModelS', 'teslaModel3', 'teslaModelX', 'teslaModelY']) {
    const types = MODELS[key].steps.map(s => s.type);
    for (const t of ['smoothNose', 'glassRoof', 'aeroWheel']) assert.ok(types.includes(t), `${key} uses ${t}`);
  }
  assert.ok(MODELS.teslaModelX.steps.some(s => s.type === 'falconDoor'), 'the Model X has falcon doors');
});

test('the Cybertruck is stainless steel and wedge-shaped, with a white light bar at the front and a red one at the back', () => {
  const steps = MODELS.cybertruck.steps;
  const wedges = steps.filter(s => s.type === 'cyberWedge');
  assert.deepEqual(wedges.map(s => [s.color, s.r]), [['silver', 0], ['silver', 2]]);
  const body = steps.filter(s => !BRICK_TYPES[s.type].fixedColor && !['seat', 'steering'].includes(s.type) && BRICK_TYPES[s.type].kind !== 'wheel');
  assert.ok(body.length >= 6 && body.every(s => s.color === 'silver'));
});

test('Tesla speeds follow the real ones: Cybertruck slowest, the Plaid near the supercars, the Roadster fastest', () => {
  const order = Object.keys(TESLAS).sort((a, b) => TESLAS[a][1] - TESLAS[b][1]);
  for (let i = 1; i < order.length; i++) assert.ok(speed(order[i]) >= speed(order[i - 1]), `${order[i - 1]} < ${order[i]}`);
  assert.ok(speed('teslaModel3') > speed('raceCar'), 'faster than the toy cars');
  assert.ok(speed('teslaModelS') < speed('huracan'), 'the Plaid is just behind the supercars');
  assert.ok(speed('teslaRoadster') > speed('aventador') && speed('teslaRoadster') < speed('chiron'), 'the Roadster beats the supercars but not the Bugatti');
});

test('a Tesla can be repainted for town traffic, keeping its wheels, glass and badge', () => {
  const bricks = modelToBricks(MODELS.teslaModel3, { blue: 'red' });
  assert.ok(!bricks.some(b => b.color === 'blue'));
  assert.ok(bricks.filter(b => b.type === 'sideDoor' || b.type === 'smoothNose').every(b => b.color === 'red'));
  assert.equal(bricks.find(b => b.type === 'badge').badge, 'tesla');
});

test('the steps name the Tesla parts and the T badge', () => {
  assert.equal(describeStep(MODELS.teslaModel3.steps.find(s => s.type === 'battery')), 'Find the Battery Pack and put it on the glowing spot!');
  assert.equal(describeStep(MODELS.teslaModel3.steps.find(s => s.type === 'badge')), 'Find the Badge and put it on the glowing spot! It is the Tesla badge.');
  assert.equal(describeStep(MODELS.cybertruck.steps.find(s => s.type === 'cyberWedge')), 'Find a silver Cyber Wedge and put it on the glowing spot!');
});
