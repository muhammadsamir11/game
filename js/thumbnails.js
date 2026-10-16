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

// people: { driver, resolveRider } for a car someone else drives (a friend's car in play together).
export function carThumbnail(bricks, cacheKey, people = {}) {
  const key = `car:${cacheKey}:${people.driver ? '' : getDriverVersion()}`;
  if (!cache.has(key)) cache.set(key, snapshot(createCarMesh(bricks, people)));
  return cache.get(key);
}

// Head pictures show only the head, so they don't change (or re-render) when the shirt or pants change.
export function figureThumbnail(figure, part = 'body') {
  const f = normaliseFigure(figure);
  const key = part === 'head' ? `figure:head:${f.head}:${f.headColor}:${f.face}:${f.skin}` : `figure:body:${figureKey(f)}`;
  if (!cache.has(key)) {
    const mesh = createFigureMesh(f);
    let object = mesh;
    if (part === 'head') {
      mesh.traverse(node => { if (node.userData.part === 'head') object = node; });
      object.removeFromParent();
    }
    cache.set(key, snapshot(object));
    trimFigureCache();
  }
  return cache.get(key);
}

// A child can tap "Surprise me" hundreds of times: keep only the newest figure pictures.
const FIGURE_CACHE_LIMIT = 200;
function trimFigureCache() {
  const keys = [...cache.keys()].filter(k => k.startsWith('figure:'));
  for (const k of keys.slice(0, Math.max(0, keys.length - FIGURE_CACHE_LIMIT))) cache.delete(k);
}

export function clearFigureThumbnails() {
  for (const k of [...cache.keys()]) if (k.startsWith('figure:')) cache.delete(k);
}

export const thumbnailCacheSize = (prefix = '') => [...cache.keys()].filter(k => k.startsWith(prefix)).length;
