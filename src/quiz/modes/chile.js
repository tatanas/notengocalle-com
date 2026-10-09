import { CHILE, REGIONS, labelPoint, regionByName } from '../../data/dataset.js'
import { COLORS, divIcon, mapLabel, regionLayer } from '../../map/draw.js'
import { answer, questionHeader, quiz } from '../engine.js'
import { cityText, regionText } from '../../domain/chile.js'
import { clearLayer, fitChile, layer, map } from '../../map/map.js'
import { distanceKmAnyLatitude } from '../../core/geo.js'
import { escapeHtml } from '../../core/util.js'
import { registerMode } from '../registry.js'
import { showPanel, toast } from '../../ui/panel.js'

registerMode({
  id: 'ch-find',
  group: 'Chile',
  name: 'Ubica la región',
  desc: 'Te digo la región; la tocas en el mapa de Chile.',
  chile: true,
  pool: () => REGIONS,
  key: f => f.properties.name,
  ask(f, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">Toca la región: <b>${escapeHtml(f.properties.name)}</b></div><div class="q-sub">Haz zoom: las del centro son angostas.</div>`,
    )
    if (q.i === 0) fitChile()
    const lay = regionLayer({
      onClick: (g, l) => {
        if (q.answered) return
        const ok = g === f
        l.setStyle({ fillColor: ok ? COLORS.ok : COLORS.bad, fillOpacity: 0.8 })
        mapLabel(labelPoint(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(layer)
        if (!ok) {
          lay.eachLayer(x => {
            if (x.feature === f) x.setStyle({ fillColor: COLORS.hi, fillOpacity: 0.85 })
          })
          mapLabel(labelPoint(f), f.properties.name, 'lbl big').addTo(layer)
        }
        answer(ok, (ok ? '' : `<p>Tocaste ${escapeHtml(g.properties.name)}.</p>`) + regionText(f))
      },
    }).addTo(layer)
  },
})
registerMode({
  id: 'ch-city',
  group: 'Chile',
  name: 'Ubica la ciudad',
  desc: 'Toca dónde está la ciudad en el mapa de Chile (margen 60 km).',
  chile: true,
  pool: () => CHILE.cities,
  key: c => c.name,
  ask(c, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Dónde está <b>${escapeHtml(c.name)}</b>?</div><div class="q-sub">Toca el mapa</div>`,
    )
    regionLayer({
      interactive: false,
      style: () => ({ color: '#64748b', weight: 1, fillOpacity: 0.08 }),
    }).addTo(layer)
    if (q.i === 0) fitChile()
    map.on('click', e => {
      if (q.answered) return
      const you = [e.latlng.lat, e.latlng.lng]
      const dk = distanceKmAnyLatitude(you, [c.lat, c.lon])
      const ok = dk <= 60
      L.marker(you, { icon: divIcon('pin you'), pane: 'points' }).addTo(layer)
      L.marker([c.lat, c.lon], { icon: divIcon('pin ' + (ok ? 'good' : 'ans')), pane: 'points' })
        .addTo(layer)
        .bindTooltip(escapeHtml(c.name), { permanent: true, direction: 'top', offset: [0, -10] })
      L.polyline([you, [c.lat, c.lon]], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(layer)
      const R = regionByName[c.region]
      if (R) mapLabel(labelPoint(R), R.properties.name).addTo(layer)
      answer(ok, `<p>Quedaste a <b>${Math.round(dk)} km</b>.</p>${cityText(c)}`, {
        partial: !ok && dk <= 150,
      })
    })
  },
})
registerMode({
  id: 'ch-cityreg',
  group: 'Chile',
  name: '¿En qué región está la ciudad?',
  desc: 'Toca la región donde queda la ciudad.',
  chile: true,
  pool: () => CHILE.cities.filter(c => regionByName[c.region]),
  key: c => c.name,
  ask(c, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿En qué región está <b>${escapeHtml(c.name)}</b>?</div><div class="q-sub">Toca la región</div>`,
    )
    if (q.i === 0) fitChile()
    regionLayer({
      onClick: (g, l) => {
        if (q.answered) return
        const ok = g.properties.name === c.region
        l.setStyle({ fillColor: ok ? COLORS.ok : COLORS.bad, fillOpacity: 0.75 })
        mapLabel(labelPoint(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(layer)
        if (!ok) mapLabel(labelPoint(regionByName[c.region]), c.region, 'lbl big').addTo(layer)
        L.marker([c.lat, c.lon], { icon: divIcon('pin good'), pane: 'points' })
          .addTo(layer)
          .bindTooltip(escapeHtml(c.name), { permanent: true, direction: 'top', offset: [0, -10] })
        answer(ok, cityText(c))
      },
    }).addTo(layer)
  },
})
registerMode({
  id: 'ch-all',
  group: 'Chile',
  name: 'Completa el mapa (regiones)',
  desc: 'Las 16 regiones, una por una, hasta pintar el mapa entero.',
  all: true,
  keepLayer: true,
  chile: true,
  pool: () => REGIONS,
  key: f => f.properties.name,
  setup(q) {
    clearLayer()
    q.state = {}
    q.tries = 0
    q.lay = regionLayer({
      style: () => ({ color: '#475569', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.6 }),
      onClick: (g, l) => this.click(g, l),
    }).addTo(layer)
    fitChile()
  },
  ask(f, q) {
    q.tries = 0
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">Toca: <b>${escapeHtml(f.properties.name)}</b></div><div class="q-sub">Verde = a la primera · amarillo = 2º intento · naranjo = 3º · rojo = no la encontraste</div>`,
    )
  },
  click(g, l) {
    const q = quiz
    if (!q || q.answered) return
    const f = q.items[q.i],
      name = f.properties.name
    if (q.state[g.properties.name]) {
      toast(g.properties.name + ' (ya respondida)')
      return
    }
    if (g === f) {
      l.setStyle({ fillColor: [COLORS.ok, COLORS.ok2, COLORS.mid][q.tries], fillOpacity: 0.85 })
      q.state[name] = true
      mapLabel(labelPoint(g), name).addTo(layer)
      answer(q.tries === 0, q.tries ? `<p>Encontrada al intento ${q.tries + 1}.</p>` : '', {
        partial: q.tries > 0,
      })
    } else {
      q.tries++
      toast('Esa es ' + g.properties.name)
      const tl = mapLabel(labelPoint(g), g.properties.name, 'lbl bad').addTo(layer)
      setTimeout(() => layer.removeLayer(tl), 1500)
      if (q.tries >= 3) {
        q.lay.eachLayer(x => {
          if (x.feature === f) x.setStyle({ fillColor: COLORS.bad, fillOpacity: 0.8 })
        })
        q.state[name] = true
        mapLabel(labelPoint(f), name, 'lbl bad').addTo(layer)
        answer(false, '<p>Está marcada en rojo.</p>')
      }
    }
  },
})
