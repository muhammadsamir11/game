import * as THREE from 'three';
import { seededRandom } from './legoKit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The sky over the city and the race track: a blue gradient, chunky brick clouds drifting over, and a soft
// reflection of that sky in every plastic surface. Turns on filmic tone mapping while it is up and puts it back after.
export const HORIZON = 0xd4ecff;
const TOP = '#4c9fff';

// center: the middle of the world the clouds drift over.
export function createSky(scene, renderer, { center = { x: 0, z: 0 } } = {}) {
  const disposables = [];
  const own = thing => { disposables.push(thing); return thing; };

  const gradient = own(new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const fill = g.createLinearGradient(0, 0, 0, 256);
    fill.addColorStop(0, TOP);
    fill.addColorStop(0.42, '#9ccfff');
    fill.addColorStop(0.5, '#' + HORIZON.toString(16));
    fill.addColorStop(0.53, '#cfe3c4');
    fill.addColorStop(1, '#6f9f5a');
    g.fillStyle = fill;
    g.fillRect(0, 0, 4, 256);
    return c;
  })()));
  gradient.colorSpace = THREE.SRGBColorSpace;
  const skyMaterial = own(new THREE.MeshBasicMaterial({ map: gradient, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  const dome = new THREE.Mesh(own(new THREE.SphereGeometry(460, 32, 16)), skyMaterial);
  dome.renderOrder = -1;
  scene.add(dome);
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 90, 320);

  // Reflections: render a little sky with a bright sun patch into an environment map.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: gradient, side: THREE.BackSide })));
  const sunPatch = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  sunPatch.material.color.setScalar(6);
  sunPatch.position.set(5, 7, 3);
  sunPatch.lookAt(0, 0, 0);
  envScene.add(sunPatch);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = own(pmrem.fromScene(envScene, 0.02).texture);
  pmrem.dispose();
  envScene.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
  scene.environment = env;
  scene.environmentIntensity = 0.65;

  // Clouds: a few white bricks stacked together, high up, drifting east.
  const rand = seededRandom(99);
  const cloudMaterial = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, fog: false, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  const clouds = Array.from({ length: 12 }, (_, n) => {
    const parts = [];
    const lumps = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < lumps; k++) {
      const w = 8 + rand() * 10;
      parts.push(new THREE.BoxGeometry(w, 3 + rand() * 3, 6 + rand() * 6).translate((k - lumps / 2) * 6 + rand() * 3, rand() * 2.5, (rand() - 0.5) * 6));
    }
    parts.push(new THREE.BoxGeometry(lumps * 6, 2.2, 8).translate(-3, -1.8, 0));
    const geometry = own(mergeGeometries(parts));
    for (const p of parts) p.dispose();
    const cloud = new THREE.Mesh(geometry, cloudMaterial);
    const a = (n / 12) * Math.PI * 2 + rand();
    const r = 120 + rand() * 170;
    cloud.position.set(center.x + Math.cos(a) * r, 70 + rand() * 40, center.z + Math.sin(a) * r);
    cloud.userData.speed = 1.2 + rand() * 1.5;
    scene.add(cloud);
    return cloud;
  });

  const saved = { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure };
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  return {
    update(dt, camera) {
      dome.position.copy(camera.position);
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > center.x + 320) c.position.x -= 640;
      }
    },
    dispose() {
      renderer.toneMapping = saved.toneMapping;
      renderer.toneMappingExposure = saved.exposure;
      for (const thing of disposables) thing.dispose();
    },
  };
}
