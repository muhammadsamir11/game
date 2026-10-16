import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRail, railFinishTime } from '../js/rail.js';

// A 10 × 10 square, driven anticlockwise seen from above (+x, then +z, then -x, then -z).
const SQUARE = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 10 }];
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('the rail is as long as the loop', () => {
  assert.equal(createRail(SQUARE).length, 40);
});

test('points along the rail, wrapping round', () => {
  const rail = createRail(SQUARE);
  const p = rail.at(15);
  assert.ok(near(p.x, 10) && near(p.z, 5));
  const q = rail.at(55);
  assert.ok(near(q.x, 10) && near(q.z, 5));
  const r = rail.at(-5);
  assert.ok(near(r.x, 0) && near(r.z, 5));
});

test('heading follows the road', () => {
  const rail = createRail(SQUARE);
  assert.ok(near(rail.at(5).heading, Math.PI / 2)); // along +x
  assert.ok(near(rail.at(15).heading, 0)); // along +z
});

test('a lane offset moves the car to the side of the road', () => {
  const rail = createRail(SQUARE);
  const p = rail.at(5, 2); // heading +x: track.js's right, cross(forward, up), is +z
  assert.ok(near(p.x, 5) && near(p.z, 2));
});

test('slopes tip the car', () => {
  const rail = createRail([{ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 0, y: 0, z: 10 }]);
  assert.ok(rail.at(1).pitch < 0); // nose up going uphill
});

test('finding the closest spot on the rail', () => {
  const rail = createRail(SQUARE);
  assert.equal(rail.distanceAt(10.2, 9.8), 20);
});

test('finish time from laps and speed', () => {
  assert.equal(railFinishTime(createRail(SQUARE), 3, 0, 10), 12);
});
