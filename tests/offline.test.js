import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(root, p), 'utf8');
const html = read('index.html');
const cssFiles = readdirSync(join(root, 'css')).filter(f => f.endsWith('.css')).map(f => `css/${f}`);

test('the page and its styles never reach out to another host', () => {
  for (const [name, text] of [['index.html', html], ...cssFiles.map(f => [f, read(f)])]) {
    assert.doesNotMatch(text, /https?:\/\//, `${name} links to another host`);
  }
});

test('every import-map target is a local file that exists', () => {
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const [name, target] of Object.entries(map)) {
    assert.match(target, /^\.\/vendor\//, `${name} → ${target}`);
    if (!name.endsWith('/')) assert.ok(existsSync(join(root, target)), target);
  }
  for (const addon of ['controls/OrbitControls.js', 'utils/BufferGeometryUtils.js']) {
    assert.ok(existsSync(join(root, map['three/addons/'], addon)), addon);
  }
  assert.ok(existsSync(join(root, 'vendor/three/build/three.module.js')));
  assert.ok(existsSync(join(root, 'vendor/cannon-es/cannon-es.js')));
});

test('every @font-face file exists', () => {
  const urls = cssFiles.flatMap(f => [...read(f).matchAll(/@font-face\s*{[^}]*url\(['"]?([^'")]+)['"]?\)/g)].map(m => join('css', m[1])));
  assert.ok(urls.length >= 3, 'Fredoka 500, 600 and 700');
  for (const u of urls) assert.ok(existsSync(join(root, u)), u);
});
