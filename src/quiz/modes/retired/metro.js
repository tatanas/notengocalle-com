import { $, escapeHtml, formatKm, shuffle } from '../../../core/util.js'
import { COLORS, comunaLayer, divIcon, drawMetro, mapLabel, outlineComunas } from '../../../map/draw.js'
import {
  LINE_IDS,
  METRO_LINES,
  comunaByName,
  comunas,
  inScope,
  labelPoint,
  scopeComunas,
  stations,
} from '../../../data/dataset.js'
import { answer, questionHeader } from '../../engine.js'
import { comunasText, linePill, metroPool, selectedLines, stationLabel } from '../../../domain/metro.js'
import { distanceKm, nearestBy } from '../../../core/geo.js'
import { fit, fitCity, layer, map } from '../../../map/map.js'
import { panel, showPanel } from '../../../ui/panel.js'
import { registerMode } from '../../registry.js'
import { renderOptions } from '../../options.js'

registerMode({
  id: 'mt-line',
  group: 'Metro',
  name: '¿En qué línea está?',
  desc: 'Elige la(s) línea(s) de la estación. Las combinaciones tienen dos.',
  pool: metroPool,
  key: s => s.name,
  ask(s, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿En qué línea(s) está la estación <b>${escapeHtml(s.name)}</b>?</div><div class="q-sub">Marca todas las que correspondan y confirma.</div>`,
    )
    outlineComunas(scopeComunas()).addTo(layer)
    L.marker([s.lat, s.lon], { icon: divIcon('pulse', '', 22), pane: 'points' }).addTo(layer)
    if (q.i === 0) fit(L.latLngBounds(stations.map(x => [x.lat, x.lon])).pad(0.05), 13)
    const box = document.createElement('div')
    box.className = 'linebtns'
    const sel = new Set()
    LINE_IDS.forEach(id => {
      const b = document.createElement('button')
      b.className = 'linebtn'
      b.style.background = METRO_LINES[id].color
      b.textContent = id
      b.dataset.id = id
      b.onclick = () => {
        if (q.answered) return
        sel.has(id) ? sel.delete(id) : sel.add(id)
        b.classList.toggle('sel')
        $('#btnConfirm').disabled = !sel.size
      }
      box.appendChild(b)
    })
    panel.appendChild(box)
    const row = document.createElement('div')
    row.className = 'row end'
    row.style.marginTop = '10px'
    row.innerHTML = `<button class="btn" id="btnConfirm" disabled>Confirmar</button>`
    panel.appendChild(row)
    $('#btnConfirm').onclick = () => {
      if (q.answered) return
      const ok = sel.size === s.lines.length && s.lines.every(l => sel.has(l))
      box.querySelectorAll('.linebtn').forEach(b => {
        const id = b.dataset.id
        if (s.lines.includes(id)) b.classList.add('ok')
        else if (sel.has(id)) b.classList.add('bad')
      })
      row.remove()
      drawMetro(layer, { ids: s.lines })
      L.marker([s.lat, s.lon], { icon: divIcon('pulse', '', 22), pane: 'points' })
        .addTo(layer)
        .bindTooltip(escapeHtml(s.name), { permanent: true, direction: 'top', offset: [0, -12] })
      answer(ok, `<p>${stationLabel(s)} — comuna de <b>${comunasText(s)}</b>.</p>`)
    }
  },
})
registerMode({
  id: 'mt-com',
  group: 'Metro',
  name: '¿En qué comuna está la estación?',
  desc: 'Toca la comuna donde queda la estación.',
  pool: metroPool,
  key: s => s.name,
  ask(s, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿En qué comuna está la estación <b>${escapeHtml(s.name)}</b> ${s.lines.map(linePill).join('')}?</div><div class="q-sub">Toca la comuna</div>`,
    )
    if (q.i === 0) fitCity()
    comunaLayer(
      comunas.filter(f => inScope(f) || f.properties.name === s.comuna),
      {
        onClick: (g, l) => {
          if (q.answered) return
          const ok = g.properties.name === s.comuna || (s.alt || []).includes(g.properties.name)
          l.setStyle({ fillColor: ok ? COLORS.ok : COLORS.bad, fillOpacity: 0.75 })
          mapLabel(labelPoint(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(layer)
          if (!ok) {
            const c = comunaByName[s.comuna]
            mapLabel(labelPoint(c), c.properties.name, 'lbl big').addTo(layer)
          }
          drawMetro(layer, { ids: s.lines, dots: false, opacity: 0.6 })
          L.marker([s.lat, s.lon], { icon: divIcon('pulse', '', 22), pane: 'points' })
            .addTo(layer)
            .bindTooltip(escapeHtml(s.name), { permanent: true, direction: 'top', offset: [0, -12] })
          answer(
            ok,
            `<p>${stationLabel(s)} está en <b>${escapeHtml(s.comuna)}</b>${(s.alt || []).length ? ', justo en el límite con ' + s.alt.map(escapeHtml).join(' y ') + ' (cualquiera vale)' : ''}.</p>`,
          )
        },
      },
    ).addTo(layer)
  },
})
registerMode({
  id: 'mt-which',
  group: 'Metro',
  name: '¿Qué estación es?',
  desc: 'Te marco una estación en la red; eliges cuál es.',
  pool: metroPool,
  key: s => s.name,
  ask(s, q) {
    showPanel(questionHeader(q) + `<div class="q-prompt">¿Qué estación está marcada?</div>`)
    outlineComunas(scopeComunas()).addTo(layer)
    drawMetro(layer, { ids: selectedLines() })
    L.marker([s.lat, s.lon], { icon: divIcon('pulse', '', 22), pane: 'points' }).addTo(layer)
    fit(L.latLng(s.lat, s.lon).toBounds(3500), 14)
    // distractores: vecinas en la misma línea + cercanas
    const ln = METRO_LINES[s.lines.find(l => selectedLines().includes(l)) || s.lines[0]],
      idx = ln.stations.indexOf(s.name)
    const sameLine = [idx - 1, idx + 1, idx - 2, idx + 2].map(k => ln.stations[k]).filter(Boolean)
    const near = nearestBy(
      metroPool(),
      [s.lat, s.lon],
      x => [x.lat, x.lon],
      6,
      x => x === s,
    ).map(x => x.name)
    const ds = [...new Set(shuffle(sameLine.slice(0, 3)).concat(near))].filter(n => n !== s.name).slice(0, 3)
    const opts = shuffle([s.name, ...ds]).map(n => ({ label: escapeHtml(n), value: n }))
    renderOptions(opts, s.name, v => {
      const byName = Object.fromEntries(stations.map(x => [x.name, x]))
      for (const o of opts) {
        const st = byName[o.value]
        L.tooltip({
          permanent: true,
          direction: 'right',
          offset: [8, 0],
          className: 'lbl' + (st === s ? ' big' : ''),
        })
          .setLatLng([st.lat, st.lon])
          .setContent(escapeHtml(st.name))
          .addTo(layer)
      }
      answer(v === s.name, `<p>${stationLabel(s)} — ${escapeHtml(s.comuna)}.</p>`)
    })
  },
})
registerMode({
  id: 'mt-loc',
  group: 'Metro',
  name: 'Ubica la estación',
  desc: 'Con las líneas dibujadas (sin estaciones), toca dónde está. Margen 800 m.',
  pool: metroPool,
  key: s => s.name,
  ask(s, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">Toca dónde está la estación <b>${escapeHtml(s.name)}</b></div><div class="q-sub">Las líneas están dibujadas, pero sin estaciones ni colores de ayuda.</div>`,
    )
    outlineComunas(scopeComunas()).addTo(layer)
    for (const id of selectedLines())
      L.polyline(METRO_LINES[id].segs, {
        pane: 'metro',
        color: '#475569',
        weight: 3,
        opacity: 0.7,
        interactive: false,
      }).addTo(layer)
    if (q.i === 0) fit(L.latLngBounds(stations.map(x => [x.lat, x.lon])).pad(0.05), 13)
    map.on('click', e => {
      if (q.answered) return
      const you = [e.latlng.lat, e.latlng.lng],
        d = distanceKm(you, [s.lat, s.lon]),
        ok = d <= 0.8
      drawMetro(layer, { ids: s.lines })
      L.marker(you, { icon: divIcon('pin you'), pane: 'points' }).addTo(layer)
      L.marker([s.lat, s.lon], { icon: divIcon('pulse', '', 22), pane: 'points' })
        .addTo(layer)
        .bindTooltip(escapeHtml(s.name), { permanent: true, direction: 'top', offset: [0, -12] })
      L.polyline([you, [s.lat, s.lon]], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(layer)
      answer(
        ok,
        `<p>Quedaste a <b>${formatKm(d)}</b>.</p><p>${stationLabel(s)} — ${escapeHtml(s.comuna)}.</p>`,
        { partial: !ok && d <= 1.6 },
      )
    })
  },
})
