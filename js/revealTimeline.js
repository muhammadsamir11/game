// When things happen in the showroom's reveal, in seconds from the drumroll: the sheet lifts (the car goes
// on the turntable only then, so nothing pokes through the silk), the confetti, the swap under the white
// flash (the prize is parked and the next mystery rolls in), and the end.
export const REVEAL = { drum: 1.5, whoosh: 2.5, shine: 6.5, fade: 7.1 };

const MOMENTS = [
  ['uncover', REVEAL.drum],
  ['celebrate', REVEAL.whoosh],
  ['swap', (REVEAL.shine + REVEAL.fade) / 2],
  ['end', REVEAL.fade],
];

// The moments passed between t0 (exclusive) and t1 (inclusive), in order.
export const revealEvents = (t0, t1) => MOMENTS.filter(([, at]) => at > t0 && at <= t1).map(([name]) => name);
