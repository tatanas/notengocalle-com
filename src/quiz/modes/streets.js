import { distanceToPolyline } from '../../core/geo.js'
import { escapeHtml, formatKm, shuffle } from '../../core/util.js'
import { DATA, comunaByName, labelPoint, quizStreets, streetByName } from '../../data/dataset.js'
import { showLandmarksAlong } from '../../domain/landmarks.js'
import {
  STREET_QUESTION,
  namedSegmentsHtml,
  noteConfusion,
  streetContextChips,
  streetDistractors,
} from '../../domain/streets.js'
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
  group: 'Calles',
  name: '¿Qué calle es?',
  desc: 'Te marco una avenida o autopista; eliges el nombre.',
  pool: () => quizStreets(),
  key: s => s.name,
  ask(s, q) {
    showPanel(questionHeader(q) + `<div class="q-prompt">${STREET_QUESTION[s.kind || 'calle']}</div>`)
    streetContextChips()
    drawStreet(s, COLORS.street)
    fit(L.latLngBounds(s.bb).pad(0.25), 14)
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
        setLabelMode('labels')
        noteConfusion(s.name, v)
        if (v !== s.name) {
          const w = streetByName[v]
          drawStreet(w, COLORS.bad, { labelText: w.name })
          drawStreet(s, COLORS.ok, { labelText: s.name })
          fit(L.latLngBounds(s.bb).extend(L.latLngBounds(w.bb)).pad(0.1), 14)
          extra = `<p>En <span style="color:${COLORS.bad};font-weight:700">rojo</span> la que elegiste (${escapeHtml(w.name)}); en <span style="color:${COLORS.ok};font-weight:700">verde</span> la correcta.</p>`
        }
        drawNamedSegments(s)
        const nearHtml = showLandmarksAlong(s)
        answer(
          v === s.name,
          `${extra}<p><b>${escapeHtml(s.name)}</b></p><p class="muted">${escapeHtml(s.hint)}</p>${namedSegmentsHtml(s)}${nearHtml}<p class="muted">Pasa por: ${s.comunas.map(escapeHtml).join(', ')}</p>${photoHtml('s:' + s.name)}`,
        )
      },
      { one: true },
    )
  },
})
registerMode({
  id: 'st-find',
  noHint: true,
  group: 'Calles',
  name: 'Encuentra la calle',
  desc: 'Toca cualquier punto de la calle que te pido (margen 400 m).',
  pool: () => quizStreets(),
  key: s => s.name,
  ask(s, q) {
    showPanel(
      questionHeader(q) + `<div class="q-prompt">Toca cualquier punto de: <b>${escapeHtml(s.name)}</b></div>`,
    )
    streetContextChips()
    if (q.i === 0) fitCity()
    map.on('click', e => {
      if (q.answered) return
      const p = [e.latlng.lat, e.latlng.lng]
      const d = distanceToPolyline(p, s.lines)
      const ok = d <= 0.4
      L.marker(p, { icon: divIcon('pin you'), pane: 'points' }).addTo(layer)
      L.polyline(s.lines, { pane: 'streets', color: '#fff', weight: 9, opacity: 0.9 }).addTo(layer)
      L.polyline(s.lines, { pane: 'streets', color: ok ? COLORS.ok : COLORS.street, weight: 5 }).addTo(layer)
      let near = null,
        nd = Infinity
      for (const o of DATA.streets) {
        const dd = distanceToPolyline(p, o.lines)
        if (dd < nd) {
          nd = dd
          near = o
        }
      }
      setLabelMode('labels')
      if (!ok && near && nd < 0.4) noteConfusion(s.name, near.name)
      if (!ok) fit(L.latLngBounds(s.bb).extend(p).pad(0.15), 14)
      const extra =
        !ok && near && near !== s && nd < 0.4
          ? `<p>Tocaste cerca de <b>${escapeHtml(near.name)}</b>.</p>`
          : ''
      drawNamedSegments(s)
      const nearHtml = showLandmarksAlong(s)
      answer(
        ok,
        `${ok ? '' : `<p>Quedaste a ${formatKm(d)} de la calle.</p>`}${extra}<p class="muted">${escapeHtml(s.hint)}</p>${namedSegmentsHtml(s)}${nearHtml}${photoHtml('s:' + s.name)}`,
      )
    })
  },
})
