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
};

export const EMBLEMS = ['bull', 'horse', 'eb', 'speedmark', 'star'];

export const DEFAULT_BADGE = 'hero';

export const resolveBadge = key => (Object.hasOwn(BRANDS, key ?? '') ? BRANDS[key] : BRANDS[DEFAULT_BADGE]);
