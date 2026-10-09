/* global BUILD */
// Deja el juego guardado para abrir rápido y sin conexión (el mapa base igual necesita internet).
// BUILD = { version, files } lo antepone el build (dev/serviceWorkerPlugin.js).
const CACHE = 'ntc-' + BUILD.version

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(BUILD.files)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)))),
  )
  self.clients.claim()
})

async function fromNetworkThenCache(request) {
  try {
    const response = await fetch(request)
    const copy = response.clone()
    caches.open(CACHE).then(cache => cache.put(request, copy))
    return response
  } catch {
    return caches.match(request)
  }
}

const fromCacheThenNetwork = async request => (await caches.match(request)) || fetch(request)

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  // Las teselas del mapa y el API de cuentas van siempre directo a la red.
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  // Los archivos de /assets llevan un hash en el nombre: nunca cambian, así que el caché basta.
  // El resto (index.html, datos) pide primero a la red para recibir actualizaciones.
  const respond = url.pathname.startsWith('/assets/') ? fromCacheThenNetwork : fromNetworkThenCache
  event.respondWith(respond(request))
})
