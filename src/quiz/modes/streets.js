import { distanceToPolyline } from '../../core/geo.js'
import { escapeHtml, formatKm, shuffle } from '../../core/util.js'
import {
  DATA,
  comunaByName,
  comunas,
  isUrban,
  labelPoint,
  quizStreets,
  streetByName,
} from '../../data/dataset.js'
import { showLandmarksAlong } from '../../domain/landmarks.js'
import { STREET_QUESTION, namedSegmentsHtml, noteConfusion, streetDistractors } from '../../domain/streets.js'
import { showAids } from '../../map/aids.js'
import { COLORS, divIcon, drawNamedSegments, drawStreet, mapLabel } from '../../map/draw.js'
import { fit, fitCity, layer, map, setLabelMode } from '../../map/map.js'
import { showPanel } from '../../ui/panel.js'
import { photoHtml } from '../../ui/photos.js'
import { answer, questionHeader } from '../engine.js'
import { renderOptions } from '../options.js'
import { registerMode } from '../registry.js'

registerMode({
  id: 'st-name',
  noHint: true,
  aids: true,
  roomy: true,
  group: 'Calles',
  name: '¿Qué calle es?',
  desc: 'Te marco una avenida o autopista; eliges el nombre.',
  pool: () => quizStreets(),
  key: s => s.name,
  ask(s, q) {
    showPanel(questionHeader(q) + `<div class="q-prompt">${STREET_QUESTION[s.kind || 'calle']}</div>`)
    showAids({ borders: comunas.filter(isUrban) })
    drawStreet(s, COLORS.street)
    const opts = shuffle([s, ...streetDistractors(s, 3)]).map(x => ({
      label: escapeHtml(x.name),
      value: x.name,
    }))
    renderOptions(
      opts,
      s.name,
      v => {
        for (const c of s.comunas) {
          const f = comunaByName[c]
          if (f) mapLabel(labelPoint(f), c).addTo(layer)
        }
        let extra = ''
        let shown = L.latLngBounds(s.bb).pad(0.25)
        setLabelMode('labels')
        noteConfusion(s.name, v)
        if (v !== s.name) {
          const w = streetByName[v]
          drawStreet(w, COLORS.bad, { labelText: w.name })
          drawStreet(s, COLORS.ok, { labelText: s.name })
          shown = L.latLngBounds(s.bb).extend(L.latLngBounds(w.bb)).pad(0.1)
          extra = `<p>En <span style="color:${COLORS.bad};font-weight:700">rojo</span> la que elegiste (${escapeHtml(w.name)}); en <span style="color:${COLORS.ok};font-weight:700">verde</span> la correcta.</p>`
        }
        drawNamedSegments(s)
        const nearHtml = showLandmarksAlong(s)
        answer(
          v === s.name,
          `${extra}<p><b>${escapeHtml(s.name)}</b></p><p class="muted">${escapeHtml(s.hint)}</p>${namedSegmentsHtml(s)}${nearHtml}<p class="muted">Pasa por: ${s.comunas.map(escapeHtml).join(', ')}</p>${photoHtml('s:' + s.name)}`,
        )
        // El encuadre va después de la respuesta: así cuenta con el tamaño final del panel.
        fit(shown, 14)
      },
      { one: true },
    )
    // Y el primero, después de las alternativas, por la misma razón.
    fit(L.latLngBounds(s.bb).pad(0.25), 14)
  },
})
// El margen de acierto son unos 14 píxeles: en metros, más estricto cuanto más se acerca el mapa (entre 80 y 250 m).
const TAP_PIXELS = 14
const MIN_TAP_KM = 0.08
const MAX_TAP_KM = 0.25
// Si otra calle del juego queda más cerca del toque que la pedida por más de esto, se tocó esa otra.
const CLOSER_OTHER_KM = 0.03

function tapToleranceKm(latlng) {
  const fingertip = map.containerPointToLatLng(map.latLngToContainerPoint(latlng).add([TAP_PIXELS, 0]))
  return Math.min(MAX_TAP_KM, Math.max(MIN_TAP_KM, latlng.distanceTo(fingertip) / 1000))
}

registerMode({
  id: 'st-find',
  noHint: true,
  aids: true,
  roomy: true,
  group: 'Calles',
  name: 'Encuentra la calle',
  desc: 'Toca sobre la calle que te pido. El margen es el ancho de un dedo: más estricto cuanto más acercas el mapa.',
  pool: () => quizStreets(),
  key: s => s.name,
  ask(s, q) {
    showPanel(
      questionHeader(q) + `<div class="q-prompt">Toca cualquier punto de: <b>${escapeHtml(s.name)}</b></div>`,
    )
    showAids({ borders: comunas.filter(isUrban) })
    if (q.i === 0) fitCity()
    map.on('click', e => {
      if (q.answered) return
      const p = [e.latlng.lat, e.latlng.lng]
      const d = distanceToPolyline(p, s.lines)
      let near = null,
        nd = Infinity
      for (const o of DATA.streets) {
        const dd = distanceToPolyline(p, o.lines)
        if (dd < nd) {
          nd = dd
          near = o
        }
      }
      const tolerance = tapToleranceKm(e.latlng)
      const ok = d <= tolerance && !(near !== s && nd < d - CLOSER_OTHER_KM)
      L.marker(p, { icon: divIcon('pin you'), pane: 'points' }).addTo(layer)
      drawStreet(s, ok ? COLORS.ok : COLORS.street)
      setLabelMode('labels')
      if (!ok && near && near !== s && nd <= tolerance) noteConfusion(s.name, near.name)
      const extra =
        !ok && near && near !== s && nd <= tolerance
          ? `<p>Tocaste cerca de <b>${escapeHtml(near.name)}</b>.</p>`
          : ''
      drawNamedSegments(s)
      const nearHtml = showLandmarksAlong(s)
      answer(
        ok,
        `${ok ? '' : `<p>Quedaste a ${formatKm(d)} de la calle.</p>`}${extra}<p class="muted">${escapeHtml(s.hint)}</p>${namedSegmentsHtml(s)}${nearHtml}${photoHtml('s:' + s.name)}`,
      )
      if (!ok) fit(L.latLngBounds(s.bb).extend(p).pad(0.15), 14)
    })
  },
})
