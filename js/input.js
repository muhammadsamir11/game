const KEYS = {
  ArrowUp: 'go', KeyW: 'go',
  ArrowDown: 'stop', KeyS: 'stop',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export function attachDriveControls(root, state, signal) {
  const opts = { signal };
  const fingers = new Set();
  const controlAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-control]')?.dataset.control ?? null;

  root.addEventListener('pointerdown', e => {
    const control = e.target.closest('[data-control]')?.dataset.control;
    if (!control) return;
    e.preventDefault();
    fingers.add(e.pointerId);
    state.press(e.pointerId, control);
  }, opts);

  // A finger sliding from ◀ to ▶ switches; sliding off every button lets go.
  window.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    const control = controlAt(e.clientX, e.clientY);
    if (control) state.press(e.pointerId, control);
    else state.release(e.pointerId);
  }, opts);

  const lift = e => {
    fingers.delete(e.pointerId);
    state.release(e.pointerId);
  };
  window.addEventListener('pointerup', lift, opts);
  window.addEventListener('pointercancel', lift, opts);

  window.addEventListener('keydown', e => {
    const control = KEYS[e.code];
    if (!control) return;
    e.preventDefault();
    state.press(`key:${e.code}`, control);
  }, opts);
  window.addEventListener('keyup', e => {
    if (KEYS[e.code]) state.release(`key:${e.code}`);
  }, opts);

  const letGo = () => { fingers.clear(); state.releaseAll(); };
  window.addEventListener('blur', letGo, opts);
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); }, opts);

  const buttons = [...root.querySelectorAll('[data-control]')]; // fixed in the page, so looked up once
  return {
    refresh() {
      for (const button of buttons) {
        const down = state.isDown(button.dataset.control);
        if (button.classList.contains('pressed') !== down) button.classList.toggle('pressed', down);
      }
    },
  };
}
