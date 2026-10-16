// The mini city as plain data, so it is the same every visit and can be checked by tests.
// x grows east, z grows south; the city covers 0..SIZE on both axes. Heading h means forward (sin h, 0, cos h).

export const BLOCK = 36;
export const ROAD = 12;
export const LANE = 3; // a lane's centre is this far from the road's centre line
export const SIDEWALK = 3;
export const PITCH = BLOCK + ROAD;
export const GRID = 4;
export const SIZE = GRID * PITCH + ROAD; // 204
export const FLOOR_HEIGHT = 4; // 3.7 m under each slab: room for tall home-built cars
// The boy this city is for. His name turns up on a few signs, as a surprise for him to find.
export const HERO_NAME = 'Murad';

const LAYOUT = [ // LAYOUT[bz][bx]
  ['garage', 'houses', 'shops', 'towers'],
  ['houses', 'park', 'pizza', 'houses'],
  ['shops', 'towers', 'houses', 'shopSoon'],
  ['towers', 'houses', 'park', 'houses'],
];

export const roadCenter = i => i * PITCH + ROAD / 2;

export function blockRect(bx, bz) {
  const x0 = ROAD + bx * PITCH;
  const z0 = ROAD + bz * PITCH;
  return { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK };
}

export const BLOCKS = LAYOUT.flatMap((row, bz) => row.map((type, bx) => ({ bx, bz, type, rect: blockRect(bx, bz) })));
// Building colours, named so a mission can say "the green house" and mean it.
export const BUILDING_COLORS = [
  { hex: 0xe53935, name: 'red' }, { hex: 0x1e88e5, name: 'blue' }, { hex: 0xfdd835, name: 'yellow' }, { hex: 0x43a047, name: 'green' },
  { hex: 0xfb8c00, name: 'orange' }, { hex: 0x8e24aa, name: 'purple' }, { hex: 0x00acc1, name: 'teal' }, { hex: 0xf06292, name: 'pink' },
];
export const buildingColor = (blockIndex, k) => BUILDING_COLORS[(blockIndex * 3 + k) % BUILDING_COLORS.length];
// The middle of house k (0..3, left-to-right then top-to-bottom) on a houses block.
export const houseCenter = (block, k) => ({ x: block.rect.x0 + 10 + 15 * (k % 2), z: block.rect.z0 + 10 + 15 * Math.floor(k / 2) });

// The park next to the pizza shop is Murad's Stunt Park.
export const STUNT_PARK_BLOCK = { bx: 1, bz: 1 };

export const INTERSECTIONS = [];
for (let i = 0; i <= GRID; i++) {
  for (let j = 0; j <= GRID; j++) INTERSECTIONS.push({ i, j, x: roadCenter(i), z: roadCenter(j) });
}

export const inCity = (x, z) => x >= 0 && x <= SIZE && z >= 0 && z <= SIZE;
const inRoadStrip = v => (((v % PITCH) + PITCH) % PITCH) <= ROAD;
export const isOnRoad = (x, z) => inCity(x, z) && (inRoadStrip(x) || inRoadStrip(z));

export function blockAt(x, z) {
  return BLOCKS.find(b => x >= b.rect.x0 && x <= b.rect.x1 && z >= b.rect.z0 && z <= b.rect.z1) ?? null;
}

export function isOnSidewalk(x, z) {
  const b = blockAt(x, z);
  if (!b) return false;
  const { x0, z0, x1, z1 } = b.rect;
  return Math.min(x - x0, x1 - x, z - z0, z1 - z) <= SIDEWALK;
}

// --- Garage on block (0,0). u/v are block-local x/z (0..36); y is height. ---
const G = blockRect(0, 0);
const SLAB = 0.3;
const box = (u0, u1, y0, y1, v0, v1) => ({ cx: G.x0 + (u0 + u1) / 2, cy: (y0 + y1) / 2, cz: G.z0 + (v0 + v1) / 2, hx: (u1 - u0) / 2, hy: (y1 - y0) / 2, hz: (v1 - v0) / 2, rotX: 0 });
const slab = (floor, u0, u1, v0, v1) => box(u0, u1, floor * FLOOR_HEIGHT - SLAB, floor * FLOOR_HEIGHT, v0, v1);

// A ramp whose top surface runs from (v0, y0) up to (v1, y1) across u0..u1.
function rampBox({ u0, u1, v0, y0, v1, y1 }) {
  const run = Math.abs(v1 - v0);
  const angle = Math.atan2(y1 - y0, run);
  const rising = Math.sign(v1 - v0); // +1: climbs toward +z
  const ny = Math.cos(angle);
  const nz = -rising * Math.sin(angle);
  return {
    cx: G.x0 + (u0 + u1) / 2,
    cy: (y0 + y1) / 2 - (ny * SLAB) / 2,
    cz: G.z0 + (v0 + v1) / 2 - (nz * SLAB) / 2,
    hx: (u1 - u0) / 2,
    hy: SLAB / 2,
    hz: Math.hypot(run, y1 - y0) / 2,
    rotX: -rising * angle, // tips the climbing end up
  };
}

// Stepped blocks under a ramp, so nothing can drive or walk underneath it and get wedged.
function rampSupports({ u0, u1, v0, y0, v1, y1 }) {
  const STEPS = 5;
  const blocks = [];
  for (let k = 1; k < STEPS; k++) {
    const va = v0 + ((v1 - v0) * k) / STEPS;
    const vb = v0 + ((v1 - v0) * (k + 1)) / STEPS;
    const top = y0 + ((y1 - y0) * k) / STEPS - SLAB - 0.05; // just under the ramp where this step starts
    blocks.push(box(u0, u1, y0, top, Math.min(va, vb), Math.max(va, vb)));
  }
  return blocks;
}

const RAMP_PATHS = [
  // Both ends sit 10 m from the walls, so a car has room to turn on and off.
  { u0: 22, u1: 28, v0: 10, y0: 0, v1: 26, y1: FLOOR_HEIGHT }, // ground → 1st, climbing south
  { u0: 29, u1: 35, v0: 26, y0: FLOOR_HEIGHT, v1: 10, y1: 2 * FLOOR_HEIGHT }, // 1st → 2nd, climbing north
];

export const GARAGE = {
  rect: G,
  floors: [
    // 1st floor, with a hole over ramp A (u 22..28, v 10..26)
    slab(1, 0, 22, 0, 36), slab(1, 28, 36, 0, 36), slab(1, 22, 28, 26, 36), slab(1, 22, 28, 0, 10),
    // 2nd floor, with a hole over ramp B (u 29..35, v 10..26)
    slab(2, 0, 29, 0, 36), slab(2, 35, 36, 0, 36), slab(2, 29, 35, 0, 10), slab(2, 29, 35, 26, 36),
  ],
  rampPaths: RAMP_PATHS,
  ramps: RAMP_PATHS.map(rampBox),
  supports: RAMP_PATHS.flatMap(rampSupports),
  walls: [
    box(-0.4, 0, 0, 3 * FLOOR_HEIGHT, 0, 36), // west
    box(0, 36, 0, 3 * FLOOR_HEIGHT, -0.4, 0), // north
    box(0, 36, 0, 3 * FLOOR_HEIGHT, 36, 36.4), // south
    box(36, 36.4, 0, 3 * FLOOR_HEIGHT, 0, 4), // east, either side of the entrance
    box(36, 36.4, 0, 3 * FLOOR_HEIGHT, 32, 36),
    box(36, 36.4, FLOOR_HEIGHT, FLOOR_HEIGHT + 1, 4, 32), // low walls on the upper floors' open side
    box(36, 36.4, 2 * FLOOR_HEIGHT, 2 * FLOOR_HEIGHT + 1, 4, 32),
    // curbs round the ramp holes, so nothing drops through (the climbing end stays open)
    box(21.6, 22, FLOOR_HEIGHT, FLOOR_HEIGHT + 0.6, 10, 26), box(28, 28.4, FLOOR_HEIGHT, FLOOR_HEIGHT + 0.6, 10, 26), box(22, 28, FLOOR_HEIGHT, FLOOR_HEIGHT + 0.6, 9.6, 10),
    box(28.6, 29, 2 * FLOOR_HEIGHT, 2 * FLOOR_HEIGHT + 0.6, 10, 26), box(29, 35, 2 * FLOOR_HEIGHT, 2 * FLOOR_HEIGHT + 0.6, 26, 26.4),
  ],
  spots: Array.from({ length: 12 }, (_, index) => {
    const floor = Math.floor(index / 4);
    const k = index % 4;
    return { index, floor, x: G.x0 + 5, y: floor * FLOOR_HEIGHT, z: G.z0 + 6.5 + 6 * k, heading: -Math.PI / 2, w: 6, d: 5 };
  }),
  spawn: { x: G.x0 + 13, y: 0, z: G.z0 + 18, heading: -Math.PI / 2 },
};

// Which spot (if any) a car's centre at (x, y, z) is parked in.
export function spotAt(x, y, z) {
  const s = GARAGE.spots.find(spot => Math.abs(x - spot.x) <= spot.w / 2 && Math.abs(z - spot.z) <= spot.d / 2 && y >= spot.y - 0.5 && y <= spot.y + 2.5);
  return s ? s.index : null;
}

export const RACE_GATE = { x: roadCenter(GRID), z: roadCenter(1) + PITCH / 2, radius: 6 };

// Clockwise round a block on the right-hand (inner) lanes.
function laneLoop(bx, bz) {
  const x0 = roadCenter(bx) + LANE;
  const x1 = roadCenter(bx + 1) - LANE;
  const z0 = roadCenter(bz) + LANE;
  const z1 = roadCenter(bz + 1) - LANE;
  return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}
export const TRAFFIC_LOOPS = [[1, 0], [3, 0], [0, 2], [2, 1], [1, 3], [3, 2]].map(([bx, bz], i) => ({ corners: laneLoop(bx, bz), start: (i * 0.37) % 1 }));

// Round one block's sidewalk, or round two neighbouring blocks (which crosses the road between them).
function sidewalkLoop(bxA, bzA, bxB = bxA, bzB = bzA) {
  const a = blockRect(bxA, bzA);
  const b = blockRect(bxB, bzB);
  const x0 = Math.min(a.x0, b.x0) + 1.5;
  const x1 = Math.max(a.x1, b.x1) - 1.5;
  const z0 = Math.min(a.z0, b.z0) + 1.5;
  const z1 = Math.max(a.z1, b.z1) - 1.5;
  return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}
export const PEDESTRIAN_PATHS = [sidewalkLoop(1, 1, 2, 1), sidewalkLoop(0, 2, 0, 3), sidewalkLoop(2, 2), sidewalkLoop(3, 1), sidewalkLoop(1, 3)].map(corners => ({ corners }));
