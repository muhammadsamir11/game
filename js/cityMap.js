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
  ['garage', 'truckYard', 'shops', 'towers'],
  ['houses', 'park', 'pizza', 'houses'],
  ['shops', 'towers', 'houses', 'showroom'],
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

// Murad Motors, the posh car showroom: a mystery car spins on a turntable out front under a silk sheet.
// waiting: where prize cars park when the garage is full, beside the turntable, facing the road.
const SHOWROOM_RECT = blockRect(3, 2);
const showroomMiddleX = (SHOWROOM_RECT.x0 + SHOWROOM_RECT.x1) / 2;
export const SHOWROOM = {
  block: { bx: 3, bz: 2 },
  turntable: { x: showroomMiddleX, z: SHOWROOM_RECT.z1 - 9, radius: 3.2 },
  zoneRadius: 7,
  waiting: [-10.5, 10.5, 7].map(dx => ({ x: showroomMiddleX + dx, z: SHOWROOM_RECT.z1 - 9, heading: 0 })),
};

// The Truck Yard, across the road from the garage's door: numbered bays for his trucks (nose to the north
// fence) and trailers (towbars toward the yard's middle), and a long bay for the car truck along the south
// side, facing east with its ramp at the west end, so cars from the garage drive straight up it.
// Bays: w and d are their x and z extents. carTruck: the cab's brick-space origin.
const YARD_RECT = blockRect(1, 0);
const YARD_LOT = { x0: YARD_RECT.x0 + SIDEWALK, z0: YARD_RECT.z0 + SIDEWALK, x1: YARD_RECT.x1 - SIDEWALK, z1: YARD_RECT.z1 - SIDEWALK };
const fence = (x0, x1, z0, z1) => ({ cx: (x0 + x1) / 2, cy: 0.6, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hy: 0.6, hz: (z1 - z0) / 2 });
export const TRUCK_YARD = {
  block: { bx: 1, bz: 0 },
  rect: YARD_RECT,
  lot: YARD_LOT,
  truckBays: Array.from({ length: 4 }, (_, index) => ({ index, x: YARD_LOT.x0 + 2.5 + 4.6 * index, z: YARD_LOT.z0 + 4.5, heading: Math.PI, w: 4.4, d: 9 })),
  trailerBays: Array.from({ length: 4 }, (_, index) => ({ index, x: YARD_LOT.x1 - 5.5, z: YARD_LOT.z0 + 3 + 4.6 * index, heading: -Math.PI / 2, w: 11, d: 4.4 })),
  carTruck: { x: YARD_LOT.x1 - 5, z: YARD_LOT.z1 - 4.5, heading: Math.PI / 2 },
  // Open on the west (toward the garage) and at the east end of the car truck's bay, so the rig can drive out.
  fences: [
    fence(YARD_LOT.x0, YARD_LOT.x1, YARD_LOT.z0 - 0.3, YARD_LOT.z0),
    fence(YARD_LOT.x0, YARD_LOT.x1, YARD_LOT.z1, YARD_LOT.z1 + 0.3),
    fence(YARD_LOT.x1, YARD_LOT.x1 + 0.3, YARD_LOT.z0, YARD_LOT.z0 + 19),
  ],
  sign: { x: YARD_LOT.x0, z: YARD_LOT.z0 + 6 },
};

const inBay = (bay, x, z) => Math.abs(x - bay.x) <= bay.w / 2 && Math.abs(z - bay.z) <= bay.d / 2;
export const truckBayAt = (x, z) => TRUCK_YARD.truckBays.find(b => inBay(b, x, z))?.index ?? null;
export const trailerBayAt = (x, z) => TRUCK_YARD.trailerBays.find(b => inBay(b, x, z))?.index ?? null;

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
  // part: 'outer' walls get windows, 'low' walls edge the open upper floors, 'curb's ring the ramp holes.
  walls: [
    { ...box(-0.4, 0, 0, 3 * FLOOR_HEIGHT, 0, 36), part: 'outer' }, // west
    { ...box(0, 36, 0, 3 * FLOOR_HEIGHT, -0.4, 0), part: 'outer' }, // north
    { ...box(0, 36, 0, 3 * FLOOR_HEIGHT, 36, 36.4), part: 'outer' }, // south
    { ...box(36, 36.4, 0, 3 * FLOOR_HEIGHT, 0, 4), part: 'outer' }, // east, either side of the entrance
    { ...box(36, 36.4, 0, 3 * FLOOR_HEIGHT, 32, 36), part: 'outer' },
    { ...box(36, 36.4, FLOOR_HEIGHT, FLOOR_HEIGHT + 1, 4, 32), part: 'low' }, // low walls on the upper floors' open side
    { ...box(36, 36.4, 2 * FLOOR_HEIGHT, 2 * FLOOR_HEIGHT + 1, 4, 32), part: 'low' },
    // curbs round the ramp holes, so nothing drops through (the climbing end stays open)
    ...[
      box(21.6, 22, FLOOR_HEIGHT, FLOOR_HEIGHT + 0.6, 10, 26), box(28, 28.4, FLOOR_HEIGHT, FLOOR_HEIGHT + 0.6, 10, 26), box(22, 28, FLOOR_HEIGHT, FLOOR_HEIGHT + 0.6, 9.6, 10),
      box(28.6, 29, 2 * FLOOR_HEIGHT, 2 * FLOOR_HEIGHT + 0.6, 10, 26), box(29, 35, 2 * FLOOR_HEIGHT, 2 * FLOOR_HEIGHT + 0.6, 26, 26.4),
    ].map(b => ({ ...b, part: 'curb' })),
  ],
  // Two rows of 4 on each floor, with a 6 m aisle between them: 1–12 nose to the west wall, 13–24 nose
  // to the ramps. The numbers stay put, so cars already parked in 1–12 keep their spots.
  spots: Array.from({ length: 24 }, (_, index) => {
    const middle = index >= 12;
    const floor = Math.floor((index % 12) / 4);
    const k = index % 4;
    return { index, floor, x: G.x0 + (middle ? 17 : 5), y: floor * FLOOR_HEIGHT, z: G.z0 + 6.5 + 6 * k, heading: middle ? Math.PI / 2 : -Math.PI / 2, w: 6, d: 5 };
  }),
  spawn: { x: G.x0 + 11, y: 0, z: G.z0 + 18, heading: -Math.PI / 2 }, // in the aisle
};

// An invisible barrier across the garage's door that only a truck pulling a trailer meets: the aisles inside
// are too tight for a rig.
export const GARAGE_DOOR = { cx: G.x1 + 0.3, cy: 1.85, cz: G.z0 + 18, hx: 0.3, hy: 1.85, hz: 14 };

// Each floor has its own colour and a big number, so he can tell them apart (and find his car again).
export const GARAGE_FLOORS = [
  { label: '1', hex: 0x1e88e5, css: '#1e88e5' },
  { label: '2', hex: 0xfb8c00, css: '#fb8c00' },
  { label: '3', hex: 0x43a047, css: '#43a047' },
];

// Which floor (0, 1, 2) someone at (x, y, z) is on, or null outside the garage. On a ramp it's the floor below until near the top.
export function garageFloorAt(x, y, z) {
  if (x <= G.x0 || x >= G.x1 || z <= G.z0 || z >= G.z1) return null;
  return Math.max(0, Math.min(GARAGE_FLOORS.length - 1, Math.floor((y + 1) / FLOOR_HEIGHT)));
}

// Which spot (if any) a car's centre at (x, y, z) is parked in.
export function spotAt(x, y, z) {
  const s = GARAGE.spots.find(spot => Math.abs(x - spot.x) <= spot.w / 2 && Math.abs(z - spot.z) <= spot.d / 2 && y >= spot.y - 0.5 && y <= spot.y + 2.5);
  return s ? s.index : null;
}

export const RACE_GATE = { x: roadCenter(GRID), z: roadCenter(1) + PITCH / 2, radius: 6 };

// The places drawn as big icons on the map, with names short enough to read at a glance.
const blockMiddle = (bx, bz) => ({ x: blockRect(bx, bz).x0 + BLOCK / 2, z: blockRect(bx, bz).z0 + BLOCK / 2 });
export const MAP_LANDMARKS = [
  { kind: 'garage', icon: '🅿️', name: 'Garage', ...blockMiddle(0, 0) },
  { kind: 'pizza', icon: '🍕', name: 'Pizza', ...blockMiddle(2, 1) },
  { kind: 'stunts', icon: '⭐', name: 'Stunt Park', ...blockMiddle(STUNT_PARK_BLOCK.bx, STUNT_PARK_BLOCK.bz) },
  { kind: 'pond', icon: '🦆', name: 'Pond', ...blockMiddle(2, 3) },
  { kind: 'showroom', icon: '❓', name: 'Showroom', ...blockMiddle(SHOWROOM.block.bx, SHOWROOM.block.bz) },
  { kind: 'race', icon: '🏁', name: 'Race', x: RACE_GATE.x - 8, z: RACE_GATE.z },
  { kind: 'trucks', icon: '🚚', name: 'Trucks', ...blockMiddle(TRUCK_YARD.block.bx, TRUCK_YARD.block.bz) },
];

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
