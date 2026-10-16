import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSION_RING, DELIVERY_TARGETS, PUPPY_SPOTS, MISSION_KINDS, STUNT_GOALS, REWARDS, missionFor, createMissionRunner, createRingGate } from '../js/missions.js';
import { buildingColor, houseCenter, isOnSidewalk, blockAt, BLOCKS, BUILDING_COLORS } from '../js/cityMap.js';

const away = { x: 0, z: 0 };

test('mission data', () => {
  assert.deepEqual(MISSION_RING, { x: 126, z: 86, radius: 2.5 });
  assert.deepEqual(MISSION_KINDS, ['pizza', 'puppy', 'coinTrail', 'stunt']);
  assert.deepEqual(STUNT_GOALS, ['FLIP', 'BIG AIR', 'RING OF FIRE']);
  assert.deepEqual(REWARDS, { pizza: 30, puppy: 40, coinTrail: 30, stunt: 40 });
  assert.equal(blockAt(MISSION_RING.x, MISSION_RING.z).type, 'pizza');
});

test('building colours: 8 named colours, picked per block and house', () => {
  assert.equal(BUILDING_COLORS.length, 8);
  assert.deepEqual(buildingColor(1, 0), { hex: 0x43a047, name: 'green' });
  assert.deepEqual(houseCenter(BLOCKS[1], 3), { x: BLOCKS[1].rect.x0 + 25, z: BLOCKS[1].rect.z0 + 25 });
});

test('rotation: pizza, puppy, coin trail, stunt, then pizza with the next house', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(n => missionFor(n).kind), ['pizza', 'puppy', 'coinTrail', 'stunt', 'pizza']);
  assert.notDeepEqual(missionFor(0).target, missionFor(4).target);
  assert.deepEqual([0, 1, 2, 3].map(n => missionFor(n).emoji), ['🍕', '🐶', '🔵', '🤸']);
  assert.deepEqual([3, 7, 11].map(n => missionFor(n).goal), STUNT_GOALS);
  assert.deepEqual([2, 6, 10].map(n => missionFor(n).routeIndex), [0, 1, 2]);
});

test('delivery houses: six different colours, and the named colour is that house\'s colour', () => {
  assert.equal(DELIVERY_TARGETS.length, 6);
  assert.equal(new Set(DELIVERY_TARGETS.map(t => t.colorName)).size, 6);
  for (const t of DELIVERY_TARGETS) {
    assert.equal(BLOCKS[t.blockIndex].type, 'houses');
    assert.equal(buildingColor(t.blockIndex, t.k).name, t.colorName);
    assert.ok(isOnSidewalk(t.x, t.z), JSON.stringify(t));
    const h = houseCenter(BLOCKS[t.blockIndex], t.k);
    assert.ok(Math.hypot(h.x - t.x, h.z - t.z) < 10, 'the drop-off is beside that house');
  }
  assert.match(missionFor(0).title, new RegExp(`the ${DELIVERY_TARGETS[0].colorName} house`));
});

test('delivery timer is 25 s plus 1 s per 5 m', () => {
  const m = missionFor(0);
  assert.ok(Math.abs(m.timer - (25 + Math.hypot(m.target.x - MISSION_RING.x, m.target.z - MISSION_RING.z) / 5)) < 1e-9);
  assert.equal(missionFor(1).timer, null);
  assert.equal(missionFor(2).timer, 60);
  assert.equal(missionFor(3).timer, null);
});

test('puppy spots are reachable and away from the ring', () => {
  assert.equal(PUPPY_SPOTS.length, 6);
  for (const p of PUPPY_SPOTS) {
    assert.ok(isOnSidewalk(p.x, p.z) || blockAt(p.x, p.z)?.type === 'park', JSON.stringify(p));
    assert.ok(Math.hypot(p.x - MISSION_RING.x, p.z - MISSION_RING.z) >= 30);
  }
});

test('start → arrive pays once, then a 5 s pause before the next offer', () => {
  const r = createMissionRunner();
  assert.equal(r.state, 'ready');
  const m = r.offer();
  assert.equal(r.state, 'offered');
  r.accept();
  assert.equal(r.state, 'running');
  assert.deepEqual(r.update(0.1, { player: m.target }), { completed: 30 });
  assert.equal(r.update(0.1, { player: m.target }), null);
  assert.equal(r.offer(), null);
  r.update(4.8, { player: away }); // 4.9 s since it was delivered
  assert.equal(r.offer(), null);
  r.update(0.2, { player: away });
  assert.equal(r.offer().kind, 'puppy');
});

test('arriving 4 m away counts, 5 m away does not', () => {
  const r = createMissionRunner();
  const m = r.offer();
  r.accept();
  assert.equal(r.update(0.1, { player: { x: m.target.x + 5, z: m.target.z } }), null);
  assert.deepEqual(r.update(0.1, { player: { x: m.target.x + 3.9, z: m.target.z } }), { completed: 30 });
});

test('timer out → failed; retry gives a fresh timer on the same mission', () => {
  const r = createMissionRunner();
  const m = r.offer();
  r.accept();
  assert.deepEqual(r.update(m.timer + 1, { player: MISSION_RING }), { failed: true });
  assert.equal(r.state, 'failed');
  r.retry();
  assert.equal(r.state, 'running');
  assert.equal(r.timeLeft, m.timer);
  assert.equal(r.current.kind, 'pizza');
});

test('decline and cancel keep the same mission and pay nothing', () => {
  const r = createMissionRunner();
  r.offer();
  r.decline();
  assert.equal(r.state, 'ready');
  assert.equal(r.offer().kind, 'pizza');
  r.accept();
  r.cancel();
  assert.equal(r.state, 'cooldown');
  r.update(5, { player: away });
  assert.equal(r.state, 'ready');
  assert.equal(r.offer().kind, 'pizza');
});

test('cancel (✖ or "Not now" after a timeout) goes through the 5 s pause', () => {
  const r = createMissionRunner();
  const m = r.offer();
  r.accept();
  r.update(m.timer + 1, { player: away });
  assert.equal(r.state, 'failed');
  r.cancel();
  assert.equal(r.offer(), null);
  r.update(4.9, { player: away });
  assert.equal(r.offer(), null);
  r.update(0.2, { player: away });
  assert.equal(r.offer().kind, 'pizza');
});

test('the ring offers once per visit, and a visit during a mission counts', () => {
  const gate = createRingGate();
  assert.equal(gate.shouldOffer(false, 'ready'), false);
  assert.equal(gate.shouldOffer(true, 'ready'), true); // walks in
  assert.equal(gate.shouldOffer(true, 'offered'), false);
  assert.equal(gate.shouldOffer(true, 'ready'), false); // "Not now": no new card while he stands there
  assert.equal(gate.shouldOffer(false, 'ready'), false);
  assert.equal(gate.shouldOffer(true, 'ready'), true); // steps out and back in
  // off on the mission, back to the ring, then ✖ quit (or a timeout and "Not now") while standing in it
  assert.equal(gate.shouldOffer(false, 'running'), false);
  assert.equal(gate.shouldOffer(true, 'running'), false);
  assert.equal(gate.shouldOffer(true, 'failed'), false);
  assert.equal(gate.shouldOffer(true, 'cooldown'), false);
  assert.equal(gate.shouldOffer(true, 'ready'), false);
  assert.equal(gate.shouldOffer(false, 'ready'), false);
  assert.equal(gate.shouldOffer(true, 'ready'), true);
});

test('arriving in the ring during the pause after a mission still offers once it ends', () => {
  const gate = createRingGate();
  assert.equal(gate.shouldOffer(false, 'cooldown'), false);
  assert.equal(gate.shouldOffer(true, 'cooldown'), false);
  assert.equal(gate.shouldOffer(true, 'ready'), true);
});

test('startIndex continues the rotation from earlier visits', () => {
  assert.equal(createMissionRunner({ startIndex: 5 }).offer().kind, 'puppy');
});

test('puppy is found within 3 m; near() measures to it', () => {
  const r = createMissionRunner({ startIndex: 1 });
  const m = r.offer();
  r.accept();
  assert.equal(r.near({ x: m.target.x + 10, z: m.target.z }), 10);
  assert.equal(r.update(1, { player: { x: m.target.x + 3.5, z: m.target.z } }), null);
  assert.deepEqual(r.update(1, { player: { x: m.target.x + 2.5, z: m.target.z } }), { completed: 40 });
  assert.equal(createMissionRunner().near(away), Infinity);
});

test('stunt mission needs the goal stunt inside the stunt park; HUGE AIR counts as BIG AIR', () => {
  const flip = createMissionRunner({ startIndex: 3 });
  flip.offer();
  flip.accept();
  assert.equal(flip.update(0.1, { player: away, stunt: { names: ['FLIP'], coins: 20, oops: false }, inStuntPark: false }), null);
  assert.equal(flip.update(0.1, { player: away, stunt: { names: ['BIG AIR'], coins: 5, oops: false }, inStuntPark: true }), null);
  assert.deepEqual(flip.update(0.1, { player: away, stunt: { names: ['BIG AIR', 'FLIP'], coins: 25, oops: false }, inStuntPark: true }), { completed: 40 });
  const air = createMissionRunner({ startIndex: 7 });
  air.offer();
  air.accept();
  assert.deepEqual(air.update(0.1, { player: away, stunt: { names: ['HUGE AIR'], coins: 10, oops: false }, inStuntPark: true }), { completed: 40 });
});

test('coin trail completes when no blue coins are left', () => {
  const r = createMissionRunner({ startIndex: 2 });
  r.offer();
  r.accept();
  assert.equal(r.update(1, { player: away, trailLeft: 3 }), null);
  assert.deepEqual(r.update(1, { player: away, trailLeft: 0 }), { completed: 30 });
});
