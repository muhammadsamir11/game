import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SILHOUETTES, tracePath, drawBadge, drawNamePlate } from '../js/badgeArt.js';
import { BRANDS } from '../js/brands.js';
import { setBrandLogo } from '../js/brandLogos.js';

// A stand-in for a canvas 2D context that records every call and every point drawn.
function fakeContext() {
  const calls = [];
  const points = [];
  const at = (x, y) => points.push([x, y]);
  const g = {
    calls, points,
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: '', textBaseline: '',
    moveTo: at, lineTo: at,
    quadraticCurveTo: (ax, ay, x, y) => { at(ax, ay); at(x, y); },
    bezierCurveTo: (ax, ay, bx, by, x, y) => { at(ax, ay); at(bx, by); at(x, y); },
    measureText: text => ({ width: text.length * (parseFloat(g.font.match(/(\d+(\.\d+)?)px/)?.[1]) || 10) * 0.6 }),
  };
  return new Proxy(g, {
    get(target, name) {
      if (name in target) return target[name];
      return (...args) => calls.push([name, ...args]);
    },
  });
}

test('the bull and the horse are closed shapes inside their 100 × 100 grid', () => {
  for (const [name, d] of Object.entries(SILHOUETTES)) {
    const g = fakeContext();
    tracePath(g, d);
    assert.ok(g.points.length > 30, `${name} has detail`);
    for (const [x, y] of g.points) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${name} point ${x},${y}`);
    assert.ok(g.calls.some(([c]) => c === 'closePath'), name);
  }
});

test('a path is scaled and moved as asked', () => {
  const g = fakeContext();
  tracePath(g, 'M 0 0 L 10 0 H 20 V 5 Q 0 0 1 1 C 2 2 3 3 4 4 Z', 100, 50, 2);
  assert.deepEqual(g.points, [[100, 50], [120, 50], [140, 50], [140, 60], [100, 50], [102, 52], [104, 54], [106, 56], [108, 58]]);
  assert.throws(() => tracePath(fakeContext(), 'M 0 0 X 1 1'), /Unknown path command/);
});

test('every brand draws a badge and a name plate in its own colours', () => {
  for (const [key, brand] of Object.entries(BRANDS)) {
    const badge = fakeContext();
    drawBadge(badge, brand, 256, 256);
    assert.equal(badge.calls[0][0], 'clearRect', `${key} badge starts see-through`);
    assert.ok(badge.calls.some(([c]) => c === 'fill'), key);
    const plate = fakeContext();
    drawNamePlate(plate, brand, 512, 128);
    assert.deepEqual(plate.calls.find(([c]) => c === 'fillRect'), ['fillRect', 0, 0, 512, 128], key);
    assert.ok(plate.calls.some(([c]) => c === 'fillText'), `${key} plate has lettering`);
  }
});

test('each emblem shows its brand: LAMBORGHINI over the bull, S F under the horse, EB over BUGATTI, the McLaren wordmark', () => {
  const letters = key => {
    const g = fakeContext();
    drawBadge(g, BRANDS[key], 256, 256);
    return g.calls.filter(([c]) => c === 'fillText').map(([, t]) => t).join('');
  };
  assert.equal(letters('lamborghini'), 'LAMBORGHINI');
  assert.equal(letters('ferrari'), 'SF');
  assert.equal(letters('bugatti'), 'EBBUGATTI');
  assert.equal(letters('mclaren'), 'McLaren');
  assert.equal(letters('hero'), 'M');
});

test('the badge art loads nothing from the internet: only the logos saved in icons/brands', () => {
  for (const file of ['js/badgeArt.js', 'js/brands.js', 'js/brandLogos.js']) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /https?:\/\/|fetch\(/, file);
  }
  const loader = readFileSync(new URL('../js/brandLogos.js', import.meta.url), 'utf8');
  const files = [...loader.matchAll(/'(icons\/brands\/[^']+)'/g)].map(m => m[1]);
  assert.equal(files.length, 4);
  for (const f of files) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
});

test('once a real logo has loaded, its badge draws that logo instead of the look-alike', () => {
  const logo = { naturalWidth: 200, naturalHeight: 100 };
  for (const emblem of ['bull', 'horse', 'eb', 'speedmark']) setBrandLogo(emblem, logo);
  for (const key of ['lamborghini', 'ferrari', 'bugatti', 'mclaren']) {
    const g = fakeContext();
    drawBadge(g, BRANDS[key], 256, 256);
    const draws = g.calls.filter(([c]) => c === 'drawImage');
    assert.equal(draws.length, 1, key);
    const [, image, x, y, w, h] = draws[0];
    assert.equal(image, logo, key);
    assert.ok(x >= 0 && y >= 0 && x + w <= 256.001 && y + h <= 256.001, `${key} fits the badge`);
    assert.ok(Math.abs(w / h - 2) < 1e-9, `${key} keeps the logo's shape`);
  }
  const hero = fakeContext();
  drawBadge(hero, BRANDS.hero, 256, 256);
  assert.ok(!hero.calls.some(([c]) => c === 'drawImage'), 'his own star stays drawn in code');
});
