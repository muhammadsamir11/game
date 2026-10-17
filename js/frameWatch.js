// Steps down the graphics if the iPad struggles: each time frames average over 20 ms for 3 s,
// the next easing step runs (fewer real studs, then softer shadows, then fewer pixels...).
export function createFrameWatch(steps) {
  let slowFor = 0;
  let next = 0;
  return dt => {
    slowFor = dt > 0.02 ? slowFor + dt : Math.max(0, slowFor - dt * 0.5);
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

// The sharpest the game draws (an iPad's screen is 2): 1.5 looks nearly as crisp at a little over half the pixels.
export const MAX_PIXEL_RATIO = 1.5;
let resizer = () => {};
export function setResizer(fn) { resizer = fn; }

// Draws a quarter step fewer pixels, down to 1 screen pixel per pixel. It stays lowered for the rest of the visit.
export function lowerResolution(renderer) {
  const ratio = Math.max(1, renderer.getPixelRatio() - 0.25);
  if (ratio === renderer.getPixelRatio()) return;
  renderer.setPixelRatio(ratio);
  resizer();
}
