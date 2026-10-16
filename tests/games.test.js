import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, pickDistinct } from '../server/games.js';
import { GAMES } from '../js/net/protocol.js';
import { TREASURE_SPOTS, RUSH_SPOTS } from '../js/cityGameSpots.js';

const START = 3000; // the 3-2-1 before every game
const seeded = (s = 7) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const make = (kind, players = ['a', 'b']) => createGame(kind, { players, now: 0, random: seeded() });
const last = (msgs, type) => [...msgs].reverse().find(m => m.type === type);

test('games that need friends refuse to start alone', () => {
  assert.equal(make('tag', ['a']), null);
  assert.equal(make('follow', ['a']), null);
  assert.ok(make('rush', ['a']));
  assert.ok(make('treasure', ['a']));
  assert.equal(make('nope'), null);
});

test('pickDistinct never repeats', () => {
  const picks = pickDistinct(30, RUSH_SPOTS.length, seeded());
  assert.equal(new Set(picks).size, 30);
  assert.ok(picks.every(i => i >= 0 && i < RUSH_SPOTS.length));
});

test('treasure: claims before the countdown ends do not count', () => {
  const g = make('treasure');
  assert.deepEqual(g.claim('a', { chest: 0 }, 100), []);
});

test('treasure: the first one there scores, then the chest moves', () => {
  const g = make('treasure');
  const spot = g.startMessage().spot;
  assert.ok(spot >= 0 && spot < TREASURE_SPOTS.length);
  const msgs = g.claim('b', { chest: 0 }, START + 10);
  const up = last(msgs, 'game.update');
  assert.equal(up.foundBy, 'b');
  assert.equal(up.chest, 1);
  assert.notEqual(up.spot, spot);
  assert.deepEqual(g.claim('a', { chest: 0 }, START + 20), []); // too late for that one
  assert.equal(up.scores.b, 1);
});

test('treasure: ends after the last chest', () => {
  const g = make('treasure');
  let msgs = [];
  for (let n = 0; n < GAMES.treasure.chests; n++) msgs = g.claim('a', { chest: n }, START + n);
  assert.equal(last(msgs, 'game.end').scores.a, GAMES.treasure.chests);
  assert.ok(g.done);
});

test('rush: each coin can be grabbed once', () => {
  const g = make('rush');
  assert.equal(g.startMessage().coins.length, GAMES.rush.coins);
  assert.equal(last(g.claim('a', { coin: 3 }, START), 'game.update').by, 'a');
  assert.deepEqual(g.claim('b', { coin: 3 }, START + 1), []);
  assert.deepEqual(g.claim('b', { coin: 999 }, START + 1), []);
  assert.equal(g.scores.a, 1);
});

test('rush: ends when time runs out', () => {
  const g = make('rush');
  assert.deepEqual(g.tick(START + GAMES.rush.seconds * 1000 - 1), []);
  assert.ok(last(g.tick(START + GAMES.rush.seconds * 1000), 'game.end'));
});

test('tag: only the police can tag, and there are no tag-backs', () => {
  const g = make('tag', ['a', 'b', 'c']);
  const police = g.startMessage().police;
  const other = ['a', 'b', 'c'].find(id => id !== police);
  assert.deepEqual(g.claim(other, { victim: police }, START + 100), []);
  const up = last(g.claim(police, { victim: other }, START + 100), 'game.update');
  assert.equal(up.police, other);
  assert.deepEqual(g.claim(other, { victim: police }, START + 1000), []); // cooldown
  assert.equal(last(g.claim(other, { victim: police }, START + 3200), 'game.update').police, police);
});

test('tag: you score the seconds you were not the police', () => {
  const g = make('tag');
  const police = g.startMessage().police;
  const runner = police === 'a' ? 'b' : 'a';
  g.tick(START + 10_000);
  assert.equal(g.scores[runner], 10);
  assert.equal(g.scores[police], 0);
});

test('tag: if the police leaves someone else becomes the police', () => {
  const g = make('tag', ['a', 'b', 'c']);
  const police = g.startMessage().police;
  const up = last(g.removePlayer(police, START + 10), 'game.update');
  assert.notEqual(up.police, police);
  assert.ok(['a', 'b', 'c'].includes(up.police));
});

test('tag: ends when only one player is left', () => {
  const g = make('tag');
  assert.ok(last(g.removePlayer('a', START + 10), 'game.end'));
});

test('follow: the leader takes turns and followers earn stars', () => {
  const g = make('follow', ['a', 'b']);
  assert.equal(g.startMessage().leader, 'a');
  assert.deepEqual(g.claim('a', { near: true }, START + 100), []); // the leader earns nothing
  assert.equal(last(g.claim('b', { near: true }, START + 100), 'game.update').star, 'b');
  assert.deepEqual(g.claim('b', { near: true }, START + 500), []); // at most one star a second
  const turn = GAMES.follow.turnSeconds * 1000;
  assert.equal(last(g.tick(START + turn), 'game.update').leader, 'b');
  assert.ok(last(g.tick(START + turn * 2), 'game.end'));
});

test('follow: a friend joining late gets a turn too', () => {
  const g = make('follow', ['a', 'b']);
  g.addPlayer('c', 100);
  const turn = GAMES.follow.turnSeconds * 1000;
  g.tick(START + turn);
  assert.equal(last(g.tick(START + turn * 2), 'game.update').leader, 'c');
});
