import { PHOTOS, cerros, comunas, peakToleranceKm } from '../../../data/dataset.js'
import { answer, questionHeader } from '../../engine.js'
import { cerroInfo, fitCerros } from '../../../domain/cerros.js'
import { distanceKm, nearestBy } from '../../../core/geo.js'
import { divIcon, outlineComunas, peakIcon } from '../../../map/draw.js'
import { escapeHtml, formatKm, shuffle } from '../../../core/util.js'
import { fit, layer, map } from '../../../map/map.js'
import { photoHtml } from '../../../ui/photos.js'
import { registerMode } from '../../registry.js'
import { renderOptions } from '../../options.js'
import { showPanel } from '../../../ui/panel.js'

registerMode({
  id: 'ce-loc',
  group: 'Cerros',
  name: 'Ubica el cerro',
  desc: 'Con el relieve a la vista, toca dónde está el cerro.',
  relief: true,
  pool: () => cerros,
  key: c => c.name,
  ask(c, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Dónde está el <b>${escapeHtml(c.name)}</b>?</div><div class="q-sub">${escapeHtml(c.tipo)}${c.ele ? ' · ' + c.ele.toLocaleString('es-CL') + ' m' : ''} · margen ${String(peakToleranceKm(c)).replace('.', ',')} km</div>`,
    )
    outlineComunas(
      comunas.filter(
        f =>
          f.properties.group !== 'rural' || ['Lo Barnechea', 'San José de Maipo'].includes(f.properties.name),
      ),
    ).addTo(layer)
    if (q.i === 0) fitCerros()
    map.on('click', e => {
      if (q.answered) return
      const you = [e.latlng.lat, e.latlng.lng],
        ans = [c.lat, c.lon],
        d = distanceKm(you, ans),
        ok = d <= peakToleranceKm(c)
      L.marker(you, { icon: divIcon('pin you'), pane: 'points' }).addTo(layer)
      L.marker(ans, { icon: peakIcon(ok ? 'ok' : 'bad'), pane: 'points' })
        .addTo(layer)
        .bindTooltip(escapeHtml(c.name), { permanent: true, direction: 'top', offset: [0, -12] })
      L.polyline([you, ans], { pane: 'routes', color: '#334155', dashArray: '5 6', weight: 2 }).addTo(layer)
      answer(ok, `<p>Quedaste a <b>${formatKm(d)}</b>.</p>${cerroInfo(c)}`, {
        partial: !ok && d <= peakToleranceKm(c) * 2.5,
      })
    })
  },
})
registerMode({
  id: 'ce-name',
  group: 'Cerros',
  name: '¿Qué cerro es?',
  desc: 'Te marco un cerro sobre el relieve; eliges cuál es.',
  relief: true,
  pool: () => cerros,
  key: c => c.name,
  ask(c, q) {
    showPanel(questionHeader(q) + `<div class="q-prompt">¿Qué cerro está marcado?</div>`)
    outlineComunas(
      comunas.filter(
        f =>
          f.properties.group !== 'rural' || ['Lo Barnechea', 'San José de Maipo'].includes(f.properties.name),
      ),
    ).addTo(layer)
    L.marker([c.lat, c.lon], { icon: peakIcon('hi'), pane: 'points' }).addTo(layer)
    map.setView([c.lat, c.lon], c.tipo === 'Cordillera' ? 10 : 11)
    const ds = nearestBy(
      cerros,
      [c.lat, c.lon],
      x => [x.lat, x.lon],
      5,
      x => x === c,
    )
    const opts = shuffle([c, ...shuffle(ds).slice(0, 3)])
    renderOptions(
      opts.map(x => ({ label: escapeHtml(x.name), value: x.name })),
      c.name,
      v => {
        for (const o of opts)
          L.marker([o.lat, o.lon], {
            icon: peakIcon(o === c ? 'ok' : o.name === v ? 'bad' : ''),
            pane: 'points',
          })
            .addTo(layer)
            .bindTooltip(escapeHtml(o.name), { permanent: true, direction: 'top', offset: [0, -12] })
        fit(L.latLngBounds(opts.map(o => [o.lat, o.lon])).pad(0.2), 12)
        answer(v === c.name, cerroInfo(c))
      },
    )
  },
})
registerMode({
  id: 'ce-photo',
  tall: true,
  group: 'Cerros',
  name: '¿Qué cerro es? (foto)',
  desc: 'Te muestro una foto del cerro; eliges cuál es.',
  relief: true,
  pool: () => cerros.filter(c => PHOTOS['c:' + c.name]),
  key: c => c.name,
  ask(c, q) {
    const ps = PHOTOS['c:' + c.name]
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Qué cerro es este?</div>${photoHtml('c:' + c.name, { start: Math.floor(Math.random() * ps.length), big: true })}`,
    )
    const ds = nearestBy(
      cerros,
      [c.lat, c.lon],
      x => [x.lat, x.lon],
      6,
      x => x === c,
    )
    const opts = shuffle([c, ...shuffle(ds).slice(0, 3)])
    renderOptions(
      opts.map(x => ({ label: escapeHtml(x.name), value: x.name })),
      c.name,
      v => {
        for (const o of opts)
          L.marker([o.lat, o.lon], {
            icon: peakIcon(o === c ? 'ok' : o.name === v ? 'bad' : ''),
            pane: 'points',
          })
            .addTo(layer)
            .bindTooltip(escapeHtml(o.name), { permanent: true, direction: 'top', offset: [0, -12] })
        fit(L.latLngBounds(opts.map(o => [o.lat, o.lon])).pad(0.2), 12)
        answer(
          v === c.name,
          `<p><b>${escapeHtml(c.name)}</b>${c.ele ? ` · ${c.ele.toLocaleString('es-CL')} m` : ''} · ${escapeHtml(c.comuna || '')}</p><p class="muted">${escapeHtml(c.desc)}</p>`,
        )
      },
    )
  },
})
