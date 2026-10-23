import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESET_RIDERS, DEFAULT_RIDER, resolveRider, riderName } from '../js/riders.js';
import { HEADS, FACES, headColorOptions, normaliseFigure } from '../js/figures.js';

test('the ready-made characters are valid figures', () => {
  assert.deepEqual(Object.keys(PRESET_RIDERS), ['police', 'firefighter', 'astronaut', 'pirate', 'chef', 'classmate', 'teacher']);
  for (const [key, preset] of Object.entries(PRESET_RIDERS)) {
    const f = resolveRider(`preset:${key}`);
    assert.deepEqual(normaliseFigure(f), f, key);
    assert.equal(f.name, preset.name);
  }
});

test('the new hats are fixed-colour and the eye patch is a face', () => {
  for (const head of ['policeCap', 'fireHelmet', 'pirateHat', 'chefHat']) {
    assert.equal(HEADS[head].kind, 'fixed', head);
    assert.deepEqual(headColorOptions(head), []);
  }
  assert.ok(FACES.eyepatch);
  assert.equal(resolveRider('preset:pirate').head, 'pirateHat');
  assert.equal(resolveRider('preset:pirate').face, 'eyepatch');
});

test('a friend rider looks like that friend', () => {
  const friends = [{ id: 'fig-1', name: 'Ana', head: 'crown', face: 'grin', skin: 'brown', shirt: 'purple', print: 'star', pants: 'white' }];
  const f = resolveRider('friend:fig-1', friends);
  assert.equal(f.name, 'Ana');
  assert.equal(f.head, 'crown');
  assert.equal(riderName('friend:fig-1', friends), 'Ana');
});

test('a deleted friend, unknown preset, junk or missing rider shows the Police Officer', () => {
  for (const rider of ['friend:gone', 'preset:wizard', 'nonsense', '', undefined, null, 42]) {
    assert.equal(resolveRider(rider, []).head, 'policeCap', String(rider));
  }
  assert.equal(DEFAULT_RIDER, 'preset:police');
  assert.equal(riderName(undefined), 'Police Officer');
});
