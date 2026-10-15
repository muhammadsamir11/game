import test from 'node:test';
import assert from 'node:assert/strict';
import { newRaceState, advanceCheckpoint, progressValue, rankRacers, ordinal } from '../js/raceLogic.js';

// A square track: checkpoint 0 is the start line.
const CPS = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 }];
const R = 10;
const at = (cp, dx = 0) => ({ x: CPS[cp].x + dx, z: CPS[cp].z });
const pass = (state, cps, laps = 2, time = 0) => cps.reduce((s, cp) => advanceCheckpoint(s, at(cp), CPS, R, laps, time), state);

test('a new racer has done no laps and is heading for checkpoint 1', () => {
  assert.deepEqual(newRaceState(), { lapsDone: 0, nextCp: 1, finishTime: null });
});

test('reaching the next checkpoint moves on to the one after', () => {
  const s = advanceCheckpoint(newRaceState(), at(1, 5), CPS, R, 2, 0);
  assert.deepEqual(s, { lapsDone: 0, nextCp: 2, finishTime: null });
});

test('nothing changes away from the next checkpoint (same object back)', () => {
  const s = newRaceState();
  assert.equal(advanceCheckpoint(s, { x: 50, z: 50 }, CPS, R, 2, 0), s);
});

test('skipping ahead to a later checkpoint gives no credit', () => {
  const s = newRaceState();
  assert.equal(advanceCheckpoint(s, at(2), CPS, R, 2, 0), s);
});

test('driving the wrong way over the start line gives no lap', () => {
  const s = pass(newRaceState(), [0, 3, 0, 3]);
  assert.deepEqual(s, newRaceState());
});

test('passing every checkpoint and then the start line counts a lap', () => {
  const s = pass(newRaceState(), [1, 2, 3, 0]);
  assert.deepEqual(s, { lapsDone: 1, nextCp: 1, finishTime: null });
});

test('finishing the last lap records the finish time and then stops changing', () => {
  const done = pass(newRaceState(), [1, 2, 3, 0, 1, 2, 3, 0], 2, 42);
  assert.equal(done.lapsDone, 2);
  assert.equal(done.finishTime, 42);
  assert.equal(advanceCheckpoint(done, at(1), CPS, R, 2, 50), done);
});

test('progressValue counts checkpoints passed', () => {
  assert.equal(progressValue(newRaceState(), 4), 0);
  assert.equal(progressValue(pass(newRaceState(), [1, 2]), 4), 2);
  assert.equal(progressValue(pass(newRaceState(), [1, 2, 3]), 4), 3);
  assert.equal(progressValue(pass(newRaceState(), [1, 2, 3, 0, 1]), 4), 5);
});

test('ranking: finishers by time, then by progress, then by distance to next checkpoint', () => {
  const entries = [
    { id: 'slow', state: pass(newRaceState(), [1]), pos: at(1) },
    { id: 'near', state: pass(newRaceState(), [1, 2]), pos: { x: 100, z: 99 } },
    { id: 'far', state: pass(newRaceState(), [1, 2]), pos: { x: 100, z: 50 } },
    { id: 'second', state: { lapsDone: 2, nextCp: 1, finishTime: 70 }, pos: at(0) },
    { id: 'winner', state: { lapsDone: 2, nextCp: 1, finishTime: 60 }, pos: at(0) },
  ];
  assert.deepEqual(rankRacers(entries, CPS).map(e => e.id), ['winner', 'second', 'near', 'far', 'slow']);
});

test('ordinal turns places into words kids know', () => {
  assert.deepEqual([1, 2, 3, 4].map(ordinal), ['1st', '2nd', '3rd', '4th']);
});
