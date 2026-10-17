import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { swManifest, swScripts, SW_HEADERS } from '../scripts/swManifest.mjs';

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

// Runs the real sw.js install in a pretend browser whose network is a cache (like Cloudflare)
// that still holds yesterday's copy of every plain address.
async function installWith({ version = 'v2', fail = null } = {}) {
  const listeners = {};
  const stored = new Map();
  const asked = [];
  const self = {
    SW_FILES: { version, files: ['./', 'index.html', 'js/main.js'] },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: async () => {},
  };
  const caches = { open: async () => ({ put: async (key, res) => { stored.set(key, await res.text()); } }) };
  const fetch = async (url, init) => {
    asked.push({ url, cache: init?.cache });
    const [path, query] = url.split('?');
    if (path === fail) return new Response('nope', { status: 500 });
    return new Response(query ? `fresh ${path} ${query}` : `stale ${path}`);
  };
  new Function('self', 'caches', 'fetch', 'importScripts', readFileSync(join(root, 'sw.js'), 'utf8'))(self, caches, fetch, () => {});
  let done;
  listeners.install({ waitUntil: p => { done = p; } });
  await done;
  return { stored, asked };
}

test('a new version downloads every file at its own address, so a stale copy in Cloudflare is never used', async () => {
  const { stored, asked } = await installWith({ version: 'abc123' });
  assert.deepEqual([...stored.keys()].sort(), ['./', 'index.html', 'js/main.js']);
  for (const [key, body] of stored) assert.equal(body, `fresh ${key} v=abc123`);
  assert.ok(asked.every(a => a.cache === 'reload'), "the browser's own cache is skipped too");
});

test('one file failing means this version does not install (the old one stays)', async () => {
  await assert.rejects(installWith({ fail: 'js/main.js' }));
});

test('the update-check files are never stored by Cloudflare or the browser', () => {
  assert.match(SW_HEADERS['Cache-Control'], /no-store/);
  assert.match(SW_HEADERS['Cloudflare-CDN-Cache-Control'], /no-store/);
  assert.match(readFileSync(join(root, 'server.js'), 'utf8'), /SW_HEADERS/);
});
