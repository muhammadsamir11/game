import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSmoke, puffSize, SMOKE } from '../js/smoke.js';
import { animateFx } from '../js/gadgetHud.js';

const jetAt = (x, y, z) => {
  const jet = new THREE.Object3D();
  jet.position.set(x, y, z);
  jet.updateMatrixWorld();
  return jet;
};
const fx = jets => ({ spinners: [], flags: [], flames: [], jets, sirens: [] });

test('a puff swells, then shrinks away by the end of its life', () => {
  assert.equal(puffSize(0), 0);
  assert.ok(puffSize(0.2) < puffSize(0.6));
  assert.ok(puffSize(SMOKE.life * 0.9) < puffSize(SMOKE.life * 0.6));
  assert.equal(puffSize(SMOKE.life), 0);
});

test('flying lets smoke out of every thruster; not flying, none', () => {
  const smoke = createSmoke(new THREE.Scene());
  const jets = [jetAt(-1, 5, 0), jetAt(1, 5, 0)];
  animateFx(fx(jets), 1 / 60, { flying: false, smoke });
  assert.equal(smoke.count, 0);
  for (let i = 0; i < 30; i++) {
    animateFx(fx(jets), 1 / 60, { flying: 'up', smoke });
    smoke.update(1 / 60);
  }
  const n = smoke.count;
  assert.ok(n >= SMOKE.rate * 0.5 * 2 - 2 && n <= SMOKE.rate * 0.5 * 2 + 2, `${n} puffs in half a second from two thrusters`);
});

test('the smoke pours down, never goes through the ground, and is gone soon after landing', () => {
  const scene = new THREE.Scene();
  const smoke = createSmoke(scene);
  const jets = [jetAt(0, 2, 0)];
  for (let i = 0; i < 60; i++) {
    smoke.emitFrom(jets, 1 / 60);
    smoke.update(1 / 60);
  }
  const mesh = scene.children.find(c => c.isInstancedMesh);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  let lowest = Infinity;
  for (let k = 0; k < SMOKE.max; k++) {
    mesh.getMatrixAt(k, m);
    p.setFromMatrixPosition(m);
    if (m.elements[0] > 0) lowest = Math.min(lowest, p.y);
  }
  assert.ok(lowest < 1.2 && lowest >= SMOKE.floor, `lowest puff at ${lowest}`);
  for (let i = 0; i < 120; i++) smoke.update(1 / 60);
  assert.equal(smoke.count, 0);
  smoke.dispose();
  assert.ok(!scene.children.includes(mesh));
});
