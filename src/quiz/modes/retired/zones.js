import { COLORS, divIcon, drawZone, mapLabel, outlineComunas, zoneBounds } from '../../../map/draw.js'
import { ZONES, coreComunas } from '../../../data/dataset.js'
import { answer, questionHeader } from '../../engine.js'
import { distanceToPolyline, pointInPolygon } from '../../../core/geo.js'
import { escapeHtml, formatKm, sameSet, shuffle } from '../../../core/util.js'
import { fit, layer, map, setLabelMode } from '../../../map/map.js'
import { option, renderMulti, renderOptions } from '../../options.js'
import { registerMode } from '../../registry.js'
import { showPanel } from '../../../ui/panel.js'
import { zoneInfo, zonesNear } from '../../../domain/zones.js'

registerMode({
  id: 'zn-name',
  group: 'Barrios',
  name: '¿Qué barrio es?',
  desc: 'Te marco el perímetro de un barrio o zona; eliges cuál es.',
  pool: () => ZONES,
  key: z => z.name,
  ask(z, q) {
    showPanel(questionHeader(q) + `<div class="q-prompt">¿Qué barrio o zona está marcado?</div>`)
    outlineComunas(coreComunas()).addTo(layer)
    drawZone(z, COLORS.hi, { lab: false })
    fit(zoneBounds(z).pad(1.2), 15)
    const opts = shuffle([z, ...shuffle(zonesNear(z, 6)).slice(0, 3)])
    renderOptions(
      opts.map(x => ({ label: escapeHtml(x.name), value: x.name })),
      z.name,
      v => {
        setLabelMode('streets')
        mapLabel(z.c, z.name, 'lbl big').addTo(layer)
        if (v !== z.name) {
          const w = ZONES.find(x => x.name === v)
          drawZone(w, COLORS.bad)
          fit(zoneBounds(z).extend(zoneBounds(w)).pad(0.2), 15)
        }
        answer(v === z.name, zoneInfo(z))
      },
      { one: true },
    )
  },
})
registerMode({
  id: 'zn-loc',
  group: 'Barrios',
  name: 'Ubica el barrio',
  desc: 'Toca dónde queda el barrio. Vale si caes dentro del perímetro o a menos de 400 m.',
  pool: () => ZONES,
  key: z => z.name,
  ask(z, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Dónde queda <b>${escapeHtml(z.name)}</b>?</div><div class="q-sub">Toca el mapa</div>`,
    )
    outlineComunas(coreComunas()).addTo(layer)
    if (q.i === 0) fit(L.latLngBounds(ZONES.flatMap(x => x.poly)).pad(0.15), 13)
    map.on('click', e => {
      if (q.answered) return
      const p = [e.latlng.lat, e.latlng.lng]
      const d = pointInPolygon(p, z.poly) ? 0 : distanceToPolyline(p, [[...z.poly, z.poly[0]]])
      const ok = d <= 0.4
      L.marker(p, { icon: divIcon('pin you'), pane: 'points' }).addTo(layer)
      drawZone(z, ok ? COLORS.ok : COLORS.hi)
      setLabelMode('streets')
      fit(zoneBounds(z).extend(p).pad(0.3), 15)
      answer(
        ok,
        `${d ? `<p>Quedaste a ${formatKm(d)} del borde.</p>` : '<p>Caíste dentro.</p>'}${zoneInfo(z)}`,
        { partial: !ok && d <= 1 },
      )
    })
  },
})
registerMode({
  id: 'zn-streets',
  group: 'Barrios',
  name: '¿Qué calles lo rodean?',
  desc: 'Selección múltiple: marca las calles que forman el perímetro del barrio.',
  pool: () => ZONES,
  key: z => z.name,
  ask(z, q) {
    const clean = s => s.replace(/\s*\(.*\)/, '')
    const all = z.streets.map(clean).filter(s => !/^(Plaza Italia|Faldeo)/.test(s))
    const cor = shuffle(all).slice(0, Math.min(3, all.length))
    const pool = [...new Set(zonesNear(z, 5).flatMap(x => x.streets.map(clean)))].filter(
      s => !all.includes(s) && !/^(Plaza Italia|Faldeo|Río)/.test(s),
    )
    const ds = shuffle(pool).slice(0, 5 - cor.length)
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Cuáles de estas calles bordean <b>${escapeHtml(z.name)}</b>?</div>`,
    )
    outlineComunas(coreComunas()).addTo(layer)
    drawZone(z, COLORS.hi, { lab: false })
    fit(zoneBounds(z).pad(0.8), 15)
    renderMulti(
      shuffle([...cor, ...ds]).map(v => option(v)),
      cor,
      sel => {
        setLabelMode('streets')
        mapLabel(z.c, z.name, 'lbl big').addTo(layer)
        fit(zoneBounds(z).pad(0.25), 16)
        answer(sameSet(sel, cor), zoneInfo(z))
      },
    )
  },
})
