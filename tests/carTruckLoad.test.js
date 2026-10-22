import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCarTruckLoad } from '../js/cityCarTruck.js';
import { MODELS, modelToBricks } from '../js/instructions.js';

// A car trailer with no pictures to draw (node has no canvas): just its body, standing far from the world's middle.
function stubTrailer() {
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const body = new THREE.Group();
  body.position.set(90, 0, 40);
  body.rotation.y = Math.PI / 2;
  const spec = { body, board: { canvas: { width: 512, height: 160, getContext: () => g }, texture: new THREE.Texture() }, pad: { visible: false, material: {} }, lift: new THREE.Mesh() };
  return { spec };
}
const quiet = { sfx: { whoosh() {}, snap() {} }, toast() {} };

test('the straps are drawn on the car they hold', () => {
  const trailer = stubTrailer();
  const load = createCarTruckLoad({ trailer, ...quiet });
  assert.equal(load.tryLoad({ car: { bricks: modelToBricks(MODELS.raceCar) } }, { x: 0, y: 0.4, z: -6, turn: 0 }), 'loaded');
  for (let i = 0; i < 150; i++) load.update(1 / 60);
  const car = load.loaded[0].mesh;
  const straps = car.children.filter(c => c.geometry?.parameters?.depth === 0.16);
  assert.equal(straps.length, 2);
  trailer.spec.body.updateMatrixWorld(true);
  const at = car.getWorldPosition(new THREE.Vector3());
  for (const s of straps) assert.ok(s.getWorldPosition(new THREE.Vector3()).distanceTo(at) < 3, 'a strap is away from its car');
});

test('leaving the city frees the car truck\'s own pictures and shapes', async () => {
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => g }) };
  const { carTrailerSpec, paintCabDoors } = await import('../js/cityCarTruck.js');
  const spec = carTrailerSpec();
  const load = createCarTruckLoad({ trailer: { spec }, ...quiet });
  const cab = new THREE.Group();
  const unpaint = paintCabDoors(cab);
  const freed = [];
  const watch = (thing, name) => thing.addEventListener('dispose', () => freed.push(name));
  watch(spec.board.texture, 'board picture');
  watch(spec.pad.material, 'pad');
  watch(spec.pad.geometry, 'pad shape');
  watch(spec.lift.geometry, 'lift shape');
  const door = cab.children[0];
  watch(door.material.map, 'door picture');
  watch(door.geometry, 'door shape');
  load.dispose();
  unpaint();
  assert.deepEqual(freed.sort(), ['board picture', 'door picture', 'door shape', 'lift shape', 'pad', 'pad shape']);
  delete globalThis.document;
});
