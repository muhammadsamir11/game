// The city mini-map's maths, kept DOM-free so it can be tested.
// The mini-map turns with the camera: whatever is ahead of him on screen is up on the map.
import { COLORS } from './bricks.js';

// The canvas rotation for a camera looking along yaw (forward is (sin yaw, cos yaw) in x/z).
export const mapAngle = yaw => yaw - Math.PI;

// A world point → canvas pixels, with `me` at the centre. view: { cx, cy, scale } (scale: pixels per metre).
export function toMapScreen(p, me, yaw, { cx, cy, scale }) {
  const a = mapAngle(yaw);
  const dx = p.x - me.x;
  const dz = p.z - me.z;
  return { x: cx + (dx * Math.cos(a) - dz * Math.sin(a)) * scale, y: cy + (dx * Math.sin(a) + dz * Math.cos(a)) * scale };
}

// Metres shown across the mini-map: close in the garage, wider in a fast car.
export function mapZoom({ driving, indoor }) {
  const across = indoor ? 48 : driving ? 120 : 80;
  return 1 / across;
}

// Keeps a canvas point inside a square of half-size `reach` round the centre, so far-off things wait at the rim.
export function edgePoint(p, { cx, cy }, reach) {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const far = Math.max(Math.abs(dx), Math.abs(dy));
  if (far <= reach) return { x: p.x, y: p.y, pinned: false };
  return { x: cx + (dx * reach) / far, y: cy + (dy * reach) / far, pinned: true };
}

// A car's main colour: the colour most of its bricks are, leaving out black (wheels and chassis) when it can.
export function carPaint(bricks) {
  const counts = new Map();
  for (const b of bricks) if (COLORS[b.color]) counts.set(b.color, (counts.get(b.color) ?? 0) + 1);
  const best = [...counts].filter(([c]) => c !== 'black').sort((a, b) => b[1] - a[1])[0];
  return COLORS[best?.[0] ?? 'black'].hex;
}
