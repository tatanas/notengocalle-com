import { roads, isPara, isRoad, streetByName, streetMidVertex } from '../../../data/dataset.js'
import { answer, questionHeader } from '../../engine.js'
import { showAids } from '../../../map/aids.js'
import { comunas, isUrban } from '../../../data/dataset.js'
import { confusionsOf, namedSegmentsHtml, noteConfusion } from '../../../domain/streets.js'
import { escapeHtml, shuffle } from '../../../core/util.js'
import { fit, layer, setLabelMode } from '../../../map/map.js'
import { panel, showPanel } from '../../../ui/panel.js'
import { photoHtml } from '../../../ui/photos.js'
import { registerMode } from '../../registry.js'

registerMode({
  id: 'st-conf',
  noHint: true,
  group: 'Calles',
  name: '¿Cuál de estas es…?',
  desc: 'Varias calles cercanas marcadas en colores: elige cuál es la que te pido. Prioriza las que has confundido antes.',
  pool: () =>
    roads().filter(s => (s.nb || []).filter(([n]) => streetByName[n] && isRoad(streetByName[n])).length >= 3),
  key: s => s.name,
  ask(s, q) {
    // rivales: primero las que has confundido con esta, luego las más cercanas
    const cf = confusionsOf(s.name)
      .sort((a, b) => b[1] - a[1])
      .map(([n]) => n)
      .filter(n => isRoad(streetByName[n]))
    const nb = s.nb
      .map(([n]) => n)
      .filter(n => streetByName[n] && isRoad(streetByName[n]) && !isPara(n, s.name))
    const rivals = [...new Set([...cf.slice(0, 2), ...shuffle(nb.slice(0, 5))])]
      .slice(0, 3)
      .map(n => streetByName[n])
    const all = shuffle([s, ...rivals])
    const COL = ['#2563eb', '#db2777', '#ea580c', '#16a34a']
    const LET = ['A', 'B', 'C', 'D']
    showPanel(
      questionHeader(q) + `<div class="q-prompt">¿Cuál de estas es <b>${escapeHtml(s.name)}</b>?</div>`,
    )
    showAids({ borders: comunas.filter(isUrban) })
    fit(
      L.latLngBounds(s.bb)
        .extend(L.latLngBounds(rivals.flatMap(r => r.bb)))
        .pad(0.08),
      15,
    )
    const box = document.createElement('div')
    box.className = 'opts'
    const pickIt = k => {
      if (q.answered || box.dataset.done) return
      box.dataset.done = '1'
      const ch = all[k],
        ok = ch === s
      box.querySelectorAll('.opt').forEach((b, j) => {
        b.disabled = true
        if (all[j] === s) b.classList.add('ok')
        else if (j === k) b.classList.add('bad')
        b.innerHTML = `<span class="lpill" style="background:${COL[j]}">${LET[j]}</span> ${escapeHtml(all[j].name)}`
      })
      setLabelMode('labels')
      if (!ok) noteConfusion(s.name, ch.name)
      all.forEach((x, j) =>
        L.tooltip({
          permanent: true,
          direction: 'top',
          className: 'lbl' + (x === s ? ' big' : ''),
          offset: [0, -4],
        })
          .setLatLng(streetMidVertex(x))
          .setContent(`${LET[j]}: ${escapeHtml(x.name)}`)
          .addTo(layer),
      )
      answer(
        ok,
        `<p><b>${escapeHtml(s.name)}</b> es la ${LET[all.indexOf(s)]}.${ok ? '' : ` Elegiste ${escapeHtml(ch.name)}.`}</p><p class="muted">${escapeHtml(s.hint)}</p>${namedSegmentsHtml(s)}${photoHtml('s:' + s.name)}`,
      )
    }
    all.forEach((x, j) => {
      L.polyline(x.lines, {
        pane: 'streets',
        color: '#fff',
        weight: 9,
        opacity: 0.9,
        interactive: false,
      }).addTo(layer)
      L.polyline(x.lines, { pane: 'streets', color: COL[j], weight: 5, interactive: false }).addTo(layer)
      L.polyline(x.lines, { pane: 'streets', color: COL[j], weight: 22, opacity: 0 })
        .addTo(layer)
        .on('click', e => {
          L.DomEvent.stop(e)
          pickIt(j)
        })
      L.marker(streetMidVertex(x), {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin a" style="background:${COL[j]}">${LET[j]}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        pane: 'points',
        interactive: false,
      }).addTo(layer)
      const b = document.createElement('button')
      b.className = 'opt'
      b.innerHTML = `<span class="lpill" style="background:${COL[j]}">${LET[j]}</span> la ${['azul', 'rosada', 'naranja', 'verde'][j]}`
      b.onclick = () => pickIt(j)
      box.appendChild(b)
    })
    panel.appendChild(box)
  },
})
