// Screen offset from the stick's centre → { x, y } inside the unit circle (y up).
export function stickVector(dx, dy, radius) {
  let x = dx / radius;
  let y = -dy / radius;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x: x || 0, y: y || 0 };
}

// A thumb stick on screen: drag the knob; it springs back when the finger lifts (or the app is switched away).
export function attachStick(element, signal) {
  const knob = element.querySelector('.knob');
  const value = { x: 0, y: 0 };
  let pointer = null;
  let cx = 0;
  let cy = 0;
  const reset = () => {
    pointer = null;
    value.x = 0;
    value.y = 0;
    knob.style.transform = '';
  };
  const follow = e => {
    const radius = element.clientWidth / 2;
    const v = stickVector(e.clientX - cx, e.clientY - cy, radius);
    value.x = v.x;
    value.y = v.y;
    knob.style.transform = `translate(${v.x * radius * 0.6}px, ${-v.y * radius * 0.6}px)`;
  };
  element.addEventListener('pointerdown', e => {
    e.preventDefault();
    pointer = e.pointerId;
    const r = element.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    follow(e);
  }, { signal });
  window.addEventListener('pointermove', e => { if (e.pointerId === pointer) follow(e); }, { signal });
  const end = e => { if (e.pointerId === pointer) reset(); };
  window.addEventListener('pointerup', end, { signal });
  window.addEventListener('pointercancel', end, { signal });
  window.addEventListener('blur', reset, { signal });
  document.addEventListener('visibilitychange', reset, { signal });
  return { value, reset };
}
