// Smooth movement for friends' cars: positions arrive ~15 times a second, a little late and a little uneven,
// so each friend is drawn a tenth of a second in the past, sliding between the two positions around then.
import { wrapAngle } from '../math.js';

export const INTERP_DELAY = 0.1; // seconds behind the newest position
export const MAX_EXTRAPOLATE = 0.25; // keep sliding this long when positions stop arriving, then wait
export const TELEPORT = 10; // a jump this big (zap, respawn, flip me) snaps instead of sliding
const KEEP = 12;

export function createTrail() {
  return { snaps: [] };
}

// state: unpacked from the network; t: when it arrived, in seconds.
export function pushSnap(trail, state, t) {
  const last = trail.snaps[trail.snaps.length - 1];
  if (last && t < last.t) return;
  if (last && Math.hypot(state.p.x - last.p.x, state.p.y - last.p.y, state.p.z - last.p.z) > TELEPORT) trail.snaps.length = 0;
  if (last && last.foot !== state.foot) trail.snaps.length = 0; // got in or out: no sliding between car and feet
  trail.snaps.push({ ...state, t });
  if (trail.snaps.length > KEEP) trail.snaps.shift();
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });

// Normalised lerp, taking the short way round: close enough to slerp for snapshots this close together.
export function nlerpQuat(a, b, k) {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const q = { x: lerp(a.x, sign * b.x, k), y: lerp(a.y, sign * b.y, k), z: lerp(a.z, sign * b.z, k), w: lerp(a.w, sign * b.w, k) };
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

// Where to draw this friend at time `now` (seconds), or null before the first position arrives.
export function sampleTrail(trail, now) {
  const snaps = trail.snaps;
  if (!snaps.length) return null;
  const at = now - INTERP_DELAY;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  if (snaps.length === 1 || at <= first.t) return { ...first, stale: now - last.t > 1 };
  if (at >= last.t) {
    const ahead = Math.min(at - last.t, MAX_EXTRAPOLATE);
    const p = { x: last.p.x + last.v.x * ahead, y: last.p.y + last.v.y * ahead, z: last.p.z + last.v.z * ahead };
    return { ...last, p, stale: now - last.t > 1 };
  }
  let i = snaps.length - 2;
  while (i > 0 && snaps[i].t > at) i--;
  const a = snaps[i];
  const b = snaps[i + 1];
  const k = b.t > a.t ? (at - a.t) / (b.t - a.t) : 1;
  return {
    ...b,
    p: lerp3(a.p, b.p, k),
    v: lerp3(a.v, b.v, k),
    q: nlerpQuat(a.q, b.q, k),
    h: a.h + wrapAngle(b.h - a.h) * k,
    stale: false,
  };
}
