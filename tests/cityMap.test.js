import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, PITCH, ROAD, LANE, FLOOR_HEIGHT, BLOCKS, INTERSECTIONS, GARAGE, RACE_GATE, TRAFFIC_LOOPS, PEDESTRIAN_PATHS,
  isOnRoad, isOnSidewalk, blockAt, spotAt, roadCenter,
} from '../js/cityMap.js';

const insideXZ = (b, x, z) => Math.abs(x - b.cx) <= b.hx + 1e-9 && Math.abs(z - b.cz) <= b.hz + 1e-9;
const slabsOn = floor => GARAGE.floors.filter(b => Math.abs(b.cy + b.hy - floor * FLOOR_HEIGHT) < 1e-9);
const samples = (corners, step = 1) => corners.flatMap((a, i) => {
  const b = corners[(i + 1) % corners.length];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  return Array.from({ length: Math.ceil(len / step) }, (_, k) => ({ x: a.x + (b.x - a.x) * (k * step / len), z: a.z + (b.z - a.z) * (k * step / len) }));
});

test('a 4×4 city, 204 m across, with exactly one garage at the corner', () => {
  assert.equal(SIZE, 204);
  assert.equal(BLOCKS.length, 16);
  assert.deepEqual(BLOCKS.filter(b => b.type === 'garage').map(b => [b.bx, b.bz]), [[0, 0]]);
  for (const type of ['houses', 'shops', 'towers', 'park', 'pizza', 'shopSoon']) assert.ok(BLOCKS.some(b => b.type === type), type);
});

test('roads, sidewalks and blocks are where they should be', () => {
  assert.equal(isOnRoad(roadCenter(2), 100), true);
  assert.equal(isOnRoad(30, 30), false);
  assert.equal(isOnSidewalk(ROAD + 1, ROAD + 10), true);
  assert.equal(isOnSidewalk(ROAD + 18, ROAD + 18), false);
  assert.equal(blockAt(ROAD + 18, ROAD + 18).type, 'garage');
  assert.equal(isOnRoad(-1, 50), false);
});

test('every intersection is listed (each gets a traffic light)', () => {
  assert.equal(INTERSECTIONS.length, 25);
  assert.ok(INTERSECTIONS.every(p => isOnRoad(p.x, p.z)));
});

test('12 garage spots, 4 per floor, inside the garage and apart from each other', () => {
  assert.equal(GARAGE.spots.length, 12);
  for (const f of [0, 1, 2]) assert.equal(GARAGE.spots.filter(s => s.floor === f).length, 4);
  const r = GARAGE.rect;
  for (const s of GARAGE.spots) {
    assert.ok(s.x > r.x0 && s.x < r.x1 && s.z > r.z0 && s.z < r.z1, `spot ${s.index}`);
    assert.equal(s.y, s.floor * FLOOR_HEIGHT);
    assert.equal(s.heading, -Math.PI / 2);
  }
  for (const a of GARAGE.spots) for (const b of GARAGE.spots) {
    if (a !== b && a.floor === b.floor) assert.ok(Math.abs(a.z - b.z) >= 5, `${a.index} vs ${b.index}`);
  }
});

test('upper-floor spots stand on a floor slab', () => {
  for (const s of GARAGE.spots.filter(s => s.floor > 0)) {
    assert.ok(slabsOn(s.floor).some(b => insideXZ(b, s.x, s.z)), `spot ${s.index}`);
  }
});

test('each ramp climbs exactly one floor, through a hole in the floor above, onto a slab edge', () => {
  assert.equal(GARAGE.rampPaths.length, 2);
  const { x0, z0 } = GARAGE.rect;
  for (const p of GARAGE.rampPaths) {
    assert.ok(Math.abs(p.y1 - p.y0 - FLOOR_HEIGHT) < 1e-9);
    const topFloor = Math.round(p.y1 / FLOOR_HEIGHT);
    const midU = x0 + (p.u0 + p.u1) / 2;
    const midV = z0 + (p.v0 + p.v1) / 2;
    assert.ok(!slabsOn(topFloor).some(b => insideXZ(b, midU, midV)), 'hole above the ramp');
    const beyond = z0 + p.v1 + Math.sign(p.v1 - p.v0) * 0.5;
    assert.ok(slabsOn(topFloor).some(b => insideXZ(b, midU, beyond)), 'floor continues at the top of the ramp');
  }
});

test('each ramp end leaves a car room to turn (10 m to the garage wall)', () => {
  for (const p of GARAGE.rampPaths) {
    for (const v of [p.v0, p.v1]) assert.ok(v >= 10 && v <= 36 - 10, `ramp end at v=${v}`);
  }
});

test('spotAt finds a spot only when a car is on it, at that floor', () => {
  const s = GARAGE.spots[5];
  assert.equal(spotAt(s.x, s.y + 0.6, s.z), 5);
  assert.equal(spotAt(s.x + 2.5, s.y + 0.6, s.z - 2), 5);
  assert.equal(spotAt(s.x, s.y + 0.6 + FLOOR_HEIGHT, s.z), 9);
  assert.equal(spotAt(s.x + 8, s.y + 0.6, s.z), null);
  assert.equal(spotAt(100, 0.6, 100), null);
});

test('the player starts inside the garage on the ground floor', () => {
  const { x, z, y } = GARAGE.spawn;
  assert.equal(y, 0);
  assert.equal(blockAt(x, z).type, 'garage');
});

test('six traffic loops drive clockwise on right-hand lanes of the roads', () => {
  assert.equal(TRAFFIC_LOOPS.length, 6);
  for (const loop of TRAFFIC_LOOPS) {
    assert.equal(loop.corners.length, 4);
    for (const p of samples(loop.corners)) assert.ok(isOnRoad(p.x, p.z), `${p.x},${p.z}`);
    const [a, b] = loop.corners;
    assert.ok(b.x > a.x && b.z === a.z, 'first leg heads east');
    const offsetFromCentre = a.z - roadCenter(Math.round((a.z - ROAD / 2) / PITCH));
    assert.equal(offsetFromCentre, LANE, 'east-bound traffic keeps to the +z (right) lane');
  }
});

test('people walk on sidewalks and only cross roads, never through buildings', () => {
  assert.equal(PEDESTRIAN_PATHS.length, 5);
  let crossings = 0;
  for (const path of PEDESTRIAN_PATHS) {
    for (const p of samples(path.corners)) {
      assert.ok(isOnSidewalk(p.x, p.z) || isOnRoad(p.x, p.z), `${p.x},${p.z}`);
      if (isOnRoad(p.x, p.z)) crossings++;
    }
  }
  assert.ok(crossings > 0, 'some people cross a road');
});

test('the race gate stands on a road at the city edge', () => {
  assert.ok(isOnRoad(RACE_GATE.x, RACE_GATE.z));
  assert.ok(RACE_GATE.x > SIZE - ROAD);
});
