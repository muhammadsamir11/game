import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SIZE, ROAD, SIDEWALK, BLOCKS, GARAGE, RACE_GATE, buildingColor, HERO_NAME, STUNT_PARK_BLOCK } from './cityMap.js';
import { STUNT_PARK } from './stuntPark.js';
import { createFigureMesh } from './figureMesh.js';
import { greenAxis } from './traffic.js';
import { SURFACE_MATERIAL } from './walker.js';
import { createKit } from './legoKit.js';
import { createBuildings } from './cityBuildings.js';
import { createGround } from './cityGround.js';
import { createProps } from './cityProps.js';


export function createCityWorld(scene, world) {
  const disposables = [];
  const own = thing => { disposables.push(thing); return thing; };
  const kit = createKit(own);
  const material = (color, extra = {}) => kit.plastic(color, extra);

  // A physics box; with a colour (or material) it is also drawn, merged with the rest of the static city.
  function staticBox({ cx, cy, cz, hx, hy, hz, rotX = 0 }, color = null) {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), material: SURFACE_MATERIAL });
    body.position.set(cx, cy, cz);
    if (rotX) body.quaternion.setFromEuler(rotX, 0, 0);
    body.aabbNeedsUpdate = true;
    world.addBody(body);
    if (color === null) return;
    kit.box(typeof color === 'number' ? material(color) : color, cx, cy, cz, hx * 2, hy * 2, hz * 2, 0, rotX);
  }

  function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'));
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const sign = (text, bg, fg = '#ffffff') => own(new THREE.MeshStandardMaterial({ roughness: 0.4,
    map: canvasTexture(512, 128, g => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = fg;
      const font = size => `bold ${size}px Fredoka, Arial Rounded MT Bold, sans-serif`;
      g.font = font(64);
      g.font = font(Math.min(64, Math.floor((64 * 480) / g.measureText(text).width))); // shrink long names to fit
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 68);
    }),
  }));

  // A painted name board, for the shop signs.
  const signBoard = (text, bg, fg, { w, h }) => new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), sign(text, bg, fg));
  const addMesh = (mesh, x, y, z, rotY = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    return mesh;
  };
  const buildings = createBuildings(kit, { sign: signBoard, addMesh });

  // --- the ground's physics: one flat plane (the plates you see are thin and only for looks) ---
  const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: SURFACE_MATERIAL });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  groundBody.aabbNeedsUpdate = true;
  world.addBody(groundBody);

  // --- blocks: the same boxes as ever for physics, dressed as brick buildings ---
  const flames = []; // ring-of-fire flames, flickered in update
  BLOCKS.forEach((b, n) => {
    const { x0, z0, x1, z1 } = b.rect;
    const ix0 = x0 + SIDEWALK + 1;
    const iz0 = z0 + SIDEWALK + 1;
    const ix1 = x1 - SIDEWALK - 1;
    const iz1 = z1 - SIDEWALK - 1;
    const color = k => buildingColor(n, k).hex;
    const solid = (xa, za, xb, zb, h) => staticBox({ cx: (xa + xb) / 2, cy: h / 2, cz: (za + zb) / 2, hx: (xb - xa) / 2, hy: h / 2, hz: (zb - za) / 2 });
    switch (b.type) {
      case 'houses':
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([qx, qz], k) => {
          const xa = ix0 + qx * 15 + 1;
          const za = iz0 + qz * 15 + 1;
          const h = 5 + ((n + k) % 3);
          solid(xa, za, xa + 10, za + 10, h);
          buildings.house({ x0: xa, z0: za, x1: xa + 10, z1: za + 10 }, h, color(k), qz ? 'south' : 'north', n * 4 + k);
        });
        break;
      case 'shops':
        solid(ix0, iz0, ix1, iz0 + 11, 7);
        solid(ix0, iz1 - 11, ix1, iz1, 8);
        buildings.shops({ x0: ix0, z0: iz0, x1: ix1, z1: iz0 + 11 }, 7, color(0), 'north', n * 2);
        buildings.shops({ x0: ix0, z0: iz1 - 11, x1: ix1, z1: iz1 }, 8, color(1), 'south', n * 2 + 1);
        break;
      case 'towers': {
        const h = 24 + (n % 3) * 4;
        const cx = (ix0 + ix1) / 2;
        const cz = (iz0 + iz1) / 2;
        solid(cx - 10, cz - 10, cx + 10, cz + 10, h);
        buildings.tower({ x0: cx - 10, z0: cz - 10, x1: cx + 10, z1: cz + 10 }, h, color(2), n);
        break;
      }
      case 'park':
        if (b.bx === STUNT_PARK_BLOCK.bx && b.bz === STUNT_PARK_BLOCK.bz) buildStuntPark();
        break;
      case 'pizza': {
        solid(ix0 + 2, iz0 + 2, ix1 - 2, iz0 + 18, 7);
        buildings.store({ x0: ix0 + 2, z0: iz0 + 2, x1: ix1 - 2, z1: iz0 + 18 }, 7, 0xfff3e0, 'south', { trim: 0xe53935, awning: 0xe53935 });
        const board = new THREE.Mesh(own(new THREE.PlaneGeometry(14, 3.5)), sign(`${HERO_NAME.toUpperCase()}'S PIZZA 🍕`, '#e53935'));
        board.position.set((ix0 + ix1) / 2, 8.6, iz0 + 18.05);
        scene.add(board);
        break;
      }
      case 'shopSoon': {
        solid(ix0 + 2, iz0 + 2, ix1 - 2, iz0 + 18, 7);
        buildings.store({ x0: ix0 + 2, z0: iz0 + 2, x1: ix1 - 2, z1: iz0 + 18 }, 7, 0xe1bee7, 'south', { trim: 0x8e24aa, awning: 0xfdd835 });
        buildings.scaffold({ x0: ix0 + 2, z0: iz0 + 2, x1: ix1 - 2, z1: iz0 + 18 }, 7, 'west');
        const board = new THREE.Mesh(own(new THREE.PlaneGeometry(16, 4)), sign('SHOP · coming soon', '#8e24aa'));
        board.position.set((ix0 + ix1) / 2, 8.8, iz0 + 18.05);
        scene.add(board);
        break;
      }
    }
  });

  // --- Murad's Stunt Park ---
  function buildStuntPark() {
    const { hoop, arch } = STUNT_PARK;
    const colors = { kicker: 0xff7043, pipe: 0x7e57c2, hoop: 0x37474f, arch: 0xe53935 };
    for (const box of STUNT_PARK.boxes) staticBox(box, colors[box.part]);
    const ring = new THREE.Mesh(own(new THREE.TorusGeometry(hoop.radius, 0.25, 12, 40)), material(0xff9800, { emissive: 0xff5722, emissiveIntensity: 0.6 }));
    ring.position.set(hoop.x, hoop.y, hoop.z);
    scene.add(ring);
    const flameGeometry = own(new THREE.ConeGeometry(0.22, 0.7, 8));
    const flameMaterial = material(0xffc107, { emissive: 0xff6f00, emissiveIntensity: 1.4 });
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const flame = new THREE.Mesh(flameGeometry, flameMaterial);
      flame.position.set(hoop.x + Math.cos(a) * (hoop.radius + 0.2), hoop.y + Math.sin(a) * (hoop.radius + 0.2), hoop.z);
      flame.rotation.z = a - Math.PI / 2;
      flame.userData.phase = k * 1.7;
      scene.add(flame);
      flames.push(flame);
    }
    const banner = new THREE.Mesh(own(new THREE.BoxGeometry(arch.width + 0.6, 1.6, 0.3)), sign(`${HERO_NAME.toUpperCase()}'S STUNT PARK`, '#ff7043'));
    banner.position.set(arch.x, 6.6, arch.z);
    scene.add(banner);
  }

  // A gold statue of him on a pedestal in the pond park, once he has done a mission.
  let statue = null;
  function showStatue(figure) {
    if (statue) return;
    statue = new THREE.Group();
    const gold = material(0xffc107, { metalness: 0.45, roughness: 0.3, emissive: 0x8d6e00, emissiveIntensity: 0.35 }); // shiny without a reflection map
    const body = createFigureMesh(figure);
    body.traverse(node => {
      if (node.isMesh) {
        node.material = gold;
        node.castShadow = true;
      }
    });
    body.scale.setScalar(3);
    body.position.y = 1.2;
    const pedestal = new THREE.Mesh(own(new THREE.BoxGeometry(3, 1.2, 3)), material(0xeceff1));
    pedestal.castShadow = pedestal.receiveShadow = true;
    pedestal.position.y = 0.6;
    const plaque = new THREE.Mesh(own(new THREE.PlaneGeometry(2.6, 0.65)), sign(`${HERO_NAME.toUpperCase()} 🏆`, '#5d4037', '#ffd54f'));
    plaque.position.set(0, 0.6, 1.52); // on the front, the way he faces
    statue.add(pedestal, body, plaque);
    statue.position.set(126, 0, 185);
    statue.rotation.y = Math.PI; // faces north, toward the pond
    scene.add(statue);
    const base = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(1.5, 0.6, 1.5)), material: SURFACE_MATERIAL });
    base.position.set(126, 0.6, 185);
    base.aabbNeedsUpdate = true;
    world.addBody(base);
  }

  // --- garage building ---
  const concrete = material(0xb0bec5);
  for (const slab of GARAGE.floors) staticBox(slab, concrete);
  for (const ramp of GARAGE.ramps) staticBox(ramp, material(0x90a4ae));
  for (const wall of GARAGE.walls) staticBox(wall, material(0x78909c, { look: 'bricks' }));
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
    lines.rotation.y = spot.heading + Math.PI / 2; // the number reads the right way up as you drive in
    scene.add(lines);
  }

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

  // --- curb walls round the city (the red and white bricks you see are drawn by the ground) ---
  staticBox({ cx: -0.5, cy: 0.4, cz: SIZE / 2, hx: 0.5, hy: 0.4, hz: SIZE / 2 + 1 });
  staticBox({ cx: SIZE + 0.5, cy: 0.4, cz: SIZE / 2, hx: 0.5, hy: 0.4, hz: SIZE / 2 + 1 });
  staticBox({ cx: SIZE / 2, cy: 0.4, cz: -0.5, hx: SIZE / 2 + 1, hy: 0.4, hz: 0.5 });
  staticBox({ cx: SIZE / 2, cy: 0.4, cz: SIZE + 0.5, hx: SIZE / 2 + 1, hy: 0.4, hz: 0.5 });

  // Ground and props go round the buildings, so they come after them; then everything static is merged.
  const ground = createGround(kit, scene, own, { occupied: buildings.occupied });
  const props = createProps(kit, scene, own, { occupied: buildings.occupied });
  kit.build(scene);
  let shownAxis = null;

  return {
    showStatue,
    ground,
    // focus: where he is, so the real studs near him switch on.
    update(time, focus) {
      for (const f of flames) f.scale.setScalar(0.8 + 0.35 * Math.abs(Math.sin(time * 9 + f.userData.phase)));
      ground.update(time, focus);
      const axis = greenAxis(time);
      if (axis === shownAxis) return;
      shownAxis = axis;
      props.setGreen(axis);
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
