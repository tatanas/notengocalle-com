import { showAids } from '../map/aids.js'
import { COLORS, divIcon, drawMetro } from '../map/draw.js'
import { DATA, METRO_LINES, coreComunas, landmarkById, roads } from '../data/dataset.js'
import { answer, questionHeader, quiz } from './engine.js'
import { escapeHtml, shuffle } from '../core/util.js'
import { fit, layer } from '../map/map.js'
import { linePill } from '../domain/metro.js'
import { panel, showPanel } from '../ui/panel.js'
import { registerMode } from './registry.js'

export const sjLm = DATA.landmarks.find(l => /Campus San Joaquín/.test(l.name))
export const HOME = {
  id: 'home',
  name: 'Casa (Los Trapenses)',
  comuna: 'Lo Barnechea',
  lat: -33.3426,
  lon: -70.5461,
}
export const SJ = {
  id: 'sj',
  name: 'Campus San Joaquín UC',
  comuna: 'Macul',
  lat: sjLm ? sjLm.lat : -33.4988,
  lon: sjLm ? sjLm.lon : -70.6107,
}
export const endpoint = id => (id === 'home' ? HOME : id === 'sj' ? SJ : landmarkById[id])
export const otherEnd = r => {
  const a = endpoint(r.from),
    b = endpoint(r.to)
  return a === HOME || a === SJ ? b : a
}
// Nombres de calles reales para completar alternativas cuando la ruta trae pocas.
const fillerStreets = () => roads().map(street => street.name.replace(/\s*\(.*\)/, ''))
/* cfg: {A, B, steps:[{label, x:[...], g, color}], sub, firstQ, nextQ, summary} */
export function askSteps(q, cfg) {
  const { A, B, steps } = cfg
  let i = 0,
    errors = 0
  const done = []
  showAids({ borders: coreComunas(), metro: false })
  L.marker([A.lat, A.lon], { icon: divIcon('pin a', 'A', 28), pane: 'points' }).addTo(layer)
  L.marker([B.lat, B.lon], { icon: divIcon('pin b', 'B', 28), pane: 'points' }).addTo(layer)
  if (cfg.pre) cfg.pre()
  let here = null
  const render = () => {
    const st = steps[i]
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">De <b style="color:#2563eb">${escapeHtml(A.name)}</b> a <b style="color:#db2777">${escapeHtml(B.name)}</b></div><div class="q-sub">${cfg.sub}</div>
      ${done.length ? `<div class="trail">${done.map((d, k) => `<span class="tstep ${d.ok ? 'ok' : 'bad'}">${k + 1}. ${d.label}</span>`).join('')}</div>` : ''}
      <div class="q-sub" style="margin:8px 0 6px"><b>Paso ${i + 1} de ${steps.length}:</b> ${i === 0 ? cfg.firstQ : cfg.nextQ}</div>`,
    )
    if (here) layer.removeLayer(here)
    here = L.marker(st.g[0], { icon: divIcon('pulse', '', 22), pane: 'points' }).addTo(layer)
    if (i > 0) fit(L.latLngBounds([st.g[0], [B.lat, B.lon]]).pad(0.3), 14)
    let xs = shuffle(st.x || []).slice(0, 3)
    if (xs.length < 3 && cfg.filler)
      for (const f of shuffle(cfg.filler)) {
        if (xs.length >= 3) break
        if (f !== st.label && !xs.includes(f) && !steps.some(s => s.label === f)) xs.push(f)
      }
    const opts = shuffle([st.label, ...xs]).map(v => ({
      label: cfg.html ? cfg.html(v) : escapeHtml(v),
      value: v,
    }))
    const box = document.createElement('div')
    box.className = 'opts one'
    opts.forEach((o, idx) => {
      const b = document.createElement('button')
      b.className = 'opt'
      b.innerHTML = `<span class="k">${idx + 1}</span> ${o.label}`
      b.onclick = () => {
        if (box.dataset.done) return
        box.dataset.done = '1'
        const ok = o.value === st.label
        if (!ok) {
          errors++
          b.classList.add('bad')
        }
        box.querySelectorAll('.opt').forEach((x, j) => {
          x.disabled = true
          if (opts[j].value === st.label) x.classList.add('ok')
        })
        done.push({ label: cfg.html ? cfg.html(st.label) : escapeHtml(st.label), ok })
        L.polyline(st.g, {
          pane: 'routes',
          color: '#fff',
          weight: 9,
          opacity: 0.9,
          interactive: false,
        }).addTo(layer)
        L.polyline(st.g, {
          pane: 'routes',
          color: st.color || (ok ? COLORS.ok : COLORS.hi),
          weight: 5,
          interactive: false,
        }).addTo(layer)
        L.tooltip({ permanent: true, direction: 'top', className: 'lbl', offset: [0, -4] })
          .setLatLng(st.g[Math.floor(st.g.length / 2)])
          .setContent(escapeHtml(st.short || st.label))
          .addTo(layer)
        i++
        if (i < steps.length)
          setTimeout(
            () => {
              if (quiz === q && !q.answered) render()
            },
            ok ? 500 : 1700,
          )
        else
          setTimeout(
            () => {
              if (quiz !== q) return
              if (here) layer.removeLayer(here)
              fit(
                L.latLngBounds(steps.flatMap(s => s.g))
                  .extend([A.lat, A.lon])
                  .extend([B.lat, B.lon])
                  .pad(0.1),
                15,
              )
              answer(
                errors === 0,
                `<p>${errors === 0 ? 'Ruta completa sin errores.' : `Te equivocaste en ${errors} de ${steps.length} pasos.`}</p>${cfg.summary}`,
                { partial: errors === 1 && steps.length >= 4 },
              )
            },
            ok ? 500 : 1700,
          )
      }
      box.appendChild(b)
    })
    panel.appendChild(box)
  }
  fit(
    L.latLngBounds([
      [A.lat, A.lon],
      [B.lat, B.lon],
    ]).pad(0.2),
    14,
  )
  render()
}
export function registerCarStepsMode(id, name, desc, filt) {
  registerMode({
    id,
    group: 'Ruteo',
    aids: true,
    name,
    desc,
    balance: r => (otherEnd(r) || {}).comuna,
    pool: () => (DATA.steps || []).filter(filt),
    key: r => r.k,
    label: r => endpoint(r.from).name + ' → ' + endpoint(r.to).name,
    ask(r, q) {
      const A = endpoint(r.from),
        B = endpoint(r.to)
      askSteps(q, {
        A,
        B,
        steps: r.steps.map(s => ({ label: s.n, x: s.x, g: s.g })),
        filler: fillerStreets(),
        sub: `En auto · ~${String(r.km).replace('.', ',')} km · ${r.steps.length} calles principales (las chicas se omiten)`,
        firstQ: '¿por qué calle partes?',
        nextQ: '¿a qué calle sigues?',
        summary: `<p><b>${r.steps.map(s => escapeHtml(s.n)).join(' → ')}</b></p><p class="muted">~${String(r.km).replace('.', ',')} km, ~${r.min} min sin taco. Ruta calculada por OSRM; puede haber otras igual de buenas (y no considera TAG ni tacos).</p>`,
      })
    },
  })
}
export const transitColor = l =>
  l.t === 'metro' && METRO_LINES[l.r[0]] ? METRO_LINES[l.r[0]].color : l.t === 'bus' ? '#ea580c' : '#1d4ed8'
export const transitStepHtml = v => {
  const m = v.match(/^(Micro|Metro|Tren) (.+?) → hasta (.+)$/)
  if (!m) return escapeHtml(v)
  const pills = m[2]
    .split(' / ')
    .map(n =>
      m[1] === 'Metro' && METRO_LINES[n]
        ? linePill(n)
        : `<span class="lpill" style="background:${m[1] === 'Micro' ? '#ea580c' : '#1d4ed8'}">${escapeHtml(n)}</span>`,
    )
    .join('')
  return `${m[1] === 'Micro' ? '🚌' : m[1] === 'Metro' ? '🚇' : '🚆'} ${pills} hasta <b>${escapeHtml(m[3])}</b>`
}
export function registerTransitStepsMode(id, name, desc, filt) {
  registerMode({
    id,
    group: 'Ruteo',
    aids: true,
    name,
    desc,
    balance: r => (otherEnd(r) || {}).comuna,
    pool: () => (DATA.transit || []).filter(filt),
    key: r => r.k,
    label: r => endpoint(r.from).name + ' → ' + endpoint(r.to).name,
    ask(r, q) {
      const A = endpoint(r.from),
        B = endpoint(r.to)
      askSteps(q, {
        A,
        B,
        html: transitStepHtml,
        steps: r.legs.map(l => ({
          label: l.label,
          short: (l.t === 'bus' ? 'Micro ' : '') + l.r.join('/'),
          x: l.x,
          g: l.g,
          color: transitColor(l),
        })),
        pre: () => drawMetro(layer, { dots: false, opacity: 0.22, weight: 3 }),
        sub: `En micro y metro · ~${r.min} min en total · ${r.legs.length} tramos`,
        firstQ: '¿qué tomas primero y hasta dónde?',
        nextQ: '¿qué tomas ahora?',
        summary: `<ol class="blist">${r.legs.map(l => `<li>${transitStepHtml(l.label)} <span class="muted">(${l.n} paradas, ~${l.min} min)</span></li>`).join('')}</ol><p class="muted">~${r.min} min en total, contando esperas${r.walk > 150 ? ` y ${r.walk} m a pie al final` : ''}. Calculado con los recorridos oficiales de Red (día laboral, media mañana); las alternativas incorrectas demoran al menos 8 min más.</p>`,
      })
    },
  })
}
