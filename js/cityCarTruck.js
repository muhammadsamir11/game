// The car truck's trailer in the city: two decks for 8 of his cars, a ramp at the back with a glowing lift pad,
// and a board on top that counts the cars on board. Loading is a short lift ride to the next free spot
// (carTruck.js says which), then the straps click shut; unloading takes the last car off again.
import * as THREE from 'three';
import { CAR_TRUCK, planLoad, carSize } from './carTruck.js';
import { createCarMesh, carLift } from './brickMesh.js';
import { disposeMerged, mergeMeshes } from './meshMerge.js';
import { withSize } from './towing.js';
import { HERO_NAME } from './cityMap.js';

const { deckLength, deckWidth, bottomDeckY, topDeckY, ramp, ringAhead, ringY } = CAR_TRUCK;
const BOTTOM = 0.2; // thickness of the bottom deck
const TOP = 0.15; // and of the top deck
const RAMP_FOOT = 0.15; // the ramp's foot stays just off the road when driving
const LIFT_TIME = 0.6; // s: up to the deck's height, behind the trailer
const ROLL_TIME = 1.1; // s: then along the deck to its spot

const box = (cx, cy, cz, hx, hy, hz, rotX = 0) => ({ cx, cy, cz, hx, hy, hz, rotX });
const rampAngle = Math.atan2(bottomDeckY - RAMP_FOOT, ramp);

// The trailer's physics boxes, in its own frame (carTruck.js): decks, posts, the front wall and the ramp.
function carTrailerBoxes() {
  const half = deckLength / 2;
  const posts = [0.3, 6, 12, deckLength - 0.3].flatMap(z => [-1, 1].map(side => box(side * (deckWidth / 2 - 0.1), (bottomDeckY + topDeckY) / 2, z, 0.1, (topDeckY - bottomDeckY) / 2, 0.1)));
  const t = 0.15;
  return [
    box(0, bottomDeckY - BOTTOM / 2, half, deckWidth / 2, BOTTOM / 2, half),
    box(0, topDeckY - TOP / 2, half, deckWidth / 2, TOP / 2, half),
    ...posts,
    box(0, (bottomDeckY + topDeckY + 0.5) / 2, deckLength + 0.15, deckWidth / 2, (topDeckY + 0.5 - bottomDeckY) / 2, 0.15), // front wall
    box(0, (bottomDeckY + RAMP_FOOT) / 2 - (Math.cos(rampAngle) * t) / 2, -ramp / 2 + (Math.sin(rampAngle) * t) / 2, deckWidth / 2 - 0.2, t / 2, Math.hypot(ramp, bottomDeckY - RAMP_FOOT) / 2, -rampAngle),
  ];
}

// Toy-brick plastic and strap shapes, shared by every car truck and never disposed (like brickMesh.js's).
const materials = new Map();
const plastic = hex => {
  if (!materials.has(hex)) materials.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.35 }));
  return materials.get(hex);
};
const strapGeometries = new Map();
const strapGeometry = width => {
  const key = width.toFixed(2);
  if (!strapGeometries.has(key)) strapGeometries.set(key, new THREE.BoxGeometry(width, 0.06, 0.16));
  return strapGeometries.get(key);
};

// spec (towing.js): physics plus body, the trailer drawn in its own frame. board: the counter's canvas.
export function carTrailerSpec() {
  const body = new THREE.Group();
  const blue = plastic(0x1e88e5);
  const grey = plastic(0x546e7a);
  const yellow = plastic(0xfdd835);
  const dark = plastic(0x263238);
  const boxes = carTrailerBoxes();
  boxes.forEach((b, i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.hx * 2, b.hy * 2, b.hz * 2), i < 2 ? grey : i === boxes.length - 1 ? yellow : blue);
    mesh.position.set(b.cx, b.cy, b.cz);
    mesh.rotation.x = b.rotX;
    mesh.castShadow = mesh.receiveShadow = true;
    body.add(mesh);
  });
  // Yellow edges along both decks, two beams underneath, and the towbar out to its ring.
  for (const y of [bottomDeckY, topDeckY]) for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, deckLength), yellow);
    edge.position.set(side * (deckWidth / 2 - 0.06), y + 0.06, deckLength / 2);
    body.add(edge);
  }
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, deckLength), dark);
    beam.position.set(side * 0.9, bottomDeckY - BOTTOM - 0.15, deckLength / 2);
    body.add(beam);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, Math.hypot(0.8, ringAhead)), dark);
    bar.position.set(side * 0.4, ringY, deckLength + ringAhead / 2);
    bar.rotation.y = Math.atan2(-side * 0.8, ringAhead);
    body.add(bar);
  }
  mergeMeshes(body, () => false);
  const wheels = [-1.45, 1.45].flatMap(x => [1.9, 3.1].map(z => ({ type: 'wheelSmall', color: 'black', radius: 0.35, x, y: 0.35, z })));
  const spec = withSize({
    body,
    boxes,
    wheels,
    mass: CAR_TRUCK.mass,
    com: { x: 0, y: 0.7, z: deckLength / 2 }, // kept low, so a full car truck never rolls over in a turn
    ring: { x: 0, y: ringY, z: deckLength + ringAhead },
    rideHeight: 0,
  });

  // The counter board on top of the front wall, readable from behind (loading) and from the cab's camera.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  board.position.set(0, topDeckY + 1.2, deckLength + 0.32);
  board.rotation.y = Math.PI; // faces back down the trailer
  board.userData.board = true;
  body.add(board);

  // The lift pad on the road behind the ramp: glows when there's room for another car.
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(deckWidth + 1.2, 4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.45, depthWrite: false }));
  pad.position.set(0, 0.04, -ramp - 2);
  pad.userData.pad = true;
  body.add(pad);

  return { ...spec, board: { canvas, texture, mesh: board }, pad, lift: makeLift(body, yellow) };
}

// A yellow platform that carries each car up behind the trailer.
function makeLift(body, material) {
  const lift = new THREE.Mesh(new THREE.BoxGeometry(deckWidth - 0.3, 0.12, 4.6), material);
  lift.visible = false;
  body.add(lift);
  return lift;
}

function drawBoard({ canvas, texture }, n) {
  const g = canvas.getContext('2d');
  g.fillStyle = '#263238';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = '#fdd835';
  g.lineWidth = 10;
  g.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  g.fillStyle = '#ffffff';
  g.font = 'bold 96px Fredoka, Arial Rounded MT Bold, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`🚗 ${n} / ${CAR_TRUCK.capacity}`, canvas.width / 2, canvas.height / 2 + 6);
  texture.needsUpdate = true;
}

const ease = t => t * t * (3 - 2 * t);

// trailer: the createTrailer made from carTrailerSpec. loaded: [{ entry, deck, z0, z1, mesh }], loading order.
export function createCarTruckLoad({ trailer, sfx, toast }) {
  const { spec } = trailer;
  const loaded = [];
  let ride = null; // { mesh, from, to, t, done } while the lift moves a car
  drawBoard(spec.board, 0);

  // Where a car's picture sits on its spot, in the trailer's frame. box: the picture's own bounds.
  function spotFor(bricks, box, slot) {
    const centre = box.getCenter(new THREE.Vector3());
    return { x: -centre.x, y: (slot.deck === 0 ? bottomDeckY : topDeckY) + carLift(bricks), z: deckLength - (slot.z0 + slot.z1) / 2 - centre.z };
  }

  // Two yellow straps across the car, near each end (box: the car picture's own bounds).
  function strap(mesh, box, size) {
    for (const z of [box.min.z + 0.6, box.max.z - 0.6]) {
      const band = new THREE.Mesh(strapGeometry(size.width + 0.1), plastic(0xfdd835));
      band.position.set((box.min.x + box.max.x) / 2, 0.45, z);
      mesh.add(band);
    }
  }

  return {
    loaded,
    get busy() {
      return !!ride;
    },
    get full() {
      return loaded.length >= CAR_TRUCK.capacity;
    },
    // entry: one of his own cars, just stopped at the ramp; from: where its picture is now, in the trailer's frame
    // ({ x, y, z, turn }). Returns 'loaded', 'busy', 'full' or 'tooBig'.
    tryLoad(entry, from) {
      if (ride) return 'busy';
      const size = carSize(entry.car.bricks);
      const slot = planLoad(loaded, size);
      if (!slot.ok) return slot.reason;
      const mesh = createCarMesh(entry.car.bricks, { emptySeat: true, merge: true });
      const box = new THREE.Box3().setFromObject(mesh); // measured while it still stands on its own
      const to = spotFor(entry.car.bricks, box, slot);
      mesh.position.set(from.x, from.y, from.z);
      mesh.rotation.y = from.turn;
      spec.body.add(mesh);
      loaded.push({ entry, deck: slot.deck, z0: slot.z0, z1: slot.z1, mesh });
      // Up behind the trailer to the deck's height, then along the deck to its spot.
      const behind = { x: 0, y: to.y, z: -size.length / 2 - 0.3 };
      ride = { mesh, box, size, lift: carLift(entry.car.bricks), from: { ...from }, behind, to, t: 0 };
      spec.lift.visible = true;
      sfx.whoosh();
      return 'loaded';
    },
    // The last car on comes off first: its picture goes, and its entry comes back to be driven.
    takeLast() {
      if (ride || !loaded.length) return null;
      const last = loaded.pop();
      spec.body.remove(last.mesh);
      disposeMerged(last.mesh);
      drawBoard(spec.board, loaded.length);
      return last.entry;
    },
    // When the city closes: the counter's picture and the pad and lift shapes are this car truck's own.
    dispose() {
      const { board, pad, lift } = spec;
      board.texture.dispose();
      board.mesh.material.dispose();
      board.mesh.geometry.dispose();
      pad.material.dispose();
      pad.geometry.dispose();
      lift.geometry.dispose();
    },
    padGlow(on, clock) {
      spec.pad.visible = on;
      if (on) spec.pad.material.opacity = 0.3 + 0.2 * Math.sin(clock * 5);
    },
    update(dt) {
      if (!ride) return;
      ride.t += dt;
      const { mesh, from, behind, to } = ride;
      if (ride.t < LIFT_TIME) {
        const k = ease(ride.t / LIFT_TIME);
        mesh.position.set(from.x + (behind.x - from.x) * k, from.y + (behind.y - from.y) * k, from.z + (behind.z - from.z) * k);
        mesh.rotation.y = from.turn * (1 - k);
      } else {
        const k = ease(Math.min(1, (ride.t - LIFT_TIME) / ROLL_TIME));
        mesh.position.set(to.x * k, to.y, behind.z + (to.z - behind.z) * k);
        mesh.rotation.y = 0;
      }
      spec.lift.position.set(mesh.position.x, mesh.position.y - ride.lift - 0.06, Math.min(mesh.position.z, -2.3));
      if (ride.t >= LIFT_TIME + ROLL_TIME) {
        strap(mesh, ride.box, ride.size);
        spec.lift.visible = false;
        ride = null;
        drawBoard(spec.board, loaded.length);
        sfx.snap();
        toast(`🚗 ${loaded.length} / ${CAR_TRUCK.capacity}`);
      }
    },
  };
}

// Small letters on the car truck cab's doors (never mentioned anywhere). body: the cab drawn in its brick space.
// Returns a function that frees them.
export function paintCabDoors(body) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.font = 'bold 64px Fredoka, Arial Rounded MT Bold, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`${HERO_NAME.toUpperCase()} TRANSPORT`, 256, 66, 500);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const geometry = new THREE.PlaneGeometry(0.95, 0.24);
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(geometry, material);
    sign.position.set(side * 1.012, 1.0, 0); // on the cab's back wall, either side
    sign.rotation.y = (side * Math.PI) / 2;
    body.add(sign);
  }
  return () => {
    texture.dispose();
    material.dispose();
    geometry.dispose();
  };
}
