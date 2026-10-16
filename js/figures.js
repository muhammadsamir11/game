import { COLORS, COLOR_KEYS } from './bricks.js';

// Everything the child can choose for a figure. Keys are what gets saved.
export const HEADS = {
  none: { name: 'No Hat', kind: 'bare' },
  spiky: { name: 'Spiky Hair', kind: 'hair' },
  long: { name: 'Long Hair', kind: 'hair' },
  ponytail: { name: 'Ponytail', kind: 'hair' },
  cap: { name: 'Cap', kind: 'hat' },
  racing: { name: 'Racing Helmet', kind: 'hat' },
  cowboy: { name: 'Cowboy Hat', kind: 'hat' },
  crown: { name: 'Crown', kind: 'fixed', hex: 0xffc107 },
  astronaut: { name: 'Space Helmet', kind: 'fixed', hex: 0xf5f5f5 },
  policeCap: { name: 'Police Cap', kind: 'fixed', hex: 0x1a237e },
  fireHelmet: { name: 'Fire Helmet', kind: 'fixed', hex: 0xd32f2f },
  pirateHat: { name: 'Pirate Hat', kind: 'fixed', hex: 0x212121 },
  chefHat: { name: 'Chef Hat', kind: 'fixed', hex: 0xfafafa },
};

export const HAIR_COLORS = {
  black: { name: 'Black', hex: 0x2b2b2b },
  brown: { name: 'Brown', hex: 0x6d4c41 },
  blonde: { name: 'Blonde', hex: 0xf2c94c },
  ginger: { name: 'Ginger', hex: 0xd9692b },
  blue: { name: 'Blue', hex: 0x42a5f5 },
};

export const FACES = {
  happy: { name: 'Happy' },
  grin: { name: 'Big Grin' },
  sunglasses: { name: 'Cool Shades' },
  silly: { name: 'Silly' },
  determined: { name: 'Determined' },
  surprised: { name: 'Surprised' },
  eyepatch: { name: 'Eye Patch' },
};

export const SKINS = {
  classic: { name: 'Toy Yellow', hex: 0xffd23f },
  light: { name: 'Light', hex: 0xf6d2b8 },
  tan: { name: 'Tan', hex: 0xd9a77a },
  brown: { name: 'Brown', hex: 0x8d5a3b },
  dark: { name: 'Dark', hex: 0x5a3825 },
};

export const PRINTS = {
  plain: { name: 'Plain' },
  stripe: { name: 'Racing Stripe' },
  star: { name: 'Star' },
  flame: { name: 'Flame' },
  badge: { name: 'Police Badge' },
  lightning: { name: 'Lightning' },
};

export const MAX_NAME = 24;
export const DEFAULT_FIGURE = Object.freeze({
  name: 'Me', head: 'spiky', headColor: 'brown', face: 'happy', skin: 'classic', shirt: 'red', print: 'stripe', pants: 'blue',
});

export function headColorOptions(head) {
  const kind = HEADS[head]?.kind;
  if (kind === 'hair') return Object.keys(HAIR_COLORS);
  if (kind === 'hat') return COLOR_KEYS;
  return [];
}

export function cleanName(name, fallback = 'Me') {
  // Only text counts: anything else (from another tablet, or an old save) gets the fallback.
  return (typeof name === 'string' ? name : '').trim().slice(0, MAX_NAME) || fallback;
}

const pickKey = (table, value, fallback) => (typeof value === 'string' && Object.hasOwn(table, value) ? value : fallback);

// Turns anything (old saves, junk, partial objects) into a complete, valid figure.
export function normaliseFigure(raw, fallbackName = 'Me') {
  const f = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const head = pickKey(HEADS, f.head, DEFAULT_FIGURE.head);
  const colors = headColorOptions(head);
  let headColor = null;
  if (colors.length) headColor = colors.includes(f.headColor) ? f.headColor : colors.includes(DEFAULT_FIGURE.headColor) ? DEFAULT_FIGURE.headColor : colors[0];
  const figure = {
    name: cleanName(f.name, fallbackName),
    head,
    headColor,
    face: pickKey(FACES, f.face, DEFAULT_FIGURE.face),
    skin: pickKey(SKINS, f.skin, DEFAULT_FIGURE.skin),
    shirt: pickKey(COLORS, f.shirt, DEFAULT_FIGURE.shirt),
    print: pickKey(PRINTS, f.print, DEFAULT_FIGURE.print),
    pants: pickKey(COLORS, f.pants, DEFAULT_FIGURE.pants),
  };
  if (typeof f.id === 'string') figure.id = f.id;
  return figure;
}

function random(seed) {
  // Scramble the seed first: this generator's first number is tiny for small seeds, which would always pick the first option.
  let h = Math.floor(seed) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  let s = (h % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function randomFigure(seed, name = 'Friend') {
  const r = random(seed);
  const pick = keys => keys[Math.floor(r() * keys.length)];
  const head = pick(Object.keys(HEADS));
  const colors = headColorOptions(head);
  return normaliseFigure({
    name,
    head,
    headColor: colors.length ? pick(colors) : null,
    face: pick(Object.keys(FACES)),
    skin: pick(Object.keys(SKINS)),
    shirt: pick(COLOR_KEYS),
    print: pick(Object.keys(PRINTS)),
    pants: pick(COLOR_KEYS),
  }, name);
}

export function headHex(figure) {
  const head = HEADS[figure.head];
  if (head.kind === 'fixed') return head.hex;
  if (head.kind === 'hair') return HAIR_COLORS[figure.headColor].hex;
  if (head.kind === 'hat') return COLORS[figure.headColor].hex;
  return null;
}

// Identifies how a figure looks (not its name), for picture caches.
export function figureKey(f) {
  return [f.head, f.headColor, f.face, f.skin, f.shirt, f.print, f.pants].join(':');
}
