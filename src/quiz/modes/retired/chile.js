import { CHILE, PARKS, REGIONS, labelPoint, regionByName } from '../../../data/dataset.js'
import { COLORS, divIcon, mapLabel, parkIcon, regionLayer } from '../../../map/draw.js'
import { answer, questionHeader } from '../../engine.js'
import { boundsOfFeatures, fit, fitChile, layer, map } from '../../../map/map.js'
import { distanceKmAnyLatitude } from '../../../core/geo.js'
import { escapeHtml, sameSet, shuffle } from '../../../core/util.js'
import { farPark, parkText, regionText } from '../../../domain/chile.js'
import { option, renderMulti, renderOptions } from '../../options.js'
import { registerMode } from '../../registry.js'
import { showPanel } from '../../../ui/panel.js'

registerMode({
  id: 'ch-name',
  group: 'Chile',
  name: '¿Qué región es?',
  desc: 'Te marco una región; eliges su nombre.',
  chile: true,
  pool: () => REGIONS,
  key: f => f.properties.name,
  ask(f, q) {
    showPanel(questionHeader(q) + `<div class="q-prompt">¿Qué región está marcada en naranjo?</div>`)
    regionLayer({
      interactive: false,
      style: g =>
        g === f
          ? { fillColor: COLORS.hi, fillOpacity: 0.9, color: '#92400e', weight: 2 }
          : { color: '#64748b', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.6 },
    }).addTo(layer)
    const i = f.properties.ord
    const nb = REGIONS.filter(g => g !== f && Math.abs(g.properties.ord - i) <= 3)
    fit(boundsOfFeatures([f, ...REGIONS.filter(g => Math.abs(g.properties.ord - i) <= 1)]), 8)
    const opts = shuffle([f, ...shuffle(nb).slice(0, 3)]).map(g => ({
      label: escapeHtml(g.properties.name),
      value: g.properties.name,
    }))
    renderOptions(opts, f.properties.name, v => {
      for (const g of [f, ...nb])
        mapLabel(labelPoint(g), g.properties.name, g === f ? 'lbl big' : 'lbl').addTo(layer)
      answer(v === f.properties.name, regionText(f))
    })
  },
})
registerMode({
  id: 'ch-cap',
  group: 'Chile',
  name: 'Capitales regionales',
  desc: '¿Cuál es la capital de cada región?',
  chile: true,
  pool: () => REGIONS,
  key: f => f.properties.name,
  ask(f, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Cuál es la capital de la región de <b>${escapeHtml(f.properties.name)}</b>?</div>`,
    )
    regionLayer({
      interactive: false,
      style: g =>
        g === f
          ? { fillColor: COLORS.hi, fillOpacity: 0.7 }
          : { color: '#64748b', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.5 },
    }).addTo(layer)
    fit(boundsOfFeatures([f]).pad(0.6), 8)
    const same = CHILE.cities
      .filter(c => c.region === f.properties.name && c.name !== f.properties.cap)
      .map(c => c.name)
    const others = REGIONS.filter(g => g !== f && Math.abs(g.properties.ord - f.properties.ord) <= 2).map(
      g => g.properties.cap,
    )
    const ds = [...new Set([...shuffle(same), ...shuffle(others)])]
      .filter(n => n !== f.properties.cap)
      .slice(0, 3)
    renderOptions(
      shuffle([f.properties.cap, ...ds]).map(n => ({ label: escapeHtml(n), value: n })),
      f.properties.cap,
      v => {
        for (const c of CHILE.cities.filter(c => c.region === f.properties.name))
          L.circleMarker([c.lat, c.lon], {
            pane: 'points',
            radius: c.cap ? 7 : 5,
            color: '#fff',
            weight: 2,
            fillColor: c.cap ? COLORS.ok : '#475569',
            fillOpacity: 1,
          })
            .addTo(layer)
            .bindTooltip(escapeHtml(c.name), {
              permanent: true,
              direction: 'right',
              offset: [8, 0],
              className: 'lbl',
            })
        answer(v === f.properties.cap, regionText(f))
      },
    )
  },
})
registerMode({
  id: 'ch-cities',
  group: 'Chile',
  name: '¿Qué ciudades son de esta región?',
  desc: 'Selección múltiple: marca las ciudades que pertenecen a la región.',
  chile: true,
  pool: () => REGIONS.filter(f => CHILE.cities.some(c => c.region === f.properties.name)),
  key: f => f.properties.name,
  ask(f, q) {
    const mine = CHILE.cities.filter(c => c.region === f.properties.name)
    const others = CHILE.cities.filter(
      c =>
        c.region !== f.properties.name &&
        regionByName[c.region] &&
        Math.abs(regionByName[c.region].properties.ord - f.properties.ord) <= 2,
    )
    const cor = shuffle(mine).slice(0, Math.min(3, mine.length))
    const ds = shuffle(others).slice(0, 6 - cor.length)
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Cuáles de estas ciudades están en la región de <b>${escapeHtml(f.properties.name)}</b>?</div>`,
    )
    regionLayer({
      interactive: false,
      style: g =>
        g === f
          ? { fillColor: COLORS.hi, fillOpacity: 0.7 }
          : { color: '#64748b', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.5 },
    }).addTo(layer)
    fit(boundsOfFeatures([f]).pad(0.8), 8)
    renderMulti(
      shuffle([...cor, ...ds]).map(c => option(c.name)),
      cor.map(c => c.name),
      sel => {
        for (const c of [...mine, ...ds])
          L.circleMarker([c.lat, c.lon], {
            pane: 'points',
            radius: 6,
            color: '#fff',
            weight: 2,
            fillColor:
              c.region === f.properties.name ? COLORS.ok : sel.includes(c.name) ? COLORS.bad : '#475569',
            fillOpacity: 1,
          })
            .addTo(layer)
            .bindTooltip(escapeHtml(c.name), {
              permanent: true,
              direction: 'right',
              offset: [8, 0],
              className: 'lbl',
            })
        fit(L.latLngBounds([...mine, ...ds].map(c => [c.lat, c.lon])).pad(0.2), 9)
        answer(
          sameSet(
            sel,
            cor.map(c => c.name),
          ),
          `<p><b>Región de ${escapeHtml(f.properties.name)}:</b> ${mine.map(c => escapeHtml(c.name) + (c.pop ? ` (${c.pop.toLocaleString('es-CL')})` : '')).join(', ')}.</p><p class="muted">Las otras: ${ds.map(c => escapeHtml(c.name) + ' → ' + escapeHtml(c.region)).join('; ')}.</p>`,
        )
      },
    )
  },
})
registerMode({
  id: 'pn-loc',
  group: 'Chile',
  name: 'Ubica el parque nacional',
  desc: 'Toca dónde está el parque (margen 80 km).',
  chile: true,
  pool: () => PARKS.filter(p => !farPark(p)),
  key: p => p.name,
  ask(p, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Dónde está el Parque Nacional <b>${escapeHtml(p.name)}</b>?</div><div class="q-sub">Toca el mapa</div>`,
    )
    regionLayer({
      interactive: false,
      style: () => ({ color: '#64748b', weight: 1, fillOpacity: 0.08 }),
    }).addTo(layer)
    if (q.i === 0) fitChile()
    map.on('click', e => {
      if (q.answered) return
      const you = [e.latlng.lat, e.latlng.lng]
      const dk = distanceKmAnyLatitude(you, [p.lat, p.lon])
      const ok = dk <= 80
      L.marker(you, { icon: divIcon('pin you'), pane: 'points' }).addTo(layer)
      L.marker([p.lat, p.lon], { icon: parkIcon(), pane: 'points' })
        .addTo(layer)
        .bindTooltip(escapeHtml(p.name), { permanent: true, direction: 'top', offset: [0, -10] })
      L.polyline([you, [p.lat, p.lon]], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(layer)
      answer(ok, `<p>Quedaste a <b>${Math.round(dk)} km</b>.</p>${parkText(p)}`, {
        partial: !ok && dk <= 200,
      })
    })
  },
})
registerMode({
  id: 'pn-name',
  group: 'Chile',
  name: '¿Qué parque nacional es?',
  desc: 'Te marco un parque en el mapa; eliges cuál es.',
  chile: true,
  pool: () => PARKS.filter(p => !farPark(p)),
  key: p => p.name,
  ask(p, q) {
    showPanel(questionHeader(q) + `<div class="q-prompt">¿Qué parque nacional está marcado?</div>`)
    regionLayer({
      interactive: false,
      style: () => ({ color: '#64748b', weight: 1, fillOpacity: 0.08 }),
    }).addTo(layer)
    L.marker([p.lat, p.lon], { icon: divIcon('pulse', '', 22), pane: 'points' }).addTo(layer)
    map.setView([p.lat, p.lon], 6)
    const near = PARKS.filter(x => x !== p && !farPark(x))
      .map(x => ({ x, d: Math.hypot(x.lat - p.lat, x.lon - p.lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
      .map(o => o.x)
    const opts = shuffle([p, ...shuffle(near).slice(0, 3)])
    renderOptions(
      opts.map(x => ({ label: escapeHtml(x.name), value: x.name })),
      p.name,
      v => {
        for (const o of opts)
          L.marker([o.lat, o.lon], { icon: parkIcon(), pane: 'points' })
            .addTo(layer)
            .bindTooltip(escapeHtml(o.name), {
              permanent: true,
              direction: 'right',
              offset: [10, 0],
              className: 'lbl' + (o === p ? ' big' : ''),
            })
        fit(L.latLngBounds(opts.map(o => [o.lat, o.lon])).pad(0.3), 8)
        answer(v === p.name, parkText(p))
      },
    )
  },
})
