import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChassis } from '../js/bricks.js';
import { createGarage, GARAGE_KEY } from '../js/storage.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } };
}
const zoomer = () => ({ name: 'Zoomer', bricks: [makeChassis()] });

test('a saved car is still there after reopening the garage', () => {
  const storage = memoryStorage();
  const saved = createGarage(storage).save(zoomer());
  const reopened = createGarage(storage);
  assert.equal(reopened.list().length, 1);
  assert.equal(reopened.get(saved.id).name, 'Zoomer');
  assert.deepEqual(reopened.get(saved.id).bricks, [makeChassis()]);
  assert.equal(typeof saved.updatedAt, 'number');
});

test('saving with an existing id updates that car instead of adding one', () => {
  const garage = createGarage(memoryStorage());
  const first = garage.save(zoomer());
  garage.save({ id: first.id, name: 'Zoomer 2', bricks: first.bricks });
  assert.equal(garage.list().length, 1);
  assert.equal(garage.get(first.id).name, 'Zoomer 2');
});

test('remove deletes a car and get returns null for it', () => {
  const garage = createGarage(memoryStorage());
  const car = garage.save(zoomer());
  garage.remove(car.id);
  assert.equal(garage.get(car.id), null);
  assert.deepEqual(garage.list(), []);
});

test('blank names become "My Car" and long names are trimmed to 24 characters', () => {
  const garage = createGarage(memoryStorage());
  assert.equal(garage.save({ name: '   ', bricks: [makeChassis()] }).name, 'My Car');
  assert.equal(garage.save({ name: undefined, bricks: [makeChassis()] }).name, 'My Car');
  assert.equal(garage.save({ name: 'The Super Duper Mega Fast Rocket Car', bricks: [makeChassis()] }).name.length, 24);
});

test('changing a returned car does not change the saved one', () => {
  const garage = createGarage(memoryStorage());
  const car = garage.save(zoomer());
  garage.get(car.id).bricks.push({ type: 'brick22', color: 'red', x: 0, y: 1, z: 0, r: 0 });
  assert.equal(garage.get(car.id).bricks.length, 1);
});

test('broken JSON in storage gives an empty garage instead of crashing', () => {
  assert.deepEqual(createGarage(memoryStorage({ [GARAGE_KEY]: '{not json' })).list(), []);
  assert.deepEqual(createGarage(memoryStorage({ [GARAGE_KEY]: '{"a":1}' })).list(), []);
});

test('cars with unknown bricks or missing fields are skipped, good cars are kept', () => {
  const good = { id: 'car-1', name: 'Good', bricks: [makeChassis()], updatedAt: 1 };
  const badBrick = { id: 'car-2', name: 'Bad', bricks: [{ ...makeChassis(), type: 'teleporter' }], updatedAt: 1 };
  const noName = { id: 'car-3', bricks: [makeChassis()] };
  const storage = memoryStorage({ [GARAGE_KEY]: JSON.stringify([good, badBrick, noName, null, 'junk']) });
  assert.deepEqual(createGarage(storage).list().map(c => c.id), ['car-1']);
});

test('when storage refuses to save, the garage still works for this visit', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const garage = createGarage(storage);
  const car = garage.save(zoomer());
  assert.equal(garage.get(car.id).name, 'Zoomer');
});

test('works with no storage at all', () => {
  const garage = createGarage(null);
  garage.save(zoomer());
  assert.equal(garage.list().length, 1);
});

test('a passenger seat keeps its rider when the car is saved and loaded', () => {
  const storage = memoryStorage();
  const bricks = [makeChassis(), { type: 'passengerSeat', color: 'white', x: 0, y: 1, z: 0, r: 0, rider: 'preset:chef' }];
  const saved = createGarage(storage).save({ name: 'Taxi', bricks });
  assert.equal(createGarage(storage).get(saved.id).bricks[1].rider, 'preset:chef');
  assert.equal('rider' in createGarage(storage).get(saved.id).bricks[0], false);
});
