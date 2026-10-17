import { ajustes, guardarAjustes } from '../nucleo/almacen.js'
import { $, escaparHtml } from '../nucleo/utilidades.js'

// El punto propio de la práctica de ruteo en auto (su casa, su trabajo): todas las rutas parten de él o llegan a él.
// Se busca con Nominatim (OpenStreetMap) y se guarda solo en este navegador.
const NOMINATIM =
  'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=cl&viewbox=-70.95,-33.25,-70.40,-33.75&bounded=1&q='

const nombreCorto = ({ name: nombre, address: direccion = {} }) => {
  const calle = direccion.road && [direccion.road, direccion.house_number].filter(Boolean).join(' ')
  const comuna = direccion.city || direccion.town || direccion.suburb
  return [nombre || calle, comuna].filter(Boolean).join(', ')
}

async function buscarDirecciones(texto) {
  const respuesta = await fetch(NOMINATIM + encodeURIComponent(texto))
  if (!respuesta.ok) throw new Error(`Nominatim respondió ${respuesta.status}`)
  return (await respuesta.json()).map(resultado => ({
    nombre: nombreCorto(resultado),
    detalle: resultado.display_name,
    lat: +(+resultado.lat).toFixed(5),
    lon: +(+resultado.lon).toFixed(5),
  }))
}

const htmlDelPuntoElegido = ({ nombre, sentido }) => `<div class="punto-propio">
    <span>📍 <b>${escaparHtml(nombre)}</b></span>
    <select id="sentidoDelPunto">
      <option value="desde" ${sentido !== 'hacia' ? 'selected' : ''}>Partir siempre de aquí</option>
      <option value="hacia" ${sentido === 'hacia' ? 'selected' : ''}>Llegar siempre aquí</option>
    </select>
    <button class="btn sec small" id="quitarPunto">Quitar</button>
  </div>`

const htmlDelBuscador = () => `<form class="row" id="buscarPunto">
    <input type="text" id="textoDelPunto" placeholder="Tu dirección (ej.: Av. Grecia 2000, Ñuñoa)" autocomplete="off">
    <button class="btn small">Buscar</button>
  </form>
  <div id="resultadosDelPunto"></div>`

export const htmlDelPuntoDeRuteo = () => `<label>Tu punto fijo (práctica en auto)</label>
  <div id="puntoDeRuteo">${ajustes.puntoDeRuteo ? htmlDelPuntoElegido(ajustes.puntoDeRuteo) : htmlDelBuscador()}</div>
  <p class="muted nota">Las rutas de la práctica en auto parten de tu punto o llegan a él. Se guarda solo en este navegador; la ronda oficial usa siempre las rutas de todos.</p>`

function fijarPunto(punto, alCambiar) {
  ajustes.puntoDeRuteo = punto
  guardarAjustes()
  alCambiar()
}

function mostrarResultados(resultados, alCambiar) {
  const caja = $('#resultadosDelPunto')
  if (!resultados.length) {
    caja.innerHTML = '<p class="muted nota">No encontré esa dirección en Santiago.</p>'
    return
  }
  caja.innerHTML = resultados
    .map(
      (resultado, indice) =>
        `<button class="opt" data-indice="${indice}" title="${escaparHtml(resultado.detalle)}">📍 ${escaparHtml(resultado.nombre)}</button>`,
    )
    .join('')
  for (const boton of caja.querySelectorAll('[data-indice]'))
    boton.onclick = () => {
      const { nombre, lat, lon } = resultados[+boton.dataset.indice]
      fijarPunto({ nombre, lat, lon, sentido: 'desde' }, alCambiar)
    }
}

// alCambiar vuelve a dibujar la tarjeta cuando se elige, cambia o quita el punto.
export function conectarPuntoDeRuteo(alCambiar) {
  const sentido = $('#sentidoDelPunto')
  if (sentido) {
    sentido.onchange = () => fijarPunto({ ...ajustes.puntoDeRuteo, sentido: sentido.value }, alCambiar)
    $('#quitarPunto').onclick = () => fijarPunto(null, alCambiar)
    return
  }
  const formulario = $('#buscarPunto')
  if (!formulario) return
  formulario.onsubmit = async evento => {
    evento.preventDefault()
    const texto = $('#textoDelPunto').value.trim()
    if (!texto) return
    $('#resultadosDelPunto').innerHTML = '<p class="muted nota">Buscando…</p>'
    try {
      mostrarResultados(await buscarDirecciones(texto), alCambiar)
    } catch {
      $('#resultadosDelPunto').innerHTML = '<p class="muted nota">No pude buscar: revisa tu conexión.</p>'
    }
  }
}
