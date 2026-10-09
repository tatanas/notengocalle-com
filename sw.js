// Service worker: guarda la app para que abra rápido y sin conexión (el mapa base igual necesita internet).
const CACHE = 'ubicate-v30';
const ASSETS = ['./', 'index.html', 'css/style.css', 'js/app.js', 'data/data.js', 'manifest.webmanifest',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/maplibre/maplibre-gl.js', 'vendor/maplibre/maplibre-gl.css',
  'vendor/maplibre/leaflet-maplibre-gl.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // teselas: que las maneje el navegador
  // red primero (para recibir actualizaciones), caché como respaldo
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
