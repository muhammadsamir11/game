// Draws the app icons (a red brick racer on sky blue) and writes them as PNGs, with no image libraries.
// Run: node scripts/icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255, 255];
const rect = (x0, y0, x1, y1, r = 0) => (x, y) => {
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && dx * dx + dy * dy <= r * r;
};
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// Layers painted in order; coordinates are fractions of the icon.
function layers(full) {
  return [
    [full ? rect(0, 0, 1, 1) : rect(0, 0, 1, 1, 0.2), hex(0x8fd3ff)],
    [rect(0, 0.72, 1, 1, 0), full ? hex(0x6fcf5f) : null], // grass, only on the full-bleed icon
    [rect(0.31, 0.27, 0.63, 0.46, 0.04), hex(0xc62828)], // cabin
    [rect(0.36, 0.31, 0.58, 0.43, 0.02), hex(0xbfe6ff)], // window
    [circle(0.38, 0.27, 0.035), hex(0xc62828)], // studs on the cabin
    [circle(0.56, 0.27, 0.035), hex(0xc62828)],
    [rect(0.15, 0.44, 0.85, 0.66, 0.05), hex(0xe53935)], // body
    [circle(0.22, 0.44, 0.035), hex(0xe53935)], // studs on the body
    [circle(0.72, 0.44, 0.035), hex(0xe53935)],
    [circle(0.8, 0.44, 0.035), hex(0xe53935)],
    [rect(0.78, 0.5, 0.85, 0.56, 0.01), hex(0xfff6c0)], // headlight
    [circle(0.3, 0.67, 0.11), hex(0x1b1b1b)], // wheels
    [circle(0.7, 0.67, 0.11), hex(0x1b1b1b)],
    [circle(0.3, 0.67, 0.05), hex(0xdddddd)],
    [circle(0.7, 0.67, 0.05), hex(0xdddddd)],
  ].filter(([, color]) => color);
}

function draw(size, { full = false, inset = 0 } = {}) {
  const shapes = layers(full);
  const rgba = Buffer.alloc(size * size * 4);
  const S = 4; // 4×4 samples per pixel for smooth edges
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          let x = (px + (sx + 0.5) / S) / size;
          let y = (py + (sy + 0.5) / S) / size;
          let color = null;
          for (const [inside, c] of shapes) {
            const isBackground = c === shapes[0][1] || (full && c === shapes[1]?.[1]);
            // the car shrinks toward the middle on maskable icons, so it stays inside the safe zone
            const ux = isBackground ? x : 0.5 + (x - 0.5) / (1 - inset);
            const uy = isBackground ? y : 0.5 + (y - 0.5) / (1 - inset);
            if (inside(ux, uy)) color = c;
          }
          if (color) for (let k = 0; k < 4; k++) acc[k] += k === 3 ? 255 : color[k] * 255;
        }
      }
      const a = acc[3] / (S * S);
      const i = (py * size + px) * 4;
      if (a > 0) for (let k = 0; k < 3; k++) rgba[i + k] = Math.round(acc[k] / acc[3]);
      rgba[i + 3] = Math.round(a);
    }
  }
  return png(size, rgba);
}

mkdirSync(join(root, 'icons'), { recursive: true });
writeFileSync(join(root, 'icons/icon-192.png'), draw(192));
writeFileSync(join(root, 'icons/icon-512.png'), draw(512));
writeFileSync(join(root, 'icons/maskable-512.png'), draw(512, { full: true, inset: 0.2 }));
writeFileSync(join(root, 'icons/apple-touch-icon.png'), draw(180, { full: true }));
console.log('icons written');
