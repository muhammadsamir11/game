import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, PITCH, ROAD, LANE, FLOOR_HEIGHT, BLOCKS, INTERSECTIONS, GARAGE, RACE_GATE, TRAFFIC_LOOPS, PEDESTRIAN_PATHS,
  isOnRoad, isOnSidewalk, blockAt, spotAt, roadCenter, SHOWROOM, MAP_LANDMARKS, blockRect, SCHOOL, FOOTBALL,
} from '../js/cityMap.js';
import { PRIZE_CARS } from '../js/prizeCars.js';

const insideXZ = (b, x, z) => Math.abs(x - b.cx) <= b.hx + 1e-9 && Math.abs(z - b.cz) <= b.hz + 1e-9;
const slabsOn = floor => GARAGE.floors.filter(b => Math.abs(b.cy + b.hy - floor * FLOOR_HEIGHT) < 1e-9);
const samples = (corners, step = 1) => corners.flatMap((a, i) => {
  const b = corners[(i + 1) % corners.length];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  return Array.from({ length: Math.ceil(len / step) }, (_, k) => ({ x: a.x + (b.x - a.x) * (k * step / len), z: a.z + (b.z - a.z) * (k * step / len) }));
});

test('a 6×6 city, 300 m across, with exactly one garage at the corner', () => {
  assert.equal(SIZE, 300);
  assert.equal(BLOCKS.length, 36);
  assert.deepEqual(BLOCKS.filter(b => b.type === 'garage').map(b => [b.bx, b.bz]), [[0, 0]]);
  for (const type of ['houses', 'shops', 'towers', 'park', 'pizza', 'showroom', 'truckYard', 'school', 'pitch']) assert.ok(BLOCKS.some(b => b.type === type), type);
  for (const type of ['school', 'pitch']) assert.equal(BLOCKS.filter(b => b.type === type).length, 1, type);
});

test('the first city keeps its 16 blocks, in their old order (missions and colours go by block number)', () => {
  const first = [
    'garage', 'truckYard', 'shops', 'towers', 'houses', 'park', 'pizza', 'houses',
    'shops', 'towers', 'houses', 'showroom', 'towers', 'houses', 'park', 'houses',
  ];
  assert.deepEqual(BLOCKS.slice(0, 16).map(b => b.type), first);
  BLOCKS.slice(0, 16).forEach((b, n) => assert.deepEqual([b.bx, b.bz], [n % 4, Math.floor(n / 4)]));
});

test('the school, its sign, flag and bus stand on its block, off the road', () => {
  const r = blockRect(SCHOOL.block.bx, SCHOOL.block.bz);
  assert.equal(blockAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2).type, 'school');
  const inside = (x, z) => x > r.x0 + 3 && x < r.x1 - 3 && z > r.z0 + 3 && z < r.z1 - 3;
  for (const box of [SCHOOL.wings, SCHOOL.hall]) assert.ok(inside(box.x0, box.z0) && inside(box.x1, box.z1));
  assert.ok(inside(SCHOOL.sign.x - 6, SCHOOL.sign.z) && inside(SCHOOL.sign.x + 6, SCHOOL.sign.z));
  assert.ok(SCHOOL.sign.z > SCHOOL.hall.z1 + 3, 'room for the steps between the doors and the sign');
  assert.ok(inside(SCHOOL.flag.x, SCHOOL.flag.z));
  const { bus } = SCHOOL;
  assert.ok(inside(bus.x - bus.w / 2, bus.z - bus.l / 2) && inside(bus.x + bus.w / 2, bus.z + bus.l / 2));
  assert.ok(bus.z - bus.l / 2 > SCHOOL.wings.z1 + 1.2, 'the bus clears the balconies');
  assert.ok(MAP_LANDMARKS.some(m => m.kind === 'school' && blockAt(m.x, m.z)?.type === 'school'));
});

test('the football pitch: a field inside its block with a goal on each end line, and the ball on the centre spot', () => {
  const r = blockRect(FOOTBALL.block.bx, FOOTBALL.block.bz);
  assert.equal(blockAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2).type, 'pitch');
  const { field, goals, ball } = FOOTBALL;
  assert.ok(field.x0 > r.x0 + 3 && field.x1 < r.x1 - 3 && field.z0 > r.z0 + 3 && field.z1 < r.z1 - 3);
  assert.deepEqual(goals.map(g => g.x).sort((a, b) => a - b), [field.x0, field.x1]);
  for (const g of goals) {
    assert.ok(Math.abs(g.z - (field.z0 + field.z1) / 2) < 1e-9);
    assert.ok(g.width > ball.radius * 4, 'the ball fits in easily');
    assert.equal(Math.sign(g.x - ball.x), g.out, 'the net is behind the end line');
    const back = g.x + g.out * g.depth;
    assert.ok(back > r.x0 + 3 && back < r.x1 - 3, 'the net stays off the sidewalk');
  }
  assert.equal(ball.x, (field.x0 + field.x1) / 2);
  assert.equal(ball.z, (field.z0 + field.z1) / 2);
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
  assert.equal(INTERSECTIONS.length, 49);
  assert.ok(INTERSECTIONS.every(p => isOnRoad(p.x, p.z)));
});

test('24 garage spots, two rows of 4 per floor, inside the garage and apart from each other', () => {
  assert.equal(GARAGE.spots.length, 24);
  for (const f of [0, 1, 2]) assert.equal(GARAGE.spots.filter(s => s.floor === f).length, 8);
  const r = GARAGE.rect;
  for (const s of GARAGE.spots) {
    assert.ok(s.x > r.x0 && s.x < r.x1 && s.z > r.z0 && s.z < r.z1, `spot ${s.index}`);
    assert.equal(s.y, s.floor * FLOOR_HEIGHT);
    assert.equal(Math.abs(s.heading), Math.PI / 2);
  }
  for (const a of GARAGE.spots) for (const b of GARAGE.spots) {
    if (a !== b && a.floor === b.floor) assert.ok(Math.abs(a.z - b.z) >= 5 || Math.abs(a.x - b.x) >= 12, `${a.index} vs ${b.index}`);
  }
});

test('spots 1–12 keep the floors they always had', () => {
  for (const s of GARAGE.spots.slice(0, 12)) assert.equal(s.floor, Math.floor(s.index / 4));
});

test('the middle row stays clear of the ramp curbs, and the spawn is in the aisle between the rows', () => {
  const { x0 } = GARAGE.rect;
  for (const s of GARAGE.spots.filter(s => s.index >= 12)) assert.ok(s.x + s.w / 2 < x0 + 21.6, `spot ${s.index}`);
  const west = GARAGE.spots[0].x + GARAGE.spots[0].w / 2;
  const middle = GARAGE.spots[12].x - GARAGE.spots[12].w / 2;
  assert.ok(GARAGE.spawn.x > west + 1 && GARAGE.spawn.x < middle - 1);
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

test('the garage is tall enough for a 3.5 m car, and its walls reach the top floor', () => {
  const slab = GARAGE.floors[0].hy * 2;
  assert.ok(FLOOR_HEIGHT - slab >= 3.5, `clearance ${FLOOR_HEIGHT - slab}`);
  for (const w of GARAGE.walls.slice(0, 5)) assert.ok(w.cy + w.hy >= 3 * FLOOR_HEIGHT - 1e-9);
});

test('ramps are no steeper than 15 degrees', () => {
  for (const p of GARAGE.rampPaths) assert.ok(Math.atan2(p.y1 - p.y0, Math.abs(p.v1 - p.v0)) <= (15 * Math.PI) / 180 + 1e-9);
});

test('nothing can drive under a ramp: supports fill it to within 1 m of the underside', () => {
  const { x0, z0 } = GARAGE.rect;
  for (const p of GARAGE.rampPaths) {
    for (let t = 0.02; t < 1; t += 0.04) {
      const v = p.v0 + (p.v1 - p.v0) * t;
      const under = p.y0 + (p.y1 - p.y0) * t - 0.3; // underside of the ramp slab
      for (const u of [p.u0 + 0.2, (p.u0 + p.u1) / 2, p.u1 - 0.2]) {
        const tops = GARAGE.supports.filter(b => insideXZ(b, x0 + u, z0 + v) && b.cy - b.hy <= p.y0 + 1e-9).map(b => b.cy + b.hy);
        const top = Math.max(p.y0, ...tops);
        assert.ok(under - top <= 1 + 1e-9, `gap ${under - top} at t=${t.toFixed(2)}`);
        assert.ok(tops.every(t => t <= under + 1e-9), 'support pokes through the ramp');
      }
    }
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

test('twelve traffic loops drive clockwise on right-hand lanes of the roads', () => {
  assert.equal(TRAFFIC_LOOPS.length, 12);
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
  assert.equal(PEDESTRIAN_PATHS.length, 10);
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

test('every garage wall says what it is, so it can be dressed: outer walls, low walls and ramp curbs', () => {
  const count = part => GARAGE.walls.filter(w => w.part === part).length;
  assert.deepEqual([count('outer'), count('low'), count('curb')], [5, 2, 5]);
  assert.equal(GARAGE.walls.length, 12);
});

test("the showroom's turntable, zone and waiting slots are on its block, off the road and apart", () => {
  const { block, turntable, zoneRadius, waiting } = SHOWROOM;
  assert.equal(BLOCKS.find(b => b.bx === block.bx && b.bz === block.bz).type, 'showroom');
  assert.ok(!BLOCKS.some(b => b.type === 'shopSoon'));
  const r = blockRect(block.bx, block.bz);
  const onBlock = (x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && !isOnRoad(x, z);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(onBlock(turntable.x + dx * zoneRadius, turntable.z + dz * zoneRadius));
  assert.ok(zoneRadius > turntable.radius);
  assert.ok(waiting.length >= PRIZE_CARS.length);
  waiting.forEach((w, i) => {
    assert.ok(onBlock(w.x, w.z), `slot ${i}`);
    assert.ok(Math.hypot(w.x - turntable.x, w.z - turntable.z) >= turntable.radius + 3, `slot ${i} clear of the turntable`);
    waiting.slice(i + 1).forEach((o, k) => assert.ok(Math.hypot(w.x - o.x, w.z - o.z) >= 3, `slots ${i} and ${i + k + 1}`));
  });
  const mark = MAP_LANDMARKS.find(m => m.kind === 'showroom');
  assert.ok(mark && blockAt(mark.x, mark.z) === BLOCKS.find(b => b.type === 'showroom'));
});
