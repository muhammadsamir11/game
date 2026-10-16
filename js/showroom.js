import * as THREE from 'three';
import { createCarMesh, carLift } from './brickMesh.js';
import { createFigureMesh } from './figureMesh.js';
import { createSky } from './sky.js';
import { createKit } from './legoKit.js';
import { buildPodium, dressBaseplate } from './podium.js';

// Home and garage background: the newest car and his figure spinning on a big round brick, out on a studded
// baseplate under the same sky as the city and the race.
export function createShowroom(bricks, figure, renderer) {
  const disposables = [];
  const own = thing => { disposables.push(thing); return thing; };
  const scene = new THREE.Scene();
  const sky = createSky(scene, renderer);
  scene.add(new THREE.HemisphereLight(0xe3f1ff, 0x5f8f4a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(5, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(sun);

  const kit = createKit(own);
  const turntable = new THREE.Group();
  const top = buildPodium(kit, turntable, { radius: 3.5 });
  dressBaseplate(kit, scene, {
    clear: 3.9,
    near: 9,
    flowers: 14,
    seed: 11,
    trees: [
      { x: -9, z: -8, s: 1, kind: 'round' }, { x: -15, z: -14, s: 1.2, kind: 'pine' }, { x: -4, z: -16, s: 1.1, kind: 'round' },
      { x: 5, z: -13, s: 1, kind: 'pine' }, { x: 11, z: -9, s: 1.1, kind: 'round' }, { x: 17, z: -15, s: 1.2, kind: 'pine' },
      { x: -18, z: 2, s: 1, kind: 'round' }, { x: 18, z: 1, s: 1, kind: 'pine' },
    ],
    bushes: [{ x: -6.5, z: -4, s: 0.8 }, { x: 7, z: -4.5, s: 0.7 }, { x: -1, z: -7, s: 0.6 }],
  });
  const car = createCarMesh(bricks);
  car.position.y = top + carLift(bricks);
  turntable.add(car);
  if (figure) {
    const person = createFigureMesh(figure);
    person.position.set(2.2, top, 0.7);
    person.rotation.y = 0.5;
    person.scale.setScalar(1.3);
    turntable.add(person);
  }
  scene.add(turntable);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  return {
    scene,
    camera,
    isShowroom: true,
    update(dt) {
      turntable.rotation.y += dt * 0.6;
      sky.update(dt, camera);
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // In landscape, aim the camera left of the car so the car sits to the right of the menu.
      const shift = w > h ? -2.6 : 0;
      camera.position.set(shift, 3.9, 12);
      camera.lookAt(shift, 1.1, 0);
    },
    dispose() {
      sun.dispose(); // frees the shadow map on the GPU
      sky.dispose();
      for (const thing of disposables) thing.dispose();
    },
  };
}
