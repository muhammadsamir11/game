import { seededRandom, snapStud, FLOWER_COLORS } from './legoKit.js';
import { STUD } from './bricks.js';

// The stage for the figure maker and the home showroom, built from the same toy bricks as the city and the race track.

// A big round yellow brick with a ring of studs, on a white round plate. Built into `group` (so it can turn); returns the height of its top.
export function buildPodium(kit, group, { radius = 0.7 } = {}) {
  const white = kit.plastic(0xf5f5f5);
  const yellow = kit.plastic(0xfdd835);
  const plate = 0.12;
  const brick = 0.3;
  const top = plate + brick;
  kit.cylinder(white, 0, plate / 2, 0, radius + 0.18, radius + 0.18, plate, 48);
  kit.cylinder(yellow, 0, plate + brick / 2, 0, radius, radius, brick, 48);
  const ring = radius - 0.22;
  const count = Math.max(6, Math.floor((Math.PI * 2 * ring) / STUD));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    kit.stud(yellow, Math.sin(a) * ring, top, Math.cos(a) * ring);
  }
  kit.build(group);
  return top;
}

// A green studded baseplate out to the horizon, real studs close by (outside `clear`, inside `near`), and trees, bushes and flowers.
// trees: [{ x, z, s, kind }], bushes: [{ x, z, s }], flowers: how many studs near the podium carry a round flower plate.
export function dressBaseplate(kit, scene, { clear = 1, near = 4, trees = [], bushes = [], flowers = 0, seed = 5 } = {}) {
  const grass = kit.plastic(0x4caf50, { look: 'studs' });
  kit.span(grass, -80, -0.1, -80, 80, 0, 80);
  const rand = seededRandom(seed);
  const blooms = [];
  for (let x = snapStud(-near); x < near; x += STUD) {
    for (let z = snapStud(-near); z < near; z += STUD) {
      const d = Math.hypot(x, z);
      if (d < clear || d > near) continue;
      if (blooms.length < flowers && d < clear + 2.5 && rand() < 0.12) blooms.push({ x, y: 0, z, c: FLOWER_COLORS[blooms.length % FLOWER_COLORS.length] });
      else kit.stud(grass, x, 0, z);
    }
  }
  const onGround = list => list.map(t => ({ y: 0, ...t }));
  kit.plant(scene, { trees: onGround(trees), bushes: onGround(bushes), flowers: blooms });
  kit.build(scene);
}
