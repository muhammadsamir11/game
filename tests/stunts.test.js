import test from 'node:test';
import assert from 'node:assert/strict';
import { createStuntTracker, throughHoop, ringEvent, STUNTS } from '../js/stunts.js';

const DT = 1 / 60;
function fly(t, seconds, { pitchRate = 0, rollRate = 0, yawRate = 0 } = {}) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const ev = t.update({ dt: DT, wheelsDown: 0, upY: 1, pitch: pitchRate * DT, roll: rollRate * DT, yaw: yawRate * DT });
    assert.equal(ev, null, 'nothing is scored in the air');
  }
}
function land(t, upY = 1) {
  for (let i = 0; i < 72; i++) {
    const ev = t.update({ dt: DT, wheelsDown: 4, upY, pitch: 0, roll: 0, yaw: 0 });
    if (ev) return ev;
  }
  return null;
}

test('rewards', () => assert.deepEqual(STUNTS, { BIG_AIR: 5, HUGE_AIR: 10, FLIP: 20, BARREL_ROLL: 20, SPIN: 15, RING: 10 }));

test('a small hop gives nothing', () => {
  const t = createStuntTracker();
  fly(t, 0.5);
  assert.equal(land(t), null);
});

test('0.7 s in the air is BIG AIR, 1.4 s is HUGE AIR', () => {
  const a = createStuntTracker();
  fly(a, 0.8);
  assert.deepEqual(land(a), { names: ['BIG AIR'], coins: 5, oops: false });
  const b = createStuntTracker();
  fly(b, 1.5);
  assert.deepEqual(land(b), { names: ['HUGE AIR'], coins: 10, oops: false });
});

test('a full forward turn is a FLIP; combos add', () => {
  const t = createStuntTracker();
  fly(t, 1.0, { pitchRate: (2 * Math.PI) / 0.95 });
  assert.deepEqual(land(t), { names: ['BIG AIR', 'FLIP'], coins: 25, oops: false });
});

test('a back flip counts as a FLIP too', () => {
  const t = createStuntTracker();
  fly(t, 0.6, { pitchRate: -(2 * Math.PI) / 0.55 });
  assert.deepEqual(land(t), { names: ['FLIP'], coins: 20, oops: false });
});

test('roll and spin thresholds', () => {
  const a = createStuntTracker();
  fly(a, 0.8, { rollRate: 5.3 / 0.8 }); // ≈ 304°
  assert.ok(land(a).names.includes('BARREL ROLL'));
  const b = createStuntTracker();
  fly(b, 0.8, { yawRate: 5.9 / 0.8 }); // ≈ 338°
  assert.deepEqual(land(b), { names: ['BIG AIR', '360 SPIN'], coins: 20, oops: false });
  const c = createStuntTracker();
  fly(c, 0.8, { yawRate: 5.6 / 0.8 }); // ≈ 321° < 330°
  assert.deepEqual(land(c), { names: ['BIG AIR'], coins: 5, oops: false });
});

test('turning forward then back again is not a flip', () => {
  const t = createStuntTracker();
  fly(t, 0.5, { pitchRate: (2 * Math.PI) / 0.5 * 0.5 });
  fly(t, 0.5, { pitchRate: -(2 * Math.PI) / 0.5 * 0.5 });
  assert.deepEqual(land(t), { names: ['BIG AIR'], coins: 5, oops: false });
});

test('landing upside down is oops with no coins', () => {
  const t = createStuntTracker();
  fly(t, 1.0, { pitchRate: Math.PI });
  assert.deepEqual(land(t, -0.9), { names: [], coins: 0, oops: true });
});

test('landing a bit tilted but righting within 1 s still scores', () => {
  const t = createStuntTracker();
  fly(t, 0.8);
  for (let i = 0; i < 30; i++) assert.equal(t.update({ dt: DT, wheelsDown: 2, upY: 0.5, pitch: 0, roll: 0, yaw: 0 }), null);
  assert.deepEqual(land(t), { names: ['BIG AIR'], coins: 5, oops: false });
});

test('reset forgets the jump (Flip me! or getting out mid-air)', () => {
  const t = createStuntTracker();
  fly(t, 1);
  t.reset();
  assert.equal(land(t), null);
});

test('airborne only after 0.15 s without wheels', () => {
  const t = createStuntTracker();
  fly(t, 0.1);
  assert.equal(t.airborne, false);
  fly(t, 0.1);
  assert.equal(t.airborne, true);
});

test('throughHoop only when crossing the plane inside the radius', () => {
  const hoop = { x: 0, y: 3, z: 10, radius: 2 };
  assert.equal(throughHoop({ x: 0, y: 3, z: 9.5 }, { x: 0.5, y: 3.2, z: 10.4 }, hoop), true);
  assert.equal(throughHoop({ x: 0, y: 3, z: 10.4 }, { x: 0, y: 3, z: 9.6 }, hoop), true);
  assert.equal(throughHoop({ x: 0, y: 3, z: 9.5 }, { x: 5, y: 3, z: 10.4 }, hoop), false); // crosses 2.8 m out
  assert.equal(throughHoop({ x: 0, y: 3, z: 8 }, { x: 0, y: 3, z: 9 }, hoop), false);
});

test('ringEvent', () => assert.deepEqual(ringEvent(), { names: ['RING OF FIRE'], coins: 10, oops: false }));

test('after reset (Flip me!), a fall only counts once the car has been back on its wheels', () => {
  const t = createStuntTracker();
  t.reset();
  fly(t, 1.5); // dropped from a Flip me! lift, or mashed upward
  assert.equal(land(t), null);
  fly(t, 0.8); // a real jump after that
  assert.deepEqual(land(t), { names: ['BIG AIR'], coins: 5, oops: false });
});
