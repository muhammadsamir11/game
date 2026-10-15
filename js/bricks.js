// Brick catalogue. Sizes are grid units: w studs across (x), d studs long (z), h plate layers tall (y).
export const STUD = 0.5; // metres per stud
export const LAYER = 0.2; // metres per plate layer; a brick is 3 layers

export const COLORS = {
  red: { name: 'Red', hex: 0xe53935 },
  blue: { name: 'Blue', hex: 0x1e88e5 },
  yellow: { name: 'Yellow', hex: 0xfdd835 },
  green: { name: 'Green', hex: 0x43a047 },
  orange: { name: 'Orange', hex: 0xfb8c00 },
  white: { name: 'White', hex: 0xf5f5f5 },
  black: { name: 'Black', hex: 0x263238 },
  purple: { name: 'Purple', hex: 0x8e24aa },
};
export const COLOR_KEYS = Object.keys(COLORS);

export const BRICK_TYPES = {
  chassis: { name: 'Chassis', w: 4, d: 8, h: 1, mass: 40, kind: 'plate' },
  plate24: { name: 'Plate 2×4', w: 2, d: 4, h: 1, mass: 4, kind: 'plate' },
  brick12: { name: 'Brick 1×2', w: 1, d: 2, h: 3, mass: 3, kind: 'brick' },
  brick22: { name: 'Brick 2×2', w: 2, d: 2, h: 3, mass: 5, kind: 'brick' },
  brick24: { name: 'Brick 2×4', w: 2, d: 4, h: 3, mass: 9, kind: 'brick' },
  slope22: { name: 'Slope 2×2', w: 2, d: 2, h: 3, mass: 4, kind: 'slope' },
  wheelSmall: { name: 'Small Wheel', w: 1, d: 2, h: 3, mass: 6, kind: 'wheel', radius: 0.35 },
  wheelLarge: { name: 'Big Wheel', w: 1, d: 2, h: 3, mass: 9, kind: 'wheel', radius: 0.5 },
  engine: { name: 'Engine', w: 2, d: 2, h: 3, mass: 15, kind: 'engine' },
  seat: { name: 'Seat + Driver', w: 2, d: 2, h: 3, mass: 6, kind: 'seat' },
  steering: { name: 'Steering Wheel', w: 1, d: 1, h: 3, mass: 1, kind: 'steering' },
  spoiler: { name: 'Spoiler', w: 4, d: 1, h: 3, mass: 2, kind: 'spoiler' },
  lights: { name: 'Headlights', w: 2, d: 1, h: 2, mass: 1, kind: 'lights' },
};

// Everything except the chassis, in the order the tray shows it.
export const TRAY_ORDER = ['plate24', 'brick12', 'brick22', 'brick24', 'slope22', 'wheelSmall', 'wheelLarge', 'engine', 'seat', 'steering', 'spoiler', 'lights'];

// Every car starts from this 4×8 plate, centred on the origin.
export function makeChassis() {
  return { type: 'chassis', color: 'black', x: -2, y: 0, z: -4, r: 0 };
}

export function isValidBrick(b) {
  return !!b && Object.hasOwn(BRICK_TYPES, b.type) && Object.hasOwn(COLORS, b.color)
    && [b.x, b.y, b.z].every(Number.isInteger) && [0, 1, 2, 3].includes(b.r);
}
