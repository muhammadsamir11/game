import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname, networkInterfaces } from 'node:os';
import { swScripts } from './scripts/swManifest.mjs';
import { createLobby } from './server/rooms.js';
import { MAX_MESSAGE_BYTES } from './js/net/protocol.js';

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

const server = http.createServer(async (req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request'); // a broken address must not take the rooms down with it
    return;
  }
  if (urlPath.endsWith('/sw.js') || urlPath.endsWith('/sw-files.js')) {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(urlPath.endsWith('/sw.js') ? offline.swJs : offline.swFilesJs);
    return;
  }
  const file = join(ROOT, normalize(urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath));
  if (!file.startsWith(ROOT) || file.includes(`${sep}node_modules${sep}`) || file.includes(`${sep}.git${sep}`) || file.startsWith(join(ROOT, 'server') + sep)) {
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
});

await startPlayTogether(server);

server.listen(PORT, '0.0.0.0', () => {
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

// Play together: tablets connect to /play and the lobby passes messages between friends in the same room.
// If the ws package is missing (an install that skipped dependencies) the game is still served, just solo.
async function startPlayTogether(httpServer) {
  let WebSocketServer;
  try {
    ({ WebSocketServer } = await import('ws'));
  } catch {
    console.log('Play together is off: run npm install to add the ws package.');
    return;
  }
  const lobby = createLobby();
  const wss = new WebSocketServer({ server: httpServer, path: '/play', maxPayload: MAX_MESSAGE_BYTES });
  wss.on('connection', (ws, req) => {
    // Behind Dokploy's proxy every tablet seems to come from the proxy, so use the address it passes on.
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress;
    const conn = lobby.connect(msg => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    }, { ip });
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', data => {
      // One odd message must never stop the server (and every room on it).
      try {
        conn.receive(JSON.parse(data));
      } catch (err) {
        console.error('Play together: dropped a bad message', err.message);
      }
    });
    ws.on('close', () => conn.close());
    ws.on('error', () => ws.terminate());
  });
  setInterval(() => lobby.tick(), 250).unref();
  // A tablet that went to sleep never says goodbye: ping everyone and drop the ones that don't answer.
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 20_000).unref();
  console.log('Play together is on (/play).');
}
