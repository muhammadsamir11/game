import { SIZE, ROAD, PITCH, GRID, SIDEWALK, BLOCKS, INTERSECTIONS, roadCenter, STUNT_PARK_BLOCK } from './cityMap.js';
import { STUNT_PARK } from './stuntPark.js';
import { STUD } from './bricks.js';
import { snapStud, seededRandom } from './legoKit.js';

// The ground as toy plates: smooth grey road plates, studded green baseplates, light grey studded sidewalks.
// Far away the studs are a picture; near him they are real 3D studs, in chunks that switch on as he gets close.
export const GRASS = 0x4caf50;
export const SIDEWALK_GREY = 0xc9ced3;
export const SAND = 0xe6c98f;
const ROAD_GREY = 0x6b7078;
const CHUNK = 16;
const BAND = 24; // studded ground shown outside the city's curb
// Surface heights: everything is thin, like real plates; studs stand on top.
export const TOP = { road: 0.01, sidewalk: 0.03, lot: 0.04, pond: 0.045 };

export const lotRect = b => ({ x0: b.rect.x0 + SIDEWALK, z0: b.rect.z0 + SIDEWALK, x1: b.rect.x1 - SIDEWALK, z1: b.rect.z1 - SIDEWALK });
export const pondRect = b => {
  const l = lotRect(b);
  return { x0: l.x0 + 9, z0: l.z0 + 9, x1: l.x1 - 9, z1: l.z1 - 9 };
};
const isStuntPark = b => b.bx === STUNT_PARK_BLOCK.bx && b.bz === STUNT_PARK_BLOCK.bz;
export const grassy = b => ['houses', 'park', 'pizza', 'showroom'].includes(b.type);

export function createGround(kit, scene, own, { occupied }) {
  const grass = kit.plastic(GRASS, { look: 'studs' });
  const walk = kit.plastic(SIDEWALK_GREY, { look: 'studs' });
  const sand = kit.plastic(SAND, { look: 'studs' });
  const road = kit.plastic(ROAD_GREY, { look: 'road', roughness: 0.5 });
  const plaza = kit.plastic(0xd7ccc8, { look: 'road', roughness: 0.45 });
  const concrete = kit.plastic(0xa7b1b8, { look: 'road', roughness: 0.5 });
  const water = kit.plastic(0x29b6f6, { look: 'ripples', transparent: true, opacity: 0.82, roughness: 0.06 });
  water.userData.noShadow = true;
  const white = kit.plastic(0xf5f5f5);
  const holes = [...occupied]; // no near studs here
  const near = []; // { x0, z0, x1, z1, y, hex } rects that get real studs near him

  // --- the big baseplate, the road plate the city stands on, and a lake ---
  kit.span(grass, -300, -0.05, -300, SIZE + 300, 0, SIZE + 300);
  kit.span(road, 0, 0, 0, SIZE, TOP.road, SIZE);
  kit.span(sand, -46, 0, SIZE + 24, SIZE + 46, 0.012, SIZE + 146);
  kit.span(water, -40, 0, SIZE + 30, SIZE + 40, 0.02, SIZE + 140);
  near.push(
    { x0: -BAND, z0: -BAND, x1: -1, z1: SIZE + BAND, y: 0, hex: GRASS },
    { x0: SIZE + 1, z0: -BAND, x1: SIZE + BAND, z1: SIZE + BAND, y: 0, hex: GRASS },
    { x0: -1, z0: -BAND, x1: SIZE + 1, z1: -1, y: 0, hex: GRASS },
    { x0: -1, z0: SIZE + 1, x1: SIZE + 1, z1: SIZE + BAND, y: 0, hex: GRASS },
  );

  // --- blocks: a studded sidewalk ring, and a lot inside it ---
  for (const b of BLOCKS) {
    const { x0, z0, x1, z1 } = b.rect;
    const lot = lotRect(b);
    if (b.type === 'garage') {
      kit.span(concrete, x0, TOP.road, z0, x1, TOP.sidewalk, z1);
      continue;
    }
    kit.span(walk, x0, TOP.road, z0, x1, TOP.sidewalk, z1);
    for (const r of [
      { x0, z0, x1, z1: lot.z0 }, { x0, z0: lot.z1, x1, z1 },
      { x0, z0: lot.z0, x1: lot.x0, z1: lot.z1 }, { x0: lot.x1, z0: lot.z0, x1, z1: lot.z1 },
    ]) near.push({ ...r, y: TOP.sidewalk, hex: SIDEWALK_GREY });
    // A white curb edge where the sidewalk meets the road.
    kit.span(white, x0, TOP.sidewalk, z0, x1, TOP.sidewalk + 0.02, z0 + 0.15);
    kit.span(white, x0, TOP.sidewalk, z1 - 0.15, x1, TOP.sidewalk + 0.02, z1);
    kit.span(white, x0, TOP.sidewalk, z0, x0 + 0.15, TOP.sidewalk + 0.02, z1);
    kit.span(white, x1 - 0.15, TOP.sidewalk, z0, x1, TOP.sidewalk + 0.02, z1);
    if (grassy(b)) {
      kit.span(grass, lot.x0, TOP.road, lot.z0, lot.x1, TOP.lot, lot.z1);
      near.push({ ...lot, y: TOP.lot, hex: GRASS });
    } else {
      kit.span(plaza, lot.x0, TOP.road, lot.z0, lot.x1, TOP.lot, lot.z1);
    }
    if (b.type === 'park' && !isStuntPark(b)) {
      const p = pondRect(b);
      kit.span(sand, p.x0 - 1.5, TOP.lot, p.z0 - 1.5, p.x1 + 1.5, TOP.pond - 0.002, p.z1 + 1.5);
      kit.span(water, p.x0, TOP.lot, p.z0, p.x1, TOP.pond, p.z1);
      near.push(
        { x0: p.x0 - 1.5, z0: p.z0 - 1.5, x1: p.x1 + 1.5, z1: p.z0, y: TOP.pond - 0.002, hex: SAND },
        { x0: p.x0 - 1.5, z0: p.z1, x1: p.x1 + 1.5, z1: p.z1 + 1.5, y: TOP.pond - 0.002, hex: SAND },
        { x0: p.x0 - 1.5, z0: p.z0, x1: p.x0, z1: p.z1, y: TOP.pond - 0.002, hex: SAND },
        { x0: p.x1, z0: p.z0, x1: p.x1 + 1.5, z1: p.z1, y: TOP.pond - 0.002, hex: SAND },
      );
      holes.push({ x0: p.x0 - 1.6, z0: p.z0 - 1.6, x1: p.x1 + 1.6, z1: p.z1 + 1.6 });
    }
    if (isStuntPark(b)) {
      const i = STUNT_PARK.inner;
      kit.span(kit.plastic(0x546e7a, { look: 'road', roughness: 0.5 }), i.x0, TOP.lot, i.z0, i.x1, TOP.pond, i.z1);
      for (const pad of STUNT_PARK.landings) kit.span(kit.plastic(0x26c6da), pad.x0, TOP.pond, pad.z0, pad.x1, TOP.pond + 0.02, pad.z1);
      holes.push({ x0: i.x0 - 0.3, z0: i.z0 - 0.3, x1: i.x1 + 0.3, z1: i.z1 + 0.3 });
    }
  }

  // --- road markings: white dash tiles, zebra crossings at every junction, a few odd tiles ---
  const lineY = TOP.road + 0.012;
  for (let i = 0; i <= GRID; i++) {
    for (let k = 0; k < GRID; k++) {
      for (let d = ROAD + 5; d < PITCH - 5; d += 6) {
        kit.box(white, roadCenter(i), lineY, k * PITCH + d, 0.3, 0.024, 3);
        kit.box(white, k * PITCH + d, lineY, roadCenter(i), 3, 0.024, 0.3);
      }
    }
  }
  for (const p of INTERSECTIONS) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = p.x + dx * (ROAD / 2 + 1.1);
      const cz = p.z + dz * (ROAD / 2 + 1.1);
      if (cx < 0 || cx > SIZE || cz < 0 || cz > SIZE) continue;
      for (let s = -4.5; s <= 4.5; s += 1.5) {
        if (dx) kit.box(white, cx, lineY, p.z + s, 1.8, 0.024, 0.7);
        else kit.box(white, p.x + s, lineY, cz, 0.7, 0.024, 1.8);
      }
    }
  }
  const rand = seededRandom(42);
  const tileColors = [kit.plastic(0x8a9099), kit.plastic(0x595e66), kit.plastic(0x9aa0a8)];
  for (let n = 0; n < 420; n++) {
    const along = rand() * SIZE;
    const i = Math.floor(rand() * (GRID + 1));
    const across = roadCenter(i) + (rand() - 0.5) * (ROAD - 1);
    const [x, z] = rand() < 0.5 ? [along, across] : [across, along];
    const long = rand() < 0.5;
    kit.box(tileColors[n % 3], snapStud(x), TOP.road + 0.008, snapStud(z), long ? STUD * 2 : STUD, 0.016, long ? STUD : STUD * 2);
  }

  // --- the curb round the city: red and white bricks with studs on top ---
  const red = kit.plastic(0xe53935);
  const curbTop = 0.8;
  const curb = (x0, z0, x1, z1) => {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let s = 0, n = 0; s < len; s += 2, n++) {
      const m = n % 2 ? white : red;
      if (alongX) kit.span(m, x0 + s, 0, z0, Math.min(x1, x0 + s + 2), curbTop, z1);
      else kit.span(m, x0, 0, z0 + s, x1, curbTop, Math.min(z1, z0 + s + 2));
      if (alongX) kit.studs(m, x0 + s, z0, Math.min(x1, x0 + s + 2), z1, curbTop);
      else kit.studs(m, x0, z0 + s, x1, Math.min(z1, z0 + s + 2), curbTop);
    }
  };
  curb(-1, -1, 0, SIZE + 1);
  curb(SIZE, -1, SIZE + 1, SIZE + 1);
  curb(0, -1, SIZE, 0);
  curb(0, SIZE, SIZE, SIZE + 1);

  // --- near studs, in chunks ---
  const inHole = (x, z) => holes.some(h => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
  const field = kit.studField(scene, { chunk: CHUNK });
  for (const r of near) {
    for (let x = snapStud(r.x0 + STUD / 2); x < r.x1; x += STUD) {
      for (let z = snapStud(r.z0 + STUD / 2); z < r.z1; z += STUD) if (!inHole(x, z)) field.add(x, r.y, z, r.hex);
    }
  }
  field.finish();

  return {
    get studCount() { return field.count; },
    // Real studs only near him; further out the baseplate picture does the job.
    update(time, focus) {
      if (focus) field.update(focus);
      water.normalMap.offset.set(time * 0.03, time * 0.017);
    },
    get radius() { return field.radius; },
    set radius(r) { field.radius = r; },
  };
}
