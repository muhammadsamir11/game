import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTricks, doorAngle, ornamentLevel, discoOn, PARTY_COLORS, DISCO_GLOW,
  DOOR_TIME, DOOR_OPEN, ORNAMENT_TIME, DISCO_TIME, PUFF_TIME,
} from '../js/carTricks.js';
import { collectFx } from '../js/drivenCar.js';
import { createCarMesh } from '../js/brickMesh.js';
import { prizeBricks } from '../js/prizeCars.js';

const node = (userData = {}) => ({
  position: { y: 0 }, rotation: { y: 0 }, visible: true, userData,
  scale: { s: 1, setScalar(v) { this.s = v; } },
  material: { emissiveIntensity: 0, emissive: { h: null, setHex(h) { this.h = h; } } },
});
const fxWith = (parts = {}) => ({ spinners: [], flags: [], flames: [], sirens: [], muzzles: [], ornaments: [], coachDoors: [], stars: [], discos: [], puffs: [], ...parts });

test('doors swing open, stay a moment, and close', () => {
  assert.equal(doorAngle(0), 0);
  assert.equal(doorAngle(0.5), DOOR_OPEN);
  assert.ok(doorAngle(1) > 0 && doorAngle(1) < DOOR_OPEN);
  assert.equal(doorAngle(DOOR_TIME), 0);
  assert.equal(doorAngle(5), 0);
});

test('the ornament level eases between down and up', () => {
  assert.equal(ornamentLevel(0, true), 0);
  assert.equal(ornamentLevel(ORNAMENT_TIME, true), 1);
  assert.equal(ornamentLevel(ORNAMENT_TIME, false), 0);
  assert.ok(ornamentLevel(ORNAMENT_TIME / 2, true) > 0 && ornamentLevel(ORNAMENT_TIME / 2, true) < 1);
  assert.equal(discoOn(0), true);
  assert.equal(discoOn(DISCO_TIME), false);
});

test('ornament goes down on park, rises after getIn, sinks after getOut', () => {
  const lady = node({ ornament: { low: 0, high: 0.3 } });
  const t = createTricks(fxWith({ ornaments: [lady] }));
  t.park();
  assert.equal(lady.position.y, 0);
  t.getIn();
  t.update(ORNAMENT_TIME);
  assert.equal(lady.position.y, 0.3);
  t.getOut();
  t.update(ORNAMENT_TIME / 2);
  assert.ok(lady.position.y > 0 && lady.position.y < 0.3);
  t.update(ORNAMENT_TIME);
  assert.equal(lady.position.y, 0);
});

test('coach doors swing the opposite way on each side', () => {
  const left = node({ coachDoor: { side: -1 } });
  const right = node({ coachDoor: { side: 1 } });
  const t = createTricks(fxWith({ coachDoors: [left, right] }));
  t.getIn();
  t.update(0.5);
  assert.equal(left.rotation.y, -doorAngle(0.5));
  assert.equal(right.rotation.y, doorAngle(0.5));
  t.update(DOOR_TIME);
  assert.equal(left.rotation.y, 0);
  assert.equal(right.rotation.y, 0);
});

test('honk flashes disco colours, then settles', () => {
  const panel = node({ disco: true });
  const t = createTricks(fxWith({ discos: [panel] }));
  t.update(0.1);
  assert.equal(panel.material.emissive.h, DISCO_GLOW);
  t.honk();
  t.update(0.2);
  assert.ok(PARTY_COLORS.includes(panel.material.emissive.h));
  t.update(DISCO_TIME);
  assert.equal(panel.material.emissive.h, DISCO_GLOW);
});

test('side pipes puff when he gets in', () => {
  const puff = node({ puff: true });
  puff.visible = false;
  const t = createTricks(fxWith({ puffs: [puff] }));
  t.getIn();
  t.update(0.1);
  assert.equal(puff.visible, true);
  t.update(PUFF_TIME);
  assert.equal(puff.visible, false);
});

test('has flags follow the parts', () => {
  assert.deepEqual(createTricks(fxWith()).has, { umbrella: false, stars: false, disco: false });
  assert.deepEqual(createTricks(fxWith({ coachDoors: [node()], stars: [node()], discos: [node()] })).has, { umbrella: true, stars: true, disco: true });
});

// Badges and the driver draw on a canvas, which node doesn't have, so they're left out here.
const meshOf = key => createCarMesh(prizeBricks(key).filter(b => b.type !== 'badge' && b.type !== 'seat'));

test('the real prize cars carry their trick parts in their meshes', () => {
  const phantom = collectFx(meshOf('phantom'));
  assert.equal(phantom.ornaments.length, 1);
  assert.equal(phantom.coachDoors.length, 2);
  assert.ok(phantom.stars.length > 0);
  assert.ok(collectFx(meshOf('limo')).discos.length >= 2);
  assert.equal(collectFx(meshOf('gwagon')).puffs.length, 2);
});

test('a car just made for driving starts with the flying lady tucked away, so she rises on getIn', () => {
  const lady = node({ ornament: { low: 0, high: 0.3 } });
  const t = createTricks(fxWith({ ornaments: [lady] }));
  t.getIn();
  t.update(ORNAMENT_TIME / 2);
  assert.ok(lady.position.y > 0 && lady.position.y < 0.3, `mid-rise, got ${lady.position.y}`);
  t.update(ORNAMENT_TIME);
  assert.equal(lady.position.y, 0.3);
});
