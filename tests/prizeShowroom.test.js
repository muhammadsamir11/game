import test from 'node:test';
import assert from 'node:assert/strict';
import { createShowroomStore, canStartQuiz, localDay, missingPrizes, stalePrizes, prizeCarFor, SHOWROOM_KEY } from '../js/prizeShowroom.js';
import { PRIZE_CARS, prizeBricks } from '../js/prizeCars.js';
import { assignSpots, SPOT_COUNT } from '../js/cityState.js';
import { createGarage } from '../js/storage.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

// A clock he can set: the tablet's calendar day.
const calendar = (day = '2026-10-17') => { const c = { day, today: () => c.day }; return c; };

test('the first mystery is ready for its questions straight away', () => {
  const s = createShowroomStore(memoryStorage(), { today: calendar().today });
  assert.deepEqual(s.status(), { mode: 'quiz', next: 'phantom', level: 1 });
});

test('a win saves before any animation, and the next car waits until the next day', () => {
  const mem = memoryStorage();
  const cal = calendar('2026-10-17');
  const s = createShowroomStore(mem, { today: cal.today });
  assert.equal(s.reveal(), 'phantom');
  const again = createShowroomStore(mem, { today: cal.today });
  assert.deepEqual(again.get().unlocked, ['phantom']);
  assert.deepEqual(again.status(), { mode: 'tomorrow', next: 'gwagon', level: 2 });
  assert.equal(again.reveal(), null, 'no second car the same day');
  cal.day = '2026-10-18';
  assert.deepEqual(again.status(), { mode: 'quiz', next: 'gwagon', level: 2 });
});

test('skipping days does not pile cars up: still one a day', () => {
  const cal = calendar('2026-10-17');
  const s = createShowroomStore(memoryStorage(), { today: cal.today });
  s.reveal();
  cal.day = '2026-10-25';
  assert.equal(s.reveal(), 'gwagon');
  assert.equal(s.status().mode, 'tomorrow');
});

test('after the batch the turntable says coming soon; a later car is a new day\'s mystery', () => {
  const mem = memoryStorage();
  const cal = calendar('2026-10-17');
  const s = createShowroomStore(mem, { today: cal.today });
  for (const day of ['2026-10-17', '2026-10-18', '2026-10-19']) {
    cal.day = day;
    s.reveal();
  }
  assert.deepEqual(s.get().unlocked, ['phantom', 'gwagon', 'limo']);
  assert.deepEqual(s.status(), { mode: 'soon', next: null, level: 0 });
  cal.day = '2026-11-02';
  const later = [...PRIZE_CARS, { key: 'bentley', level: 3 }];
  assert.deepEqual(createShowroomStore(mem, { today: cal.today, lineup: later }).status(), { mode: 'quiz', next: 'bentley', level: 3 });
  const all = [{ key: 'phantom', level: 1, finale: true }];
  assert.equal(createShowroomStore(memoryStorage({ [SHOWROOM_KEY]: '{"unlocked":["phantom"]}' }), { lineup: all }).status().mode, 'done');
});

test('odd saves load as fresh or are tidied; coin-goal saves from before keep his cars', () => {
  for (const raw of ['{oops', '[]', 'null', '7']) {
    assert.deepEqual(createShowroomStore(memoryStorage({ [SHOWROOM_KEY]: raw })).get(), { unlocked: [], driven: [], starsSeen: false, lastWinDay: null }, raw);
  }
  const tidy = createShowroomStore(memoryStorage({ [SHOWROOM_KEY]: '{"startCoins":5,"unlocked":["phantom","nope","phantom","limo"],"driven":["limo","zz"],"starsSeen":1,"lastWinDay":42}' })).get();
  assert.deepEqual(tidy, { unlocked: ['phantom'], driven: [], starsSeen: false, lastWinDay: null });
});

test('driven cars and the starry roof are remembered', () => {
  const mem = memoryStorage();
  const s = createShowroomStore(mem, { today: calendar().today });
  s.reveal();
  s.markDriven('phantom');
  s.markDriven('phantom');
  s.markDriven('limo'); // not unlocked: ignored
  s.seeStars();
  assert.deepEqual(createShowroomStore(mem).get(), { unlocked: ['phantom'], driven: ['phantom'], starsSeen: true, lastWinDay: '2026-10-17' });
});

test('the grown-ups\' shortcut skips the wait for the next day', () => {
  const cal = calendar();
  const s = createShowroomStore(memoryStorage(), { today: cal.today });
  s.reveal();
  assert.equal(s.status().mode, 'tomorrow');
  s.debugReady();
  assert.equal(s.status().mode, 'quiz');
});

test('storage that cannot save keeps working for this visit', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const s = createShowroomStore(broken, { today: calendar().today });
  assert.equal(s.reveal(), 'phantom');
  assert.deepEqual(s.get().unlocked, ['phantom']);
});

test('the tablet\'s calendar day, in its own time zone', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDay(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
});

test('the questions can start in front of the turntable, standing still, with nothing else going on', () => {
  const ok = { mode: 'quiz', inZone: true, speed: 0, busy: false };
  assert.equal(canStartQuiz(ok), true);
  for (const change of [{ mode: 'tomorrow' }, { mode: 'soon' }, { inZone: false }, { speed: 3 }, { busy: true }]) assert.equal(canStartQuiz({ ...ok, ...change }), false, JSON.stringify(change));
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
