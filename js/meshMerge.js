import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Bakes the meshes under `anchor` into one mesh per material, added to the anchor itself, so a car or a figure
// draws in a few calls instead of dozens. Subtrees where `stop(node)` is true are left alone (parts that move).
// Free the baked shapes with disposeMerged when done.
export function mergeMeshes(anchor, stop = () => false) {
  anchor.updateMatrixWorld(true);
  const toAnchor = new THREE.Matrix4().copy(anchor.matrixWorld).invert();
  const matrix = new THREE.Matrix4();
  const batches = new Map(); // material + shadow flags → { material, castShadow, receiveShadow, geometries }
  const baked = [];
  (function walk(node) {
    if (stop(node)) return;
    if (node.isMesh && !node.isInstancedMesh && !node.isSkinnedMesh && node.visible && !Array.isArray(node.material)) {
      matrix.multiplyMatrices(toAnchor, node.matrixWorld);
      const key = `${node.material.uuid}:${node.castShadow}:${node.receiveShadow}`;
      if (!batches.has(key)) batches.set(key, { material: node.material, castShadow: node.castShadow, receiveShadow: node.receiveShadow, geometries: [] });
      batches.get(key).geometries.push(bakedGeometry(node.geometry, matrix));
      baked.push(node);
    }
    for (const child of node.children) walk(child);
  })(anchor);
  for (const node of baked) node.removeFromParent();
  pruneEmpty(anchor, stop);
  for (const { material, castShadow, receiveShadow, geometries } of batches.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    for (const g of geometries) g.dispose();
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.userData.merged = true;
    anchor.add(mesh);
  }
  return anchor;
}

// Frees the shapes mergeMeshes made (the shared shapes they were baked from stay cached).
export function disposeMerged(root) {
  root.traverse(node => { if (node.userData.merged) node.geometry.dispose(); });
}

// A copy of a part's shape moved into the anchor's space, in the one layout every part shares (position, normal, uv).
function bakedGeometry(source, matrix) {
  const g = source.index ? source.toNonIndexed() : source.clone();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.applyMatrix4(matrix);
  if (matrix.determinant() < 0) flipWinding(g); // a mirrored part would otherwise face inside out
  return g;
}

function flipWinding(g) {
  for (const attribute of Object.values(g.attributes)) {
    const { array, itemSize } = attribute;
    for (let t = 0; t < attribute.count; t += 3) {
      for (let k = 0; k < itemSize; k++) {
        const a = (t + 1) * itemSize + k;
        const b = (t + 2) * itemSize + k;
        [array[a], array[b]] = [array[b], array[a]];
      }
    }
  }
}

// Empty groups left behind once their meshes were baked.
function pruneEmpty(node, stop) {
  for (const child of [...node.children]) {
    if (stop(child)) continue;
    pruneEmpty(child, stop);
    if ((child.isGroup || child.type === 'Object3D') && !child.children.length) child.removeFromParent();
  }
}
