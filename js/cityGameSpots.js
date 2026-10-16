// Where the play-together city games put things. Plain data, so the server and every tablet agree on it.
import { INTERSECTIONS } from './cityMap.js';
import { COIN_SPOTS } from './coins.js';

// Treasure chests sit in the middle of road junctions: every one of them can be driven to.
export const TREASURE_SPOTS = INTERSECTIONS.map(({ x, z }) => ({ x, y: 0, z }));

// Rush coins use the city's own coin places, except the mid-air ones that need a jump.
export const RUSH_SPOTS = COIN_SPOTS.filter(c => !c.air).map(({ x, y, z }) => ({ x, y, z }));
