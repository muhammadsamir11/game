// Computer cars in a play-together race ride a rail round the track at a steady speed, so every tablet
// works out exactly the same race from the same clock, with nothing sent over the network.

// points: the track's centre line (a closed loop of {x, y, z}).
export function createRail(points) {
  const n = points.length;
  const starts = new Float64Array(n + 1); // distance along the loop where each segment begins
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    starts[i + 1] = starts[i] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  const length = starts[n];

  // Where along the loop is closest to (x, z): used to put each car's rail under its grid spot.
  function distanceAt(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (points[i].x - x) ** 2 + (points[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return starts[best];
  }

  // The point s metres along the loop, the way the road faces there, and how steep it is.
  // lane: metres to the right of the centre line.
  function at(s, lane = 0) {
    const d = ((s % length) + length) % length;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    const a = points[lo];
    const b = points[(lo + 1) % n];
    const segment = starts[lo + 1] - starts[lo] || 1;
    const k = (d - starts[lo]) / segment;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const flat = Math.hypot(dx, dz) || 1;
    // The road's right-hand side is (-forward.z, forward.x), the same as track.js's cross(forward, up).
    const rx = -dz / flat;
    const rz = dx / flat;
    return {
      x: a.x + dx * k + rx * lane,
      y: a.y + (b.y - a.y) * k,
      z: a.z + dz * k + rz * lane,
      heading: Math.atan2(dx, dz),
      pitch: -Math.atan2(b.y - a.y, flat),
    };
  }

  return { length, at, distanceAt };
}

// When a rail car finishes `laps` laps, starting `startGap` metres behind the line at a steady speed.
export const railFinishTime = (rail, laps, startGap, speed) => (rail.length * laps + startGap) / speed;
