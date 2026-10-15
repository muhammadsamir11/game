// Tracks which control each finger (or key) is holding, so fingers can come and go independently.
export function createControlState() {
  const pressed = new Map();
  return {
    press(pointerId, control) { pressed.set(pointerId, control); },
    release(pointerId) { pressed.delete(pointerId); },
    releaseAll() { pressed.clear(); },
    isDown(control) {
      for (const held of pressed.values()) if (held === control) return true;
      return false;
    },
  };
}

export function toDriveInput(state) {
  return {
    steer: (state.isDown('left') ? 1 : 0) - (state.isDown('right') ? 1 : 0),
    throttle: state.isDown('go') ? 1 : 0,
    brake: state.isDown('stop') ? 1 : 0,
  };
}
