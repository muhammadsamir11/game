export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

// Wrap any angle into [-π, π) so "how far do I need to turn" is always the short way round.
export function wrapAngle(a) {
  const twoPi = Math.PI * 2;
  return ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}
