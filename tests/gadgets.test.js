import test from 'node:test';
import assert from 'node:assert/strict';
import { gadgetsOf, createCooldown, createBoost, BOOST, GADGET_ORDER } from '../js/gadgets.js';
import { makeChassis } from '../js/bricks.js';

const part = (type, x = 0, y = 1, z = 0) => ({ type, color: 'red', x, y, z, r: 0 });

test('gadgetsOf lists each gadget once, in button order', () => {
  const car = [makeChassis(), part('cannon'), part('horn'), part('rocket'), part('rocket'), part('dog')];
  assert.deepEqual(gadgetsOf(car), ['boost', 'horn', 'confetti']);
  assert.deepEqual(gadgetsOf([makeChassis()]), []);
  assert.deepEqual(GADGET_ORDER, ['boost', 'horn', 'siren', 'confetti']);
});

test('boost lasts 2 seconds, then recharges for 6, and cannot be re-triggered meanwhile', () => {
  const boost = createBoost();
  assert.equal(boost.ready, true);
  assert.equal(boost.charge, 1);
  assert.equal(boost.trigger(), true);
  assert.equal(boost.active, true);
  boost.update(1.5);
  assert.equal(boost.trigger(), false, 'not while boosting');
  assert.equal(boost.active, true);
  boost.update(0.5);
  assert.equal(boost.active, false);
  assert.equal(boost.charge, 0);
  assert.equal(boost.trigger(), false, 'not while recharging');
  boost.update(3);
  assert.equal(boost.charge, 0.5);
  boost.update(3);
  assert.equal(boost.ready, true);
  assert.equal(boost.trigger(), true);
  assert.deepEqual(BOOST, { duration: 2, recharge: 6, force: 1.6, topSpeed: 1.4 });
});

test('a cooldown blocks repeat presses until it has passed', () => {
  const cd = createCooldown(1.5);
  assert.equal(cd.trigger(), true);
  assert.equal(cd.trigger(), false);
  cd.update(1);
  assert.equal(cd.ready, false);
  cd.update(0.5);
  assert.equal(cd.ready, true);
  assert.equal(cd.trigger(), true);
});
