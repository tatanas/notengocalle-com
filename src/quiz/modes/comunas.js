import { escapeHtml, shuffle } from '../../core/util.js'
import { comunaByName, inScope, labelPoint, scopeComunas } from '../../data/dataset.js'
import { comunaDistractors } from '../../domain/comunas.js'
import { COLORS, comunaLayer, mapLabel } from '../../map/draw.js'
import { boundsOfFeatures, clearLayer, fit, fitCity, layer } from '../../map/map.js'
import { showPanel, toast } from '../../ui/panel.js'
import { answer, questionHeader, quiz } from '../engine.js'
import { renderOptions } from '../options.js'
import { registerMode } from '../registry.js'

registerMode({
  id: 'com-name',
  group: 'Comunas',
  name: '¿Qué comuna es?',
  desc: 'Te marco una comuna y eliges su nombre.',
  pool: () => scopeComunas(),
  key: f => f.properties.name,
  ask(f, q) {
    const name = f.properties.name
    showPanel(questionHeader(q) + `<div class="q-prompt">¿Qué comuna está marcada en naranjo?</div>`)
    comunaLayer(scopeComunas(), {
      interactive: false,
      style: g => (g === f ? { fillColor: COLORS.hi, fillOpacity: 0.85, weight: 3, color: '#92400e' } : {}),
    }).addTo(layer)
    const nbs = f.properties.nb
      .map(n => comunaByName[n])
      .filter(Boolean)
      .filter(inScope)
    fit(boundsOfFeatures([f]).pad(f.properties.km2 > 150 ? 0.3 : 1.2), 13)
    const opts = shuffle([name, ...comunaDistractors(name)]).map(v => ({ label: escapeHtml(v), value: v }))
    renderOptions(opts, name, v => {
      mapLabel(labelPoint(f), name, 'lbl big').addTo(layer)
      nbs.forEach(n => mapLabel(labelPoint(n), n.properties.name).addTo(layer))
      answer(
        v === name,
        `<p>Es <b>${escapeHtml(name)}</b>. Limita con: ${f.properties.nb.map(escapeHtml).join(', ')}.</p>`,
      )
    })
  },
})

registerMode({
  id: 'com-all',
  group: 'Comunas',
  name: 'Completa el mapa',
  desc: 'Todas las comunas, una por una, hasta pintar el mapa entero.',
  all: true,
  keepLayer: true,
  pool: () => scopeComunas(),
  key: f => f.properties.name,
  setup(q) {
    clearLayer()
    q.state = {}
    q.tries = 0
    q.lay = comunaLayer(scopeComunas(), { onClick: (g, l) => this.click(g, l) }).addTo(layer)
    fitCity()
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
    const f = q.items[q.i]
    const name = f.properties.name
    if (q.state[g.properties.name]) {
      toast(g.properties.name + ' (ya respondida)')
      return
    }
    if (g.properties.name === name) {
      const col = [COLORS.ok, COLORS.ok2, COLORS.mid][q.tries]
      l.setStyle({ fillColor: col, fillOpacity: 0.85 })
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
          if (x.feature.properties.name === name) {
            x.setStyle({ fillColor: COLORS.bad, fillOpacity: 0.8 })
          }
        })
        q.state[name] = true
        mapLabel(labelPoint(f), name, 'lbl bad').addTo(layer)
        answer(false, `<p>Está marcada en rojo.</p>`)
      }
    }
  },
})
