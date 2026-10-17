import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIZE_CARS, prizeByKey, prizeBricks, carBounds } from '../js/prizeCars.js';
import { MODELS, modelToBricks } from '../js/instructions.js';
import { computeStats, raceReadiness, LIMITS } from '../js/carStats.js';
import { isValidBrick } from '../js/bricks.js';
import { MAX_BRICKS } from '../js/net/protocol.js';
import { cleanCar } from '../server/rooms.js';

test('three prize cars in order with goals 150, 200, 250', () => {
  assert.deepEqual(PRIZE_CARS.map(c => [c.key, c.goal]), [['phantom', 150], ['gwagon', 200], ['limo', 250]]);
  assert.deepEqual(PRIZE_CARS.map(c => c.sayName), ['A Rolls-Royce Phantom!', 'A Mercedes G-Wagon!', 'A stretch limousine!']);
  assert.equal(prizeByKey('gwagon'), PRIZE_CARS[1]);
  assert.equal(prizeByKey('nope'), null);
  assert.ok(!PRIZE_CARS.some(c => c.finale), 'batch 1 has no finale');
});

test('every prize car is race-ready, valid, within limits and slower than the Chiron', () => {
  const chiron = computeStats(modelToBricks(MODELS.chiron)).topSpeed;
  for (const { key } of PRIZE_CARS) {
    const bricks = prizeBricks(key);
    assert.ok(raceReadiness(bricks).ready, key);
    assert.ok(bricks.every(isValidBrick) && bricks.length <= MAX_BRICKS, key);
    const s = computeStats(bricks);
    assert.ok(s.topSpeed >= LIMITS.minTopSpeed && s.topSpeed < chiron, `${key} ${s.topSpeed} < ${chiron}`);
    assert.ok(carBounds(bricks).height < 3.2, `${key} fits under a garage floor`);
    assert.ok(cleanCar({ name: key, bricks }), `${key} can be sent to friends`);
  }
});

test('each car carries its trick pieces and badge', () => {
  const has = (key, type, n = 1) => prizeBricks(key).filter(b => b.type === type).length >= n;
  assert.ok(has('phantom', 'grille') && has('phantom', 'ornament') && has('phantom', 'coachDoor', 2) && has('phantom', 'starRoof'));
  assert.ok(has('gwagon', 'wheelOffroad', 4) && has('gwagon', 'spareWheel') && has('gwagon', 'sidePipe', 2));
  assert.ok(has('limo', 'limoPlate', 2) && has('limo', 'discoPanel', 2) && has('limo', 'horn'));
  assert.equal(prizeBricks('phantom').find(b => b.type === 'badge').badge, 'rollsRoyce');
  assert.equal(prizeBricks('gwagon').find(b => b.type === 'badge').badge, 'mercedes');
  assert.equal(prizeBricks('limo').find(b => b.type === 'badge').badge, 'hero');
  const doors = prizeBricks('phantom').filter(b => b.type === 'coachDoor');
  assert.ok(doors.some(b => b.x < 0) && doors.some(b => b.x >= 0), 'a coach door on each side');
});

test('the G-Wagon pulls hardest and the limo is clearly the longest', () => {
  const force = k => computeStats(prizeBricks(k)).engineForce;
  assert.ok(force('gwagon') > force('phantom') && force('gwagon') > force('limo'));
  assert.ok(carBounds(prizeBricks('limo')).length >= 6.5);
  assert.ok(carBounds(prizeBricks('limo')).length > carBounds(prizeBricks('phantom')).length + 2);
});

test('prize cars are not in the build chooser', () => {
  for (const { key } of PRIZE_CARS) assert.equal(MODELS[key], undefined);
});

test('prizeBricks gives a fresh copy each time', () => {
  const a = prizeBricks('phantom');
  a[0].x = 99;
  assert.notEqual(prizeBricks('phantom')[0].x, 99);
});
