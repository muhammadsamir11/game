// Racers start just behind checkpoint 0 (the start line), so the first one to reach is 1.
export function newRaceState() {
  return { lapsDone: 0, nextCp: 1, finishTime: null };
}

// Only the next checkpoint in order counts, so cutting across or driving backwards earns nothing.
export function advanceCheckpoint(state, pos, checkpoints, radius, totalLaps, time) {
  if (state.finishTime !== null) return state;
  const cp = checkpoints[state.nextCp];
  const dx = pos.x - cp.x;
  const dz = pos.z - cp.z;
  if (dx * dx + dz * dz > radius * radius) return state;
  const lapsDone = state.nextCp === 0 ? state.lapsDone + 1 : state.lapsDone;
  return {
    lapsDone,
    nextCp: (state.nextCp + 1) % checkpoints.length,
    finishTime: lapsDone >= totalLaps ? time : null,
  };
}

export function progressValue(state, count) {
  return state.lapsDone * count + ((state.nextCp - 1 + count) % count);
}

export function rankRacers(entries, checkpoints) {
  const n = checkpoints.length;
  const distanceToNext = e => {
    const cp = checkpoints[e.state.nextCp];
    return Math.hypot(e.pos.x - cp.x, e.pos.z - cp.z);
  };
  return [...entries].sort((a, b) => {
    const fa = a.state.finishTime;
    const fb = b.state.finishTime;
    if (fa !== null && fb !== null) return fa - fb;
    if (fa !== null) return -1;
    if (fb !== null) return 1;
    return progressValue(b.state, n) - progressValue(a.state, n) || distanceToNext(a) - distanceToNext(b);
  });
}

export function ordinal(n) {
  return n + (['th', 'st', 'nd', 'rd'][n] ?? 'th');
}
