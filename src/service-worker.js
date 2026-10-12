/* global BUILD */
// Deja el juego guardado para abrir rápido y sin conexión (el mapa base igual necesita internet).
// BUILD = { version, files } lo antepone el build (dev/serviceWorkerPlugin.js).
const CACHE = 'ntc-' + BUILD.version

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(cache => cache.addAll(BUILD.files)))
  self.skipWaiting()
})

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches
      .keys()
      .then(nombres =>
        Promise.all(nombres.filter(nombre => nombre !== CACHE).map(nombre => caches.delete(nombre))),
      ),
  )
  self.clients.claim()
})

async function primeroRedLuegoCache(solicitud) {
  try {
    const respuesta = await fetch(solicitud)
    const copia = respuesta.clone()
    caches.open(CACHE).then(cache => cache.put(solicitud, copia))
    return respuesta
  } catch {
    return caches.match(solicitud)
  }
}

const primeroCacheLuegoRed = async solicitud => (await caches.match(solicitud)) || fetch(solicitud)

self.addEventListener('fetch', evento => {
  const { request: solicitud } = evento
  const url = new URL(solicitud.url)
  // Las teselas del mapa y el API de cuentas van siempre directo a la red.
  if (solicitud.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  // Los archivos de /assets llevan un hash en el nombre: nunca cambian, así que el caché basta.
  // El resto (index.html, datos) pide primero a la red para recibir actualizaciones.
  const contestar = url.pathname.startsWith('/assets/') ? primeroCacheLuegoRed : primeroRedLuegoCache
  evento.respondWith(contestar(solicitud))
})
