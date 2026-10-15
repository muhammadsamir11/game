import * as THREE from 'three';
import { createCarMesh, carLift } from './brickMesh.js';

// Home and garage background: the newest car spinning on a yellow turntable.
export function createShowroom(bricks) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 25, 70);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6fbf5f, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(5, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x6fcf5f }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const turntable = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0xfdd835 }));
  disc.position.y = 0.15;
  disc.receiveShadow = true;
  turntable.add(disc);
  const car = createCarMesh(bricks);
  car.position.y = 0.3 + carLift(bricks);
  turntable.add(car);
  scene.add(turntable);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  return {
    scene,
    camera,
    isShowroom: true,
    update(dt) { turntable.rotation.y += dt * 0.6; },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // In landscape, aim the camera left of the car so the car sits to the right of the menu.
      const shift = w > h ? -2.6 : 0;
      camera.position.set(shift, 3.8, 12);
      camera.lookAt(shift, 1, 0);
    },
    dispose() {
      sun.dispose(); // frees the shadow map on the GPU
      ground.geometry.dispose();
      ground.material.dispose();
      disc.geometry.dispose();
      disc.material.dispose();
    },
  };
}
