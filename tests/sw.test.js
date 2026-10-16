import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const walk = dir => readdirSync(join(root, dir)).flatMap(name => {
  const p = `${dir}/${name}`;
  if (name.startsWith('.')) return [];
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
});

// The rule: the page, its manifest, and every file under the game's folders.
const expected = ['index.html', 'manifest.webmanifest', ...['css', 'js', 'vendor', 'fonts', 'icons'].flatMap(walk)].sort();

function loadList() {
  const self = {};
  new Function('self', readFileSync(join(root, 'sw-files.js'), 'utf8'))(self);
  return self.SW_FILES;
}

test('the offline list has exactly the game files (run `npm run sw` after changing files)', () => {
  const { files } = loadList();
  assert.deepEqual(files.filter(f => f !== './').sort(), expected);
  assert.ok(files.includes('./'), 'the start page');
});

test('the offline version is the hash of those files, so any change makes a new cache', () => {
  const hash = createHash('sha256');
  for (const f of expected) hash.update(f).update(readFileSync(join(root, f)));
  assert.equal(loadList().version, hash.digest('hex').slice(0, 12));
});

test('the service worker caches that list under a versioned name', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.match(sw, /importScripts\(['"]sw-files\.js['"]\)/);
  assert.match(sw, /brick-racers-/);
  assert.match(sw, /SW_FILES/);
  assert.ok(existsSync(join(root, 'js/install.js')));
});
