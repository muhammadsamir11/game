export const TILT_LIMIT = { down: -0.5, up: 0.9 }; // radians the view may tilt from its normal angle

// A drag of (dx, dy) pixels on a width × height screen → the new { yaw, pitch }.
// Dragging right looks right; dragging down raises the camera to look down. A full screen width is half a turn.
export function dragLook({ yaw, pitch }, dx, dy, width, height) {
  return {
    yaw: yaw - (dx / width) * Math.PI,
    pitch: Math.min(TILT_LIMIT.up, Math.max(TILT_LIMIT.down, pitch + (dy / height) * 1.2)),
  };
}

// One finger (or the mouse) dragging on the 3D view turns the camera. Fingers on the stick or buttons
// never land on the canvas, so they keep working at the same time.
export function attachCameraDrag(canvas, signal) {
  const look = { yaw: 0, pitch: 0 }; // yaw piles up until the camera takes it with takeYaw()
  let pointer = null;
  let lastX = 0;
  let lastY = 0;
  let lastMove = -Infinity;
  const letGo = () => { pointer = null; };
  canvas.addEventListener('pointerdown', e => {
    if (pointer !== null) return;
    pointer = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    lastMove = performance.now();
  }, { signal });
  window.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    Object.assign(look, dragLook(look, e.clientX - lastX, e.clientY - lastY, window.innerWidth, window.innerHeight));
    lastX = e.clientX;
    lastY = e.clientY;
    lastMove = performance.now();
  }, { signal });
  const end = e => { if (e.pointerId === pointer) letGo(); };
  window.addEventListener('pointerup', end, { signal });
  window.addEventListener('pointercancel', end, { signal });
  window.addEventListener('blur', letGo, { signal });
  document.addEventListener('visibilitychange', letGo, { signal });
  return {
    look,
    get dragging() { return pointer !== null; },
    // Seconds since the finger last moved the view (0 while it is still down).
    get idle() { return pointer !== null ? 0 : (performance.now() - lastMove) / 1000; },
    takeYaw() {
      const turn = look.yaw;
      look.yaw = 0;
      return turn;
    },
    reset() {
      letGo();
      look.yaw = 0;
      look.pitch = 0;
      lastMove = -Infinity;
    },
  };
}
