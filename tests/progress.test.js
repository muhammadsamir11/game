import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressStore, PROGRESS_KEY } from '../js/progress.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

test('a fresh store starts at zero', () => {
  assert.deepEqual(createProgressStore(memoryStorage()).get(), { coins: 0, missionsDone: 0 });
});

test('coins and missions are saved and reloaded', () => {
  const s = memoryStorage();
  const a = createProgressStore(s);
  assert.equal(a.addCoins(5), 5);
  assert.equal(a.addCoins(20), 25);
  assert.equal(a.missionDone(), 1);
  assert.deepEqual(createProgressStore(s).get(), { coins: 25, missionsDone: 1 });
});

test('unreadable or odd data reads as zero', () => {
  for (const raw of ['{oops', '[]', '{"coins":-4,"missionsDone":1.5}', '{"coins":"7"}']) {
    assert.deepEqual(createProgressStore(memoryStorage({ [PROGRESS_KEY]: raw })).get(), { coins: 0, missionsDone: 0 }, raw);
  }
});

test('coins never go down', () => {
  const p = createProgressStore(memoryStorage());
  p.addCoins(10);
  p.addCoins(-3);
  p.addCoins(NaN);
  p.addCoins(2.5);
  assert.equal(p.get().coins, 10);
});

test('storage that cannot save keeps counting for this visit', () => {
  const p = createProgressStore({ getItem: () => null, setItem() { throw new Error('full'); } });
  assert.equal(p.addCoins(3), 3);
  assert.equal(p.missionDone(), 1);
});
