import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { swManifest, swScripts } from '../scripts/swManifest.mjs';

const root = new URL('..', import.meta.url).pathname;
const walk = dir => readdirSync(join(root, dir)).flatMap(name => {
  const p = `${dir}/${name}`;
  if (name.startsWith('.')) return [];
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
});
// The rule: the page, its manifest, and every file under the game's folders, as they are on the server.
const expected = ['index.html', 'manifest.webmanifest', ...['css', 'js', 'vendor', 'fonts', 'icons'].flatMap(walk)].sort();

test('the offline list is built from the files actually on the server', () => {
  const { files } = swManifest(root);
  assert.deepEqual(files.filter(f => f !== './').sort(), expected);
  assert.ok(files.includes('./'));
});

test('the version is the hash of those files', () => {
  const hash = createHash('sha256');
  for (const f of expected) hash.update(f).update(readFileSync(join(root, f)));
  assert.equal(swManifest(root).version, hash.digest('hex').slice(0, 12));
});

test('the served sw.js carries the version, so browsers see a new worker whenever any game file changes', () => {
  const { swJs, swFilesJs } = swScripts(root);
  const { version } = swManifest(root);
  assert.ok(swJs.startsWith(readFileSync(join(root, 'sw.js'), 'utf8')));
  assert.match(swJs, new RegExp(`version ${version}`));
  const self = {};
  new Function('self', swFilesJs)(self);
  assert.equal(self.SW_FILES.version, version);
});

test('no hand-made list is committed (it could go stale)', () => {
  assert.equal(existsSync(join(root, 'sw-files.js')), false);
  const server = readFileSync(join(root, 'server.js'), 'utf8');
  assert.match(server, /swScripts/);
});
