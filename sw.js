// Brick Racers offline helper: keeps a copy of every game file, so the game opens and plays without internet.
// server.js serves this with the current version stamped at the end, and serves sw-files.js from the files it has.
importScripts('sw-files.js');
const { version, files } = self.SW_FILES;
const CACHE = `brick-racers-${version}`;

self.addEventListener('install', event => {
  // All or nothing: if any file fails to download, this version doesn't install and the old one stays.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(files)).then(() => self.skipWaiting()));
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
