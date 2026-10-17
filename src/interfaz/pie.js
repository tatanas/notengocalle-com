import { DATOS } from '../datos/datos.js'
import { escaparHtml } from '../nucleo/utilidades.js'

const enlace = (href, texto) => `<a href="${href}" target="_blank" rel="noopener">${texto}</a>`

// Créditos, privacidad y autor: al final del menú, del ranking y de Mi progreso.
export const htmlDelPie = () =>
  `<p class="foot">Mapas y datos: © ${enlace('https://www.openstreetmap.org/copyright', 'OpenStreetMap')} (ODbL),
    mapa base © ${enlace('https://openfreemap.org', 'OpenFreeMap')} / OpenMapTiles, rutas en auto: ${enlace('https://valhalla.github.io/valhalla/', 'Valhalla')} (FOSSGIS),
    recorridos: Red (DTPM), relieve: AWS Terrain Tiles, fotos: autores indicados en cada foto vía
    ${enlace('https://commons.wikimedia.org', 'Wikimedia Commons')} y ${enlace('https://panoramax.fr', 'Panoramax')}.
    Datos generados el ${escaparHtml(DATOS.built)}. ${enlace('/privacidad.html', 'Privacidad')}.</p>
  <p class="foot">Hecho a punta de Claude por ${enlace('https://github.com/tatanas', 'tatanas')}.</p>`
