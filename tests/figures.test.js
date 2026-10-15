import test from 'node:test';
import assert from 'node:assert/strict';
import { HEADS, DEFAULT_FIGURE, headColorOptions, cleanName, normaliseFigure, randomFigure, headHex, figureKey, HAIR_COLORS } from '../js/figures.js';
import { COLOR_KEYS } from '../js/bricks.js';

test('the default figure is already valid', () => {
  assert.deepEqual(normaliseFigure(DEFAULT_FIGURE), { ...DEFAULT_FIGURE });
});

test('unknown or missing choices are repaired to defaults', () => {
  const f = normaliseFigure({ name: '  Sam  ', head: 'rocket', face: 'x', skin: 9, shirt: 'gold', print: null });
  assert.deepEqual(f, { name: 'Sam', head: 'spiky', headColor: 'brown', face: 'happy', skin: 'classic', shirt: 'red', print: 'stripe', pants: 'blue' });
});

test('anything that is not an object becomes the default figure', () => {
  for (const junk of [null, undefined, 'hello', 42, []]) assert.equal(normaliseFigure(junk).head, DEFAULT_FIGURE.head);
});

test('a colour that does not fit the head style snaps to one that does', () => {
  assert.equal(normaliseFigure({ head: 'cap', headColor: 'brown' }).headColor, 'red');
  assert.equal(normaliseFigure({ head: 'spiky', headColor: 'red' }).headColor, 'brown');
  assert.equal(normaliseFigure({ head: 'cap', headColor: 'purple' }).headColor, 'purple');
  assert.equal(normaliseFigure({ head: 'long', headColor: 'ginger' }).headColor, 'ginger');
});

test('crown, space helmet and no hat have no colour choice', () => {
  for (const head of ['crown', 'astronaut', 'none']) {
    assert.deepEqual(headColorOptions(head), []);
    assert.equal(normaliseFigure({ head, headColor: 'red' }).headColor, null);
  }
  assert.deepEqual(headColorOptions('cowboy'), COLOR_KEYS);
  assert.deepEqual(headColorOptions('ponytail'), Object.keys(HAIR_COLORS));
});

test('an id is kept when it is a string', () => {
  assert.equal(normaliseFigure({ id: 'fig-1' }).id, 'fig-1');
  assert.equal('id' in normaliseFigure({ id: 7 }), false);
});

test('names are trimmed to 24 characters and blank names use the fallback', () => {
  assert.equal(cleanName('The Super Duper Mega Fast Racer Kid').length, 24);
  assert.equal(cleanName('   '), 'Me');
  assert.equal(cleanName(undefined, 'Friend'), 'Friend');
  assert.equal(normaliseFigure({ name: '' }, 'Friend').name, 'Friend');
});

test('randomFigure is the same for the same seed and always valid', () => {
  assert.deepEqual(randomFigure(1234), randomFigure(1234));
  const heads = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const f = randomFigure(seed * 7919);
    assert.deepEqual(normaliseFigure(f, 'Friend'), f, `seed ${seed}`);
    heads.add(f.head);
  }
  assert.ok(heads.size >= 5, `only ${heads.size} different heads`);
  assert.equal(randomFigure(2147483647).name, 'Friend');
});

test('headHex gives the colour to paint the hat or hair', () => {
  assert.equal(headHex(normaliseFigure({ head: 'crown' })), 0xffc107);
  assert.equal(headHex(normaliseFigure({ head: 'astronaut' })), 0xf5f5f5);
  assert.equal(headHex(normaliseFigure({ head: 'spiky', headColor: 'brown' })), HAIR_COLORS.brown.hex);
  assert.equal(headHex(normaliseFigure({ head: 'none' })), null);
  assert.equal(HEADS.crown.kind, 'fixed');
});

test('figureKey changes when any look choice changes but not with the name', () => {
  const a = normaliseFigure({ name: 'A' });
  assert.equal(figureKey(a), figureKey({ ...a, name: 'B' }));
  assert.notEqual(figureKey(a), figureKey({ ...a, print: 'star' }));
});

test('small seeds still give varied figures (AI drivers use seeds like 101, 138, 175)', () => {
  const heads = new Set();
  const shirts = new Set();
  for (let seed = 0; seed < 20; seed++) {
    const f = randomFigure(seed);
    heads.add(f.head);
    shirts.add(f.shirt);
  }
  assert.ok(heads.size >= 4, `heads: ${[...heads]}`);
  assert.ok(shirts.size >= 4, `shirts: ${[...shirts]}`);
  assert.notDeepEqual(randomFigure(101), randomFigure(138));
});
