// The Truck Yard, dressed up: dark asphalt with every bay painted on one big picture (blue numbers for
// trucks, orange for trailers, a yellow lane for the car truck), toy fences and posts, and its sign.
// The physics boxes are exactly the fences in cityMap.js; everything else here is only for looks.
import * as THREE from 'three';
import { TRUCK_YARD } from './cityMap.js';
import { TOP } from './cityGround.js';

const FONT = 'Fredoka, Arial Rounded MT Bold, sans-serif';
const PX = 34; // canvas pixels per metre of yard

export function buildTruckYard({ kit, scene, own, staticBox, canvasTexture, sign }) {
  const { lot } = TRUCK_YARD;
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  kit.span(kit.plastic(0x455a64, { look: 'road', roughness: 0.55 }), lot.x0, TOP.lot, lot.z0, lot.x1, TOP.lot + 0.006, lot.z1);

  // --- the paint: one picture over the whole lot ---
  const u = x => (x - lot.x0) * PX;
  const v = z => (z - lot.z0) * PX;
  const paint = canvasTexture(Math.round(w * PX), Math.round(d * PX), g => {
    g.lineWidth = 0.18 * PX;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${2.6 * PX}px ${FONT}`;
    const bay = (b, colour, label, turn) => {
      g.strokeStyle = '#ffffff';
      g.strokeRect(u(b.x - b.w / 2) + 4, v(b.z - b.d / 2) + 4, b.w * PX - 8, b.d * PX - 8);
      g.save();
      g.translate(u(b.x), v(b.z));
      g.rotate(turn);
      g.fillStyle = colour;
      g.fillText(label, 0, 0);
      g.restore();
    };
    // Numbers read the right way up for someone driving into the bay.
    for (const b of TRUCK_YARD.truckBays) bay(b, '#42a5f5', String(b.index + 1), Math.PI);
    for (const b of TRUCK_YARD.trailerBays) bay(b, '#ffa726', String(b.index + 1), Math.PI / 2);
    // The car truck's long lane, with arrows pointing up its ramp at the west end.
    const lane = { z0: TRUCK_YARD.carTruck.z - 2.6, z1: TRUCK_YARD.carTruck.z + 2.6 };
    g.strokeStyle = '#fdd835';
    g.setLineDash([1.2 * PX, 0.6 * PX]);
    g.strokeRect(4, v(lane.z0), w * PX - 8, (lane.z1 - lane.z0) * PX);
    g.setLineDash([]);
    g.fillStyle = '#fdd835';
    for (const x of [lot.x0 + 1.2, lot.x0 + 3.4]) {
      g.beginPath();
      g.moveTo(u(x + 1.2), v(TRUCK_YARD.carTruck.z));
      g.lineTo(u(x), v(TRUCK_YARD.carTruck.z - 1));
      g.lineTo(u(x), v(TRUCK_YARD.carTruck.z + 1));
      g.fill();
    }
  });
  const decal = new THREE.Mesh(own(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({ map: paint, transparent: true })));
  decal.position.set((lot.x0 + lot.x1) / 2, TOP.lot + 0.012, (lot.z0 + lot.z1) / 2);
  scene.add(decal);

  // --- fences: yellow rails on grey posts, with the physics wall inside them ---
  const post = kit.plastic(0x546e7a);
  const rail = kit.plastic(0xfdd835);
  for (const f of TRUCK_YARD.fences) {
    staticBox(f);
    const alongX = f.hx > f.hz;
    const a0 = alongX ? f.cx - f.hx : f.cz - f.hz;
    const a1 = alongX ? f.cx + f.hx : f.cz + f.hz;
    for (const y of [0.55, 1.05]) {
      if (alongX) kit.span(rail, a0, y - 0.07, f.cz - 0.06, a1, y + 0.07, f.cz + 0.06);
      else kit.span(rail, f.cx - 0.06, y - 0.07, a0, f.cx + 0.06, y + 0.07, a1);
    }
    const posts = Math.round((a1 - a0) / 3);
    for (let k = 0; k <= posts; k++) {
      const a = a0 + ((a1 - a0) * k) / posts;
      if (alongX) kit.box(post, a, 0.65, f.cz, 0.22, 1.3, 0.22);
      else kit.box(post, f.cx, 0.65, a, 0.22, 1.3, 0.22);
    }
  }

  // --- the sign, on two posts facing the garage across the road ---
  const { x, z } = TRUCK_YARD.sign;
  for (const dz of [-3.2, 3.2]) kit.box(post, x - 0.4, 2.2, z + dz, 0.25, 4.4, 0.25);
  const board = sign('🚚 TRUCK YARD', '#fb8c00', { w: 7, h: 1.8 });
  board.position.set(x - 0.55, 3.6, z);
  board.rotation.y = -Math.PI / 2; // faces west, toward the garage
  scene.add(board);
}
