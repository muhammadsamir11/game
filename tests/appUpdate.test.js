import test from 'node:test';
import assert from 'node:assert/strict';
import { watchForUpdates } from '../js/appUpdate.js';

// A pretend browser: the service worker container, the page's visibility, a clock and reloads.
function fakeBrowser({ controlled = true, safe = true } = {}) {
  const container = new EventTarget();
  container.controller = controlled ? {} : null;
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  const timers = [];
  const b = {
    container, doc, safe, checks: 0, reloads: 0,
    registration: { update: async () => { b.checks++; } },
    setInterval: (fn, ms) => timers.push({ fn, ms }),
    tick: () => timers.forEach(t => t.fn()),
    timers,
    show(state) { doc.visibilityState = state; doc.dispatchEvent(new Event('visibilitychange')); },
    newVersion() { container.controller = {}; container.dispatchEvent(new Event('controllerchange')); },
  };
  b.watch = () => watchForUpdates({
    registration: b.registration, container, doc, setInterval: b.setInterval,
    canReload: () => b.safe, reload: () => { b.reloads++; },
  });
  return b;
}

test('coming back to the app (it was only in the background) checks for a new version', () => {
  const b = fakeBrowser();
  b.watch();
  b.show('hidden');
  assert.equal(b.checks, 0);
  b.show('visible');
  assert.equal(b.checks, 1);
});

test('while the app stays open it still checks now and then', () => {
  const b = fakeBrowser();
  b.watch();
  assert.equal(b.timers.length, 1);
  assert.ok(b.timers[0].ms <= 60 * 60 * 1000);
  b.tick();
  assert.equal(b.checks, 1);
  b.doc.visibilityState = 'hidden';
  b.tick();
  assert.equal(b.checks, 1, 'no checks while the app is in the background');
});

test('a new version on a safe screen (home) reloads straight away', () => {
  const b = fakeBrowser();
  b.watch();
  b.newVersion();
  assert.equal(b.reloads, 1);
});

test('a new version mid-game waits, and reloads once back on a safe screen', () => {
  const b = fakeBrowser({ safe: false });
  const updates = b.watch();
  b.newVersion();
  assert.equal(b.reloads, 0, 'never interrupts a race');
  assert.equal(updates.waiting, true);
  updates.reloadIfWaiting();
  assert.equal(b.reloads, 0);
  b.safe = true;
  updates.reloadIfWaiting();
  assert.equal(b.reloads, 1);
});

test('a waiting new version also loads when the app is opened again from the background', () => {
  const b = fakeBrowser({ safe: false });
  b.watch();
  b.newVersion();
  b.show('hidden');
  b.safe = true;
  b.show('visible');
  assert.equal(b.reloads, 1);
});

test('the very first install does not reload (nothing old is showing)', () => {
  const b = fakeBrowser({ controlled: false });
  const updates = b.watch();
  b.newVersion();
  assert.equal(b.reloads, 0);
  assert.equal(updates.waiting, false);
});

test('a failed check (no internet) is quiet', async () => {
  const b = fakeBrowser();
  b.registration.update = () => Promise.reject(new Error('offline'));
  b.watch();
  b.show('visible');
  await new Promise(r => setTimeout(r, 0)); // an unhandled rejection would fail the test
});
