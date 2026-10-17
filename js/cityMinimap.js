// The city's maps: a mini-map in the corner that follows him and turns with the camera, and a big north-up map of
// the whole city. Both are painted from the same city plan: roads, coloured buildings, parks, the pond, the garage.
import { SIZE, PITCH, GRID, ROAD, BLOCKS, GARAGE, GARAGE_FLOORS, MAP_LANDMARKS, FLOOR_HEIGHT, STUNT_PARK_BLOCK, roadCenter, garageFloorAt } from './cityMap.js';
import { grassy, lotRect, pondRect } from './cityGround.js';
import { STUNT_PARK } from './stuntPark.js';
import { hexCss } from './ui.js';
import { mapAngle, toMapScreen, mapZoom, edgePoint } from './mapView.js';

const C = {
  outside: '#7cc46e', road: '#7d838b', walk: '#e3e7eb', lot: '#9bd88a', plaza: '#d3d8de', concrete: '#c3ccd1',
  water: '#5fb3f0', sand: '#ecd39c', ink: '#1d2a44', ramp: '#90a4ae', hole: 'rgba(29, 42, 68, 0.45)',
};
const STUNT_COLORS = { kicker: '#ff7043', pipe: '#7e57c2', hoop: '#37474f', arch: '#e53935' };
const FONT = 'Fredoka, Arial Rounded MT Bold, sans-serif';
const TOP_FLOOR = GARAGE_FLOORS.length - 1;
const CAR = { w: 2.6, l: 4.4 }; // a car's size on the map, in metres

const isStuntPark = b => b.bx === STUNT_PARK_BLOCK.bx && b.bz === STUNT_PARK_BLOCK.bz;
const grow = (r, by) => ({ x0: r.x0 - by, z0: r.z0 - by, x1: r.x1 + by, z1: r.z1 + by });

// A rounded box path, without ctx.roundRect (older iPads don't have it).
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rectsPath(rects) {
  const path = new Path2D();
  for (const r of rects) path.rect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
  return path;
}

// The city that never changes, as filled shapes in metres (x east, z south). buildings: [{ x0, z0, x1, z1, hex }].
function cityPlan(buildings) {
  const fills = [];
  const add = (fill, rects, outline = null) => fills.push({ fill, path: rectsPath(rects), outline });
  add(C.sand, [{ x0: -46, z0: SIZE + 24, x1: SIZE + 46, z1: SIZE + 146 }]);
  add(C.water, [{ x0: -40, z0: SIZE + 30, x1: SIZE + 40, z1: SIZE + 140 }]);
  add(C.road, [{ x0: 0, z0: 0, x1: SIZE, z1: SIZE }]);
  add(C.walk, BLOCKS.filter(b => b.type !== 'garage').map(b => b.rect));
  add(C.lot, BLOCKS.filter(grassy).map(lotRect));
  add(C.plaza, BLOCKS.filter(b => !grassy(b) && b.type !== 'garage').map(lotRect));
  const ponds = BLOCKS.filter(b => b.type === 'park' && !isStuntPark(b)).map(pondRect);
  add(C.sand, ponds.map(p => grow(p, 1.5)));
  add(C.water, ponds);
  add('#ffe0b2', STUNT_PARK.landings);
  for (const [part, fill] of Object.entries(STUNT_COLORS)) {
    add(fill, STUNT_PARK.boxes.filter(b => b.part === part).map(b => {
      const hz = b.hz * Math.cos(b.rotX ?? 0);
      return { x0: b.cx - b.hx, z0: b.cz - hz, x1: b.cx + b.hx, z1: b.cz + hz };
    }));
  }
  const byColor = new Map();
  for (const b of buildings) byColor.set(b.hex, [...(byColor.get(b.hex) ?? []), b]);
  for (const [hex, rects] of byColor) add(hexCss(hex), rects, 'rgba(29, 42, 68, 0.35)');
  // Dashed white lines down the middle of every road.
  const lanes = new Path2D();
  for (let i = 0; i <= GRID; i++) {
    const c = roadCenter(i);
    for (let k = 0; k < GRID; k++) {
      const a = k * PITCH + ROAD;
      const b = a + PITCH - ROAD;
      lanes.moveTo(c, a);
      lanes.lineTo(c, b);
      lanes.moveTo(a, c);
      lanes.lineTo(b, c);
    }
  }
  return { fills, lanes };
}

export function createCityMinimap({ canvas, buildings }) {
  const plan = cityPlan(buildings);
  const g = canvas.getContext('2d');
  let zoom = mapZoom({ driving: false, indoor: true });

  // Everything in metres; `px` is how many metres one canvas pixel covers, for lines that should stay a set width.
  function paintCity(ctx, px) {
    for (const f of plan.fills) {
      ctx.fillStyle = f.fill;
      ctx.fill(f.path);
      if (f.outline) {
        ctx.strokeStyle = f.outline;
        ctx.lineWidth = 2 * px;
        ctx.stroke(f.path);
      }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = Math.max(0.35, 1.5 * px);
    ctx.setLineDash([3, 3]);
    ctx.stroke(plan.lanes);
    ctx.setLineDash([]);
  }

  // One floor of the garage seen from above: its colour, the ramps (arrows point uphill), the spots and the cars on it.
  function paintGarage(ctx, floor, cars, px) {
    const r = GARAGE.rect;
    const style = GARAGE_FLOORS[floor];
    ctx.fillStyle = C.concrete;
    ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    for (const p of GARAGE.rampPaths) {
      const x0 = r.x0 + p.u0;
      const z0 = r.z0 + Math.min(p.v0, p.v1);
      const w = p.u1 - p.u0;
      const d = Math.abs(p.v1 - p.v0);
      if (Math.round(p.y0 / FLOOR_HEIGHT) === floor) {
        ctx.fillStyle = C.ramp;
        ctx.fillRect(x0, z0, w, d);
        const up = Math.sign(p.v1 - p.v0); // +1: climbs south
        ctx.strokeStyle = GARAGE_FLOORS[floor + 1].css;
        ctx.lineWidth = 1.1;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const t of [0.3, 0.55, 0.8]) {
          const z = r.z0 + p.v0 + (p.v1 - p.v0) * t;
          ctx.beginPath();
          ctx.moveTo(x0 + 1.2, z - up * 1.5);
          ctx.lineTo(x0 + w / 2, z);
          ctx.lineTo(x0 + w - 1.2, z - up * 1.5);
          ctx.stroke();
        }
      } else if (Math.round(p.y1 / FLOOR_HEIGHT) === floor) {
        ctx.fillStyle = C.hole;
        ctx.fillRect(x0, z0, w, d);
      }
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(0.25, 1.5 * px);
    for (const s of GARAGE.spots.filter(s => s.floor === floor)) ctx.strokeRect(s.x - s.w / 2, s.z - s.d / 2, s.w, s.d);
    ctx.strokeStyle = style.css;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(r.x0 + 0.6, r.z0 + 0.6, r.x1 - r.x0 - 1.2, r.z1 - r.z0 - 1.2);
    paintCars(ctx, cars.filter(c => c.floor === floor), px);
  }

  function paintCars(ctx, cars, px) {
    for (const c of cars) {
      ctx.save();
      ctx.translate(c.x, c.z);
      ctx.rotate(-c.heading);
      ctx.fillStyle = hexCss(c.hex);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = Math.max(0.3, 2 * px);
      rounded(ctx, -CAR.w / 2, -CAR.l / 2, CAR.w, CAR.l, 0.7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; // windscreen, at the front
      ctx.fillRect(-CAR.w / 2 + 0.45, CAR.l / 2 - 1.6, CAR.w - 0.9, 0.7);
      ctx.restore();
    }
  }

  function paintCoins(ctx, field, floor) {
    if (!field) return;
    ctx.fillStyle = '#ffc107';
    ctx.strokeStyle = '#b26a00';
    ctx.lineWidth = 0.25;
    field.spots.forEach((s, i) => {
      if (!field.isActive(i) || garageFloorAt(s.x, s.y, s.z) !== floor) return;
      ctx.beginPath();
      ctx.arc(s.x, s.z, s.value > 1 ? 1.1 : 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function arrow(ctx, x, y, angle, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(size, size);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.lineTo(10, -9);
    ctx.lineTo(0, -4);
    ctx.lineTo(-10, -9);
    ctx.closePath();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  }

  function dot(ctx, x, y, radius, fill, ring = '#ffffff') {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = ring;
    ctx.stroke();
  }

  function icon(ctx, text, x, y, size) {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 6;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }

  function label(ctx, text, x, y, size, fill = C.ink) {
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function pill(ctx, text, x, y, fill, size = 26) {
    ctx.font = `bold ${size}px ${FONT}`;
    const w = ctx.measureText(text).width + size;
    const h = size * 1.55;
    ctx.fillStyle = fill;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = size * 0.15;
    rounded(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + size / 2, y + h / 2 + 1);
  }

  // state: { me: {x, y, z}, heading, yaw, driving, cars: [{ x, z, heading, floor, hex }], coins, friends, extras(ctx, toMap, scale), dt }
  function draw(state) {
    const { me, yaw, heading } = state;
    const size = canvas.width;
    const floor = garageFloorAt(me.x, me.y, me.z);
    const indoor = floor !== null;
    const target = mapZoom({ driving: state.driving, indoor });
    zoom += (target - zoom) * (1 - Math.exp(-(state.dt ?? 1) * 3));
    const scale = size * zoom; // pixels per metre
    const view = { cx: size / 2, cy: size / 2, scale };
    const a = mapAngle(yaw);
    const px = 1 / scale;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = C.outside;
    g.fillRect(0, 0, size, size);
    g.save();
    g.translate(view.cx, view.cy);
    g.rotate(a);
    g.scale(scale, scale);
    g.translate(-me.x, -me.z);
    paintCity(g, px);
    paintGarage(g, indoor ? floor : TOP_FLOOR, state.cars, px);
    paintCars(g, state.cars.filter(c => c.floor === null), px);
    paintCoins(g, state.coins, indoor ? floor : null);
    g.restore();

    // Missions and games draw in pixels with a toMap(v) per axis: same turn, unscaled.
    g.save();
    g.translate(view.cx, view.cy);
    g.rotate(a);
    g.translate(-me.x * scale, -me.z * scale);
    state.extras?.(g, v => v * scale, scale);
    g.restore();

    // Upright things: icons, spot numbers, friends, him, north.
    const at = p => toMapScreen(p, me, yaw, view);
    const reach = size / 2 - 22;
    if (indoor) {
      g.globalAlpha = 0.9;
      for (const s of GARAGE.spots.filter(s => s.floor === floor && !state.cars.some(c => c.spot === s.index))) {
        const p = at(s);
        label(g, String(s.index + 1), p.x, p.y, 20, '#607d8b');
      }
      g.globalAlpha = 1;
    } else {
      for (const l of MAP_LANDMARKS) {
        const p = at(l);
        if (l.kind === 'garage') {
          const e = edgePoint(p, view, reach); // home is always on the map, at the rim when far away
          icon(g, l.icon, e.x, e.y, e.pinned ? 30 : 38);
        } else if (Math.abs(p.x - view.cx) < reach + 10 && Math.abs(p.y - view.cy) < reach + 10) {
          icon(g, l.icon, p.x, p.y, 34);
        }
      }
    }
    for (const f of state.friends) {
      const e = edgePoint(at(f.p), view, reach);
      dot(g, e.x, e.y, e.pinned ? 9 : 12, f.color);
    }
    arrow(g, view.cx, view.cy, a - heading, 1.25);
    const north = edgePoint(at({ x: me.x, z: me.z - 1000 }), view, size / 2 - 18);
    dot(g, north.x, north.y, 15, '#e53935');
    label(g, 'N', north.x, north.y + 1, 19, '#ffffff');
    if (indoor) pill(g, `🅿️ Floor ${GARAGE_FLOORS[floor].label}`, 12, size - 54, GARAGE_FLOORS[floor].css);
    icon(g, '🔍', size - 26, size - 26, 26); // tap me for the big map
  }

  // The whole city, north up, with names: for the big map he opens by tapping the mini-map.
  function drawBig(big, state) {
    const ctx = big.getContext('2d');
    const size = big.width;
    const margin = 14;
    const scale = size / (SIZE + margin * 2);
    const px = 1 / scale;
    const toMap = v => (v + margin) * scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.outside;
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(margin, margin);
    paintCity(ctx, px);
    paintGarage(ctx, TOP_FLOOR, state.cars, px);
    paintCars(ctx, state.cars.filter(c => c.floor === null), px);
    paintCoins(ctx, state.coins, null);
    ctx.restore();
    state.extras?.(ctx, toMap, scale);
    for (const l of MAP_LANDMARKS) {
      icon(ctx, l.icon, toMap(l.x), toMap(l.z) - 18, 84);
      label(ctx, l.name, toMap(l.x), toMap(l.z) + 46, 44);
    }
    const parked = state.cars.filter(c => c.floor !== null).length;
    if (parked) {
      const g0 = GARAGE.rect;
      label(ctx, `🚗 × ${parked}`, toMap((g0.x0 + g0.x1) / 2), toMap(g0.z1) + 30, 40);
    }
    for (const f of state.friends) {
      dot(ctx, toMap(f.p.x), toMap(f.p.z), 20, f.color);
      label(ctx, f.name, toMap(f.p.x), toMap(f.p.z) - 40, 34);
    }
    const mx = toMap(state.me.x);
    const mz = toMap(state.me.z);
    dot(ctx, mx, mz, 46, 'rgba(229, 57, 53, 0.18)', 'rgba(229, 57, 53, 0.9)');
    arrow(ctx, mx, mz, -state.heading, 2);
    const floor = garageFloorAt(state.me.x, state.me.y, state.me.z);
    if (floor !== null) pill(ctx, `🅿️ You are on floor ${GARAGE_FLOORS[floor].label}`, 24, size - 90, GARAGE_FLOORS[floor].css, 44);
  }

  return { draw, drawBig };
}
