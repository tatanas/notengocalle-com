import { escapeHtml } from '../../../core/util.js'
import { labelPoint, scopeComunas } from '../../../data/dataset.js'
import { COLORS, comunaLayer, mapLabel } from '../../../map/draw.js'
import { fitCity, layer } from '../../../map/map.js'
import { showPanel } from '../../../ui/panel.js'
import { answer, questionHeader } from '../../engine.js'
import { registerMode } from '../../registry.js'

registerMode({
  id: 'com-find',
  group: 'Comunas',
  name: 'Encuentra la comuna',
  desc: 'Te digo el nombre, tú la tocas en el mapa.',
  pool: () => scopeComunas(),
  key: f => f.properties.name,
  setup() {
    fitCity()
  },
  ask(f, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">Toca la comuna: <b>${escapeHtml(f.properties.name)}</b></div><div class="q-sub">Tip: haz zoom si las comunas son chicas.</div>`,
    )
    let tries = 0
    const lay = comunaLayer(scopeComunas(), {
      onClick: (g, l) => {
        if (q.answered) return
        const ok = g.properties.name === f.properties.name
        if (ok) {
          l.setStyle({ fillColor: tries ? COLORS.mid : COLORS.ok, fillOpacity: 0.8 })
          mapLabel(l.getBounds().getCenter(), g.properties.name, 'lbl big ok').addTo(layer)
        } else {
          l.setStyle({ fillColor: COLORS.bad, fillOpacity: 0.7 })
          mapLabel(labelPoint(g), g.properties.name, 'lbl bad').addTo(layer)
          lay.eachLayer(x => {
            if (x.feature.properties.name === f.properties.name)
              x.setStyle({ fillColor: COLORS.hi, fillOpacity: 0.85, weight: 3, color: '#92400e' })
          })
          mapLabel(labelPoint(f), f.properties.name, 'lbl big').addTo(layer)
        }
        answer(
          ok,
          ok
            ? ''
            : `<p>Tocaste <b>${escapeHtml(g.properties.name)}</b>. ${escapeHtml(f.properties.name)} está marcada en naranjo.</p>`,
        )
      },
    }).addTo(layer)
  },
})
