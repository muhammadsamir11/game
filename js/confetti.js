import * as THREE from 'three';

const PALETTE = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xfb8c00, 0x8e24aa];

export function createConfetti(scene) {
  const geometry = new THREE.PlaneGeometry(0.12, 0.08);
  const materials = PALETTE.map(color => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  const bits = [];
  return {
    burst(origin, count = 40) {
      for (let i = 0; i < count; i++) {
        const bit = new THREE.Mesh(geometry, materials[i % materials.length]);
        bit.position.copy(origin);
        bit.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5);
        bit.userData.spin = new THREE.Vector2(Math.random() * 10, Math.random() * 10);
        bit.userData.life = 1.4;
        scene.add(bit);
        bits.push(bit);
      }
    },
    update(dt) {
      for (let i = bits.length - 1; i >= 0; i--) {
        const bit = bits[i];
        const u = bit.userData;
        u.velocity.y -= 9 * dt;
        bit.position.addScaledVector(u.velocity, dt);
        bit.rotation.x += u.spin.x * dt;
        bit.rotation.y += u.spin.y * dt;
        u.life -= dt;
        if (u.life <= 0) {
          scene.remove(bit);
          bits.splice(i, 1);
        }
      }
    },
    dispose() {
      for (const bit of bits) scene.remove(bit);
      bits.length = 0;
      geometry.dispose();
      materials.forEach(m => m.dispose());
    },
  };
}
