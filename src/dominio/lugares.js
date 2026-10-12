import { distanciaKm, distanciaALinea } from '../nucleo/geografia.js'
import { ajustes } from '../nucleo/almacen.js'
import { escaparHtml } from '../nucleo/utilidades.js'
import { DATOS, callePorNombre } from '../datos/datos.js'
import { COLORES, dibujarCalle } from '../mapa/dibujo.js'
import { capa, fijarModoDeEtiquetas } from '../mapa/mapa.js'
import { htmlDeFoto } from '../interfaz/fotos.js'
import { textoDeComunas } from './metro.js'

const EMOJI_DE_CATEGORIA = {
  Universidades: '🎓',
  Colegios: '🏫',
  Salud: '🏥',
  'Cerros y parques': '🌳',
  Deporte: '🏟️',
  'Malls y edificios': '🏬',
  Barrios: '🏘️',
  Cultura: '🎭',
  Transporte: '🚉',
  'Restaurantes y bares': '🍽️',
  'Gobierno y justicia': '🏛️',
  Religión: '🛐',
  'Ríos y canales': '🌊',
  'Centro histórico': '🏛️',
}
const emojiDe = lugar => EMOJI_DE_CATEGORIA[lugar.cat] || '📍'
const posicionDe = lugar => [lugar.lat, lugar.lon]

export const conjuntoDeLugares = () =>
  DATOS.landmarks.filter(lugar => !ajustes.cats || ajustes.cats.includes(lugar.cat))

export const lugarEnComuna = (lugar, comuna) => lugar.comuna === comuna || (lugar.alt || []).includes(comuna)

export function lineaDeZona(zona) {
  const calles = zona.streets.length
    ? `<p><b>${zona.axis ? 'Su eje:' : 'Lo rodean:'}</b> ${zona.streets.map(escaparHtml).join(' · ')}</p>`
    : ''
  const advertencia = zona.approx
    ? '<p class="muted" style="font-size:12.5px">Zona aproximada: este sector no tiene límites oficiales.</p>'
    : ''
  return calles + advertencia
}

export function infoDeLugar(lugar) {
  return `<p><b>${escaparHtml(lugar.name)}</b> — ${textoDeComunas(lugar)}</p>
    <p class="muted">${escaparHtml(lugar.desc || '')}</p>
    ${lugar.zone ? lineaDeZona(lugar.zone) : ''}
    ${lugar.car ? `<p><b>Qué se estudia:</b> ${escaparHtml(lugar.car)}</p>` : ''}
    ${htmlDeFoto(lugar.pk || 'l:' + lugar.name)}`
}

// Al responder: el perímetro del barrio o el cauce del río o canal.
export function mostrarZona(lugar) {
  if (lugar.line) dibujarCalle(callePorNombre[lugar.name], COLORES.ok)
  if (!lugar.zone) return
  L.polygon(lugar.zone.poly, {
    pane: 'comunas',
    color: '#b45309',
    weight: 3,
    dashArray: lugar.zone.approx ? '6 6' : null,
    fillColor: COLORES.hi,
    fillOpacity: 0.25,
    interactive: false,
  }).addTo(capa)
  fijarModoDeEtiquetas('streets')
}

function agregarMarcadorDeEmoji(lugar) {
  const icono = L.divIcon({
    className: '',
    html: `<div class="emo">${emojiDe(lugar)}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
  L.marker(posicionDe(lugar), { icon: icono, pane: 'points', interactive: false })
    .addTo(capa)
    .bindTooltip(escaparHtml(lugar.name), {
      permanent: true,
      direction: 'right',
      offset: [12, 0],
      className: 'lbl',
    })
}

// De una lista ordenada por cercanía, toma los primeros que no se amontonen en el mapa.
// Solo se descartan los que quedan prácticamente uno encima del otro.
const SEPARACION_MINIMA_KM = 0.08

function elegirEspaciados(lugaresOrdenados, maximo, separacionMinimaKm = SEPARACION_MINIMA_KM) {
  const elegidos = []
  for (const lugar of lugaresOrdenados) {
    if (elegidos.length >= maximo) break
    if (elegidos.every(otro => distanciaKm(posicionDe(otro), posicionDe(lugar)) > separacionMinimaKm))
      elegidos.push(lugar)
  }
  return elegidos
}

function lugaresMasCercanos(distanciaDe, minKm, maxKm) {
  return DATOS.landmarks
    .map(lugar => ({ landmark: lugar, distance: distanciaDe(lugar) }))
    .filter(entrada => entrada.distance > minKm && entrada.distance <= maxKm)
    .sort((a, b) => a.distance - b.distance)
    .map(entrada => entrada.landmark)
}

export function mostrarLugaresCercanos(lugar, maximo = 8) {
  const origen = posicionDe(lugar)
  const cercanos = lugaresMasCercanos(otro => distanciaKm(origen, posicionDe(otro)), 0.12, 1.5)
  elegirEspaciados(
    cercanos.filter(otro => otro !== lugar),
    maximo,
  ).forEach(agregarMarcadorDeEmoji)
}

// Un lugar está "en" la calle solo si queda pegado a ella; más allá, a lo más "cerca".
const PEGADO_KM = 0.05
const CERCA_KM = 0.3

export function lugaresPegados(calle, maximo = 8) {
  const alAlcance = lugaresMasCercanos(lugar => distanciaALinea(posicionDe(lugar), calle.lines), -1, CERCA_KM)
  const espaciados = elegirEspaciados(alAlcance, maximo)
  const estaPegado = lugar => distanciaALinea(posicionDe(lugar), calle.lines) <= PEGADO_KM
  return { beside: espaciados.filter(estaPegado), nearby: espaciados.filter(lugar => !estaPegado(lugar)) }
}

const nombresDe = lugares => lugares.map(lugar => `${emojiDe(lugar)} ${escaparHtml(lugar.name)}`).join(' · ')

export function mostrarLugaresAlLargo(calle) {
  const { beside: pegados, nearby: cercanos } = lugaresPegados(calle)
  pegados.concat(cercanos).forEach(agregarMarcadorDeEmoji)
  const lineas = []
  if (pegados.length) lineas.push(`<p><b>En esta calle:</b> ${nombresDe(pegados)}</p>`)
  if (cercanos.length) lineas.push(`<p><b>Cerca (no sobre la calle):</b> ${nombresDe(cercanos)}</p>`)
  return lineas.join('')
}
