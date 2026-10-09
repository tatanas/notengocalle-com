import { nearestBy } from '../../../core/geo.js'
import { escapeHtml, shuffle } from '../../../core/util.js'
import { DATA, PHOTOS, streetByName } from '../../../data/dataset.js'
import { landmarkPool } from '../../../domain/landmarks.js'
import { streetDistractors } from '../../../domain/streets.js'
import { COLORS, divIcon, drawStreet } from '../../../map/draw.js'
import { fit, layer } from '../../../map/map.js'
import { showPanel } from '../../../ui/panel.js'
import { photoHtml } from '../../../ui/photos.js'
import { answer, questionHeader } from '../../engine.js'
import { renderOptions } from '../../options.js'
import { registerMode } from '../../registry.js'

registerMode({
  id: 'ph-lm',
  tall: true,
  balance: l => l.comuna,
  group: 'Fotos',
  name: '¿Qué lugar es?',
  desc: 'Te muestro una foto de un landmark; eliges cuál es.',
  cats: true,
  pool: () => landmarkPool().filter(l => PHOTOS['l:' + l.name]),
  key: l => l.name,
  label: l => l.name,
  ask(l, q) {
    const ps = PHOTOS['l:' + l.name]
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Qué lugar es este?</div>${photoHtml('l:' + l.name, { start: Math.floor(Math.random() * ps.length), big: true })}`,
    )
    // alternativas: mismo tipo de lugar, preferentemente cercanos
    const same = DATA.landmarks.filter(x => x !== l && x.cat === l.cat)
    const ds = shuffle(
      nearestBy(
        same.length >= 3 ? same : DATA.landmarks,
        [l.lat, l.lon],
        x => [x.lat, x.lon],
        6,
        x => x === l,
      ),
    ).slice(0, 3)
    const opts = shuffle([l, ...ds])
    renderOptions(
      opts.map(x => ({ label: escapeHtml(x.name), value: x.name })),
      l.name,
      v => {
        for (const o of opts)
          L.marker([o.lat, o.lon], {
            icon: divIcon('pin ' + (o === l ? 'good' : o.name === v ? 'ans' : 'you')),
            pane: 'points',
          })
            .addTo(layer)
            .bindTooltip(escapeHtml(o.name), { permanent: true, direction: 'top', offset: [0, -10] })
        fit(L.latLngBounds(opts.map(o => [o.lat, o.lon])).pad(0.25), 15)
        answer(
          v === l.name,
          `<p><b>${escapeHtml(l.name)}</b> — ${escapeHtml(l.comuna)}</p><p class="muted">${escapeHtml(l.desc || '')}</p>`,
        )
      },
      { one: true },
    )
  },
})
registerMode({
  id: 'ph-st',
  tall: true,
  group: 'Fotos',
  name: '¿Qué calle es?',
  desc: 'Foto de una calle o avenida; eliges cuál es.',
  pool: () => DATA.streets.filter(s => PHOTOS['s:' + s.name]),
  key: s => s.name,
  ask(s, q) {
    const photo = photoHtml('s:' + s.name, {
      start: Math.floor(Math.random() * PHOTOS['s:' + s.name].length),
      big: true,
    })
    showPanel(questionHeader(q) + `<div class="q-prompt">¿Qué calle es esta?</div>${photo}`)
    const opts = shuffle([s, ...streetDistractors(s, 3)])
    renderOptions(
      opts.map(x => ({ label: escapeHtml(x.name), value: x.name })),
      s.name,
      v => {
        if (v !== s.name) drawStreet(streetByName[v], COLORS.bad, { labelText: v })
        drawStreet(s, COLORS.ok, { labelText: s.name })
        fit(L.latLngBounds(s.bb).pad(0.15), 14)
        answer(v === s.name, `<p><b>${escapeHtml(s.name)}</b></p><p class="muted">${escapeHtml(s.hint)}</p>`)
      },
      { one: true },
    )
  },
})
