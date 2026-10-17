// Supercar brands for badges, name plates and build cards: real names and colours. badgeArt.js draws
// each emblem with the real logo (brandLogos.js) or, until it loads, a look-alike. A private family game.
import { HERO_NAME } from './cityMap.js';

// emblem: which picture badgeArt.js draws. colors: the emblem's own paint.
// card: the build chooser's trading card (frame, its shadow, the name plate under the car and its ink).
export const BRANDS = {
  lamborghini: {
    name: 'Lamborghini', emblem: 'bull',
    colors: { main: '#0b0b0b', accent: '#d4af37' },
    card: { frame: '#d4af37', frameLo: '#8a6d1a', plate: '#0b0b0b', ink: '#d4af37', tint: '#f3e3b0' },
  },
  ferrari: {
    name: 'Ferrari', emblem: 'horse',
    colors: { main: '#ffd600', accent: '#111111', red: '#d40000', green: '#009246' },
    card: { frame: '#d40000', frameLo: '#8c0000', plate: '#d40000', ink: '#ffd600', tint: '#fff2a8' },
  },
  bugatti: {
    name: 'Bugatti', emblem: 'eb',
    colors: { main: '#c8102e', accent: '#ffffff' },
    card: { frame: '#1d3f8c', frameLo: '#0f2350', plate: '#0b1630', ink: '#e8ecf2', tint: '#d6e0f5' },
  },
  mclaren: {
    name: 'McLaren', emblem: 'speedmark',
    colors: { main: '#2b2d31', accent: '#ff8000' },
    card: { frame: '#ff8000', frameLo: '#b35600', plate: '#2b2d31', ink: '#ffffff', tint: '#ffe0bf' },
  },
  hero: {
    name: `${HERO_NAME} Motors`, emblem: 'star', mark: HERO_NAME[0],
    colors: { main: '#1e88e5', accent: '#ffeb3b' },
    card: { frame: '#1e88e5', frameLo: '#0d5fa8', plate: '#1e88e5', ink: '#ffeb3b', tint: '#d6ecff' },
  },
  // Prize brands: only the showroom's prize cars wear them, so the badge picker leaves them out.
  rollsRoyce: {
    name: 'Rolls-Royce', emblem: 'rr', prize: true,
    colors: { main: '#1b1b1b', accent: '#e0e0e0' },
    card: { frame: '#c9ccd1', frameLo: '#7d8288', plate: '#1b1b1b', ink: '#e0e0e0', tint: '#eceff1' },
  },
  mercedes: {
    name: 'Mercedes-Benz', emblem: 'tristar', prize: true,
    colors: { main: '#c0c6cc', accent: '#1b1b1b' },
    card: { frame: '#c0c6cc', frameLo: '#6f777e', plate: '#1b1b1b', ink: '#e8ecef', tint: '#eef1f3' },
  },
};

export const EMBLEMS = ['bull', 'horse', 'eb', 'speedmark', 'star', 'rr', 'tristar'];

// The "Which badge?" choices: his own first, then every brand that isn't a showroom prize.
export const pickerBrandKeys = () => ['hero', ...Object.keys(BRANDS).filter(k => k !== 'hero' && !BRANDS[k].prize)];

export const DEFAULT_BADGE = 'hero';

export const resolveBadge = key => (Object.hasOwn(BRANDS, key ?? '') ? BRANDS[key] : BRANDS[DEFAULT_BADGE]);
