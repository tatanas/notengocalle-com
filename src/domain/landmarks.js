import { distanceKm, distanceToPolyline } from '../core/geo.js'
import { settings } from '../core/store.js'
import { escapeHtml } from '../core/util.js'
import { DATA } from '../data/dataset.js'
import { COLORS, drawMetro } from '../map/draw.js'
import { layer, setLabelMode } from '../map/map.js'
import { photoHtml } from '../ui/photos.js'
import { comunasText, linePill, selectedLines } from './metro.js'

const CATEGORY_EMOJI = {
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
  Metro: '🚇',
  'Centro histórico': '🏛️',
}
const emojiOf = landmark => CATEGORY_EMOJI[landmark.cat] || '📍'
const positionOf = landmark => [landmark.lat, landmark.lon]

export const landmarkPool = () =>
  DATA.landmarks.filter(
    landmark =>
      (!settings.cats || settings.cats.includes(landmark.cat)) &&
      (!landmark.metro || landmark.lines.some(id => selectedLines().includes(id))),
  )

export const landmarkInComuna = (landmark, comuna) =>
  landmark.comuna === comuna || (landmark.alt || []).includes(comuna)

export function zoneLine(zone) {
  const streets = zone.streets.length
    ? `<p><b>${zone.axis ? 'Su eje:' : 'Lo rodean:'}</b> ${zone.streets.map(escapeHtml).join(' · ')}</p>`
    : ''
  const disclaimer = zone.approx
    ? '<p class="muted" style="font-size:12.5px">Zona aproximada: este sector no tiene límites oficiales.</p>'
    : ''
  return streets + disclaimer
}

export function landmarkInfo(landmark) {
  const pills = landmark.metro ? ' ' + landmark.lines.map(linePill).join('') : ''
  return `<p><b>${escapeHtml(landmark.name)}</b>${pills} — ${comunasText(landmark)}</p>
    <p class="muted">${escapeHtml(landmark.desc || '')}</p>
    ${landmark.zone ? zoneLine(landmark.zone) : ''}
    ${landmark.car ? `<p><b>Qué se estudia:</b> ${escapeHtml(landmark.car)}</p>` : ''}
    ${photoHtml(landmark.pk || 'l:' + landmark.name)}`
}

// Al responder: el perímetro del barrio o, si es una estación, sus líneas.
export function showZone(landmark) {
  if (landmark.metro) drawMetro(layer, { ids: landmark.lines, dots: false, opacity: 0.7 })
  if (!landmark.zone) return
  L.polygon(landmark.zone.poly, {
    pane: 'comunas',
    color: '#b45309',
    weight: 3,
    dashArray: landmark.zone.approx ? '6 6' : null,
    fillColor: COLORS.hi,
    fillOpacity: 0.25,
    interactive: false,
  }).addTo(layer)
  setLabelMode('streets')
}

function addEmojiMarker(landmark) {
  const icon = L.divIcon({
    className: '',
    html: `<div class="emo">${emojiOf(landmark)}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
  L.marker(positionOf(landmark), { icon, pane: 'points', interactive: false })
    .addTo(layer)
    .bindTooltip(escapeHtml(landmark.name), {
      permanent: true,
      direction: 'right',
      offset: [12, 0],
      className: 'lbl',
    })
}

// De una lista ordenada por cercanía, toma los primeros que no se amontonen en el mapa.
// Solo se descartan los que quedan prácticamente uno encima del otro.
const MIN_GAP_KM = 0.08

function pickSpaced(sortedLandmarks, max, minGapKm = MIN_GAP_KM) {
  const chosen = []
  for (const landmark of sortedLandmarks) {
    if (chosen.length >= max) break
    if (chosen.every(other => distanceKm(positionOf(other), positionOf(landmark)) > minGapKm))
      chosen.push(landmark)
  }
  return chosen
}

function nearestLandmarks(distanceOf, minKm, maxKm) {
  return DATA.landmarks
    .filter(landmark => !landmark.metro)
    .map(landmark => ({ landmark, distance: distanceOf(landmark) }))
    .filter(entry => entry.distance > minKm && entry.distance <= maxKm)
    .sort((a, b) => a.distance - b.distance)
    .map(entry => entry.landmark)
}

export function showLandmarksNear(landmark, max = 8) {
  const origin = positionOf(landmark)
  const nearby = nearestLandmarks(other => distanceKm(origin, positionOf(other)), 0.12, 1.5)
  pickSpaced(
    nearby.filter(other => other !== landmark),
    max,
  ).forEach(addEmojiMarker)
}

export function landmarksAlong(street, max = 8) {
  const alongside = nearestLandmarks(
    landmark => distanceToPolyline(positionOf(landmark), street.lines),
    -1,
    0.5,
  )
  return pickSpaced(alongside, max)
}

export function showLandmarksAlong(street) {
  const landmarks = landmarksAlong(street)
  landmarks.forEach(addEmojiMarker)
  if (!landmarks.length) return ''
  const list = landmarks.map(landmark => `${emojiOf(landmark)} ${escapeHtml(landmark.name)}`).join(' · ')
  return `<p><b>En esta calle:</b> ${list}</p>`
}
