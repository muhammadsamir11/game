// Draws a coin field: spinning, bobbing discs, one instanced mesh per size so the whole city costs two draw calls.
import * as THREE from 'three';

export function createCityCoins(scene, field, { color = 0xffc107, bigColor = 0xffd54f } = {}) {
  const owned = [];
  const kinds = [
    { value: 1, radius: 0.45, depth: 0.1, color },
    { value: 5, radius: 0.8, depth: 0.14, color: bigColor },
  ].map(kind => {
    const indices = field.spots.map((s, i) => (s.value === kind.value ? i : -1)).filter(i => i >= 0);
    if (!indices.length) return null;
    const geometry = new THREE.CylinderGeometry(kind.radius, kind.radius, kind.depth, 24).rotateX(Math.PI / 2); // a disc standing up
    const material = new THREE.MeshStandardMaterial({ color: kind.color, metalness: 0.3, roughness: 0.3, emissive: kind.color, emissiveIntensity: 0.35 });
    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    mesh.frustumCulled = false; // instances are spread over the whole city
    scene.add(mesh);
    owned.push(mesh, geometry, material);
    return { indices, mesh };
  }).filter(Boolean);

  const position = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();

  function update(dt, clock) {
    field.update(dt);
    for (const { indices, mesh } of kinds) {
      indices.forEach((i, n) => {
        const s = field.spots[i];
        const on = field.isActive(i);
        position.set(s.x, s.y + Math.sin(clock * 2.5 + i) * 0.15, s.z);
        turn.setFromAxisAngle(up, clock * 3 + i);
        scale.setScalar(on ? 1 : 0);
        mesh.setMatrixAt(n, matrix.compose(position, turn, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  update(0, 0);

  return {
    field,
    update,
    // Hidden while a play-together Coin rush puts its own coins in the same places.
    setVisible(on) {
      for (const { mesh } of kinds) mesh.visible = on;
    },
    dispose() {
      for (const { mesh } of kinds) scene.remove(mesh);
      for (const thing of owned) thing.dispose?.();
    },
  };
}
