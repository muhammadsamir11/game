export const LIGHT_PERIOD = 8;
export const STOP_DISTANCE = 7;
export const LANE_HALF_WIDTH = 2.5;
export const DODGE_RADIUS = 4;
export const TRAFFIC_SPEED = 7;
export const PEDESTRIAN_SPEED = 1.4;

// All lights switch together: traffic along x, then traffic along z.
export const greenAxis = time => (Math.floor(time / LIGHT_PERIOD) % 2 === 0 ? 'x' : 'z');
export const isGreen = (axis, time) => greenAxis(time) === axis;

export function obstacleAhead(pos, dir, obstacles) {
  return obstacles.some(o => {
    const rx = o.x - pos.x;
    const rz = o.z - pos.z;
    const ahead = rx * dir.x + rz * dir.z;
    const lateral = Math.abs(rx * dir.z - rz * dir.x);
    return ahead > 0.5 && ahead <= STOP_DISTANCE && lateral < LANE_HALF_WIDTH;
  });
}

// Stop at a red light before entering the junction (corner 4–10 m away), or for anything just ahead.
export function shouldStop(pose, time, obstacles) {
  if (!isGreen(pose.axis, time) && pose.distToCorner > 4 && pose.distToCorner <= 10) return true;
  return obstacleAhead(pose, pose.dir, obstacles);
}

export function createLoopMover(corners, startFraction = 0) {
  const segments = corners.map((a, i) => {
    const b = corners[(i + 1) % corners.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    return { a, len, dir: { x: (b.x - a.x) / len, z: (b.z - a.z) / len } };
  });
  const length = segments.reduce((total, seg) => total + seg.len, 0);
  let s = ((((startFraction % 1) + 1) % 1) * length) % length;
  return {
    length,
    get s() { return s; },
    advance(ds) { s = (s + ds) % length; },
    pose() {
      let d = s;
      for (const seg of segments) {
        if (d < seg.len) {
          return {
            x: seg.a.x + seg.dir.x * d,
            z: seg.a.z + seg.dir.z * d,
            dir: seg.dir,
            axis: Math.abs(seg.dir.x) > Math.abs(seg.dir.z) ? 'x' : 'z',
            distToCorner: seg.len - d,
            heading: Math.atan2(seg.dir.x, seg.dir.z),
          };
        }
        d -= seg.len;
      }
      const first = segments[0];
      return { x: first.a.x, z: first.a.z, dir: first.dir, axis: Math.abs(first.dir.x) > Math.abs(first.dir.z) ? 'x' : 'z', distToCorner: first.len, heading: Math.atan2(first.dir.x, first.dir.z) };
    },
  };
}

export function dodgeVector(person, player) {
  const dx = person.x - player.x;
  const dz = person.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= DODGE_RADIUS) return null;
  if (dist < 1e-6) return { x: 1, z: 0 };
  return { x: dx / dist, z: dz / dist };
}
