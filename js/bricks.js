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
  silver: { name: 'Silver', hex: 0xb8c0c8, metal: true }, // stainless steel, for the Cybertruck
};
export const COLOR_KEYS = Object.keys(COLORS);

export const BRICK_TYPES = {
  chassis: { name: 'Chassis', w: 4, d: 8, h: 1, mass: 40, kind: 'plate', chassis: true },
  // Trucks and trailers start from their own longer chassis: the truck has a tow hook at the back, the trailer a towbar at the front.
  truckChassis: { name: 'Truck Chassis', w: 4, d: 12, h: 1, mass: 60, kind: 'truckChassis', chassis: true },
  trailerChassis: { name: 'Trailer Chassis', w: 4, d: 16, h: 1, mass: 40, kind: 'trailerChassis', chassis: true },
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
  // Tesla parts: electric, so a battery pack is the engine; electric motors make it faster (carStats.js).
  battery: { name: 'Battery Pack', w: 4, d: 4, h: 1, mass: 24, kind: 'battery', power: 1, fixedColor: true },
  eMotor: { name: 'Electric Motor', w: 2, d: 1, h: 1, mass: 3, kind: 'motor', fixedColor: true },
  smoothNose: { name: 'Smooth Nose', w: 4, d: 2, h: 2, mass: 5, kind: 'smoothNose' },
  aeroWheel: { name: 'Aero Wheel', w: 1, d: 2, h: 3, mass: 7, kind: 'wheel', radius: 0.36, aero: true },
  sideDoor: { name: 'Car Door', w: 1, d: 4, h: 3, mass: 5, kind: 'sideDoor' },
  falconDoor: { name: 'Falcon Door', w: 1, d: 4, h: 3, mass: 5, kind: 'falconDoor' },
  glassRoof: { name: 'Glass Roof', w: 4, d: 4, h: 3, mass: 4, kind: 'glassRoof', fixedColor: true },
  cyberWedge: { name: 'Cyber Wedge', w: 4, d: 2, h: 3, mass: 6, kind: 'cyberWedge' },
  // Prize parts: only the showroom's prize cars have them, so they never show in the tray.
  grille: { name: 'Grille', w: 2, d: 1, h: 3, mass: 2, kind: 'grille', fixedColor: true, prize: true },
  ornament: { name: 'Flying Lady', w: 1, d: 1, h: 2, mass: 1, kind: 'ornament', fixedColor: true, prize: true },
  coachDoor: { name: 'Coach Door', w: 1, d: 2, h: 3, mass: 2, kind: 'coachDoor', prize: true },
  starRoof: { name: 'Starlight Roof', w: 4, d: 4, h: 1, mass: 2, kind: 'starRoof', fixedColor: true, prize: true },
  wheelOffroad: { name: 'Off-road Wheel', w: 1, d: 2, h: 3, mass: 10, kind: 'wheel', radius: 0.5, tread: true, prize: true },
  spareWheel: { name: 'Spare Wheel', w: 2, d: 1, h: 3, mass: 4, kind: 'spare', fixedColor: true, prize: true },
  sidePipe: { name: 'Side Pipe', w: 1, d: 2, h: 1, mass: 1, kind: 'sidePipe', fixedColor: true, prize: true },
  limoPlate: { name: 'Limo Plate', w: 4, d: 2, h: 1, mass: 4, kind: 'plate', prize: true },
  discoPanel: { name: 'Disco Lights', w: 1, d: 4, h: 2, mass: 1, kind: 'disco', fixedColor: true, prize: true },
};
export const isPrizePart = type => !!BRICK_TYPES[type]?.prize;

// The tray's tabs. Every part except the chassis pieces and the prize parts is in exactly one.
export const TRAY_GROUPS = [
  { key: 'bricks', label: '🧱 Bricks', types: ['plate24', 'brick12', 'brick22', 'brick24', 'slope22'] },
  { key: 'wheels', label: '🛞 Wheels', types: ['wheelSmall', 'wheelLarge'] },
  { key: 'supercar', label: '🏎 Supercar', types: ['superNose', 'airScoop', 'racingWing', 'scissorDoor', 'v12', 'superWheel', 'badge', 'namePlate'] },
  { key: 'tesla', label: '⚡ Tesla', types: ['battery', 'eMotor', 'smoothNose', 'aeroWheel', 'sideDoor', 'falconDoor', 'glassRoof', 'cyberWedge'] },
  { key: 'people', label: '🧑 People', types: ['seat', 'passengerSeat', 'dog', 'cat', 'parrot', 'bunny'] },
  { key: 'gadgets', label: '🚀 Gadgets', types: ['engine', 'steering', 'spoiler', 'lights', 'rocket', 'wings', 'propeller', 'siren', 'horn', 'exhaust', 'cannon'] },
  { key: 'extras', label: '🎁 Extras', types: ['flag', 'ladder', 'toolbox', 'crate', 'trophy', 'windshield'] },
];
export const TRAY_ORDER = TRAY_GROUPS.flatMap(g => g.types);
export const groupOf = type => TRAY_GROUPS.find(g => g.types.includes(type))?.key ?? null;

export const isChassis = type => !!BRICK_TYPES[type]?.chassis;

// What a build is comes only from its chassis piece, so saves need nothing extra.
const CHASSIS_OF = { car: { type: 'chassis', z: -4 }, truck: { type: 'truckChassis', z: -6 }, trailer: { type: 'trailerChassis', z: -8 } };
export function buildKind(bricks) {
  const chassis = bricks.find(b => isChassis(b.type))?.type;
  return Object.keys(CHASSIS_OF).find(kind => CHASSIS_OF[kind].type === chassis) ?? 'car';
}

// Every build starts from its chassis plate, 4 studs wide and centred on the origin: 8 long for a car,
// 12 for a truck and 16 for a trailer.
export function makeChassis(kind = 'car') {
  const { type, z } = CHASSIS_OF[kind];
  return { type, color: 'black', x: -2, y: 0, z, r: 0 };
}

export function isValidBrick(b) {
  return !!b && Object.hasOwn(BRICK_TYPES, b.type) && Object.hasOwn(COLORS, b.color)
    && [b.x, b.y, b.z].every(Number.isInteger) && [0, 1, 2, 3].includes(b.r)
    && (b.rider === undefined || typeof b.rider === 'string')
    && (b.badge === undefined || typeof b.badge === 'string');
}
