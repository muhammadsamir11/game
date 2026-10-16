import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname, networkInterfaces } from 'node:os';
import { swScripts } from './scripts/swManifest.mjs';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// The offline helper and its list of game files, made from what is on this server right now.
const offline = swScripts(ROOT);

http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath.endsWith('/sw.js') || urlPath.endsWith('/sw-files.js')) {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(urlPath.endsWith('/sw.js') ? offline.swJs : offline.swFilesJs);
    return;
  }
  const file = join(ROOT, normalize(urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath));
  if (!file.startsWith(ROOT) || file.includes(`${sep}node_modules${sep}`) || file.includes(`${sep}.git${sep}`)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Brick Racers is running!`);
  console.log(`  On this computer: http://localhost:${PORT}`);
  // The .local name stays the same when the router hands the Mac a new IP address, so saved cars stay put.
  const bonjour = hostname().replace(/\.local$/i, '');
  console.log(`  On the iPad (best, same Wi-Fi): http://${bonjour}.local:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) console.log(`  Or by number: http://${net.address}:${PORT}`);
    }
  }
});
