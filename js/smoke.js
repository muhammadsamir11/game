import * as THREE from 'three';

// Thruster smoke: puffs pour down out of a flying car's thrusters, slow down, swell, drift and fade away,
// leaving a trail in the sky. One instanced mesh for all the puffs (one draw call, fine on an iPad).
export const SMOKE = { life: 1.6, rate: 28, max: 200, floor: 0.1 };
const DRAG = 2.2; // how quickly a puff loses its downward rush
const RISE = 0.5; // m/s it drifts up once it has slowed
const tip = new THREE.Vector3();
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

// How big a puff is at `age` seconds: it swells quickly, then shrinks away at the end.
export function puffSize(age) {
  const t = age / SMOKE.life;
  if (t <= 0 || t >= 1) return 0;
  const grow = 0.3 + 1.1 * Math.min(1, t / 0.35);
  return t < 0.7 ? grow : grow * (1 - (t - 0.7) / 0.3);
}

export function createSmoke(scene) {
  const geometry = new THREE.IcosahedronGeometry(0.5, 1);
  const material = new THREE.MeshLambertMaterial({ color: 0xeceff1, transparent: true, opacity: 0.6, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, SMOKE.max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  for (let k = 0; k < SMOKE.max; k++) mesh.setMatrixAt(k, hidden);
  scene.add(mesh);
  const puffs = Array.from({ length: SMOKE.max }, () => ({ age: Infinity, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: 0 }));
  let next = 0;
  let owed = new WeakMap(); // each thruster's share of a puff not yet let out
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);

  function add(at) {
    const puff = puffs[next];
    next = (next + 1) % SMOKE.max;
    puff.age = 0;
    puff.p.copy(at);
    puff.v.set((Math.random() - 0.5) * 1.6, -4 - Math.random() * 2, (Math.random() - 0.5) * 1.6);
    puff.spin = Math.random() * Math.PI * 2;
  }

  return {
    // Let smoke out of each thruster jet (a mesh hanging under the nozzle, pointing down).
    emitFrom(jets, dt) {
      for (const jet of jets) {
        let n = (owed.get(jet) ?? Math.random()) + SMOKE.rate * dt;
        jet.localToWorld(tip.set(0, -0.8, 0));
        for (; n >= 1; n--) add(tip);
        owed.set(jet, n);
      }
    },
    update(dt) {
      puffs.forEach((puff, k) => {
        if (puff.age >= SMOKE.life) return;
        puff.age += dt;
        const size = puffSize(puff.age);
        if (size === 0) {
          mesh.setMatrixAt(k, hidden);
          return;
        }
        const slow = Math.exp(-DRAG * dt);
        puff.v.x *= slow;
        puff.v.z *= slow;
        puff.v.y = puff.v.y * slow + RISE * (1 - slow);
        puff.p.addScaledVector(puff.v, dt);
        if (puff.p.y < SMOKE.floor) { // hitting the ground: it spreads out sideways instead
          puff.p.y = SMOKE.floor;
          puff.v.x *= 1.5;
          puff.v.z *= 1.5;
          puff.v.y = 0;
        }
        s.setScalar(size);
        m.compose(puff.p, q.setFromAxisAngle(axis, puff.spin), s);
        mesh.setMatrixAt(k, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    get count() { return puffs.filter(p => p.age < SMOKE.life).length; },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      owed = new WeakMap();
    },
  };
}
