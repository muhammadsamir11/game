// Supercar brands for badges and name plates. Real names, our own toy badges (never the official logos).
import { HERO_NAME } from './cityMap.js';

export const BRANDS = {
  lamborghini: { name: 'Lamborghini', mark: 'L', bg: '#111111', fg: '#d4af37', shape: 'shield' },
  ferrari: { name: 'Ferrari', mark: 'F', bg: '#ffd600', fg: '#111111', shape: 'shield' },
  bugatti: { name: 'Bugatti', mark: 'B', bg: '#c62828', fg: '#ffffff', shape: 'oval' },
  mclaren: { name: 'McLaren', mark: 'M', bg: '#ff6d00', fg: '#ffffff', shape: 'oval' },
  hero: { name: `${HERO_NAME} Motors`, mark: HERO_NAME[0], bg: '#1e88e5', fg: '#ffeb3b', shape: 'star' },
};

export const DEFAULT_BADGE = 'hero';

export const resolveBadge = key => (Object.hasOwn(BRANDS, key ?? '') ? BRANDS[key] : BRANDS[DEFAULT_BADGE]);
