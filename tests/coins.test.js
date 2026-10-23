import test from 'node:test';
import assert from 'node:assert/strict';
import { COIN_SPOTS, TRAIL_ROUTES, COIN_RESPAWN, PICKUP, createCoinField } from '../js/coins.js';
import { isOnRoad, isOnSidewalk, blockAt, BLOCKS, GARAGE, FLOOR_HEIGHT, blockRect, STUNT_PARK_BLOCK } from '../js/cityMap.js';

const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const onSlab = (floor, x, z) => GARAGE.floors.some(b => Math.abs(b.cy + b.hy - floor * FLOOR_HEIGHT) < 1e-9
  && Math.abs(x - b.cx) <= b.hx && Math.abs(z - b.cz) <= b.hz);
function onRampLine(c) {
  return GARAGE.rampPaths.some(p => {
    const u = c.x - GARAGE.rect.x0;
    const v = c.z - GARAGE.rect.z0;
    if (u < p.u0 || u > p.u1 || v < Math.min(p.v0, p.v1) || v > Math.max(p.v0, p.v1)) return false;
    const t = (v - p.v0) / (p.v1 - p.v0);
    return Math.abs(c.y - (p.y0 + (p.y1 - p.y0) * t + 1)) < 0.2;
  });
}
// Somewhere he can get to: road or sidewalk, a park, a garage floor or ramp, or the stunt park's air.
function reachable(c) {
  if (inRect(GARAGE.rect, c.x, c.z)) {
    const floor = Math.round((c.y - 1) / FLOOR_HEIGHT);
    return onRampLine(c) || (Math.abs(c.y - 1 - floor * FLOOR_HEIGHT) < 1e-9 && floor >= 1 && onSlab(floor, c.x, c.z));
  }
  if (inRect(blockRect(STUNT_PARK_BLOCK.bx, STUNT_PARK_BLOCK.bz), c.x, c.z)) return c.y <= 8;
  const block = blockAt(c.x, c.z);
  if (['park', 'school', 'pitch'].includes(block?.type)) return Math.abs(c.y - 1) < 1e-9; // open ground: forecourt, pitch
  return Math.abs(c.y - 1) < 1e-9 && (isOnRoad(c.x, c.z) || isOnSidewalk(c.x, c.z));
}

test('coin counts: about 120 small and exactly 12 big', () => {
  const small = COIN_SPOTS.filter(c => c.value === 1).length;
  assert.ok(small >= 100 && small <= 130, `small=${small}`);
  assert.equal(COIN_SPOTS.filter(c => c.value === 5).length, 12);
  assert.ok(COIN_SPOTS.every(c => c.value === 1 || c.value === 5));
});

test('every coin is somewhere he can reach, never inside a building', () => {
  for (const c of COIN_SPOTS) assert.ok(reachable(c), JSON.stringify(c));
});

test('no two coins overlap', () => {
  for (let i = 0; i < COIN_SPOTS.length; i++) {
    for (let j = i + 1; j < COIN_SPOTS.length; j++) {
      const a = COIN_SPOTS[i];
      const b = COIN_SPOTS[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) >= 1.5, `${JSON.stringify(a)} ${JSON.stringify(b)}`);
    }
  }
});

test('trail routes: 3 routes of 10 road or sidewalk points, 4–15 m apart', () => {
  assert.equal(TRAIL_ROUTES.length, 3);
  for (const route of TRAIL_ROUTES) {
    assert.equal(route.length, 10);
    route.forEach((p, i) => {
      assert.ok(isOnRoad(p.x, p.z) || isOnSidewalk(p.x, p.z), JSON.stringify(p));
      if (i > 0) {
        const d = Math.hypot(p.x - route[i - 1].x, p.z - route[i - 1].z);
        assert.ok(d >= 4 && d <= 15, `gap ${d}`);
      }
    });
  }
});

test('collect grabs coins within the radius and with height difference < 3 m only', () => {
  const f = createCoinField([{ x: 0, y: 1, z: 0, value: 1 }, { x: 0, y: 5, z: 0, value: 5 }, { x: 10, y: 1, z: 0, value: 1 }]);
  assert.deepEqual(f.collect({ x: 1, y: 0.5, z: 0 }, PICKUP.foot), [{ index: 0, value: 1 }]);
  assert.deepEqual(f.collect({ x: 1, y: 0.5, z: 0 }, PICKUP.foot), []);
  assert.equal(f.isActive(1), true);
  assert.equal(f.activeCount(), 2);
  assert.deepEqual(f.collect({ x: 0, y: 3, z: 1.5 }, PICKUP.car), [{ index: 1, value: 5 }]);
});

test('mid-air coins need a jump: under 1.5 m of height difference, not 3 m', () => {
  const air = COIN_SPOTS.filter(c => c.air);
  assert.equal(air.length, 2);
  const f = createCoinField(air);
  for (const c of air) {
    assert.deepEqual(f.collect({ x: c.x, y: 0.4, z: c.z }, PICKUP.foot), [], 'on foot from the ground');
    assert.deepEqual(f.collect({ x: c.x, y: 0.9, z: c.z }, PICKUP.car), [], 'a car on the ground');
  }
  const g = createCoinField([{ x: 0, y: 3.2, z: 0, value: 5, air: true }]);
  assert.deepEqual(g.collect({ x: 0, y: 1.6, z: 0 }, PICKUP.car), []);
  assert.deepEqual(g.collect({ x: 0, y: 1.8, z: 0 }, PICKUP.car), [{ index: 0, value: 5 }]);
});

test('pickup reach: 1.2 m on foot, 2 m in a car', () => {
  assert.deepEqual(PICKUP, { foot: 1.2, car: 2 });
  const f = createCoinField([{ x: 0, y: 1, z: 0, value: 1 }]);
  assert.deepEqual(f.collect({ x: 1.5, y: 1, z: 0 }, PICKUP.foot), []);
  assert.equal(f.collect({ x: 1.5, y: 1, z: 0 }, PICKUP.car).length, 1);
});

test('a collected coin comes back after 90 s, a trail coin never does', () => {
  assert.equal(COIN_RESPAWN, 90);
  const f = createCoinField([{ x: 0, y: 1, z: 0, value: 1 }]);
  f.collect({ x: 0, y: 1, z: 0 }, 2);
  f.update(89.9);
  assert.equal(f.isActive(0), false);
  f.update(0.2);
  assert.equal(f.isActive(0), true);
  const t = createCoinField([{ x: 0, y: 1, z: 0, value: 1 }], { respawn: Infinity });
  t.collect({ x: 0, y: 1, z: 0 }, 2);
  t.update(1e6);
  assert.equal(t.isActive(0), false);
});

test('the stunt park is block (1,1) and HERO_NAME is Murad', async () => {
  const map = await import('../js/cityMap.js');
  assert.deepEqual(STUNT_PARK_BLOCK, { bx: 1, bz: 1 });
  assert.equal(BLOCKS.find(b => b.bx === 1 && b.bz === 1).type, 'park');
  assert.equal(map.HERO_NAME, 'Murad');
});
