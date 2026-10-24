import { empezarEn } from '../dominio/conduccion.js'
import { detenerPartida } from '../juego/engine.js'
import { encuadrarCiudad, fijarModoDeEtiquetas, limpiarCapa, mapa } from '../mapa/mapa.js'
import { ajustes } from '../nucleo/almacen.js'
import { $, escaparHtml } from '../nucleo/utilidades.js'
import { cargarElGrafo, conducir, dejarDeConducir } from './conductor.js'
import { definirPantalla } from './navegacion.js'
import { mostrarPanel, ocultarPanel, ocultarPantalla } from './panel.js'
import { buscarDirecciones } from './puntoDeRuteo.js'

// Conducir libre (experimental, solo en desarrollo; pestaña "Conducir"): se parte donde se quiera (una dirección, un toque en el mapa
// o el punto fijo del ruteo) y en cada cruce se elige qué hacer, viendo la calle en Street View. Sin misión ni puntaje. El juego
// de ruteo en auto, que sí tiene rutas, puntaje y ranking, es src/juego/modos/ruteoEnAuto.js.
const ZOOM_AL_CONDUCIR = 17

function mostrarFormularioDePartida(mensaje = '') {
  dejarDeConducir()
  limpiarCapa()
  const puntoFijo = ajustes.puntoDeRuteo
  mostrarPanel(`<h4>🚗 Conducir libre</h4>
    <p class="muted nota">Sin misión: partes donde quieras y en cada cruce eliges qué hacer. Experimental.</p>
    ${mensaje ? `<p class="nota">${escaparHtml(mensaje)}</p>` : ''}
    <form class="row" id="cdBuscar">
      <input type="text" id="cdTexto" placeholder="Dirección (ej.: Av. Grecia 2000, Ñuñoa)" autocomplete="off">
      <button class="btn small">Buscar</button>
    </form>
    <div id="cdResultados"></div>
    ${puntoFijo ? `<button class="opt" id="cdDesdeMiPunto">📍 Desde tu punto fijo: ${escaparHtml(puntoFijo.nombre)}</button>` : ''}
    <p class="muted nota">O toca el mapa para partir desde ahí.</p>`)
  $('#cdBuscar').onsubmit = buscarPartida
  if (puntoFijo) $('#cdDesdeMiPunto').onclick = () => partirDesde([puntoFijo.lat, puntoFijo.lon])
}

async function buscarPartida(evento) {
  evento.preventDefault()
  const texto = $('#cdTexto').value.trim()
  if (!texto) return
  $('#cdResultados').innerHTML = '<p class="muted nota">Buscando…</p>'
  try {
    let resultados = await buscarDirecciones(texto)
    const sinLaComuna = texto.split(',')[0].trim()
    if (!resultados.length && sinLaComuna !== texto) resultados = await buscarDirecciones(sinLaComuna)
    $('#cdResultados').innerHTML = resultados.length
      ? resultados
          .map(
            (resultado, indice) =>
              `<button class="opt" data-i="${indice}" title="${escaparHtml(resultado.detalle)}">📍 ${escaparHtml(resultado.nombre)}</button>`,
          )
          .join('')
      : '<p class="muted nota">No encontré esa dirección en Santiago.</p>'
    for (const boton of document.querySelectorAll('#cdResultados [data-i]')) {
      const { lat, lon } = resultados[+boton.dataset.i]
      boton.onclick = () => partirDesde([lat, lon])
    }
  } catch {
    $('#cdResultados').innerHTML = '<p class="muted nota">No pude buscar: revisa tu conexión.</p>'
  }
}

async function partirDesde(punto) {
  mostrarPanel('<h4>🚗 Conducir libre</h4><p class="muted nota">Cargando las calles de Santiago…</p>')
  let grafo
  try {
    grafo = await cargarElGrafo()
  } catch (error) {
    return mostrarFormularioDePartida(error.message)
  }
  const nuevo = empezarEn(grafo, punto)
  if (!nuevo)
    return mostrarFormularioDePartida('No hay una calle cerca de ese punto en los datos descargados.')
  mapa.setView(punto, ZOOM_AL_CONDUCIR)
  conducir({ estado: nuevo, alSalir: () => mostrarFormularioDePartida() })
}

function abrirConducir() {
  detenerPartida()
  ocultarPantalla()
  limpiarCapa()
  fijarModoDeEtiquetas('labels')
  encuadrarCiudad()
  const alTocarElMapa = evento => partirDesde([evento.latlng.lat, evento.latlng.lng])
  mapa.on('click', alTocarElMapa)
  const inicio = new URLSearchParams(location.search).get('inicio')
  if (inicio) partirDesde(inicio.split(',').map(Number))
  else mostrarFormularioDePartida()
  return () => {
    mapa.off('click', alTocarElMapa)
    dejarDeConducir()
    ocultarPanel()
    limpiarCapa()
  }
}

definirPantalla('drive', abrirConducir)
