import test from 'node:test';
import assert from 'node:assert/strict';
import { slopeBox, STUNT_PARK } from '../js/stuntPark.js';
import { blockRect, SIDEWALK } from '../js/cityMap.js';

// Where a box's top face starts and ends along z (its centre line), after the x-axis tilt.
function topEnds(b) {
  const c = Math.cos(b.rotX);
  const s = Math.sin(b.rotX);
  const at = dz => ({ y: b.cy + b.hy * c - dz * s, z: b.cz + b.hy * s + dz * c });
  return [at(-b.hz), at(b.hz)];
}
// x/z footprint of a box tilted about x.
function footprint(b) {
  const c = Math.abs(Math.cos(b.rotX ?? 0));
  const s = Math.abs(Math.sin(b.rotX ?? 0));
  const ez = b.hz * c + b.hy * s;
  return { x0: b.cx - b.hx, x1: b.cx + b.hx, z0: b.cz - ez, z1: b.cz + ez };
}
const inside = (f, r) => f.x0 >= r.x0 - 1e-9 && f.x1 <= r.x1 + 1e-9 && f.z0 >= r.z0 - 1e-9 && f.z1 <= r.z1 + 1e-9;
const angle = p => Math.atan2(Math.abs(p.y1 - p.y0), Math.abs(p.z1 - p.z0));

test('slopeBox puts the top face exactly on the path (climbing and descending)', () => {
  for (const path of [{ x0: 0, x1: 4, z0: 0, y0: 0, z1: 6, y1: 1.6 }, { x0: 0, x1: 4, z0: 10, y0: 1.2, z1: 17, y1: 0 }, { x0: 0, x1: 4, z0: 5, y0: 0, z1: 3, y1: 2 }]) {
    const b = slopeBox(path, 2);
    const [a, e] = topEnds(b);
    const ends = [[a, e], [e, a]].find(([p]) => Math.abs(p.z - path.z0) < 1e-9);
    assert.ok(ends, JSON.stringify({ path, a, e }));
    assert.ok(Math.abs(ends[0].y - path.y0) < 1e-9 && Math.abs(ends[1].z - path.z1) < 1e-9 && Math.abs(ends[1].y - path.y1) < 1e-9);
    assert.equal(b.hx, 2);
    assert.equal(b.hy, 1);
  }
});

test('the park is block (1,1), next to the pizza shop', () => {
  assert.deepEqual(STUNT_PARK.rect, blockRect(1, 1));
  const r = STUNT_PARK.rect;
  assert.deepEqual(STUNT_PARK.inner, { x0: r.x0 + SIDEWALK + 1, z0: r.z0 + SIDEWALK + 1, x1: r.x1 - SIDEWALK - 1, z1: r.z1 - SIDEWALK - 1 });
});

test('every box lies in the block; the jumps, pipes and hoop lie in the inner area', () => {
  for (const b of STUNT_PARK.boxes) assert.ok(inside(footprint(b), STUNT_PARK.rect), JSON.stringify(b));
  for (const b of STUNT_PARK.boxes.filter(b => b.part !== 'arch')) assert.ok(inside(footprint(b), STUNT_PARK.inner), JSON.stringify(b));
});

test('kickers and landings line up: each landing is in the same lane, further along +z', () => {
  assert.deepEqual(STUNT_PARK.kickers.map(k => k.name), ['big', 'small']);
  STUNT_PARK.kickers.forEach((k, i) => {
    const l = STUNT_PARK.landings[i];
    assert.ok(k.path.y1 > k.path.y0 && k.path.z1 > k.path.z0, 'kicker climbs toward +z');
    assert.ok(l.y0 > l.y1 && l.z0 > k.path.z1, 'landing comes down further on');
    assert.deepEqual([l.x0, l.x1], [k.path.x0, k.path.x1]);
  });
});

test('quarter-pipe slabs face each other and get steeper toward the ends', () => {
  const north = STUNT_PARK.quarterPipes.filter(p => p.z1 < p.z0); // climbing toward -z
  const south = STUNT_PARK.quarterPipes.filter(p => p.z1 > p.z0);
  assert.equal(north.length, 3);
  assert.equal(south.length, 3);
  for (const pipe of [north, south]) {
    for (let i = 1; i < 3; i++) {
      assert.ok(angle(pipe[i]) > angle(pipe[i - 1]));
      assert.ok(Math.abs(pipe[i].z0 - pipe[i - 1].z1) < 1e-9 && Math.abs(pipe[i].y0 - pipe[i - 1].y1) < 1e-9, 'slabs join up');
    }
  }
  assert.ok(Math.max(...north.map(p => p.z0)) < Math.min(...south.map(p => p.z0)));
});

test('the hoop sits on the big kicker\'s lane, between its kicker and landing', () => {
  const big = STUNT_PARK.kickers.find(k => k.name === 'big').path;
  const land = STUNT_PARK.landings[0];
  const { hoop } = STUNT_PARK;
  assert.ok(hoop.x > big.x0 && hoop.x < big.x1);
  assert.ok(hoop.z > big.z1 && hoop.z < land.z0);
  assert.ok(hoop.y - hoop.radius > 0.5, 'the bottom of the ring is off the ground');
});

test('the arch spans the big kicker lane at the north edge', () => {
  const { arch } = STUNT_PARK;
  const big = STUNT_PARK.kickers[0].path;
  assert.ok(arch.x > big.x0 && arch.x < big.x1 && arch.z < STUNT_PARK.inner.z0 && arch.z > STUNT_PARK.rect.z0);
});
