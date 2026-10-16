import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));

// Width and height from a PNG's IHDR chunk.
function pngSize(path) {
  const b = readFileSync(join(root, path));
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} is a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('the manifest makes an installable full-screen landscape app', () => {
  assert.equal(manifest.name, 'Brick Racers');
  assert.equal(manifest.short_name, 'Brick Racers');
  assert.equal(typeof manifest.id, 'string');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'fullscreen');
  assert.equal(manifest.orientation, 'landscape');
});

test('manifest icons: 192 and 512 for any use, 512 maskable, and every file is a PNG of that size', () => {
  const has = (size, purpose) => manifest.icons.some(i => i.sizes === `${size}x${size}` && (i.purpose ?? 'any') === purpose);
  assert.ok(has(192, 'any') && has(512, 'any') && has(512, 'maskable'));
  for (const icon of manifest.icons) {
    const n = Number(icon.sizes.split('x')[0]);
    assert.equal(icon.type, 'image/png');
    assert.ok(existsSync(join(root, icon.src)), icon.src);
    assert.deepEqual(pngSize(icon.src), [n, n], icon.src);
  }
});

test('Safari gets a 180 px home-screen icon', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const href = html.match(/<link rel="apple-touch-icon" href="([^"]+)">/)?.[1];
  assert.ok(href, 'apple-touch-icon link');
  assert.deepEqual(pngSize(href), [180, 180]);
});
