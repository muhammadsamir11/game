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
  lime: { name: 'Lime', hex: 0x9ccc65 },
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
  engine: { name: 'Engine', w: 2, d: 2, h: 3, mass: 15, kind: 'engine', power: 1 },
  seat: { name: 'Seat + Driver', w: 2, d: 2, h: 3, mass: 6, kind: 'seat' },
  steering: { name: 'Steering Wheel', w: 1, d: 1, h: 3, mass: 1, kind: 'steering' },
  spoiler: { name: 'Spoiler', w: 4, d: 1, h: 3, mass: 2, kind: 'spoiler' },
  lights: { name: 'Headlights', w: 2, d: 1, h: 2, mass: 1, kind: 'lights' },
  passengerSeat: { name: 'Passenger Seat', w: 2, d: 2, h: 3, mass: 6, kind: 'passenger' },
  dog: { name: 'Dog', w: 1, d: 2, h: 2, mass: 2, kind: 'dog', fixedColor: true },
  cat: { name: 'Cat', w: 1, d: 1, h: 2, mass: 1, kind: 'cat', fixedColor: true },
  parrot: { name: 'Parrot', w: 1, d: 1, h: 3, mass: 1, kind: 'parrot', fixedColor: true },
  bunny: { name: 'Bunny', w: 1, d: 1, h: 2, mass: 1, kind: 'bunny', fixedColor: true },
  rocket: { name: 'Rocket Booster', w: 2, d: 2, h: 2, mass: 6, kind: 'rocket', action: 'boost' },
  wings: { name: 'Wings', w: 6, d: 2, h: 1, mass: 4, kind: 'wings' },
  propeller: { name: 'Propeller', w: 1, d: 1, h: 2, mass: 1, kind: 'propeller' },
  siren: { name: 'Siren Light', w: 2, d: 1, h: 1, mass: 1, kind: 'siren', fixedColor: true, action: 'siren' },
  horn: { name: 'Horn', w: 1, d: 1, h: 1, mass: 1, kind: 'horn', fixedColor: true, action: 'horn' },
  exhaust: { name: 'Exhaust Pipes', w: 1, d: 1, h: 3, mass: 1, kind: 'exhaust', fixedColor: true },
  flag: { name: 'Flag', w: 1, d: 1, h: 5, mass: 1, kind: 'flag' },
  ladder: { name: 'Ladder', w: 1, d: 6, h: 1, mass: 3, kind: 'ladder', fixedColor: true },
  toolbox: { name: 'Tool Box', w: 2, d: 1, h: 2, mass: 2, kind: 'toolbox' },
  crate: { name: 'Cargo Crate', w: 2, d: 2, h: 3, mass: 4, kind: 'crate', fixedColor: true },
  trophy: { name: 'Trophy', w: 1, d: 1, h: 3, mass: 1, kind: 'trophy', fixedColor: true },
  cannon: { name: 'Confetti Cannon', w: 1, d: 2, h: 2, mass: 3, kind: 'cannon', action: 'confetti' },
  windshield: { name: 'Windshield', w: 4, d: 1, h: 2, mass: 1, kind: 'windshield', fixedColor: true },
  // Supercar parts
  superNose: { name: 'Supercar Nose', w: 4, d: 2, h: 2, mass: 5, kind: 'wedge' },
  airScoop: { name: 'Air Scoop', w: 1, d: 2, h: 2, mass: 1, kind: 'scoop' },
  racingWing: { name: 'Racing Wing', w: 4, d: 1, h: 4, mass: 2, kind: 'spoiler', tall: true },
  scissorDoor: { name: 'Scissor Door', w: 1, d: 2, h: 3, mass: 2, kind: 'door' },
  v12: { name: 'V12 Engine', w: 2, d: 2, h: 2, mass: 18, kind: 'engine', power: 2 },
  superWheel: { name: 'Super Wheel', w: 1, d: 2, h: 3, mass: 7, kind: 'wheel', radius: 0.38, rim: true },
  badge: { name: 'Badge', w: 2, d: 1, h: 1, mass: 1, kind: 'badge', fixedColor: true },
  namePlate: { name: 'Name Plate', w: 4, d: 1, h: 1, mass: 1, kind: 'nameplate', fixedColor: true },
};

// The tray's tabs. Every part except the chassis is in exactly one.
export const TRAY_GROUPS = [
  { key: 'bricks', label: '🧱 Bricks', types: ['plate24', 'brick12', 'brick22', 'brick24', 'slope22'] },
  { key: 'wheels', label: '🛞 Wheels', types: ['wheelSmall', 'wheelLarge'] },
  { key: 'supercar', label: '🏎 Supercar', types: ['superNose', 'airScoop', 'racingWing', 'scissorDoor', 'v12', 'superWheel', 'badge', 'namePlate'] },
  { key: 'people', label: '🧑 People', types: ['seat', 'passengerSeat', 'dog', 'cat', 'parrot', 'bunny'] },
  { key: 'gadgets', label: '🚀 Gadgets', types: ['engine', 'steering', 'spoiler', 'lights', 'rocket', 'wings', 'propeller', 'siren', 'horn', 'exhaust', 'cannon'] },
  { key: 'extras', label: '🎁 Extras', types: ['flag', 'ladder', 'toolbox', 'crate', 'trophy', 'windshield'] },
];
export const TRAY_ORDER = TRAY_GROUPS.flatMap(g => g.types);
export const groupOf = type => TRAY_GROUPS.find(g => g.types.includes(type))?.key ?? null;

// Every car starts from this 4×8 plate, centred on the origin.
export function makeChassis() {
  return { type: 'chassis', color: 'black', x: -2, y: 0, z: -4, r: 0 };
}

export function isValidBrick(b) {
  return !!b && Object.hasOwn(BRICK_TYPES, b.type) && Object.hasOwn(COLORS, b.color)
    && [b.x, b.y, b.z].every(Number.isInteger) && [0, 1, 2, 3].includes(b.r)
    && (b.rider === undefined || typeof b.rider === 'string')
    && (b.badge === undefined || typeof b.badge === 'string');
}
