import test from 'node:test';
import assert from 'node:assert/strict';
import { stickToWorld } from '../js/walker.js';
import { mapAngle, toMapScreen, mapZoom, carPaint, edgePoint } from '../js/mapView.js';
import { GARAGE, FLOOR_HEIGHT, MAP_LANDMARKS, GARAGE_FLOORS, garageFloorAt, inCity } from '../js/cityMap.js';

const view = { cx: 150, cy: 150, scale: 2 };
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('the map turns with the camera: what is ahead on screen is up on the map', () => {
  for (const yaw of [0, 0.7, Math.PI / 2, 2.5, -1.2]) {
    const me = { x: 100, z: 80 };
    const ahead = { x: me.x + Math.sin(yaw) * 10, z: me.z + Math.cos(yaw) * 10 };
    const p = toMapScreen(ahead, me, yaw, view);
    assert.ok(near(p.x, view.cx), `yaw ${yaw}: x ${p.x}`);
    assert.ok(near(p.y, view.cy - 20), `yaw ${yaw}: y ${p.y}`);
  }
});

test('what is on the right of the screen is on the right of the map (not mirrored)', () => {
  for (const yaw of [0, 1, -2]) {
    const right = stickToWorld({ x: 1, y: 0 }, yaw);
    const p = toMapScreen({ x: right.x * 10, z: right.z * 10 }, { x: 0, z: 0 }, yaw, view);
    assert.ok(p.x > view.cx + 19 && near(p.y, view.cy), `yaw ${yaw}: ${p.x}, ${p.y}`);
  }
});

test('mapAngle is the canvas rotation that matches toMapScreen', () => {
  const yaw = 0.9;
  const a = mapAngle(yaw);
  const d = { x: 3, z: -7 };
  const p = toMapScreen(d, { x: 0, z: 0 }, yaw, view);
  const rx = (d.x * Math.cos(a) - d.z * Math.sin(a)) * view.scale + view.cx;
  const ry = (d.x * Math.sin(a) + d.z * Math.cos(a)) * view.scale + view.cy;
  assert.ok(near(p.x, rx) && near(p.y, ry));
});

test('the map zooms in close in the garage, and out when driving', () => {
  assert.ok(mapZoom({ driving: false, indoor: true }) > mapZoom({ driving: false, indoor: false }));
  assert.ok(mapZoom({ driving: false, indoor: false }) > mapZoom({ driving: true, indoor: false }));
});

test('things off the edge of the mini map are pinned to its rim, in the right direction', () => {
  const inside = edgePoint({ x: 160, y: 140 }, view, 120);
  assert.deepEqual(inside, { x: 160, y: 140, pinned: false });
  const far = edgePoint({ x: 150, y: -500 }, view, 120);
  assert.ok(far.pinned && near(far.x, 150) && near(far.y, 30));
  const corner = edgePoint({ x: 1000, y: 1000 }, view, 120);
  assert.ok(corner.pinned && near(corner.x, 270) && near(corner.y, 270));
});

test('a car shows on the map in its main colour, not its black wheels', () => {
  const bricks = [
    { type: 'chassis', color: 'black' }, { type: 'wheelSmall', color: 'black' }, { type: 'wheelSmall', color: 'black' },
    { type: 'brick12', color: 'red' }, { type: 'brick12', color: 'red' }, { type: 'seat', color: 'white' },
  ];
  assert.equal(carPaint(bricks), 0xe53935);
  assert.equal(carPaint([{ type: 'chassis', color: 'black' }]), 0x263238);
  assert.equal(carPaint([]), 0x263238);
  assert.equal(carPaint([{ type: 'brick12', color: 'nonsense' }]), 0x263238);
});

test('garageFloorAt says which floor he is on, only inside the garage', () => {
  for (const s of GARAGE.spots) assert.equal(garageFloorAt(s.x, s.y + 0.6, s.z), s.floor, `spot ${s.index}`);
  const r = GARAGE.rect;
  assert.equal(garageFloorAt(r.x1 + 5, 0.6, r.z0 + 5), null);
  assert.equal(garageFloorAt(r.x0 + 5, 3 * FLOOR_HEIGHT + 4, r.z0 + 5), 2, 'jumping on the top deck is still the top deck');
  const ramp = GARAGE.rampPaths[0];
  assert.equal(garageFloorAt(r.x0 + (ramp.u0 + ramp.u1) / 2, ramp.y0 + 0.5, r.z0 + ramp.v0 + 1), 0, 'bottom of the first ramp');
});

test('each garage floor has its own colour and a big number to read', () => {
  assert.equal(GARAGE_FLOORS.length, 3);
  assert.equal(new Set(GARAGE_FLOORS.map(f => f.hex)).size, 3);
  assert.deepEqual(GARAGE_FLOORS.map(f => f.label), ['1', '2', '3']);
});

test('map landmarks sit in the city, each with an icon and a short name', () => {
  for (const kind of ['garage', 'pizza', 'race', 'stunts']) assert.ok(MAP_LANDMARKS.some(l => l.kind === kind), kind);
  for (const l of MAP_LANDMARKS) {
    assert.ok(inCity(l.x, l.z), l.kind);
    assert.ok(l.icon && l.name && l.name.length <= 12, l.kind);
  }
});
