import { $, escapeHtml, formatKm, sameSet, shuffle } from '../../../core/util.js'
import { COLORS, comunaLayer, drawStreet, mapLabel } from '../../../map/draw.js'
import { DATA, comunaByName, coreComunas, inScope, labelPoint, streetByName } from '../../../data/dataset.js'
import { answer, questionHeader } from '../../engine.js'
import { boundsOfFeatures, fit, layer } from '../../../map/map.js'
import { distanceToPolyline } from '../../../core/geo.js'
import { hud, showPanel } from '../../../ui/panel.js'
import { option, renderMulti } from '../../options.js'
import { registerMode } from '../../registry.js'
import { store } from '../../../core/store.js'

export const BORDERS = (DATA.borders || []).filter(P => comunaByName[P.a] && comunaByName[P.b])
export const NONE = '__none'
export const FEAT_COLORS = [
  '#2563eb',
  '#db2777',
  '#16a34a',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
]
export const typeLabel = t =>
  ({
    río: 'río',
    canal: 'canal',
    estero: 'estero',
    acequia: 'canal',
    cauce: 'cauce',
    'vía férrea': 'línea férrea',
    calle: '',
  })[t] || ''
export const featLabel = f =>
  escapeHtml(f.n) +
  (typeLabel(f.t) && !/^(Río|Canal|Estero|Zanjón)/.test(f.n)
    ? ` <span class="muted">(${typeLabel(f.t)})</span>`
    : '')
export const bordersOf = c => BORDERS.filter(P => P.a === c || P.b === c)
export const otherOf = (P, c) => (P.a === c ? P.b : P.a)
export const mainFeats = P => P.feats.filter(f => f.km >= Math.max(0.4, 0.2 * P.km))
export function drawBorder(P, colorOf, { labels = true } = {}) {
  const lab = new Set()
  for (const r of P.runs) {
    const col = colorOf(r.n)
    if (!col) continue
    L.polyline(r.pts, {
      pane: 'routes',
      color: '#fff',
      weight: r.n ? 9 : 5,
      opacity: 0.9,
      interactive: false,
    }).addTo(layer)
    L.polyline(r.pts, {
      pane: 'routes',
      color: col,
      weight: r.n ? 5 : 3,
      dashArray: r.n ? null : '4 6',
      interactive: false,
    }).addTo(layer)
    if (labels && r.n && !lab.has(r.n) && r.pts.length > 2) {
      lab.add(r.n)
      L.tooltip({ permanent: true, direction: 'top', className: 'lbl', offset: [0, -4] })
        .setLatLng(r.pts[Math.floor(r.pts.length / 2)])
        .setContent(escapeHtml(r.n))
        .addTo(layer)
    }
  }
}
export function pairComunas(P) {
  comunaLayer([comunaByName[P.a], comunaByName[P.b]], {
    interactive: false,
    style: f => ({
      fillColor: f.properties.name === P.a ? '#93c5fd' : '#fda4af',
      fillOpacity: 0.35,
      color: '#475569',
      weight: 1,
    }),
  }).addTo(layer)
  for (const n of [P.a, P.b]) mapLabel(labelPoint(comunaByName[n]), n, 'lbl big').addTo(layer)
}
export const borderSummary = P =>
  `<p><b>${escapeHtml(P.a)} – ${escapeHtml(P.b)}</b> (${String(P.km).replace('.', ',')} km de límite):</p><ul class="blist">${P.feats
    .slice(0, 6)
    .map(f => `<li>${featLabel(f)} — ${formatKm(f.km)}</li>`)
    .join(
      '',
    )}${P.free >= 0.3 ? `<li class="muted">Sin calle ni cauce (cerros, terrenos o línea imaginaria) — ${formatKm(P.free)}</li>` : ''}</ul>`
export const pairBounds = P => L.latLngBounds(P.runs.flatMap(r => r.pts))

registerMode({
  id: 'fr-study',
  group: 'Fronteras',
  name: 'Estudiar fronteras',
  desc: 'Elige una comuna y mira qué calle, río o canal la separa de cada vecina.',
  study: true,
  pool: () => (BORDERS.length ? [1] : []),
  key: () => 'study',
  ask(_, q) {
    const opts = coreComunas()
      .map(f => f.properties.name)
      .filter(n => bordersOf(n).length)
      .sort((a, b) => a.localeCompare(b, 'es'))
    const cur = store.get('frStudy', 'Las Condes')
    showPanel(`<div class="q-prompt" style="margin-top:0">Fronteras de…</div><select id="frSel">${opts.map(n => `<option ${n === cur ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select><div id="frList" style="margin-top:8px"></div>
      <p class="muted" style="font-size:12px">Calculado comparando el límite oficial (OpenStreetMap) con las calles, ríos y canales que corren a menos de ~70 m. Toca una vecina para acercarte.</p>`)
    hud.textContent = ''
    const render = c => {
      store.set('frStudy', c)
      layer.clearLayers()
      const C = comunaByName[c]
      const bs = bordersOf(c).sort((a, b) => b.km - a.km)
      comunaLayer(coreComunas(), {
        interactive: false,
        style: f =>
          f.properties.name === c
            ? { fillColor: COLORS.hi, fillOpacity: 0.3, color: '#92400e', weight: 2 }
            : { fillOpacity: 0.12, color: '#94a3b8', weight: 1 },
      }).addTo(layer)
      for (const P of bs) mapLabel(labelPoint(comunaByName[otherOf(P, c)]), otherOf(P, c)).addTo(layer)
      mapLabel(labelPoint(C), c, 'lbl big').addTo(layer)
      const names = [...new Set(bs.flatMap(P => P.feats.map(f => f.n)))]
      const col = n => (n ? FEAT_COLORS[names.indexOf(n) % FEAT_COLORS.length] : '#94a3b8')
      for (const P of bs) drawBorder(P, col)
      $('#frList').innerHTML = bs
        .map((P, i) => {
          const o = otherOf(P, c)
          return `<button class="mode" data-i="${i}" style="margin-bottom:6px"><span><b>${escapeHtml(o)}</b> <small>· ${String(P.km).replace('.', ',')} km</small><br><small>${
            P.feats.length
              ? P.feats
                  .slice(0, 4)
                  .map(
                    f =>
                      `<span class="dot" style="background:${col(f.n)}"></span>${escapeHtml(f.n)} (${formatKm(f.km)})`,
                  )
                  .join(' · ')
              : 'sin calle ni cauce: cerros / terrenos'
          }${P.free >= 0.3 && P.feats.length ? ` · <span class="muted">sin calle ${formatKm(P.free)}</span>` : ''}</small></span></button>`
        })
        .join('')
      $('#frList')
        .querySelectorAll('[data-i]')
        .forEach(b => (b.onclick = () => fit(pairBounds(bs[+b.dataset.i]).pad(0.2), 15)))
      fit(boundsOfFeatures([C]).pad(0.15), 14)
    }
    $('#frSel').onchange = e => render(e.target.value)
    render(opts.includes(cur) ? cur : opts[0])
  },
})
registerMode({
  id: 'fr-what',
  group: 'Fronteras',
  name: '¿Qué separa a estas comunas?',
  desc: 'Te doy dos comunas vecinas; eliges qué calle(s), río o canal forman su límite.',
  pool: () =>
    BORDERS.filter(
      P =>
        inScope(comunaByName[P.a]) &&
        inScope(comunaByName[P.b]) &&
        P.km >= 0.8 &&
        (mainFeats(P).length || P.free / P.km >= 0.5),
    ),
  key: P => P.a + '|' + P.b,
  label: P => P.a + ' – ' + P.b,
  ask(P, q) {
    const cor = mainFeats(P).map(f => f.n)
    const none = P.free / P.km >= 0.4
    if (none) cor.push(NONE)
    const near = shuffle(
      [
        ...new Set(
          [...bordersOf(P.a), ...bordersOf(P.b)]
            .filter(Z => Z !== P)
            .flatMap(Z => mainFeats(Z).map(f => f.n)),
        ),
      ].filter(n => !P.feats.some(f => f.n === n)),
    )
    const ds = near.slice(0, Math.max(2, 4 - cor.length))
    if (ds.length < 2)
      for (const s of shuffle(DATA.streets)) {
        if (ds.length >= 3) break
        if (
          !P.feats.some(f => f.n === s.name) &&
          !ds.includes(s.name) &&
          distanceToPolyline(labelPoint(comunaByName[P.a]), s.lines) < 4
        )
          ds.push(s.name)
      }
    const opts = shuffle([...cor.filter(n => n !== NONE), ...ds]).map(n => option(n))
    opts.push(option(NONE, '<i>Ninguna: cerros, terrenos o línea imaginaria</i>'))
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Qué forma el límite entre <b>${escapeHtml(P.a)}</b> y <b>${escapeHtml(P.b)}</b>?</div><div class="q-sub">Marca lo que forme una parte importante del límite.</div>`,
    )
    pairComunas(P)
    fit(pairBounds(P).pad(0.35), 15)
    renderMulti(opts, cor, sel => {
      drawBorder(P, n => (n ? (cor.includes(n) ? COLORS.ok : '#64748b') : '#94a3b8'))
      for (const n of sel.filter(x => x !== NONE && !cor.includes(x))) {
        const s = streetByName[n]
        if (s) drawStreet(s, COLORS.bad, { weight: 3, labelText: n })
      }
      answer(sameSet(sel, cor), borderSummary(P))
    })
  },
})
registerMode({
  id: 'fr-which',
  group: 'Fronteras',
  name: '¿Qué comunas separa?',
  desc: 'Te doy una calle, río o canal; eliges entre qué comunas hace de límite.',
  pool() {
    const m = {}
    for (const P of BORDERS) {
      if (!inScope(comunaByName[P.a]) || !inScope(comunaByName[P.b])) continue
      for (const f of mainFeats(P))
        if (f.km >= 0.5) (m[f.n] = m[f.n] || { n: f.n, t: f.t, pairs: [] }).pairs.push(P)
    }
    return Object.values(m)
  },
  key: F => F.n,
  label: F => F.n,
  ask(F, q) {
    const pk = P => P.a + ' – ' + P.b
    const cor = F.pairs.map(pk)
    const cs = [...new Set(F.pairs.flatMap(P => [P.a, P.b]))]
    const cand = shuffle(
      BORDERS.filter(
        P =>
          !F.pairs.includes(P) &&
          (cs.includes(P.a) || cs.includes(P.b)) &&
          inScope(comunaByName[P.a]) &&
          inScope(comunaByName[P.b]),
      ),
    )
    const shown = shuffle(cor).slice(0, 3)
    const ds = cand.slice(0, 5 - shown.length).map(pk)
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Entre qué comunas hace de límite <b>${featLabel(F)}</b>?</div>`,
    )
    renderMulti(
      shuffle([...shown, ...ds]).map(v => option(v)),
      shown,
      sel => {
        const all = F.pairs
        const fs = [...new Set(all.flatMap(P => [P.a, P.b]))].map(n => comunaByName[n])
        comunaLayer(fs, {
          interactive: false,
          style: () => ({ fillColor: '#93c5fd', fillOpacity: 0.25, color: '#475569', weight: 1 }),
        }).addTo(layer)
        for (const f of fs) mapLabel(labelPoint(f), f.properties.name).addTo(layer)
        for (const P of all) drawBorder(P, n => (n === F.n ? COLORS.ok : null), { labels: false })
        fit(
          L.latLngBounds(all.flatMap(P => P.runs.filter(r => r.n === F.n).flatMap(r => r.pts))).pad(0.25),
          14,
        )
        answer(
          sameSet(sel, shown),
          `<p><b>${escapeHtml(F.n)}</b> es límite entre: ${all.map(P => `${escapeHtml(P.a)} – ${escapeHtml(P.b)} (${formatKm(P.feats.find(f => f.n === F.n).km)})`).join('; ')}.</p>`,
        )
      },
    )
  },
})
