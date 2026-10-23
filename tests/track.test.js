import test from 'node:test';
import assert from 'node:assert/strict';
import { layTrack, LAVA_JUMP } from '../js/track.js';

const track = layTrack();
const { points, spacing, lip, land } = track;
const n = points.length;
const flat = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const after = (i, from) => (i - from + n) % n; // samples from `from` on to i

test('the lap is a big closed loop, about twice the old 380 m one', () => {
  assert.ok(track.length > 620 && track.length < 780, `${track.length.toFixed(0)} m`);
  for (let i = 0; i < n; i++) assert.ok(flat(points[i], points[(i + 1) % n]) < spacing * 1.5, `gap after sample ${i}`);
});

test('no two parts of the road run close together (scenery and respawns need room)', () => {
  for (let i = 0; i < n; i += 3) {
    for (let j = i + 60; j < n; j += 3) {
      if (n - j + i < 60) continue;
      assert.ok(flat(points[i], points[j]) > 40, `samples ${i} and ${j}`);
    }
  }
});

test('the lava jump climbs to the takeoff, leaves a gap with no road, and lands lower down', () => {
  assert.ok(Math.abs(points[lip].y - LAVA_JUMP.takeoff) < 0.01);
  assert.ok(Math.abs(points[land].y - LAVA_JUMP.land) < 0.01);
  const gap = flat(points[lip], points[land]);
  assert.ok(gap > LAVA_JUMP.gap - 1 && gap < LAVA_JUMP.gap + 1, `${gap.toFixed(1)} m`);
  for (let i = lip; i !== land; i = (i + 1) % n) assert.ok(track.isGap(i), `sample ${i} is over the lava`);
  assert.ok(!track.isGap((lip - 1 + n) % n) && !track.isGap(land));
  // Up the ramp it only ever climbs; down the landing it only ever falls.
  for (let i = track.rampFoot; i !== lip; i = (i + 1) % n) assert.ok(points[(i + 1) % n].y > points[i].y);
  for (let i = land; points[i].y > 0; i = (i + 1) % n) assert.ok(points[(i + 1) % n].y <= points[i].y);
});

test('a car leaving the kicker at 10 m/s clears the lava; at 7 m/s it falls in', () => {
  const before = points[(lip - 1 + n) % n];
  const angle = Math.atan2(points[lip].y - before.y, flat(before, points[lip]));
  const gap = flat(points[lip], points[land]);
  const heightAtLanding = speed => {
    const t = gap / (speed * Math.cos(angle));
    return points[lip].y + speed * Math.sin(angle) * t - 4.91 * t * t;
  };
  assert.ok(angle > 0.15 && angle < 0.25, `kicker at ${(angle * 180 / Math.PI).toFixed(1)}°`);
  assert.ok(heightAtLanding(10) > LAVA_JUMP.land + 0.2);
  assert.ok(heightAtLanding(7) < LAVA_JUMP.land);
});

test('checkpoints go round in order and the jump sits between two of them, never on one', () => {
  const cps = track.checkpointSamples;
  assert.equal(cps[0], 0, 'checkpoint 0 is the start line');
  assert.ok(cps.length >= 12);
  for (let c = 1; c < cps.length; c++) assert.ok(cps[c] > cps[c - 1]);
  for (const i of cps) assert.ok(!track.inJump(i), `checkpoint at sample ${i}`);
  const spanning = cps.filter((i, c) => after(lip, i) < after(cps[(c + 1) % cps.length], i));
  assert.equal(spanning.length, 1, 'exactly one stretch between checkpoints has the jump in it');
});

test('the lava catches cars that fall in, not ones flying over or driving the ramps', () => {
  const { pit } = track;
  assert.ok(track.inLava({ x: pit.x, y: 0.6, z: pit.z }));
  assert.ok(track.inLava({ x: pit.x + pit.dz * (pit.half - 1), y: 0.6, z: pit.z - pit.dx * (pit.half - 1) }), 'near the side');
  assert.ok(!track.inLava({ x: pit.x, y: 5, z: pit.z }), 'flying over');
  assert.ok(!track.inLava({ ...points[lip], y: points[lip].y + 0.8 }), 'on the takeoff');
  assert.ok(!track.inLava({ x: points[track.rampFoot].x, y: 0.6, z: points[track.rampFoot].z }), 'at the foot of the ramp');
});

test('after the lava you start again on flat road with a run-up before the ramp', () => {
  const i = track.respawnSample;
  assert.equal(points[i].y, 0);
  assert.ok(!track.inLava({ ...points[i], y: 1 }));
  const runUp = after(track.rampFoot, i) * spacing;
  assert.ok(runUp > 20 && runUp < 40, `${runUp.toFixed(0)} m run-up`);
});

test('the bridge still lifts the road over the river', () => {
  const high = points.filter((p, i) => p.y > 3 && !track.inJump(i));
  assert.ok(high.length > 10);
  for (const p of high) assert.ok(Math.abs(p.x - 197) < 6 && Math.abs(p.z + 36) < 20, `(${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
});

test('a car hung on the edge of the landing ramp, over the lava, counts as in it', () => {
  const { pit } = track;
  const edge = { x: pit.x + pit.dx * (pit.length / 2 - 0.8), y: LAVA_JUMP.land - 0.3, z: pit.z + pit.dz * (pit.length / 2 - 0.8) };
  assert.ok(track.inLava(edge));
});
