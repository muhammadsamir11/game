// The offline helper's file list and version, built from the files actually on the server.
// server.js calls this when it starts, so a deploy can never ship a stale or wrong list.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export function swManifest(root) {
  const walk = dir => readdirSync(join(root, dir)).flatMap(name => {
    const p = `${dir}/${name}`;
    if (name.startsWith('.')) return [];
    return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
  });
  const files = ['index.html', 'manifest.webmanifest', ...['css', 'js', 'vendor', 'fonts', 'icons'].flatMap(walk)].sort();
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
  return { version: hash.digest('hex').slice(0, 12), files: ['./', ...files] };
}

// Headers for /sw.js and /sw-files.js: never stored, not by the browser and not by Cloudflare in front
// of the server, or tablets could keep being told about an old version.
export const SW_HEADERS = {
  'Content-Type': 'text/javascript; charset=utf-8',
  'Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
};

// What the server sends for /sw-files.js and /sw.js. The version is stamped into sw.js itself,
// because browsers decide "is there a new worker?" by comparing sw.js byte for byte.
export function swScripts(root) {
  const manifest = swManifest(root);
  return {
    version: manifest.version,
    swFilesJs: `self.SW_FILES = ${JSON.stringify(manifest)};\n`,
    swJs: `${readFileSync(join(root, 'sw.js'), 'utf8')}\n// version ${manifest.version}\n`,
  };
}
