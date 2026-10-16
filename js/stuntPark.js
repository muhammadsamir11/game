// Murad's Stunt Park: kickers, landing pads, two quarter-pipes and the ring of fire, as static boxes.
import { blockRect, SIDEWALK, STUNT_PARK_BLOCK } from './cityMap.js';

// A box whose top face runs from (z0, y0) to (z1, y1) across x0..x1 (world coordinates, tilted about x).
export function slopeBox({ x0, x1, z0, y0, z1, y1 }, thickness) {
  const run = Math.abs(z1 - z0);
  const angle = Math.atan2(y1 - y0, run);
  const rising = Math.sign(z1 - z0); // +1: the path heads toward +z
  const ny = Math.cos(angle);
  const nz = -rising * Math.sin(angle);
  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2 - (ny * thickness) / 2,
    cz: (z0 + z1) / 2 - (nz * thickness) / 2,
    hx: (x1 - x0) / 2,
    hy: thickness / 2,
    hz: Math.hypot(run, y1 - y0) / 2,
    rotX: -rising * angle,
  };
}

const rect = blockRect(STUNT_PARK_BLOCK.bx, STUNT_PARK_BLOCK.bz); // x 60..96, z 60..96
const inner = { x0: rect.x0 + SIDEWALK + 1, z0: rect.z0 + SIDEWALK + 1, x1: rect.x1 - SIDEWALK - 1, z1: rect.z1 - SIDEWALK - 1 };
const X = rect.x0;
const Z = rect.z0;

// He drives in from the north road heading south (+z), with 10 m of run-up inside the park.
// Each kicker starts with a gentle lead-in, so a low car's nose doesn't catch where the slope meets the ground.
function kicker(name, x0, x1, z0, zBend, yBend, z1, y1) {
  const parts = [{ x0, x1, z0, y0: 0, z1: zBend, y1: yBend }, { x0, x1, z0: zBend, y0: yBend, z1, y1 }];
  return { name, path: { x0, x1, z0, y0: 0, z1, y1 }, parts };
}
const kickers = [
  kicker('big', X + 4, X + 11, Z + 8, Z + 10.5, 0.25, Z + 16, 1.6),
  kicker('small', X + 13, X + 18, Z + 12, Z + 14, 0.15, Z + 18, 0.8),
];
// Flat painted pads where cars come down (no landing slopes: a car that lands short would hit their back wall).
const landings = [
  { x0: X + 4, x1: X + 11, z0: Z + 22, z1: Z + 32 },
  { x0: X + 13, x1: X + 18, z0: Z + 21, z1: Z + 30 },
];

// A quarter-pipe from three slabs, each steeper than the last (about 20°, 40°, 60°), climbing toward `dir`.
function quarterPipe(zStart, dir) {
  const steps = [[1.5, 0.55], [1.3, 1.09], [1.0, 1.73]]; // [run, rise]
  let z = zStart;
  let y = 0;
  return steps.map(([run, rise]) => {
    const path = { x0: X + 21, x1: X + 31, z0: z, y0: y, z1: z + dir * run, y1: y + rise };
    z += dir * run;
    y += rise;
    return path;
  });
}
const quarterPipes = [...quarterPipe(Z + 9, -1), ...quarterPipe(Z + 27, 1)]; // north end climbs toward -z, south toward +z
const pipeTop = 0.55 + 1.09 + 1.73;

const hoop = { x: X + 7.5, y: 3.5, z: Z + 21, radius: 2.8 }; // wide enough for a spinning car to clear the posts
const arch = { x: X + 7.5, z: Z + 2.6, width: 9 };

const part = (name, box) => ({ ...box, part: name });
const solid = (cx, cy, cz, hx, hy, hz) => ({ cx, cy, cz, hx, hy, hz, rotX: 0 });

const boxes = [
  ...kickers.flatMap(k => k.parts.map(p => part('kicker', slopeBox(p, 2)))),
  ...quarterPipes.map(p => part('pipe', slopeBox(p, 0.5))),
  // solid blocks behind each pipe's top, so nothing can drive in underneath
  part('pipe', solid(X + 26, pipeTop / 2, Z + 4.6, 5, pipeTop / 2, 0.6)),
  part('pipe', solid(X + 26, pipeTop / 2, Z + 31.4, 5, pipeTop / 2, 0.6)),
  // the ring's two posts
  ...[-1, 1].map(s => part('hoop', solid(hoop.x + s * (hoop.radius + 0.3), (hoop.y + hoop.radius) / 2, hoop.z, 0.2, (hoop.y + hoop.radius) / 2, 0.2))),
  // the entrance arch's two posts
  ...[-1, 1].map(s => part('arch', solid(arch.x + s * (arch.width / 2), 3, arch.z, 0.3, 3, 0.2))),
];

export const STUNT_PARK = { rect, inner, kickers, landings, quarterPipes, hoop, arch, boxes };
