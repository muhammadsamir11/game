// Friends in your world: their car or their figure, a name tag, stickers, honks and sirens.
// Their tablets do the driving; here they slide along the positions that arrive (see interp.js).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCarMesh, createWheelMesh } from '../brickMesh.js';
import { createFigureMesh, applyPose } from '../figureMesh.js';
import { createGait, stepGait } from '../walkCycle.js';
import { computeStats } from '../carStats.js';
import { collectFx } from '../drivenCar.js';
import { animateFx } from '../gadgetHud.js';
import { sfx, atVolume, createSirenSound } from '../audio.js';
import { STICKERS, unpackState } from './protocol.js';
import { createTrail, pushSnap, sampleTrail } from './interp.js';
import { peopleFor, bricksOf, bricksKey, friendColor } from './together.js';

const HEARING = 70; // metres: further away than this a friend's horn can't be heard
const STICKER_SECONDS = 2.6;

export const loudness = (from, to) => (to ? Math.max(0, 1 - Math.hypot(from.x - to.x, from.z - to.z) / HEARING) : 1);

// A flat picture that always faces the camera: name tags, stickers, 💤.
function textSprite(draw, width, height, worldHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(worldHeight * (width / height), worldHeight, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// A rounded pill shape (roundRect itself needs iPadOS 16).
function pill(g, x, y, w, h) {
  const r = h / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x + r, y + h);
  g.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
  g.closePath();
}

export function nameTag(name, color) {
  return textSprite((g, w, h) => {
    g.font = '700 54px Fredoka, "Arial Rounded MT Bold", sans-serif';
    const text = name.length > 14 ? `${name.slice(0, 13)}…` : name;
    const tw = Math.min(w - 20, g.measureText(text).width + 56);
    g.fillStyle = color;
    pill(g, (w - tw) / 2, 6, tw, h - 12);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  }, 512, 96, 0.45);
}

export function emojiSprite(emoji, size = 1.1) {
  return textSprite((g, w, h) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
    g.fill();
    g.font = `${Math.round(w * 0.62)}px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, w / 2, h / 2 + w * 0.04);
  }, 160, 160, size);
}

// Pops a sticker over any object (a friend, or your own car) for a couple of seconds.
export function createStickerPopper() {
  const live = [];
  return {
    pop(parent, sticker, height) {
      const sprite = emojiSprite(STICKERS[sticker] ?? '👋');
      sprite.position.set(0, height, 0);
      parent.add(sprite);
      live.push({ sprite, parent, age: 0, height });
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const s = live[i];
        s.age += dt;
        const grow = Math.min(1, s.age / 0.18);
        s.sprite.material.opacity = s.age > STICKER_SECONDS - 0.4 ? Math.max(0, (STICKER_SECONDS - s.age) / 0.4) : 1;
        s.sprite.scale.setScalar(1.1 * (0.4 + 0.6 * grow));
        s.sprite.position.y = s.height + s.age * 0.3;
        if (s.age >= STICKER_SECONDS) {
          s.parent.remove(s.sprite);
          s.sprite.material.map.dispose();
          s.sprite.material.dispose();
          live.splice(i, 1);
        }
      }
    },
    dispose() {
      for (const s of live) s.parent.remove(s.sprite);
      live.length = 0;
    },
  };
}

// room: the room client. collide: friends' cars push yours (city), or drive through it (race).
// noBumpAt(p): true where bumping must stay off (inside the garage, under low ceilings).
// listener(): where you are, for how loud their horns are. onConfetti(position): their confetti cannon fired.
export function createRemotePlayers({ scene, world, room, collide = true, noBumpAt = () => false, listener = () => null, onConfetti = () => {}, popper = createStickerPopper() }) {
  const friends = new Map();
  const offs = [];
  let clock = 0;
  const me = () => room.state.you;

  function buildCar(f) {
    const bricks = bricksOf(f.player);
    const key = bricksKey(bricks);
    if (f.car && f.car.key === key) return;
    removeCar(f);
    const people = peopleFor(f.player);
    const stats = computeStats(bricks);
    const com = stats.centerOfMass;
    const group = new THREE.Group();
    const body = createCarMesh(bricks, { includeWheels: false, ...people });
    body.position.set(-com.x, -com.y, -com.z);
    group.add(body);
    const wheels = stats.wheels.map(w => {
      const wheel = createWheelMesh(w.type, w.color);
      wheel.position.set(w.x - com.x, w.y - com.y, w.z - com.z);
      group.add(wheel);
      return { mesh: wheel, radius: w.radius, front: w.front };
    });
    const drivers = [];
    body.traverse(node => { if (node.userData.driver) drivers.push(node); });
    group.visible = false;
    scene.add(group);
    let physics = null;
    if (world) {
      // Kinematic: it pushes your car but your car can't push it (its own tablet decides where it goes).
      physics = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0 });
      for (const b of stats.boxes) physics.addShape(new CANNON.Box(new CANNON.Vec3(b.hx, b.hy, b.hz)), new CANNON.Vec3(b.cx - com.x, b.cy - com.y, b.cz - com.z));
      physics.collisionResponse = false;
      physics.position.set(0, -50, 0);
      world.addBody(physics);
    }
    f.car = { key, group, wheels, drivers, physics, fx: collectFx(body), spin: 0, height: stats.boxes.reduce((m, b) => Math.max(m, b.cy + b.hy), 0) - com.y };
  }

  function removeCar(f) {
    if (!f.car) return;
    scene.remove(f.car.group);
    if (f.car.physics && world) world.removeBody(f.car.physics);
    f.car = null;
  }

  function add(player) {
    if (player.id === me() || friends.has(player.id)) return;
    const color = friendColor(room.state.players, player.id);
    const figure = createFigureMesh(peopleFor(player).driver);
    figure.visible = false;
    scene.add(figure);
    const tag = nameTag(player.name, color);
    scene.add(tag);
    const zzz = emojiSprite('💤', 0.8);
    zzz.visible = false;
    scene.add(zzz);
    const f = { id: player.id, player, color, trail: createTrail(), figure, gait: createGait(), lastFeet: null, tag, zzz, car: null, shown: null, siren: createSirenSound(0.06), sirenOn: false };
    friends.set(player.id, f);
    buildCar(f);
  }

  function remove(id) {
    const f = friends.get(id);
    if (!f) return;
    removeCar(f);
    scene.remove(f.figure, f.tag, f.zzz);
    f.tag.material.map.dispose();
    f.siren.stop();
    friends.delete(id);
  }

  function refresh(player) {
    const f = friends.get(player.id);
    if (!f) return add(player);
    const nameChanged = f.player.name !== player.name;
    f.player = player;
    buildCar(f);
    if (nameChanged) {
      scene.remove(f.tag);
      f.tag = nameTag(player.name, f.color);
      scene.add(f.tag);
    }
  }

  for (const p of room.state.players.values()) add(p);
  offs.push(
    room.on('joined', msg => add(msg.player)),
    room.on('updated', msg => refresh(msg.player)),
    room.on('left', msg => remove(msg.id)),
    room.on('welcome', () => {
      for (const id of [...friends.keys()]) if (!room.state.players.has(id)) remove(id);
      for (const p of room.state.players.values()) refresh(p);
    }),
    room.on('state', msg => {
      const s = unpackState(msg.s);
      const f = friends.get(msg.id);
      if (s && f) pushSnap(f.trail, s, performance.now() / 1000);
    }),
    room.on('sticker', msg => {
      const f = friends.get(msg.id);
      if (!f?.shown) return;
      const host = f.shown.foot ? f.figure : f.car?.group;
      if (host) popper.pop(host, msg.sticker, f.shown.foot ? 2.6 : (f.car.height ?? 1) + 1.6);
      atVolume(loudness(f.shown.p, listener()), () => sfx.pop());
    }),
    room.on('fx', msg => {
      const f = friends.get(msg.id);
      if (!f?.shown) return;
      const volume = loudness(f.shown.p, listener());
      if (msg.kind === 'horn') atVolume(volume, () => sfx.horn());
      if (msg.kind === 'boost') atVolume(volume, () => sfx.whoosh());
      if (msg.kind === 'confetti' && f.car) {
        atVolume(volume, () => sfx.pop());
        for (const muzzle of f.car.fx.muzzles) onConfetti(muzzle.localToWorld(new THREE.Vector3(0, 0, 0.4)));
        if (!f.car.fx.muzzles.length) onConfetti(new THREE.Vector3(f.shown.p.x, f.shown.p.y + 1.5, f.shown.p.z));
      }
    }),
  );

  return {
    friends,
    popper,
    // Where each friend is right now (as drawn), for the map, zapping and games.
    positions() {
      return [...friends.values()].filter(f => f.shown).map(f => ({ id: f.id, name: f.player.name, color: f.color, p: f.shown.p, h: f.shown.h, foot: f.shown.foot, away: !!f.player.away, lap: f.shown.lap, cp: f.shown.cp, carGroup: f.car?.group ?? null }));
    },
    get(id) { return friends.get(id) ?? null; },
    update(dt) {
      clock += dt;
      const now = performance.now() / 1000;
      const here = listener();
      for (const f of friends.values()) {
        const s = sampleTrail(f.trail, now);
        f.shown = s;
        if (!s) {
          f.figure.visible = false;
          f.tag.visible = false;
          if (f.car) f.car.group.visible = false;
          continue;
        }
        const car = f.car;
        if (s.foot) {
          // On foot: the figure walks; the car they left stays parked where it was, without its driver.
          f.figure.visible = true;
          const distance = f.lastFeet ? Math.min(Math.hypot(s.p.x - f.lastFeet.x, s.p.z - f.lastFeet.z), 0.5) : 0;
          f.lastFeet = { x: s.p.x, z: s.p.z };
          applyPose(f.figure, stepGait(f.gait, { distance, dt, grounded: true }));
          f.figure.position.set(s.p.x, s.p.y - 0.4, s.p.z);
          f.figure.rotation.y = s.h;
          if (car) {
            for (const d of car.drivers) d.visible = false;
            if (car.physics) car.physics.velocity.setZero();
          }
          f.tag.position.set(s.p.x, s.p.y + 1.9, s.p.z);
        } else if (car) {
          f.figure.visible = false;
          f.lastFeet = null;
          car.group.visible = true;
          for (const d of car.drivers) d.visible = true;
          car.group.position.set(s.p.x, s.p.y, s.p.z);
          car.group.quaternion.set(s.q.x, s.q.y, s.q.z, s.q.w);
          // Roll the wheels by how far the car went forward.
          const forward = s.v.x * Math.sin(s.h) + s.v.z * Math.cos(s.h);
          car.spin += forward * dt;
          for (const w of car.wheels) w.mesh.rotation.x = car.spin / w.radius;
          if (car.physics) {
            car.physics.position.set(s.p.x, s.p.y, s.p.z);
            car.physics.quaternion.set(s.q.x, s.q.y, s.q.z, s.q.w);
            car.physics.velocity.set(s.v.x, s.v.y, s.v.z);
            car.physics.aabbNeedsUpdate = true;
          }
          animateFx(car.fx, dt, { speed: Math.abs(forward), clock, seed: f.id.length, boosting: s.boost, sirenOn: s.siren });
          f.tag.position.set(s.p.x, s.p.y + car.height + 1, s.p.z);
        }
        if (car?.physics) car.physics.collisionResponse = collide && !s.foot && !f.player.away && !noBumpAt(s.p) && !(here && noBumpAt(here));
        f.tag.visible = true;
        f.zzz.visible = !!f.player.away || s.stale;
        f.zzz.position.set(f.tag.position.x, f.tag.position.y + 0.7, f.tag.position.z);
        // Their siren wails here too, quieter the further away they are.
        const sirenOn = s.siren && !s.foot && !f.player.away;
        if (sirenOn !== f.sirenOn) {
          f.sirenOn = sirenOn;
          if (sirenOn) f.siren.start();
          else f.siren.stop();
        }
        if (sirenOn) f.siren.setVolume(0.06 * loudness(s.p, here));
      }
      popper.update(dt);
    },
    dispose() {
      for (const off of offs) off();
      for (const id of [...friends.keys()]) remove(id);
      popper.dispose();
    },
  };
}
