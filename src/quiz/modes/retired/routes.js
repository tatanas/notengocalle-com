import { $, escapeHtml, formatKm, pick, shuffle } from '../../../core/util.js'
import {
  DATA,
  LINE_IDS,
  METRO_LINES,
  comunas,
  coreComunas,
  isUrban,
  landmarkById,
  stationByName,
} from '../../../data/dataset.js'
import { answer, questionHeader, skipQuestion } from '../../engine.js'
import { distanceKm } from '../../../core/geo.js'
import { divIcon, drawMetro, outlineComunas } from '../../../map/draw.js'
import { fit, layer, setLabelMode } from '../../../map/map.js'
import { linePill } from '../../../domain/metro.js'
import { registerCarStepsMode, registerTransitStepsMode, sjLm } from '../../steps.js'
import { registerMode } from '../../registry.js'
import { renderOptions } from '../../options.js'
import { showPanel } from '../../../ui/panel.js'

export function routeOptions(r) {
  const A = landmarkById[r.from],
    B = landmarkById[r.to],
    key = s => s.join(' → ')
  const cands = DATA.routes
    .filter(o => o !== r)
    .map(o => {
      const oa = landmarkById[o.from],
        ob = landmarkById[o.to]
      const d1 = distanceKm([A.lat, A.lon], [oa.lat, oa.lon]) + distanceKm([B.lat, B.lon], [ob.lat, ob.lon])
      const d2 = distanceKm([A.lat, A.lon], [ob.lat, ob.lon]) + distanceKm([B.lat, B.lon], [oa.lat, oa.lon])
      return d2 < d1 ? { seq: o.streets.slice().reverse(), d: d2 } : { seq: o.streets.slice(), d: d1 }
    })
    .sort((a, b) => a.d - b.d)
  const correct = key(r.streets),
    used = new Set([correct]),
    sameSet = s => s.slice().sort().join('|') === r.streets.slice().sort().join('|')
  const out = []
  // 1) una mutación: cambiar una calle de la ruta correcta por otra calle cercana
  const pool = [...new Set(cands.slice(0, 10).flatMap(c => c.seq))].filter(x => !r.streets.includes(x))
  if (pool.length) {
    const m = r.streets.slice()
    m[Math.floor(Math.random() * m.length)] = pick(pool)
    if (!used.has(key(m)) && !sameSet(m)) {
      used.add(key(m))
      out.push(m)
    }
  }
  // 2) rutas parecidas (orígenes/destinos cercanos)
  for (const c of cands.slice(0, 14)) {
    if (out.length >= 3) break
    const k = key(c.seq)
    if (!used.has(k) && !sameSet(c.seq) && Math.random() < 0.75) {
      used.add(k)
      out.push(c.seq)
    }
  }
  for (const c of cands) {
    if (out.length >= 3) break
    const k = key(c.seq)
    if (!used.has(k) && !sameSet(c.seq)) {
      used.add(k)
      out.push(c.seq)
    }
  }
  return shuffle([r.streets, ...out]).map(s => ({ label: escapeHtml(key(s)), value: key(s) }))
}
registerMode({
  id: 'route',
  group: 'Ruteo',
  name: '¿Cómo llego?',
  desc: 'Dos puntos en el mapa: elige qué calles principales tomarías en auto.',
  pool: () => DATA.routes,
  key: r => landmarkById[r.from].name + ' → ' + landmarkById[r.to].name,
  label: r => landmarkById[r.from].name + ' → ' + landmarkById[r.to].name,
  ask(r, q) {
    const A = landmarkById[r.from],
      B = landmarkById[r.to]
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">De <b style="color:#2563eb">A: ${escapeHtml(A.name)}</b> a <b style="color:#db2777">B: ${escapeHtml(B.name)}</b></div><div class="q-sub">${escapeHtml(A.comuna)} → ${escapeHtml(B.comuna)} · ¿qué calles principales usarías? (en orden)</div>`,
    )
    outlineComunas(comunas.filter(isUrban)).addTo(layer)
    L.marker([A.lat, A.lon], { icon: divIcon('pin a', 'A', 28), pane: 'points' }).addTo(layer)
    L.marker([B.lat, B.lon], { icon: divIcon('pin b', 'B', 28), pane: 'points' }).addTo(layer)
    fit(
      L.latLngBounds([
        [A.lat, A.lon],
        [B.lat, B.lon],
      ]).pad(0.25),
      14,
    )
    const correct = r.streets.join(' → ')
    renderOptions(
      routeOptions(r),
      correct,
      v => {
        L.polyline(r.geom, { pane: 'routes', color: '#fff', weight: 8, opacity: 0.9 }).addTo(layer)
        L.polyline(r.geom, { pane: 'routes', color: '#7c3aed', weight: 5 }).addTo(layer)
        // dibujar también las calles conocidas de la ruta, si están en el set de calles
        setLabelMode('labels')
        answer(
          v === correct,
          `<p>Ruta sugerida (~${String(r.km).replace('.', ',')} km, ~${r.min} min sin taco):</p><p><b>${escapeHtml(correct)}</b></p><p class="muted" style="font-size:12.5px">Ruta calculada por OSRM; hay otras alternativas válidas, esto es solo para orientarte.</p>`,
        )
      },
      { one: true },
    )
  },
})
export const TRANSFER = 3 // una combinación "cuesta" como ~3 estaciones
export const ORIGINS = [
  {
    id: 'trap',
    name: 'Los Trapenses (Lo Barnechea)',
    st: 'Escuela Militar',
    note: 'llegas en micro hasta Escuela Militar (L1)',
    lat: -33.3426,
    lon: -70.5461,
  },
  {
    id: 'sj',
    name: 'Campus San Joaquín UC',
    st: 'San Joaquín',
    note: 'la estación San Joaquín (L5) está en el campus',
    lat: sjLm ? sjLm.lat : -33.4988,
    lon: sjLm ? sjLm.lon : -70.6107,
  },
]
export const stationIndex = (L, n) => METRO_LINES[L].stations.indexOf(n)
export function metroPaths(o, d) {
  const res = []
  function rec(L, station, cost, legs, used) {
    const di = stationIndex(L, d)
    if (di >= 0 && station !== d)
      res.push({
        legs: [...legs, { L, from: station, to: d }],
        cost: cost + Math.abs(stationIndex(L, station) - di),
      })
    if (used.length >= 3) return
    for (const t of METRO_LINES[L].stations) {
      const ts = stationByName[t]
      if (!ts || ts.lines.length < 2 || t === station) continue
      for (const L2 of ts.lines) {
        if (used.includes(L2)) continue
        rec(
          L2,
          t,
          cost + Math.abs(stationIndex(L, station) - stationIndex(L, t)) + TRANSFER,
          [...legs, { L, from: station, to: t }],
          [...used, L2],
        )
      }
    }
  }
  for (const L of stationByName[o].lines) rec(L, o, 0, [], [L])
  const best = {}
  for (const r of res) {
    const k = r.legs.map(l => l.L + '>' + l.to).join('|')
    if (!best[k] || best[k].cost > r.cost) best[k] = r
  }
  return Object.values(best).sort((a, b) => a.cost - b.cost)
}
export const legsLabel = legs =>
  legs
    .map((l, i) => `${linePill(l.L)} ${legs.length === 1 ? 'directo hasta' : 'hasta'} ${escapeHtml(l.to)}`)
    .join(' → ')
export const legsText = legs => legs.map(l => `${l.L} hasta ${l.to}`).join(' → ')
export function drawLegs(legs, target = layer) {
  for (const l of legs) {
    const a = stationIndex(l.L, l.from),
      b = stationIndex(l.L, l.to)
    const seq = METRO_LINES[l.L].stations
      .slice(Math.min(a, b), Math.max(a, b) + 1)
      .map(n => stationByName[n])
      .filter(Boolean)
    L.polyline(
      seq.map(s => [s.lat, s.lon]),
      { pane: 'routes', color: '#fff', weight: 9, opacity: 0.9 },
    ).addTo(target)
    L.polyline(
      seq.map(s => [s.lat, s.lon]),
      { pane: 'routes', color: METRO_LINES[l.L].color, weight: 6 },
    ).addTo(target)
    for (const s of seq)
      L.circleMarker([s.lat, s.lon], {
        pane: 'points',
        radius: 3.5,
        color: '#fff',
        weight: 1.5,
        fillColor: METRO_LINES[l.L].color,
        fillOpacity: 1,
      }).addTo(target)
    const t = stationByName[l.to]
    L.tooltip({ permanent: true, direction: 'right', offset: [8, 0], className: 'lbl' })
      .setLatLng([t.lat, t.lon])
      .setContent(escapeHtml(l.to))
      .addTo(target)
  }
}
registerMode({
  id: 'mt-route',
  balance: x => x.l.comuna,
  group: 'Ruteo',
  name: '¿Cómo llego en metro?',
  desc: 'Desde Los Trapenses o el Campus San Joaquín: elige qué líneas tomar y dónde combinar.',
  pool() {
    const out = []
    for (const O of ORIGINS)
      for (const l of DATA.landmarks) {
        if (!l.nm || l.nm[0][1] > 1.2) continue
        const d = l.nm[0][0]
        if (d === O.st || distanceKm([O.lat, O.lon], [l.lat, l.lon]) < 3) continue
        out.push({ O, l, d })
      }
    return out
  },
  key: x => x.O.id + '→' + x.l.name,
  label: x => x.O.name.split(' (')[0] + ' → ' + x.l.name,
  ask(x, q) {
    const { O, l, d } = x
    const paths = metroPaths(O.st, d)
    const best = paths[0]
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">Desde <b style="color:#2563eb">${escapeHtml(O.name)}</b> a <b style="color:#db2777">${escapeHtml(l.name)}</b></div><div class="q-sub">${escapeHtml(O.note)}. ¿Qué metro tomas? (se muestra hasta qué estación vas en cada línea)</div>`,
    )
    outlineComunas(coreComunas()).addTo(layer)
    L.marker([O.lat, O.lon], { icon: divIcon('pin a', 'A', 28), pane: 'points' }).addTo(layer)
    L.marker([l.lat, l.lon], { icon: divIcon('pin b', 'B', 28), pane: 'points' }).addTo(layer)
    drawMetro(layer, { dots: false, opacity: 0.25, weight: 3 })
    fit(
      L.latLngBounds([
        [O.lat, O.lon],
        [l.lat, l.lon],
      ]).pad(0.2),
      13,
    )
    if (!best) {
      $('#panel').insertAdjacentHTML('beforeend', '<p class="muted">Sin ruta.</p>')
      setTimeout(skipQuestion, 500)
      return
    }
    const used = new Set([legsText(best.legs)])
    const opts = [{ label: legsLabel(best.legs), value: legsText(best.legs) }]
    // 1) rutas válidas pero claramente peores
    for (const p of paths.slice(1)) {
      if (opts.length >= 3) break
      if (p.cost >= best.cost + 5 && !used.has(legsText(p.legs))) {
        used.add(legsText(p.legs))
        opts.push({ label: legsLabel(p.legs), value: legsText(p.legs) })
      }
    }
    // 2) rutas imposibles: combinar en una estación que no tiene esa línea, o usar una línea que no llega
    const tries = []
    best.legs.forEach((leg, i) => {
      if (i < best.legs.length - 1) {
        const k = stationIndex(leg.L, leg.to)
        for (const dk of [-1, 1, -2, 2]) {
          const n = METRO_LINES[leg.L].stations[k + dk]
          if (n && !stationByName[n].lines.includes(best.legs[i + 1].L)) {
            const legs = best.legs.map(z => ({ ...z }))
            legs[i].to = n
            legs[i + 1].from = n
            tries.push(legs)
          }
        }
      }
    })
    for (const Lw of shuffle(LINE_IDS)) {
      const last = best.legs[best.legs.length - 1]
      if (Lw !== last.L && !METRO_LINES[Lw].stations.includes(d)) {
        const legs = best.legs.map(z => ({ ...z }))
        legs[legs.length - 1].L = Lw
        tries.push(legs)
      }
    }
    for (const legs of shuffle(tries)) {
      if (opts.length >= 4) break
      const t = legsText(legs)
      if (!used.has(t)) {
        used.add(t)
        opts.push({ label: legsLabel(legs), value: t })
      }
    }
    const alt = paths.slice(1).find(p => p.cost <= best.cost + 2)
    renderOptions(
      shuffle(opts),
      legsText(best.legs),
      v => {
        layer.clearLayers()
        outlineComunas(coreComunas()).addTo(layer)
        L.marker([O.lat, O.lon], { icon: divIcon('pin a', 'A', 28), pane: 'points' })
          .addTo(layer)
          .bindTooltip(escapeHtml(O.name), { permanent: true, direction: 'top', offset: [0, -14] })
        L.marker([l.lat, l.lon], { icon: divIcon('pin b', 'B', 28), pane: 'points' })
          .addTo(layer)
          .bindTooltip(escapeHtml(l.name), { permanent: true, direction: 'top', offset: [0, -14] })
        drawLegs(best.legs)
        const o = stationByName[O.st],
          ds = stationByName[d]
        L.polyline(
          [
            [O.lat, O.lon],
            [o.lat, o.lon],
          ],
          { pane: 'routes', color: '#334155', dashArray: '6 6', weight: 2 },
        ).addTo(layer)
        L.polyline(
          [
            [ds.lat, ds.lon],
            [l.lat, l.lon],
          ],
          { pane: 'routes', color: '#334155', dashArray: '3 5', weight: 2 },
        ).addTo(layer)
        fit(
          L.latLngBounds([
            [O.lat, O.lon],
            [l.lat, l.lon],
            [o.lat, o.lon],
          ]).pad(0.15),
          14,
        )
        const n = best.legs.reduce(
          (s, z) => s + Math.abs(stationIndex(z.L, z.from) - stationIndex(z.L, z.to)),
          0,
        )
        answer(
          v === legsText(best.legs),
          `<p><b>${legsLabel(best.legs)}</b></p><p class="muted">${n} estaciones, ${best.legs.length - 1 ? best.legs.length - 1 + ' combinación' + (best.legs.length > 2 ? 'es' : '') : 'sin combinaciones'}. Luego caminas ${formatKm(l.nm[0][1])} desde ${escapeHtml(d)}.</p>${alt ? `<p class="muted">También sirve (casi igual): ${legsLabel(alt.legs)}</p>` : ''}`,
        )
      },
      { one: true },
    )
  },
})
registerCarStepsMode(
  'rs-home-car',
  'Paso a paso · casa o campus · auto',
  'Construye calle por calle la ruta en auto desde/hacia tu casa (Los Trapenses) o el Campus San Joaquín.',
  r => !!r.o,
)
registerTransitStepsMode(
  'rs-home-tp',
  'Paso a paso · casa o campus · micro y metro',
  'Tramo por tramo: qué micro o línea de metro tomar y dónde bajarte, desde/hacia tu casa o el Campus San Joaquín.',
  r => !!r.o,
)
