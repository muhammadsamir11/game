// Brick Racers offline helper: keeps a copy of every game file, so the game opens and plays without internet.
// server.js serves this with the current version stamped at the end, and serves sw-files.js from the files it has.
importScripts('sw-files.js');
const { version, files } = self.SW_FILES;
const CACHE = `brick-racers-${version}`;

self.addEventListener('install', event => {
  // Each file is fetched as file?v=<version>: a new address for every version, so an old copy kept by
  // Cloudflare (or the browser) can't sneak into it. It is kept under its plain address.
  // All or nothing: if any file fails to download, this version doesn't install and the old one stays.
  event.waitUntil((async () => {
    const downloads = await Promise.all(files.map(async file => {
      const response = await fetch(`${file}?v=${version}`, { cache: 'reload' });
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return [file, response];
    }));
    const cache = await caches.open(CACHE);
    await Promise.all(downloads.map(([file, response]) => cache.put(file, response)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('brick-racers-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') return (await cache.match('index.html')) ?? fetch(request);
    return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
  })());
});
