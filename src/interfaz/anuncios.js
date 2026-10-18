// Espacios de AdSense. Cada uno necesita su unidad de anuncio, creada en AdSense (Anuncios → Por unidad de anuncio →
// Anuncios de display) cuando aprueben el sitio: aquí va su número (data-ad-slot). Mientras esté vacío, ese espacio no
// aparece. Nunca hay anuncios durante una pregunta ni encima del mapa, y fuera de notengocalle.com tampoco.
const CLIENTE = 'ca-pub-4475367095699323'
const ESPACIOS = {
  menu: '', // banner chico arriba del menú, bajo el título
  resultado: '', // al terminar una ronda, debajo de los botones
  paginas: '', // al final del ranking y de Mi progreso, sobre el pie
}
const DOMINIO = 'notengocalle.com'
const enElSitioPublicado = () => location.hostname === DOMINIO || location.hostname.endsWith('.' + DOMINIO)

export function htmlDeAnuncio(lugar) {
  const espacio = ESPACIOS[lugar]
  if (!espacio || !enElSitioPublicado()) return ''
  return `<aside class="anuncio anuncio-${lugar}" aria-label="Publicidad">
    <span class="anuncio-etiqueta">Publicidad</span>
    <ins class="adsbygoogle anuncio-horizontal" style="display:inline-block" data-ad-client="${CLIENTE}" data-ad-slot="${espacio}"></ins>
  </aside>`
}

// Esta es una página de una sola vista: cada espacio nuevo que se dibuja hay que avisárselo a AdSense.
export function activarAnuncios(contenedor) {
  const nuevos = contenedor.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])').length
  for (let i = 0; i < nuevos; i++)
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // un bloqueador de anuncios u otro problema de AdSense no debe afectar el juego
    }
}
