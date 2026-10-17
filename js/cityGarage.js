// The parking garage, dressed up: each floor in its own colour, windows between brick pillars, lit ceilings,
// colour-coded ramps with arrows, big floor numbers inside, a barrier at the entrance and a P sign on the roof.
// The physics boxes are exactly the ones in cityMap.js; everything else here is only for looks.
import * as THREE from 'three';
import { GARAGE, GARAGE_FLOORS, FLOOR_HEIGHT } from './cityMap.js';

const H = FLOOR_HEIGHT;
const SLAB = 0.3;
const SILL = 1.1; // solid wall up to here on each floor; windows above
const FONT = 'Fredoka, Arial Rounded MT Bold, sans-serif';

export function buildGarage({ kit, scene, own, staticBox, canvasTexture }) {
  const { x0: X, z0: Z } = GARAGE.rect;
  const concrete = kit.plastic(0xb0bec5);
  const bricks = kit.plastic(0x78909c, { look: 'bricks' });
  const white = kit.plastic(0xf5f5f5);
  const yellow = kit.plastic(0xfdd835);
  // The undersides glow a little, so a ceiling looks like a ceiling and not like the sky.
  const ceiling = kit.plastic(0x8f9aa3, { emissive: 0xe8edf2, emissiveIntensity: 0.75 });
  const lamp = kit.glow(0xfff8e1);
  const glass = kit.plastic(0xc4e6ff, { transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2, depthWrite: false });
  glass.userData.noShadow = true; // sunlight comes in through the windows
  const floorBricks = GARAGE_FLOORS.map(f => kit.plastic(f.hex, { look: 'bricks' }));
  const floorPlastic = GARAGE_FLOORS.map(f => kit.plastic(f.hex));
  const floorOf = y => Math.max(0, Math.min(GARAGE_FLOORS.length - 1, Math.round(y / H)));

  // --- the same physics as ever ---
  for (const slab of GARAGE.floors) staticBox(slab, concrete);
  for (const ramp of GARAGE.ramps) staticBox(ramp, kit.plastic(0x90a4ae));
  for (const support of GARAGE.supports) staticBox(support); // hidden inside the coloured wedges below
  for (const wall of GARAGE.walls) staticBox(wall); // drawn below

  // --- ceilings and lights under each upper floor ---
  for (const slab of GARAGE.floors) kit.box(ceiling, slab.cx, slab.cy - slab.hy - 0.012, slab.cz, slab.hx * 2, 0.02, slab.hz * 2);
  const lampRows = [[11, 31.5], [11, 25]]; // u of each row of lights, under floor 1 and floor 2 (clear of the ramp holes)
  lampRows.forEach((us, k) => {
    const y = (k + 1) * H - SLAB - 0.05;
    for (const u of us) for (let v = 4.5; v < 33; v += 6) kit.box(lamp, X + u, y, Z + v, 0.45, 0.06, 3);
  });

  // --- outer walls: a coloured brick sill on each floor, grey pillars with windows between, white coping on top ---
  function facade(w) {
    const alongX = w.hx > w.hz;
    const a0 = alongX ? w.cx - w.hx : w.cz - w.hz;
    const a1 = alongX ? w.cx + w.hx : w.cz + w.hz;
    const t = 2 * Math.min(w.hx, w.hz);
    const top = w.cy + w.hy;
    const piece = (m, s0, s1, y0, y1, thick = t) => (alongX
      ? kit.span(m, s0, y0, w.cz - thick / 2, s1, y1, w.cz + thick / 2)
      : kit.span(m, w.cx - thick / 2, y0, s0, w.cx + thick / 2, y1, s1));
    const windows = a1 - a0 > 6;
    for (let f = 0; f < GARAGE_FLOORS.length; f++) {
      const y0 = f * H;
      const y1 = f === GARAGE_FLOORS.length - 1 ? top - 0.25 : (f + 1) * H - SLAB - 0.1;
      piece(floorBricks[f], a0, a1, y0, y0 + SILL);
      if (!windows) {
        piece(bricks, a0, a1, y0 + SILL, y1);
      } else {
        const bays = Math.round((a1 - a0) / 6);
        const step = (a1 - a0) / bays;
        for (let k = 0; k <= bays; k++) {
          const s = a0 + k * step;
          piece(bricks, Math.max(a0, s - 0.35), Math.min(a1, s + 0.35), y0 + SILL, y1);
        }
        piece(glass, a0 + 0.35, a1 - 0.35, y0 + SILL, y1, 0.08);
        piece(white, a0, a1, y0 + SILL - 0.08, y0 + SILL + 0.06, t + 0.16); // window ledge
      }
      // the band where the next floor's slab meets the wall
      if (f < GARAGE_FLOORS.length - 1) piece(bricks, a0, a1, y1, (f + 1) * H);
    }
    piece(white, a0 - 0.1, a1 + 0.1, top - 0.25, top + 0.05, t + 0.24);
  }

  for (const wall of GARAGE.walls) {
    if (wall.part === 'outer') facade(wall);
    else if (wall.part === 'low') {
      // the open side of an upper floor: a wall in that floor's colour with a white rail on top
      const f = floorOf(wall.cy - wall.hy);
      kit.box(floorPlastic[f], wall.cx, wall.cy, wall.cz, wall.hx * 2, wall.hy * 2, wall.hz * 2);
      kit.box(white, wall.cx, wall.cy + wall.hy + 0.05, wall.cz, wall.hx * 2 + 0.16, 0.1, wall.hz * 2);
    } else {
      kit.box(yellow, wall.cx, wall.cy, wall.cz, wall.hx * 2, wall.hy * 2, wall.hz * 2);
    }
  }
  // White corner columns, like a toy building's.
  const corners = [[X - 0.2, Z - 0.2], [X + 36.2, Z - 0.2], [X - 0.2, Z + 36.2], [X + 36.2, Z + 36.2]];
  for (const [x, z] of corners) kit.box(white, x, (3 * H) / 2, z, 0.8, 3 * H, 0.8);

  // --- ramps: the space under each one is a solid wedge in the colour of the floor it climbs to ---
  for (const p of GARAGE.rampPaths) wedge(floorBricks[floorOf(p.y1)], p);
  GARAGE.ramps.forEach((box, i) => rampArrows(box, GARAGE.rampPaths[i]));

  function wedge(material, { u0, u1, v0, y0, v1, y1 }) {
    const top = y1 - SLAB - 0.03;
    const P = [[X + u0, y0, Z + v0], [X + u0, y0, Z + v1], [X + u0, top, Z + v1], [X + u1, y0, Z + v0], [X + u1, y0, Z + v1], [X + u1, top, Z + v1]];
    const middle = [X + (u0 + u1) / 2, (y0 + top) / 3, Z + (v0 + 2 * v1) / 3];
    const faces = [[0, 1, 2], [3, 4, 5], [1, 4, 5], [1, 5, 2], [0, 3, 4], [0, 4, 1], [0, 2, 5], [0, 5, 3]];
    const positions = [];
    for (let [a, b, c] of faces) {
      // wind each triangle to face outward
      const e1 = P[b].map((n, i) => n - P[a][i]);
      const e2 = P[c].map((n, i) => n - P[a][i]);
      const normal = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const out = [0, 1, 2].map(i => (P[a][i] + P[b][i] + P[c][i]) / 3 - middle[i]);
      if (normal[0] * out[0] + normal[1] * out[1] + normal[2] * out[2] < 0) [b, c] = [c, b];
      positions.push(...P[a], ...P[b], ...P[c]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
    geometry.computeVertexNormals();
    kit.add(material, geometry, 0, 0, 0);
  }

  // Yellow edges and big chevrons painted on the ramp, pointing uphill in the next floor's colour.
  function rampArrows(box, path) {
    const next = GARAGE_FLOORS[floorOf(path.y1)].css;
    const texture = canvasTexture(128, 352, g => {
      g.fillStyle = '#fdd835';
      g.fillRect(0, 0, 10, 352);
      g.fillRect(118, 0, 10, 352);
      g.strokeStyle = next;
      g.lineWidth = 16;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const y of [70, 160, 250]) {
        g.beginPath();
        g.moveTo(30, y + 34);
        g.lineTo(64, y);
        g.lineTo(98, y + 34);
        g.stroke();
      }
    });
    const climbsSouth = path.v1 > path.v0;
    if (climbsSouth) {
      texture.center.set(0.5, 0.5);
      texture.rotation = Math.PI; // the picture's "up" points north unless turned
    }
    const decal = new THREE.Mesh(
      own(new THREE.PlaneGeometry(box.hx * 2 - 0.1, box.hz * 2 - 0.2)),
      own(new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 })),
    );
    const ny = Math.cos(box.rotX);
    const nz = Math.sin(box.rotX);
    decal.position.set(box.cx, box.cy + ny * (box.hy + 0.012), box.cz + nz * (box.hy + 0.012));
    decal.rotation.x = -Math.PI / 2 + box.rotX;
    decal.receiveShadow = true;
    scene.add(decal);
  }

  // --- big floor numbers on the inside walls ---
  const numberMaterials = GARAGE_FLOORS.map(f => own(new THREE.MeshStandardMaterial({
    roughness: 0.5,
    alphaTest: 0.5, // round, with nothing drawn round it (not even into the depth buffer, so the glass behind still shows)
    map: canvasTexture(256, 256, g => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(128, 128, 126, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = f.css;
      g.beginPath();
      g.arc(128, 128, 114, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold 34px ${FONT}`;
      g.fillText('FLOOR', 128, 62);
      g.font = `bold 150px ${FONT}`;
      g.fillText(f.label, 128, 150);
    }),
  })));
  const numberGeometry = own(new THREE.PlaneGeometry(1.8, 1.8));
  const placeNumber = (f, x, z, rotY) => {
    const mesh = new THREE.Mesh(numberGeometry, numberMaterials[f]);
    mesh.position.set(x, f * H + 2.55, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
  };
  for (let f = 0; f < GARAGE_FLOORS.length; f++) {
    for (const u of [11, 32]) placeNumber(f, X + u, Z + 0.03, 0); // north wall, facing in
    for (const u of [11, 25]) placeNumber(f, X + u, Z + 35.97, Math.PI); // south wall
    placeNumber(f, X + 0.03, Z + 15.5, Math.PI / 2); // west wall, between the cars
  }

  // --- the entrance: yellow and black stripes over it, and a barrier that's up ---
  const stripes = own(new THREE.MeshStandardMaterial({
    roughness: 0.5,
    map: canvasTexture(512, 32, g => {
      g.fillStyle = '#fdd835';
      g.fillRect(0, 0, 512, 32);
      g.fillStyle = '#212121';
      for (let x = -32; x < 512; x += 32) {
        g.beginPath();
        g.moveTo(x, 32);
        g.lineTo(x + 16, 32);
        g.lineTo(x + 32, 0);
        g.lineTo(x + 16, 0);
        g.fill();
      }
    }),
  }));
  const header = new THREE.Mesh(own(new THREE.PlaneGeometry(28, SLAB)), stripes);
  header.position.set(X + 36.02, H - SLAB / 2, Z + 18);
  header.rotation.y = Math.PI / 2;
  scene.add(header);
  const post = { cx: X + 35.4, cy: 0.55, cz: Z + 33, hx: 0.2, hy: 0.55, hz: 0.2 };
  staticBox(post, yellow);
  const arm = new THREE.Group(); // red and white, swung up out of the way
  for (let k = 0; k < 5; k++) {
    const piece = new THREE.Mesh(own(new THREE.BoxGeometry(0.16, 0.16, 0.9)), k % 2 ? kit.plastic(0xffffff) : kit.plastic(0xe53935));
    piece.position.z = -0.45 - k * 0.9;
    arm.add(piece);
  }
  arm.position.set(post.cx, 1.05, post.cz);
  arm.rotation.x = 1.15; // tipped up toward the sky
  scene.add(arm);

  // --- a tall P sign on the roof, so the garage is easy to spot from anywhere in town ---
  staticBox({ cx: X + 33.5, cy: 2 * H + 3.5, cz: Z + 33.5, hx: 0.18, hy: 3.5, hz: 0.18 }, kit.plastic(0x546e7a));
  const pBoard = own(new THREE.MeshStandardMaterial({
    roughness: 0.4,
    emissive: 0x1e88e5,
    emissiveIntensity: 0.25,
    map: canvasTexture(256, 256, g => {
      g.fillStyle = '#1e88e5';
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 14;
      g.strokeRect(14, 14, 228, 228);
      g.fillStyle = '#ffffff';
      g.font = `bold 200px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('P', 128, 140);
    }),
  }));
  const board = new THREE.Mesh(own(new THREE.BoxGeometry(3.2, 3.2, 0.3)), pBoard);
  board.position.set(X + 33.5, 2 * H + 8.4, Z + 33.5);
  board.rotation.y = Math.PI / 4; // faces the city's middle
  scene.add(board);
}
