import * as THREE from 'three';
import { createBrickMesh, createCarMesh, getDriverVersion } from './brickMesh.js';
import { createFigureMesh } from './figureMesh.js';
import { normaliseFigure, figureKey } from './figures.js';

// One small offscreen renderer makes every picture in the tray, instruction card and garage.
let renderer = null;
let scene = null;
let camera = null;
const cache = new Map();

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(160, 160);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
}

// `focus` is the part of the object the camera frames (a figure's head for head/face tiles).
function snapshot(object, focus = object) {
  if (!renderer) setup();
  scene.add(object);
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(focus);
  const size = bounds.getSize(new THREE.Vector3()).length();
  const center = bounds.getCenter(new THREE.Vector3());
  camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1.2).normalize().multiplyScalar(size * 1.9));
  camera.lookAt(center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(object);
  return url;
}

export function brickThumbnail(type, color) {
  const key = `brick:${type}:${color}:${type === 'seat' ? getDriverVersion() : 0}`;
  if (!cache.has(key)) cache.set(key, snapshot(createBrickMesh({ type, color, x: 0, y: 0, z: 0, r: 0 })));
  return cache.get(key);
}

export function carThumbnail(bricks, cacheKey) {
  const key = `car:${cacheKey}:${getDriverVersion()}`;
  if (!cache.has(key)) cache.set(key, snapshot(createCarMesh(bricks)));
  return cache.get(key);
}

export function figureThumbnail(figure, part = 'body') {
  const f = normaliseFigure(figure);
  const key = `figure:${figureKey(f)}:${part}`;
  if (!cache.has(key)) {
    const mesh = createFigureMesh(f);
    let focus = mesh;
    if (part === 'head') mesh.traverse(node => { if (node.userData.part === 'head') focus = node; });
    cache.set(key, snapshot(mesh, focus));
  }
  return cache.get(key);
}
