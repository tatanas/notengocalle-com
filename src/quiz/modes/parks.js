import { COLORS, mapLabel, parkIcon, regionLayer } from '../../map/draw.js'
import { PARKS, PHOTOS, labelPoint, regionByName } from '../../data/dataset.js'
import { answer, questionHeader } from '../engine.js'
import { escapeHtml, shuffle } from '../../core/util.js'
import { farPark, parkText } from '../../domain/chile.js'
import { fit, fitChile, layer } from '../../map/map.js'
import { photoHtml } from '../../ui/photos.js'
import { registerMode } from '../registry.js'
import { renderOptions } from '../options.js'
import { showPanel } from '../../ui/panel.js'

registerMode({
  id: 'pn-reg',
  group: 'Parques nacionales',
  name: '¿En qué región está el parque?',
  desc: 'Toca la región del parque nacional.',
  chile: true,
  pool: () => PARKS.filter(p => regionByName[p.region]),
  key: p => p.name,
  ask(p, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿En qué región está el Parque Nacional <b>${escapeHtml(p.name)}</b>?</div><div class="q-sub">Toca la región</div>`,
    )
    if (q.i === 0) fitChile()
    regionLayer({
      onClick: (g, l) => {
        if (q.answered) return
        const ok = g.properties.name === p.region
        l.setStyle({ fillColor: ok ? COLORS.ok : COLORS.bad, fillOpacity: 0.8 })
        mapLabel(labelPoint(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(layer)
        if (!ok) mapLabel(labelPoint(regionByName[p.region]), p.region, 'lbl big').addTo(layer)
        if (!farPark(p))
          L.marker([p.lat, p.lon], { icon: parkIcon(), pane: 'points' })
            .addTo(layer)
            .bindTooltip(escapeHtml(p.name), { permanent: true, direction: 'top', offset: [0, -10] })
        answer(
          ok,
          parkText(p) +
            (farPark(p)
              ? '<p class="muted">Es territorio insular: administrativamente pertenece a la región de Valparaíso.</p>'
              : ''),
        )
      },
    }).addTo(layer)
  },
})
registerMode({
  id: 'pn-photo',
  group: 'Parques nacionales',
  name: 'Reconoce el parque por la foto',
  desc: 'Te muestro una foto de un parque nacional; eliges cuál es.',
  chile: true,
  tall: true,
  pool: () => PARKS.filter(p => PHOTOS['p:' + p.name]),
  key: p => p.name,
  ask(p, q) {
    const ps = PHOTOS['p:' + p.name]
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Qué parque nacional es este?</div>${photoHtml('p:' + p.name, { start: Math.floor(Math.random() * ps.length), big: true })}`,
    )
    regionLayer({
      interactive: false,
      style: () => ({ color: '#64748b', weight: 1, fillOpacity: 0.08 }),
    }).addTo(layer)
    if (q.i === 0) fitChile()
    const near = PARKS.filter(x => x !== p)
      .map(x => ({ x, d: Math.abs(x.lat - p.lat) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .map(o => o.x)
    const opts = shuffle([p, ...shuffle(near).slice(0, 3)])
    renderOptions(
      opts.map(x => ({ label: escapeHtml(x.name), value: x.name })),
      p.name,
      v => {
        for (const o of opts.filter(o => !farPark(o)))
          L.marker([o.lat, o.lon], { icon: parkIcon(), pane: 'points' })
            .addTo(layer)
            .bindTooltip(escapeHtml(o.name), {
              permanent: true,
              direction: 'right',
              offset: [10, 0],
              className: 'lbl' + (o === p ? ' big' : ''),
            })
        const vis = opts.filter(o => !farPark(o))
        if (vis.length) fit(L.latLngBounds(vis.map(o => [o.lat, o.lon])).pad(0.4), 8)
        answer(v === p.name, parkText(p))
      },
      { one: true },
    )
  },
})
