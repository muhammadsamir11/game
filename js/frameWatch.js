// Steps down the graphics if the iPad struggles: each time frames average over 25 ms for 3 s,
// the next easing step runs (fewer real studs, then softer shadows...).
export function createFrameWatch(steps) {
  let slowFor = 0;
  let next = 0;
  return dt => {
    slowFor = dt > 0.025 ? slowFor + dt : Math.max(0, slowFor - dt * 0.5);
    if (slowFor < 3 || next >= steps.length) return;
    slowFor = 0;
    steps[next++]();
  };
}

// Halves a sun's shadow map (frees the old one so it is rebuilt at the new size).
export function softerShadows(sun) {
  sun.shadow.mapSize.multiplyScalar(0.5);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
}
