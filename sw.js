const CACHE = 'inspiration-garden-v2';
const SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './assets/icon.png', './assets/garden-paper-background.png', './assets/crayon-meadow.png',
  './assets/flowers/sprouts.png', './assets/flowers/buds.png', './assets/flowers/blooms.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
