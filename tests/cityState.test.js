import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSpots, createCityStore, CITY_KEY, SPOT_COUNT } from '../js/cityState.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const ids = n => Array.from({ length: n }, (_, i) => `car-${i}`);

test('cars keep their saved spots and new cars get the lowest free spot', () => {
  assert.deepEqual(assignSpots(['a', 'b', 'c'], { a: 3, b: 0 }), { a: 3, b: 0, c: 1 });
});

test('a deleted car frees its spot for the next new car', () => {
  const first = assignSpots(['a', 'b'], {});
  assert.deepEqual(first, { a: 0, b: 1 });
  assert.deepEqual(assignSpots(['b', 'c'], first), { b: 1, c: 0 });
});

test('only 24 cars fit; extras get no spot', () => {
  assert.equal(SPOT_COUNT, 24);
  const spots = assignSpots(ids(27), {});
  assert.equal(Object.keys(spots).length, SPOT_COUNT);
  assert.equal(spots['car-12'], 12);
  assert.equal(spots['car-26'], undefined);
  assert.deepEqual(new Set(Object.values(spots)).size, SPOT_COUNT);
});

test('broken saved spots are ignored (out of range, duplicates, not numbers)', () => {
  assert.deepEqual(assignSpots(['a', 'b', 'c', 'd'], { a: 99, b: 2, c: 2, d: 'x' }), { b: 2, a: 0, c: 1, d: 3 });
  assert.deepEqual(assignSpots(['a'], null), { a: 0 });
});

test('the store saves spots and remembers them next visit', () => {
  const storage = memoryStorage();
  createCityStore(storage).spotsFor(['a', 'b']);
  assert.deepEqual(createCityStore(storage).spotsFor(['b', 'a']), { a: 0, b: 1 });
});

test('parking in a free spot moves the car there', () => {
  const store = createCityStore(memoryStorage());
  store.spotsFor(['a', 'b']);
  assert.equal(store.park('a', 7), true);
  assert.deepEqual(store.spotsFor(['a', 'b']), { a: 7, b: 1 });
});

test('parking in a spot another car owns is refused; parking in your own spot is fine', () => {
  const store = createCityStore(memoryStorage());
  store.spotsFor(['a', 'b']);
  assert.equal(store.park('a', 1), false);
  assert.equal(store.park('b', 1), true);
  assert.deepEqual(store.spotsFor(['a', 'b']), { a: 0, b: 1 });
});

test('a spot that does not exist cannot be parked in', () => {
  const store = createCityStore(memoryStorage());
  store.spotsFor(['a']);
  assert.equal(store.park('a', SPOT_COUNT), false);
  assert.equal(store.park('a', -1), false);
});

test('unreadable saved data gives everyone a fresh spot', () => {
  const store = createCityStore(memoryStorage({ [CITY_KEY]: '{nope' }));
  assert.deepEqual(store.spotsFor(['a', 'b']), { a: 0, b: 1 });
});

test('works when storage refuses to save or does not exist', () => {
  const broken = createCityStore({ getItem: () => null, setItem: () => { throw new Error('full'); } });
  assert.deepEqual(broken.spotsFor(['a']), { a: 0 });
  assert.deepEqual(createCityStore(null).spotsFor(['a']), { a: 0 });
});
