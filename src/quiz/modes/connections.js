import {
  COLORS,
  comunaLayer,
  divIcon,
  drawMetro,
  drawStreet,
  highlightComuna,
  mapLabel,
  outlineComunas,
  peakIcon,
} from '../../map/draw.js'
import {
  DATA,
  LINE_IDS,
  METRO_LINES,
  cerros,
  comunaByName,
  coreComunas,
  crossingsOf,
  inScope,
  isPara,
  isRoad,
  labelPoint,
  roads,
  scopeComunas,
  stationByName,
  stations,
  streetByName,
} from '../../data/dataset.js'
import { KM_PER_DEG_LAT, KM_PER_DEG_LON, distanceKm, distanceToPolyline } from '../../core/geo.js'
import { answer, questionHeader } from '../engine.js'
import { boundsOfFeatures, fit, fitCity, layer, map, setLabelMode } from '../../map/map.js'
import { comunaDistractors } from '../../domain/comunas.js'
import { escapeHtml, formatKm, pick, sameSet, shuffle } from '../../core/util.js'
import { landmarkInComuna, landmarkInfo } from '../../domain/landmarks.js'
import { lineName, linePill } from '../../domain/metro.js'
import { option, renderMulti, renderOptions } from '../options.js'
import { registerMode } from '../registry.js'
import { showPanel } from '../../ui/panel.js'

export const GENERATORS = {
  roundabout() {
    const R = pick(DATA.rotondas || [])
    if (!R) return null
    const near = roads()
      .filter(
        s =>
          !R.streets.some(
            n => n.replace(/^Av\. /, '') === s.name.replace(/^Av\. /, '').replace(/\s*\(.*\)/, ''),
          ) &&
          distanceToPolyline(R.c, s.lines) > 0.25 &&
          distanceToPolyline(R.c, s.lines) < 2.5,
      )
      .map(s => s.name)
    if (near.length < 2) return null
    const cor = shuffle(R.streets).slice(0, Math.min(3, R.streets.length))
    const ds = shuffle(near).slice(0, 5 - cor.length)
    return {
      key: 'rotonda:' + R.name,
      prompt: `¿Qué calles llegan a la <b>${escapeHtml(R.name)}</b>?`,
      sub: 'Es la rotonda marcada en el mapa.',
      multi: true,
      opts: shuffle([...cor, ...ds]).map(n => option(n)),
      correct: cor,
      pre() {
        L.marker(R.c, { icon: divIcon('pulse', '', 22), pane: 'points' }).addTo(layer)
        map.setView(R.c, 14)
      },
      reveal(sel) {
        setLabelMode('streets')
        L.marker(R.c, { icon: divIcon('pulse', '', 22), pane: 'points' })
          .addTo(layer)
          .bindTooltip(escapeHtml(R.name), { permanent: true, direction: 'top', offset: [0, -12] })
        for (const n of sel.filter(x => !cor.includes(x))) {
          const s = streetByName[n]
          if (s) drawStreet(s, COLORS.bad, { weight: 3, labelText: n })
        }
        for (const n of R.streets) {
          const s = streetByName[n]
          if (s) drawStreet(s, COLORS.ok, { weight: 4 })
        }
        map.setView(R.c, 15)
        return `<p>A la <b>${escapeHtml(R.name)}</b> llegan: ${R.streets.map(escapeHtml).join(', ')}.</p>`
      },
    }
  },
  metroStreets() {
    const L0 = pick(LINE_IDS.filter(id => (DATA.metroAlong[id] || []).length))
    const al = DATA.metroAlong[L0]
    const cor = al.map(x => x[0])
    const no = roads()
      .filter(
        s =>
          !cor.includes(s.name) &&
          METRO_LINES[L0].segs.some(seg =>
            seg.some((p, i) => i % 8 === 0 && distanceToPolyline(p, s.lines) < 1.5),
          ),
      )
      .map(s => s.name)
    if (no.length < 2) return null
    const c = shuffle(cor).slice(0, Math.min(3, cor.length))
    const ds = shuffle(no).slice(0, 5 - c.length)
    return {
      key: 'metro-calles:' + L0,
      prompt: `¿Por (sobre o bajo) cuáles de estas calles corre la ${linePill(L0)} <b>${lineName(L0)}</b>?`,
      multi: true,
      opts: shuffle([...c, ...ds]).map(n => option(n)),
      correct: c,
      reveal(sel) {
        for (const n of ds)
          if (sel.includes(n)) drawStreet(streetByName[n], COLORS.bad, { weight: 3, labelText: n })
        for (const [n] of al) drawStreet(streetByName[n], COLORS.ok, { weight: 7, labelText: n })
        drawMetro(layer, { ids: [L0] })
        fit(L.latLngBounds(METRO_LINES[L0].segs.flat()).pad(0.05), 13)
        return `<p>La ${lineName(L0)} va principalmente por: ${al.map(([n, k]) => `<b>${escapeHtml(n)}</b> (${String(k).replace('.', ',')} km)`).join(', ')}.</p>`
      },
    }
  },
  streetsInComuna() {
    const C = pick(coreComunas())
    const c = C.properties.name
    const yes = roads().filter(s => (s.cl[c] || 0) >= 300)
    const no = roads().filter(s => !s.cl[c] && distanceToPolyline(labelPoint(C), s.lines) < 3.5)
    if (!yes.length || no.length < 2) return null
    const k = 1 + Math.floor(Math.random() * Math.min(3, yes.length))
    const cor = shuffle(yes).slice(0, k)
    const ds = shuffle(no).slice(0, 5 - k)
    return {
      key: 'calles-comuna:' + c,
      prompt: `¿Cuáles de estas calles pasan por <b>${escapeHtml(c)}</b>?`,
      multi: true,
      opts: shuffle([...cor, ...ds]).map(s => option(s.name)),
      correct: cor.map(s => s.name),
      reveal(sel) {
        highlightComuna(C)
        for (const s of [...cor, ...ds]) {
          const isC = cor.includes(s)
          drawStreet(s, isC ? COLORS.ok : sel.includes(s.name) ? COLORS.bad : '#94a3b8', {
            weight: isC ? 5 : 3,
            labelText: s.name,
          })
        }
        fit(boundsOfFeatures([C]).pad(0.4), 14)
        return `<p>Pasan por ${escapeHtml(c)}: <b>${cor.map(s => escapeHtml(s.name)).join(', ')}</b>.</p>`
      },
    }
  },
  crossings() {
    const X = pick(roads().filter(s => crossingsOf(s.name).length >= 2))
    const cr = crossingsOf(X.name).filter(o => streetByName[o.other] && isRoad(streetByName[o.other]))
    const crN = cr.map(o => o.other)
    const no = (X.nb || [])
      .map(([n]) => n)
      .filter(n => n !== X.name && !crN.includes(n) && !isPara(n, X.name))
      .slice(0, 8)
    if (no.length < 2) return null
    const k = 1 + Math.floor(Math.random() * Math.min(3, crN.length))
    const cor = shuffle(crN).slice(0, k)
    const ds = shuffle(no).slice(0, 5 - k)
    return {
      key: 'cruces:' + X.name,
      prompt: `¿Cuáles de estas calles se cruzan con <b>${escapeHtml(X.name)}</b>?`,
      sub: 'Cuenta también si una termina en la otra.',
      multi: true,
      opts: shuffle([...cor, ...ds]).map(n => option(n)),
      correct: cor,
      pre() {
        drawStreet(X, COLORS.hi, { weight: 6 })
        fit(L.latLngBounds(X.bb).pad(0.2), 14)
      },
      reveal(sel) {
        for (const n of [...cor, ...ds]) {
          const s = streetByName[n],
            isC = cor.includes(n)
          drawStreet(s, isC ? COLORS.ok : sel.includes(n) ? COLORS.bad : '#94a3b8', {
            weight: isC ? 5 : 3,
            labelText: n,
          })
        }
        for (const o of cr.filter(o => cor.includes(o.other)))
          for (const p of o.i.pts)
            L.circleMarker(p, {
              pane: 'points',
              radius: 6,
              color: '#fff',
              weight: 2,
              fillColor: COLORS.ok,
              fillOpacity: 1,
            })
              .addTo(layer)
              .bindTooltip(
                `${escapeHtml(X.name)} × ${escapeHtml(o.other)} (${escapeHtml(o.i.comunas.join(' / '))})`,
              )
        return `<p><b>${escapeHtml(X.name)}</b> se cruza con: ${cr.map(o => escapeHtml(o.other)).join(', ')}.</p>`
      },
    }
  },
  nearestStreet() {
    const l = pick(DATA.landmarks.filter(l => l.ns && l.ns[0][1] <= 0.4 && l.ns[1][1] - l.ns[0][1] >= 0.35))
    if (!l) return null
    const corr = l.ns[0][0]
    const far = roads().filter(s => {
      const d = distanceToPolyline([l.lat, l.lon], s.lines)
      return d > 1.2 && d < 6
    })
    if (far.length < 3) return null
    const ds = shuffle(far)
      .slice(0, 3)
      .map(s => s.name)
    return {
      key: 'calle-cerca:' + l.name,
      prompt: `¿Qué calle importante pasa más cerca de <b>${escapeHtml(l.name)}</b>?`,
      opts: shuffle([corr, ...ds]).map(n => option(n)),
      correct: corr,
      reveal(v) {
        L.marker([l.lat, l.lon], { icon: divIcon('pin good'), pane: 'points' })
          .addTo(layer)
          .bindTooltip(escapeHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        drawStreet(streetByName[corr], COLORS.ok, { labelText: corr })
        if (v !== corr) drawStreet(streetByName[v], COLORS.bad, { labelText: v })
        fit(
          L.latLngBounds([[l.lat, l.lon]])
            .extend(L.latLngBounds(streetByName[v].bb))
            .pad(0.1),
          15,
        )
        return `<p>${escapeHtml(l.name)} está a ${formatKm(l.ns[0][1])} de <b>${escapeHtml(corr)}</b>.</p>${landmarkInfo(l)}`
      },
    }
  },
  nearestStation() {
    const l = pick(DATA.landmarks.filter(l => l.nm && l.nm[0][1] <= 1.2 && l.nm[1][1] - l.nm[0][1] >= 0.3))
    if (!l) return null
    const corr = l.nm[0][0]
    const far = stations.filter(s => {
      const d = distanceKm([l.lat, l.lon], [s.lat, s.lon])
      return d > 2.5 && d < 8
    })
    const ds = shuffle(far)
      .slice(0, 3)
      .map(s => s.name)
    return {
      key: 'metro-cerca:' + l.name,
      prompt: `¿Cuál es la estación de metro más cercana a <b>${escapeHtml(l.name)}</b>?`,
      opts: shuffle([corr, ...ds]).map(n =>
        option(n, `${escapeHtml(n)} ${stationByName[n].lines.map(linePill).join('')}`),
      ),
      correct: corr,
      reveal(v) {
        L.marker([l.lat, l.lon], { icon: divIcon('pin good'), pane: 'points' })
          .addTo(layer)
          .bindTooltip(escapeHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        for (const n of [corr, v]) {
          const s = stationByName[n]
          L.marker([s.lat, s.lon], { icon: divIcon('pulse', '', 22), pane: 'points' })
            .addTo(layer)
            .bindTooltip(escapeHtml(n), { permanent: true, direction: 'right', offset: [10, 0] })
        }
        drawMetro(layer, { ids: stationByName[corr].lines, dots: false, opacity: 0.6 })
        fit(
          L.latLngBounds([
            [l.lat, l.lon],
            [stationByName[corr].lat, stationByName[corr].lon],
            [stationByName[v].lat, stationByName[v].lon],
          ]).pad(0.2),
          15,
        )
        return `<p>La más cercana es <b>${escapeHtml(corr)}</b> ${stationByName[corr].lines.map(linePill).join('')}, a ${formatKm(l.nm[0][1])}.</p>`
      },
    }
  },
  crossComuna() {
    const I = pick(
      (DATA.inter || []).filter(
        i =>
          isRoad(streetByName[i.a]) &&
          isRoad(streetByName[i.b]) &&
          i.pts.length === 1 &&
          i.comunas.length === 1 &&
          comunaByName[i.comunas[0]] &&
          inScope(comunaByName[i.comunas[0]]),
      ),
    )
    if (!I) return null
    const c = I.comunas[0]
    const ds = comunaDistractors(c, 3)
    return {
      key: 'cruce-comuna:' + I.a + '×' + I.b,
      prompt: `¿En qué comuna se cruzan <b>${escapeHtml(I.a)}</b> y <b>${escapeHtml(I.b)}</b>?`,
      opts: shuffle([c, ...ds]).map(n => option(n)),
      correct: c,
      reveal(v) {
        drawStreet(streetByName[I.a], COLORS.street, { labelText: I.a })
        drawStreet(streetByName[I.b], '#7c3aed', { labelText: I.b })
        L.circleMarker(I.pts[0], {
          pane: 'points',
          radius: 8,
          color: '#fff',
          weight: 2,
          fillColor: COLORS.hi,
          fillOpacity: 1,
        }).addTo(layer)
        highlightComuna(comunaByName[c])
        fit(L.latLng(I.pts[0]).toBounds(4000), 14)
        return `<p>Se cruzan en <b>${escapeHtml(c)}</b>.</p>`
      },
    }
  },
  landmarksInComuna() {
    const C = pick(coreComunas())
    const c = C.properties.name
    const yes = DATA.landmarks.filter(l => landmarkInComuna(l, c) && !l.obvious)
    const nbs = C.properties.nb
    const no = DATA.landmarks.filter(
      l => !landmarkInComuna(l, c) && nbs.includes(l.comuna) && !(l.alt || []).length && !l.obvious,
    )
    if (!yes.length || no.length < 2) return null
    const k = 1 + Math.floor(Math.random() * Math.min(3, yes.length))
    const cor = shuffle(yes).slice(0, k)
    const ds = shuffle(no).slice(0, 5 - k)
    return {
      key: 'lugares-comuna:' + c,
      prompt: `¿Cuáles de estos lugares están en <b>${escapeHtml(c)}</b>?`,
      multi: true,
      opts: shuffle([...cor, ...ds]).map(l => option(l.name)),
      correct: cor.map(l => l.name),
      reveal(sel) {
        highlightComuna(C)
        for (const l of [...cor, ...ds]) {
          const isC = cor.includes(l)
          L.marker([l.lat, l.lon], {
            icon: divIcon('pin ' + (isC ? 'good' : sel.includes(l.name) ? 'ans' : 'you')),
            pane: 'points',
          })
            .addTo(layer)
            .bindTooltip(`${escapeHtml(l.name)} (${escapeHtml(l.comuna)})`, {
              permanent: true,
              direction: 'top',
              offset: [0, -10],
            })
        }
        fit(
          boundsOfFeatures([C])
            .extend(L.latLngBounds([...cor, ...ds].map(l => [l.lat, l.lon])))
            .pad(0.1),
          14,
        )
        return `<p>En ${escapeHtml(c)}: <b>${cor.map(l => escapeHtml(l.name)).join(', ')}</b>. Los otros están en: ${ds.map(l => escapeHtml(l.name) + ' (' + escapeHtml(l.comuna) + ')').join(', ')}.</p>`
      },
    }
  },
  comunaNeighbors() {
    const C = pick(coreComunas())
    const c = C.properties.name
    const sc = scopeComunas().map(f => f.properties.name)
    const nb = C.properties.nb.filter(n => sc.includes(n))
    const ring2 = [...new Set(nb.flatMap(n => comunaByName[n].properties.nb))].filter(
      n => n !== c && !nb.includes(n) && sc.includes(n),
    )
    if (nb.length < 2 || ring2.length < 2) return null
    const k = 2 + Math.floor(Math.random() * Math.min(2, nb.length - 1))
    const cor = shuffle(nb).slice(0, k)
    const ds = shuffle(ring2).slice(0, Math.max(2, 5 - k))
    return {
      key: 'limites:' + c,
      prompt: `¿Cuáles de estas comunas limitan con <b>${escapeHtml(c)}</b>?`,
      multi: true,
      opts: shuffle([...cor, ...ds]).map(n => option(n)),
      correct: cor,
      reveal(sel) {
        comunaLayer(scopeComunas(), {
          interactive: false,
          style: f => {
            const n = f.properties.name
            return n === c
              ? { fillColor: COLORS.hi, fillOpacity: 0.85 }
              : nb.includes(n)
                ? { fillColor: COLORS.ok, fillOpacity: 0.55 }
                : sel.includes(n)
                  ? { fillColor: COLORS.bad, fillOpacity: 0.6 }
                  : { fillOpacity: 0.25 }
          },
        }).addTo(layer)
        for (const n of [c, ...nb, ...ds]) mapLabel(labelPoint(comunaByName[n]), n).addTo(layer)
        fit(boundsOfFeatures([C, ...nb.map(n => comunaByName[n])]), 13)
        return `<p>${escapeHtml(c)} limita con: <b>${nb.map(escapeHtml).join(', ')}</b>.</p>`
      },
    }
  },
  linesInComuna() {
    const inC = (s, c) => s.comuna === c || (s.alt || []).includes(c)
    const withSt = coreComunas().filter(f => stations.some(s => inC(s, f.properties.name)))
    const C = pick(withSt)
    const c = C.properties.name
    const sts = stations.filter(s => inC(s, c))
    const cor = [...new Set(sts.flatMap(s => s.lines))]
    return {
      key: 'lineas-comuna:' + c,
      prompt: `¿Qué líneas de metro tienen estaciones en <b>${escapeHtml(c)}</b>?`,
      multi: true,
      opts: LINE_IDS.map(id => option(id, `${linePill(id)} ${lineName(id)}`)),
      correct: cor,
      reveal() {
        highlightComuna(C)
        drawMetro(layer, { ids: cor, dots: false, opacity: 0.7 })
        for (const s of sts)
          L.circleMarker([s.lat, s.lon], {
            pane: 'points',
            radius: 5,
            color: '#fff',
            weight: 2,
            fillColor: METRO_LINES[s.lines[0]].color,
            fillOpacity: 1,
          })
            .addTo(layer)
            .bindTooltip(escapeHtml(s.name), {
              permanent: true,
              direction: 'right',
              offset: [6, 0],
              className: 'lbl',
            })
        fit(boundsOfFeatures([C]).pad(0.2), 14)
        return `<p>Estaciones en ${escapeHtml(c)}: ${sts.map(s => escapeHtml(s.name) + ' ' + s.lines.map(linePill).join('')).join(', ')}.</p>`
      },
    }
  },
  extreme() {
    const dirs = [
      ['norte', l => l.lat],
      ['sur', l => -l.lat],
      ['oriente', l => l.lon],
      ['poniente', l => -l.lon],
    ]
    const [dn, f] = pick(dirs)
    const KM = dn === 'norte' || dn === 'sur' ? KM_PER_DEG_LAT : KM_PER_DEG_LON
    const pool = shuffle(
      DATA.landmarks.filter(
        l => comunaByName[l.comuna] && comunaByName[l.comuna].properties.group === 'core',
      ),
    )
    const ch = []
    for (const l of pool) {
      if (ch.every(x => x.comuna !== l.comuna)) ch.push(l)
      if (ch.length === 4) break
    }
    const sorted = ch.slice().sort((a, b) => f(b) - f(a))
    if ((f(sorted[0]) - f(sorted[1])) * KM < 1.5) return null
    return {
      key: 'extremo:' + dn + ':' + sorted[0].name,
      prompt: `¿Cuál de estos lugares está más al <b>${dn}</b>?`,
      opts: shuffle(ch).map(l => option(l.name)),
      correct: sorted[0].name,
      reveal(v) {
        for (const l of ch)
          L.marker([l.lat, l.lon], {
            icon: divIcon('pin ' + (l === sorted[0] ? 'good' : l.name === v ? 'ans' : 'you')),
            pane: 'points',
          })
            .addTo(layer)
            .bindTooltip(escapeHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        fit(L.latLngBounds(ch.map(l => [l.lat, l.lon])).pad(0.2), 14)
        return `<p>El más al ${dn} es <b>${escapeHtml(sorted[0].name)}</b> (${escapeHtml(sorted[0].comuna)}).</p>`
      },
    }
  },
  stationStreet() {
    const st = pick(stations.filter(s => s.ns && s.ns[0][1] <= 0.15 && s.ns[1][1] >= 0.35))
    if (!st) return null
    const corr = st.ns[0][0]
    const far = roads().filter(s => {
      const d = distanceToPolyline([st.lat, st.lon], s.lines)
      return d > 1 && d < 5
    })
    if (far.length < 3) return null
    const ds = shuffle(far)
      .slice(0, 3)
      .map(s => s.name)
    return {
      key: 'estacion-calle:' + st.name,
      prompt: `¿Sobre (o junto a) qué calle está la estación <b>${escapeHtml(st.name)}</b> ${st.lines.map(linePill).join('')}?`,
      opts: shuffle([corr, ...ds]).map(n => option(n)),
      correct: corr,
      reveal(v) {
        drawStreet(streetByName[corr], COLORS.ok, { labelText: corr })
        if (v !== corr) drawStreet(streetByName[v], COLORS.bad, { labelText: v })
        L.marker([st.lat, st.lon], { icon: divIcon('pulse', '', 22), pane: 'points' })
          .addTo(layer)
          .bindTooltip(escapeHtml(st.name), { permanent: true, direction: 'right', offset: [10, 0] })
        fit(
          L.latLngBounds([[st.lat, st.lon]])
            .extend(L.latLngBounds(streetByName[v].bb))
            .pad(0.1),
          15,
        )
        return `<p>${escapeHtml(st.name)} está sobre <b>${escapeHtml(corr)}</b> (${escapeHtml(st.comuna)}).</p>`
      },
    }
  },
  nearestCerro() {
    const urb = cerros.filter(c => c.tipo === 'Cerros islas')
    const l = pick(DATA.landmarks)
    const ds = urb.map(c => ({ c, d: distanceKm([l.lat, l.lon], [c.lat, c.lon]) })).sort((a, b) => a.d - b.d)
    if (ds[0].d > 5 || ds[1].d - ds[0].d < 1.5) return null
    const corr = ds[0].c.name
    const others = shuffle(ds.slice(3, 12))
      .slice(0, 3)
      .map(o => o.c.name)
    return {
      key: 'cerro-cerca:' + l.name,
      prompt: `¿Qué cerro queda más cerca de <b>${escapeHtml(l.name)}</b>?`,
      opts: shuffle([corr, ...others]).map(n => option(n)),
      correct: corr,
      reveal(v) {
        L.marker([l.lat, l.lon], { icon: divIcon('pin good'), pane: 'points' })
          .addTo(layer)
          .bindTooltip(escapeHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        for (const n of new Set([corr, v])) {
          const c = cerros.find(x => x.name === n)
          L.marker([c.lat, c.lon], { icon: peakIcon(n === corr ? 'ok' : 'bad'), pane: 'points' })
            .addTo(layer)
            .bindTooltip(escapeHtml(n), { permanent: true, direction: 'top', offset: [0, -12] })
        }
        const cs = cerros.filter(x => x.name === corr || x.name === v)
        fit(L.latLngBounds([[l.lat, l.lon], ...cs.map(c => [c.lat, c.lon])]).pad(0.2), 14)
        return `<p>El más cercano es el <b>${escapeHtml(corr)}</b>, a ${formatKm(ds[0].d)}.</p>`
      },
    }
  },
}
export const GENERATOR_NAMES = {
  roundabout: 'Rotondas',
  metroStreets: 'Calles de cada línea de metro',
  streetsInComuna: 'Calles por comuna',
  crossings: 'Cruces de calles',
  nearestStreet: 'Calle más cercana a un lugar',
  nearestStation: 'Metro más cercano',
  crossComuna: 'Comuna de un cruce',
  landmarksInComuna: 'Lugares por comuna',
  comunaNeighbors: 'Comunas vecinas',
  linesInComuna: 'Líneas por comuna',
  extreme: 'Más al norte / sur / oriente / poniente',
  stationStreet: 'Calle de una estación',
  nearestCerro: 'Cerro más cercano',
}
registerMode({
  id: 'cx',
  group: 'Conexiones',
  name: 'Conexiones (mezcla)',
  desc: 'Preguntas que relacionan todo: cruces, calles por comuna, metro más cercano, vecinas, puntos cardinales…',
  pool() {
    const out = [],
      keys = new Set(),
      gens = Object.keys(GENERATORS)
    for (let t = 0; t < 400 && out.length < 80; t++) {
      const g = gens[t % gens.length]
      const qq = GENERATORS[g]()
      if (qq && !keys.has(qq.key)) {
        keys.add(qq.key)
        qq.gen = g
        out.push(qq)
      }
    }
    return out
  },
  key: x => x.key,
  label: x => x.key.split(':').slice(1).join(':'),
  ask(x, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-head" style="margin-top:-4px"><span>${escapeHtml(GENERATOR_NAMES[x.gen])}</span></div><div class="q-prompt">${x.prompt}</div>${x.sub ? `<div class="q-sub">${escapeHtml(x.sub)}</div>` : ''}`,
    )
    outlineComunas(coreComunas()).addTo(layer)
    if (x.pre) x.pre()
    else if (q.i === 0) fitCity()
    if (x.multi)
      renderMulti(x.opts, x.correct, sel => {
        const html = x.reveal(sel)
        answer(sameSet(sel, x.correct), html)
      })
    else
      renderOptions(
        x.opts,
        x.correct,
        v => {
          const html = x.reveal(v)
          answer(v === x.correct, html)
        },
        { one: x.opts.some(o => o.label.length > 22) },
      )
  },
})
