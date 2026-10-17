import test from 'node:test';
import assert from 'node:assert/strict';
import { createShowroomStore, shouldStartReveal, missingPrizes, stalePrizes, prizeCarFor, SHOWROOM_KEY } from '../js/prizeShowroom.js';
import { PRIZE_CARS, prizeBricks } from '../js/prizeCars.js';
import { assignSpots, SPOT_COUNT } from '../js/cityState.js';
import { createGarage } from '../js/storage.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

test('fresh store counts from coinsNow', () => {
  const s = createShowroomStore(memoryStorage(), { coinsNow: 3000 });
  assert.deepEqual(s.status(3000), { mode: 'mystery', next: 'phantom', have: 0, goal: 150 });
  assert.equal(s.status(3149).mode, 'mystery');
  assert.deepEqual(s.status(3150), { mode: 'ready', next: 'phantom', have: 150, goal: 150 });
  assert.deepEqual(s.status(9000), { mode: 'ready', next: 'phantom', have: 150, goal: 150 });
});

test('the first open is remembered, so reopening later does not restart the count', () => {
  const mem = memoryStorage();
  createShowroomStore(mem, { coinsNow: 10 });
  assert.equal(createShowroomStore(mem, { coinsNow: 90 }).status(90).have, 80);
});

test('reveal persists before any animation, and the next goal counts from that moment', () => {
  const mem = memoryStorage();
  const s = createShowroomStore(mem, { coinsNow: 0 });
  assert.equal(s.reveal(100), null);
  assert.equal(s.reveal(170), 'phantom');
  const again = createShowroomStore(mem, { coinsNow: 9999 });
  assert.deepEqual(again.get().unlocked, ['phantom']);
  assert.deepEqual(again.status(170), { mode: 'mystery', next: 'gwagon', have: 0, goal: 200 });
});

test('after the batch the turntable says coming soon, and a later car counts from the last reveal', () => {
  const mem = memoryStorage();
  const s = createShowroomStore(mem, { coinsNow: 0 });
  s.reveal(150); s.reveal(350); s.reveal(600);
  assert.deepEqual(s.get().unlocked, ['phantom', 'gwagon', 'limo']);
  assert.deepEqual(s.status(5000), { mode: 'soon', next: null, have: 0, goal: 0 });
  assert.equal(s.reveal(5000), null);
  const later = [...PRIZE_CARS, { key: 'bentley', goal: 300 }];
  assert.deepEqual(createShowroomStore(mem, { coinsNow: 0, lineup: later }).status(900), { mode: 'ready', next: 'bentley', have: 300, goal: 300 });
  assert.equal(createShowroomStore(mem, { coinsNow: 0, lineup: [...PRIZE_CARS, { key: 'gold', goal: 450, finale: true }] }).status(600).mode, 'mystery');
  const all = [{ key: 'phantom', goal: 150, finale: true }];
  assert.equal(createShowroomStore(memoryStorage({ [SHOWROOM_KEY]: '{"startCoins":0,"unlocked":["phantom"]}' }), { lineup: all }).status(0).mode, 'done');
});

test('odd saves load as fresh or are tidied', () => {
  for (const raw of ['{oops', '[]', 'null', '{"startCoins":"5"}', '{"startCoins":1.5}', '{"unlocked":"x"}']) {
    assert.deepEqual(createShowroomStore(memoryStorage({ [SHOWROOM_KEY]: raw }), { coinsNow: 7 }).get(), { startCoins: 7, unlocked: [], driven: [], starsSeen: false }, raw);
  }
  const tidy = createShowroomStore(memoryStorage({ [SHOWROOM_KEY]: '{"startCoins":5,"unlocked":["phantom","nope","phantom","limo"],"driven":["limo","zz"],"starsSeen":1}' }), { coinsNow: 0 }).get();
  assert.deepEqual(tidy, { startCoins: 5, unlocked: ['phantom'], driven: [], starsSeen: false });
});

test('driven cars and the starry roof are remembered', () => {
  const mem = memoryStorage();
  const s = createShowroomStore(mem, { coinsNow: 0 });
  s.reveal(150);
  s.markDriven('phantom');
  s.markDriven('phantom');
  s.markDriven('limo'); // not unlocked: ignored
  s.seeStars();
  assert.deepEqual(createShowroomStore(mem, { coinsNow: 0 }).get(), { startCoins: 150, unlocked: ['phantom'], driven: ['phantom'], starsSeen: true });
});

test('coins are never touched', () => {
  const s = createShowroomStore(memoryStorage(), { coinsNow: 40 });
  s.debugReady(40);
  assert.equal(s.status(40).mode, 'ready');
  assert.equal(s.reveal(40), 'phantom');
  assert.equal(s.get().startCoins, 40);
});

test('a debug start below zero survives a reload without losing his cars', () => {
  const mem = memoryStorage();
  const s = createShowroomStore(mem, { coinsNow: 0 });
  s.reveal(150);
  s.debugReady(150);
  const again = createShowroomStore(mem, { coinsNow: 150 });
  assert.deepEqual(again.get().unlocked, ['phantom']);
  assert.equal(again.status(150).mode, 'ready');
});

test('storage that cannot save keeps working for this visit', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const s = createShowroomStore(broken, { coinsNow: 0 });
  assert.equal(s.reveal(150), 'phantom');
  assert.deepEqual(s.get().unlocked, ['phantom']);
});

test('shouldStartReveal waits for a ready goal, the zone, a stop and no mission or game', () => {
  const ok = { mode: 'ready', inZone: true, speed: 0, busy: false };
  assert.equal(shouldStartReveal(ok), true);
  for (const change of [{ mode: 'mystery' }, { mode: 'soon' }, { inZone: false }, { speed: 3 }, { busy: true }]) assert.equal(shouldStartReveal({ ...ok, ...change }), false, JSON.stringify(change));
});

test('missingPrizes finds unlocked cars that are gone', () => {
  assert.deepEqual(missingPrizes([{ prize: 'phantom' }, {}], ['phantom', 'gwagon']), ['gwagon']);
  assert.deepEqual(missingPrizes([], []), []);
});

test('prizeCarFor gives a car ready for the garage', () => {
  assert.deepEqual(prizeCarFor('gwagon'), { name: 'Mercedes G-Wagon', bricks: prizeBricks('gwagon'), prize: 'gwagon' });
  assert.equal(prizeCarFor('nope'), null);
});

test('restoring a missing prize gives a garage car with its mark', () => {
  const g = createGarage(memoryStorage());
  for (const k of missingPrizes(g.list(), ['phantom'])) g.save(prizeCarFor(k));
  assert.equal(g.list()[0].prize, 'phantom');
  assert.equal(g.list()[0].bricks.length, prizeBricks('phantom').length);
  assert.deepEqual(missingPrizes(g.list(), ['phantom']), []);
});

test('a prize car waits unparked when all 24 spots are taken', () => {
  const ids = Array.from({ length: SPOT_COUNT }, (_, i) => `car${i}`);
  const spots = assignSpots([...ids, 'prize'], {});
  assert.equal(spots.prize, undefined);
  assert.equal(Object.keys(spots).length, SPOT_COUNT);
});

test('stalePrizes finds prize cars saved from an older recipe, so they can be brought up to date', () => {
  const fresh = { id: 'a', prize: 'limo', bricks: prizeBricks('limo') };
  const old = { id: 'b', prize: 'phantom', bricks: prizeBricks('phantom').slice(0, 5) };
  const mine = { id: 'c', bricks: prizeBricks('gwagon').slice(0, 3) };
  assert.deepEqual(stalePrizes([fresh, old, mine]).map(c => c.id), ['b']);
});
