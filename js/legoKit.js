import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STUD, LAYER } from './bricks.js';

// Building pieces for a world that looks like it is made of toy bricks.
// Everything static is collected per material and merged into one mesh each, so the whole city draws in a few calls.
export const STUD_RADIUS = STUD * 0.3;
export const STUD_HEIGHT = LAYER * 0.45;
export const BRICK_H = LAYER * 3; // one brick course
export const snapStud = v => (Math.floor(v / STUD) + 0.5) * STUD; // the middle of the stud cell v falls in

// A small seeded random, so the city is dressed the same way every visit.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(width, height, draw) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  draw(c.getContext('2d'), width, height);
  return c;
}

// A normal map from a grey height picture (white = high), so flat faces catch the light like bumpy plastic.
function normalFromHeight(height, strength) {
  const { width: w, height: h } = height;
  const src = height.getContext('2d').getImageData(0, 0, w, h).data;
  return canvas(w, h, g => {
    const out = g.createImageData(w, h);
    const at = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * w + x) * 4;
        out.data[i] = (-dx / len) * 127 + 128;
        out.data[i + 1] = (dy / len) * 127 + 128;
        out.data[i + 2] = (1 / len) * 127 + 128;
        out.data[i + 3] = 255;
      }
    }
    g.putImageData(out, 0, 0);
  });
}

// Pictures in metres: `size` is how much of the world one copy of the picture covers.
const PATTERNS = {
  // A baseplate: 4 × 4 studs, each with a soft shadow ring.
  studs: {
    size: [STUD * 4, STUD * 4],
    color: (g, w) => {
      const cell = w / 4;
      const r = (STUD_RADIUS / STUD) * cell;
      g.fillStyle = '#f2f2f2';
      g.fillRect(0, 0, w, w);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const x = (i + 0.5) * cell;
        const y = (j + 0.5) * cell;
        const shade = g.createRadialGradient(x + 3, y + 4, r * 0.8, x + 3, y + 4, r * 1.45);
        shade.addColorStop(0, 'rgba(0,0,0,0.28)');
        shade.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = shade;
        g.fillRect(x - cell / 2, y - cell / 2, cell, cell);
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.lineWidth = 2;
        g.stroke();
      }
    },
    height: (g, w) => {
      const cell = w / 4;
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, w);
      g.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        g.beginPath(); g.arc((i + 0.5) * cell, (j + 0.5) * cell, (STUD_RADIUS / STUD) * cell, 0, Math.PI * 2); g.fill();
      }
    },
    strength: 3,
  },
  // Brick courses: 4 rows of bricks two studs long, every other row shifted half a brick.
  bricks: {
    size: [STUD * 4, BRICK_H * 4],
    color: (g, w, h) => {
      g.fillStyle = '#f4f4f4';
      g.fillRect(0, 0, w, h);
      const row = h / 4;
      for (let r = 0; r < 4; r++) {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.fillRect(0, r * row, w, 3);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(0, r * row + 3, w, 2);
        for (let k = 0; k < 2; k++) {
          const x = ((k + (r % 2) * 0.5) * w) / 2;
          g.fillStyle = 'rgba(0,0,0,0.13)';
          g.fillRect(x % w, r * row, 3, row);
        }
      }
    },
    height: (g, w, h) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      const row = h / 4;
      g.fillStyle = '#000';
      for (let r = 0; r < 4; r++) {
        g.fillRect(0, r * row, w, 3);
        for (let k = 0; k < 2; k++) g.fillRect((((k + (r % 2) * 0.5) * w) / 2) % w, r * row, 3, row);
      }
    },
    strength: 2,
  },
  // Road plates: smooth, with a faint seam every 8 m and a little speckle.
  road: {
    size: [8, 8],
    color: (g, w) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, w);
      const rand = seededRandom(7);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.04})`;
        g.fillRect(rand() * w, rand() * w, 2, 2);
      }
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, 0, w, 2);
      g.fillRect(0, 0, 2, w);
    },
    height: (g, w) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, w);
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, 2);
      g.fillRect(0, 0, 2, w);
    },
    strength: 2,
  },
  // Gentle ripples for water.
  ripples: {
    size: [6, 6],
    color: (g, w) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, w);
    },
    height: (g, w) => {
      const img = g.createImageData(w, w);
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
        const a = (x / w) * Math.PI * 2;
        const b = (y / w) * Math.PI * 2;
        const v = 0.5 + 0.25 * Math.sin(a * 2 + Math.sin(b) * 1.5) + 0.25 * Math.sin(b * 3 + Math.cos(a * 2));
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    },
    strength: 1.2,
  },
};

// World-scale UVs (in metres): top faces use x/z, side faces use their run and height. Lets one picture tile seamlessly over any box.
function worldUVs(geometry) {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    if (ny >= nx && ny >= nz) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = -pos.getZ(i); }
    else if (nx >= nz) { uv[i * 2] = pos.getZ(i); uv[i * 2 + 1] = pos.getY(i); }
    else { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getY(i); }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

export function createKit(own) {
  const textures = new Map();
  function pattern(name) {
    if (!textures.has(name)) {
      const p = PATTERNS[name];
      const color = canvas(256, 256, (g, w, h) => p.color(g, w, h));
      const height = canvas(256, 256, (g, w, h) => p.height(g, w, h));
      const make = (c, srgb) => {
        const t = own(new THREE.CanvasTexture(c));
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1 / p.size[0], 1 / p.size[1]);
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      textures.set(name, { map: make(color, true), normalMap: make(normalFromHeight(height, p.strength), false) });
    }
    return textures.get(name);
  }

  const materials = new Map();
  // Shiny toy plastic in any colour; `look` picks a surface pattern (studs, bricks, road, ripples).
  function plastic(hex, { look = null, ...extra } = {}) {
    const key = `${hex}:${look}:${JSON.stringify(extra)}`;
    if (!materials.has(key)) {
      const options = { color: hex, roughness: 0.32, metalness: 0, ...extra };
      if (look) Object.assign(options, pattern(look), { normalScale: new THREE.Vector2(0.6, 0.6) });
      const m = own(new THREE.MeshStandardMaterial(options));
      m.userData.key = key;
      materials.set(key, m);
    }
    return materials.get(key);
  }
  const glass = () => plastic(0x4f7fb8, { roughness: 0.08, metalness: 0.35 });
  const glow = hex => plastic(hex, { emissive: hex, emissiveIntensity: 1.1, roughness: 0.5 });

  const parts = new Map(); // material → [geometry]
  const studSpots = new Map(); // material → [x, y, z]
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  function add(material, geometry, x, y, z, rotY = 0, rotX = 0, rotZ = 0) {
    geometry.applyMatrix4(m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rotX, rotY, rotZ)), new THREE.Vector3(1, 1, 1)));
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(geometry.index ? geometry.toNonIndexed() : geometry);
  }

  return {
    plastic,
    glass,
    glow,
    pattern,
    add,
    // Several geometries as one (e.g. a pine tree's stacked cones), for instancing.
    merge(list) {
      const merged = mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)));
      for (const g of list) g.dispose();
      return merged;
    },
    // A box by its centre and full size.
    box(material, x, y, z, w, h, d, rotY = 0, rotX = 0) {
      add(material, new THREE.BoxGeometry(w, h, d), x, y, z, rotY, rotX);
    },
    // A box by its corners: x0..x1, y0..y1, z0..z1.
    span(material, x0, y0, z0, x1, y1, z1) {
      add(material, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    },
    cylinder(material, x, y, z, rTop, rBottom, h, segments = 12, rotZ = 0, rotX = 0) {
      add(material, new THREE.CylinderGeometry(rTop, rBottom, h, segments), x, y, z, 0, rotX, rotZ);
    },
    // Studs on top of a surface at height y, on the world's stud grid, inside x0..x1, z0..z1.
    studs(material, x0, z0, x1, z1, y) {
      if (!studSpots.has(material)) studSpots.set(material, []);
      const list = studSpots.get(material);
      for (let x = snapStud(x0 + STUD / 2); x < x1; x += STUD) for (let z = snapStud(z0 + STUD / 2); z < z1; z += STUD) list.push(x, y, z);
    },
    stud(material, x, y, z) {
      if (!studSpots.has(material)) studSpots.set(material, []);
      studSpots.get(material).push(x, y, z);
    },
    // Merge everything added so far into the scene: one mesh per material, one instanced mesh of studs per material.
    build(scene, { castShadow = true, receiveShadow = true } = {}) {
      const meshes = [];
      for (const [material, list] of parts) {
        const mesh = new THREE.Mesh(own(worldUVs(mergeGeometries(list))), material);
        for (const g of list) g.dispose();
        mesh.castShadow = castShadow && !material.userData.noShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
        meshes.push(mesh);
      }
      parts.clear();
      const studGeometry = own(new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 10).translate(0, STUD_HEIGHT / 2, 0));
      for (const [material, list] of studSpots) {
        const count = list.length / 3;
        const mesh = own(new THREE.InstancedMesh(studGeometry, material, count));
        for (let i = 0; i < count; i++) mesh.setMatrixAt(i, m4.makeTranslation(list[i * 3], list[i * 3 + 1], list[i * 3 + 2]));
        mesh.computeBoundingSphere();
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
        meshes.push(mesh);
      }
      studSpots.clear();
      return meshes;
    },
  };
}
