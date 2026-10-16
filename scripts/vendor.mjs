// Copies the run-time libraries and the font out of node_modules, so the game needs no internet.
// Run after changing those packages: npm run vendor.
import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const nm = join(root, 'node_modules');

function copy(from, to) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(join(nm, from), join(root, to));
}

// three: the core module and the addons the game imports, following their relative imports.
copy('three/build/three.module.js', 'vendor/three/build/three.module.js');
const addons = ['controls/OrbitControls.js', 'utils/BufferGeometryUtils.js'];
const seen = new Set();
while (addons.length) {
  const file = addons.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  copy(`three/examples/jsm/${file}`, `vendor/three/examples/jsm/${file}`);
  const text = readFileSync(join(nm, 'three/examples/jsm', file), 'utf8');
  for (const [, rel] of text.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) addons.push(join(dirname(file), rel));
}

copy('cannon-es/dist/cannon-es.js', 'vendor/cannon-es/cannon-es.js');

for (const weight of [500, 600, 700]) {
  copy(`@fontsource/fredoka/files/fredoka-latin-${weight}-normal.woff2`, `fonts/fredoka-${weight}.woff2`);
}

console.log(`vendored three (+${seen.size} addons), cannon-es and Fredoka`);
