import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SIZE, ROAD, PITCH, GRID, SIDEWALK, BLOCK, BLOCKS, INTERSECTIONS, GARAGE, RACE_GATE, roadCenter, buildingColor } from './cityMap.js';
import { greenAxis } from './traffic.js';
import { SURFACE_MATERIAL } from './walker.js';


export function createCityWorld(scene, world) {
  const disposables = [];
  const own = thing => { disposables.push(thing); return thing; };
  const materials = new Map();
  const material = (color, extra = {}) => {
    const key = `${color}:${JSON.stringify(extra)}`;
    if (!materials.has(key)) materials.set(key, own(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra })));
    return materials.get(key);
  };

  function staticBox({ cx, cy, cz, hx, hy, hz, rotX = 0 }, color = null, { physics = true, shadow = true } = {}) {
    if (physics) {
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), material: SURFACE_MATERIAL });
      body.position.set(cx, cy, cz);
      if (rotX) body.quaternion.setFromEuler(rotX, 0, 0);
      body.aabbNeedsUpdate = true;
      world.addBody(body);
    }
    if (color === null) return null;
    const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2)), typeof color === 'number' ? material(color) : color);
    mesh.position.set(cx, cy, cz);
    mesh.rotation.x = rotX;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const flat = (x0, z0, x1, z1, y, color) => {
    const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2)), typeof color === 'number' ? material(color) : color);
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'));
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const sign = (text, bg, fg = '#ffffff') => own(new THREE.MeshStandardMaterial({
    map: canvasTexture(512, 128, g => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = fg;
      g.font = 'bold 64px Fredoka, Arial Rounded MT Bold, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 68);
    }),
  }));

  // --- ground, roads, sidewalks ---
  const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: SURFACE_MATERIAL });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  groundBody.aabbNeedsUpdate = true;
  world.addBody(groundBody);
  flat(-300, -300, SIZE + 300, SIZE + 300, 0, 0x6fcf5f);
  flat(0, 0, SIZE, SIZE, 0.01, 0x55595f);
  flat(-40, SIZE + 30, SIZE + 40, SIZE + 140, 0.02, material(0x29b6f6, { roughness: 0.2 })); // lake

  // White dashes down the middle of every road, skipping the junctions.
  const dashes = [];
  for (let i = 0; i <= GRID; i++) {
    for (let k = 0; k < GRID; k++) {
      for (let d = ROAD + 3; d < PITCH - 3; d += 6) {
        dashes.push([roadCenter(i), k * PITCH + d, 0]);
        dashes.push([k * PITCH + d, roadCenter(i), Math.PI / 2]);
      }
    }
  }
  const dashMesh = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(0.3, 3).rotateX(-Math.PI / 2)), material(0xffffff), dashes.length);
  const m4 = new THREE.Matrix4();
  dashes.forEach(([x, z, rot], n) => dashMesh.setMatrixAt(n, m4.makeRotationY(rot).setPosition(x, 0.02, z)));
  scene.add(dashMesh);

  // --- blocks ---
  const trees = [];
  BLOCKS.forEach((b, n) => {
    const { x0, z0, x1, z1 } = b.rect;
    flat(x0, z0, x1, z1, 0.03, 0xcfd8dc); // sidewalk
    const ix0 = x0 + SIDEWALK + 1;
    const iz0 = z0 + SIDEWALK + 1;
    const ix1 = x1 - SIDEWALK - 1;
    const iz1 = z1 - SIDEWALK - 1;
    const color = k => buildingColor(n, k).hex;
    const building = (xa, za, xb, zb, h, c) => {
      staticBox({ cx: (xa + xb) / 2, cy: h / 2, cz: (za + zb) / 2, hx: (xb - xa) / 2, hy: h / 2, hz: (zb - za) / 2 }, c);
      staticBox({ cx: (xa + xb) / 2, cy: h + 0.2, cz: (za + zb) / 2, hx: (xb - xa) / 2 + 0.4, hy: 0.2, hz: (zb - za) / 2 + 0.4 }, 0xf5f5f5, { physics: false });
    };
    switch (b.type) {
      case 'houses':
        flat(ix0, iz0, ix1, iz1, 0.04, 0x8bd17c);
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([qx, qz], k) => {
          const xa = ix0 + qx * 15 + 1;
          const za = iz0 + qz * 15 + 1;
          const h = 5 + ((n + k) % 3);
          staticBox({ cx: xa + 5, cy: h / 2, cz: za + 5, hx: 5, hy: h / 2, hz: 5 }, color(k));
          const roof = new THREE.Mesh(own(new THREE.ConeGeometry(7.4, 3, 4)), material(0xb71c1c));
          roof.position.set(xa + 5, h + 1.5, za + 5);
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          scene.add(roof);
        });
        break;
      case 'shops':
        building(ix0, iz0, ix1, iz0 + 11, 7, color(0));
        building(ix0, iz1 - 11, ix1, iz1, 8, color(1));
        break;
      case 'towers': {
        const h = 24 + (n % 3) * 4;
        const windows = own(new THREE.MeshStandardMaterial({
          color: color(2),
          map: canvasTexture(64, 128, g => {
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, 64, 128);
            g.fillStyle = '#90caf9';
            for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 16) g.fillRect(x, y, 10, 10);
          }),
        }));
        staticBox({ cx: (ix0 + ix1) / 2, cy: h / 2, cz: (iz0 + iz1) / 2, hx: 10, hy: h / 2, hz: 10 }, windows);
        break;
      }
      case 'park':
        flat(ix0, iz0, ix1, iz1, 0.04, 0x66bb6a);
        flat(ix0 + 8, iz0 + 8, ix1 - 8, iz1 - 8, 0.05, material(0x4fc3f7, { roughness: 0.2 }));
        for (const [tx, tz] of [[2, 2], [26, 3], [3, 25], [25, 26], [14, 1], [1, 14]]) trees.push([ix0 + tx, iz0 + tz, 1]);
        break;
      case 'pizza': {
        building(ix0 + 2, iz0 + 2, ix1 - 2, iz0 + 18, 7, 0xfff3e0);
        const board = new THREE.Mesh(own(new THREE.PlaneGeometry(14, 3.5)), sign('PIZZA 🍕', '#e53935'));
        board.position.set((ix0 + ix1) / 2, 8.6, iz0 + 18.05);
        scene.add(board);
        break;
      }
      case 'shopSoon': {
        building(ix0 + 2, iz0 + 2, ix1 - 2, iz0 + 18, 7, 0xe1bee7);
        const board = new THREE.Mesh(own(new THREE.PlaneGeometry(16, 4)), sign('SHOP · coming soon', '#8e24aa'));
        board.position.set((ix0 + ix1) / 2, 8.8, iz0 + 18.05);
        scene.add(board);
        break;
      }
      case 'garage':
        flat(x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, 0.04, 0x9e9e9e);
        break;
    }
  });

  // --- garage building ---
  const concrete = material(0xb0bec5);
  for (const slab of GARAGE.floors) staticBox(slab, concrete);
  for (const ramp of GARAGE.ramps) staticBox(ramp, material(0x90a4ae));
  for (const wall of GARAGE.walls) staticBox(wall, material(0x78909c));
  for (const support of GARAGE.supports) staticBox(support, concrete);
  const garageSign = new THREE.Mesh(own(new THREE.PlaneGeometry(14, 3.5)), sign('🅿️ GARAGE', '#1e88e5'));
  garageSign.position.set(GARAGE.rect.x1 + 0.45, 7.6, (GARAGE.rect.z0 + GARAGE.rect.z1) / 2);
  garageSign.rotation.y = Math.PI / 2;
  scene.add(garageSign);
  for (const spot of GARAGE.spots) {
    const lines = new THREE.Mesh(own(new THREE.PlaneGeometry(spot.w, spot.d).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({
      map: canvasTexture(192, 160, g => {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 8;
        g.strokeRect(4, 4, 184, 152);
        g.fillStyle = '#ffffff';
        g.font = 'bold 72px Fredoka, Arial Rounded MT Bold, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(spot.index + 1), 96, 84);
      }),
      transparent: true,
    })));
    lines.position.set(spot.x, spot.y + 0.06, spot.z);
    scene.add(lines);
  }

  // --- traffic lights: one lamp for traffic along x, one for traffic along z ---
  const green = material(0x00e676, { emissive: 0x00e676, emissiveIntensity: 1.2 });
  const red = material(0xff1744, { emissive: 0xff1744, emissiveIntensity: 1.2 });
  const poleGeometry = own(new THREE.CylinderGeometry(0.12, 0.12, 4, 8));
  const lampGeometry = own(new THREE.SphereGeometry(0.35, 12, 8));
  const lights = INTERSECTIONS.map(p => {
    const pole = new THREE.Mesh(poleGeometry, material(0x37474f));
    pole.position.set(p.x + ROAD / 2 + 0.6, 2, p.z + ROAD / 2 + 0.6);
    scene.add(pole);
    const lampX = new THREE.Mesh(lampGeometry, green);
    lampX.position.set(pole.position.x, 4.2, pole.position.z - 0.4);
    const lampZ = new THREE.Mesh(lampGeometry, red);
    lampZ.position.set(pole.position.x - 0.4, 4.2, pole.position.z);
    scene.add(lampX, lampZ);
    return { lampX, lampZ };
  });
  let shownAxis = null;

  // --- race gate ---
  const gate = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(own(new THREE.BoxGeometry(0.8, 7, 0.8)), material(0xe53935));
    post.position.set(side * (ROAD / 2 + 1), 3.5, 0);
    gate.add(post);
  }
  const banner = new THREE.Mesh(own(new THREE.BoxGeometry(ROAD + 3, 1.8, 0.4)), sign('🏁 RACE TRACK', '#111111'));
  banner.position.y = 7;
  gate.add(banner);
  gate.position.set(RACE_GATE.x, 0, RACE_GATE.z);
  scene.add(gate);

  // --- curb walls round the city ---
  const curb = 0xe53935;
  staticBox({ cx: -0.5, cy: 0.4, cz: SIZE / 2, hx: 0.5, hy: 0.4, hz: SIZE / 2 + 1 }, curb);
  staticBox({ cx: SIZE + 0.5, cy: 0.4, cz: SIZE / 2, hx: 0.5, hy: 0.4, hz: SIZE / 2 + 1 }, curb);
  staticBox({ cx: SIZE / 2, cy: 0.4, cz: -0.5, hx: SIZE / 2 + 1, hy: 0.4, hz: 0.5 }, curb);
  staticBox({ cx: SIZE / 2, cy: 0.4, cz: SIZE + 0.5, hx: SIZE / 2 + 1, hy: 0.4, hz: 0.5 }, curb);

  // --- trees: in the parks and in a ring outside the city ---
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * Math.PI * 2;
    const r = SIZE * 0.75 + (k % 5) * 6;
    trees.push([SIZE / 2 + Math.cos(a) * r, SIZE / 2 + Math.sin(a) * r, 1.2 + (k % 3) * 0.2]);
  }
  const trunks = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.4, 0.5, 2, 8)), material(0x795548), trees.length);
  const leaves = new THREE.InstancedMesh(own(new THREE.ConeGeometry(2.2, 5, 8)), material(0x2e7d32), trees.length);
  trees.forEach(([x, z, s], n) => {
    trunks.setMatrixAt(n, new THREE.Matrix4().compose(new THREE.Vector3(x, s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
    leaves.setMatrixAt(n, new THREE.Matrix4().compose(new THREE.Vector3(x, 4.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
  });
  trunks.castShadow = leaves.castShadow = true;
  scene.add(trunks, leaves);

  return {
    update(time) {
      const axis = greenAxis(time);
      if (axis === shownAxis) return;
      shownAxis = axis;
      for (const light of lights) {
        light.lampX.material = axis === 'x' ? green : red;
        light.lampZ.material = axis === 'z' ? green : red;
      }
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
