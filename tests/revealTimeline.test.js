import test from 'node:test';
import assert from 'node:assert/strict';
import { revealEvents, REVEAL } from '../js/revealTimeline.js';
import { deliveryNote } from '../js/prizeShowroom.js';

test('nothing of the car shows during the drumroll: it goes on the turntable as the sheet lifts', () => {
  assert.deepEqual(revealEvents(0, REVEAL.drum - 0.01), []);
  assert.deepEqual(revealEvents(REVEAL.drum - 0.01, REVEAL.drum + 0.01), ['uncover']);
});

test('the prize is parked under the flash, and the show ends after it', () => {
  const swap = (REVEAL.shine + REVEAL.fade) / 2;
  assert.deepEqual(revealEvents(swap - 0.01, swap + 0.01), ['swap']);
  assert.deepEqual(revealEvents(0, 99), ['uncover', 'celebrate', 'swap', 'end']);
  assert.deepEqual(revealEvents(REVEAL.fade + 1, REVEAL.fade + 2), []);
});

test('where the prize went is said out loud too, for a boy who may not read yet', () => {
  assert.deepEqual(deliveryNote('Stretch Limo', 'garage', 4), { text: '🎀 Your Stretch Limo is in the garage, spot 5!', say: "It's in your garage!" });
  assert.deepEqual(deliveryNote('Stretch Limo', 'showroom'), { text: '🎀 Your Stretch Limo is waiting at the showroom!', say: "It's waiting outside the showroom!" });
  assert.deepEqual(deliveryNote('Stretch Limo', 'cars'), { text: '🎀 Your Stretch Limo is in 🚗 My cars!', say: "It's in My cars!" });
});
