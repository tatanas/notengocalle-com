import { mostrarAyudas } from '../mapa/ayudas.js'
import { COLORES, iconoDiv, dibujarMetro } from '../mapa/dibujo.js'
import { DATOS, LINEAS_DE_METRO, comunasDelNucleo, lugarPorId, vias } from '../datos/datos.js'
import { responder, encabezadoDePregunta, partida } from './engine.js'
import { escaparHtml, mezclar } from '../nucleo/utilidades.js'
import { encuadrar, capa } from '../mapa/mapa.js'
import { pildoraDeLinea } from '../dominio/metro.js'
import { panel, mostrarPanel } from '../interfaz/panel.js'
import { registrarModo } from './registry.js'

export const lugarSanJoaquin = DATOS.landmarks.find(l => /Campus San Joaquín/.test(l.name))
export const CASA = {
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
  lat: lugarSanJoaquin ? lugarSanJoaquin.lat : -33.4988,
  lon: lugarSanJoaquin ? lugarSanJoaquin.lon : -70.6107,
}
export const punto = id => (id === 'home' ? CASA : id === 'sj' ? SJ : lugarPorId[id])
export const otroExtremo = r => {
  const a = punto(r.from),
    b = punto(r.to)
  return a === CASA || a === SJ ? b : a
}
// Nombres de calles reales para completar alternativas cuando la ruta trae pocas.
const callesDeRelleno = () => vias().map(calle => calle.name.replace(/\s*\(.*\)/, ''))
/* cfg: {A, B, steps:[{label, x:[...], g, color}], sub, firstQ, nextQ, summary} */
export function preguntarPasos(q, cfg) {
  const { A, B, steps: pasos } = cfg
  let i = 0,
    errores = 0
  const listo = []
  mostrarAyudas({ borders: comunasDelNucleo(), metro: false })
  L.marker([A.lat, A.lon], { icon: iconoDiv('pin a', 'A', 28), pane: 'points' }).addTo(capa)
  L.marker([B.lat, B.lon], { icon: iconoDiv('pin b', 'B', 28), pane: 'points' }).addTo(capa)
  if (cfg.pre) cfg.pre()
  let aqui = null
  const dibujar = () => {
    const st = pasos[i]
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">De <b style="color:#2563eb">${escaparHtml(A.name)}</b> a <b style="color:#db2777">${escaparHtml(B.name)}</b></div><div class="q-sub">${cfg.sub}</div>
      ${listo.length ? `<div class="trail">${listo.map((d, k) => `<span class="tstep ${d.ok ? 'ok' : 'bad'}">${k + 1}. ${d.label}</span>`).join('')}</div>` : ''}
      <div class="q-sub" style="margin:8px 0 6px"><b>Paso ${i + 1} de ${pasos.length}:</b> ${i === 0 ? cfg.firstQ : cfg.nextQ}</div>`,
    )
    if (aqui) capa.removeLayer(aqui)
    aqui = L.marker(st.g[0], { icon: iconoDiv('pulse', '', 22), pane: 'points' }).addTo(capa)
    if (i > 0) encuadrar(L.latLngBounds([st.g[0], [B.lat, B.lon]]).pad(0.3), 14)
    let xs = mezclar(st.x || []).slice(0, 3)
    if (xs.length < 3 && cfg.filler)
      for (const f of mezclar(cfg.filler)) {
        if (xs.length >= 3) break
        if (f !== st.label && !xs.includes(f) && !pasos.some(s => s.label === f)) xs.push(f)
      }
    const opciones = mezclar([st.label, ...xs]).map(v => ({
      label: cfg.html ? cfg.html(v) : escaparHtml(v),
      value: v,
    }))
    const caja = document.createElement('div')
    caja.className = 'opts one'
    opciones.forEach((o, idx) => {
      const b = document.createElement('button')
      b.className = 'opt'
      b.innerHTML = `<span class="k">${idx + 1}</span> ${o.label}`
      b.onclick = () => {
        if (caja.dataset.done) return
        caja.dataset.done = '1'
        const ok = o.value === st.label
        if (!ok) {
          errores++
          b.classList.add('bad')
        }
        caja.querySelectorAll('.opt').forEach((x, j) => {
          x.disabled = true
          if (opciones[j].value === st.label) x.classList.add('ok')
        })
        listo.push({ label: cfg.html ? cfg.html(st.label) : escaparHtml(st.label), ok })
        L.polyline(st.g, {
          pane: 'routes',
          color: '#fff',
          weight: 9,
          opacity: 0.9,
          interactive: false,
        }).addTo(capa)
        L.polyline(st.g, {
          pane: 'routes',
          color: st.color || (ok ? COLORES.ok : COLORES.hi),
          weight: 5,
          interactive: false,
        }).addTo(capa)
        L.tooltip({ permanent: true, direction: 'top', className: 'lbl', offset: [0, -4] })
          .setLatLng(st.g[Math.floor(st.g.length / 2)])
          .setContent(escaparHtml(st.short || st.label))
          .addTo(capa)
        i++
        if (i < pasos.length)
          setTimeout(
            () => {
              if (partida === q && !q.answered) dibujar()
            },
            ok ? 500 : 1700,
          )
        else
          setTimeout(
            () => {
              if (partida !== q) return
              if (aqui) capa.removeLayer(aqui)
              encuadrar(
                L.latLngBounds(pasos.flatMap(s => s.g))
                  .extend([A.lat, A.lon])
                  .extend([B.lat, B.lon])
                  .pad(0.1),
                15,
              )
              responder(
                errores === 0,
                `<p>${errores === 0 ? 'Ruta completa sin errores.' : `Te equivocaste en ${errores} de ${pasos.length} pasos.`}</p>${cfg.summary}`,
                { partial: errores === 1 && pasos.length >= 4 },
              )
            },
            ok ? 500 : 1700,
          )
      }
      caja.appendChild(b)
    })
    panel.appendChild(caja)
  }
  encuadrar(
    L.latLngBounds([
      [A.lat, A.lon],
      [B.lat, B.lon],
    ]).pad(0.2),
    14,
  )
  dibujar()
}
export function registrarModoDePasosEnAuto(id, nombre, filtro) {
  registrarModo({
    id,
    group: 'Ruteo',
    aids: true,
    name: nombre,
    balance: r => (otroExtremo(r) || {}).comuna,
    pool: () => (DATOS.steps || []).filter(filtro),
    key: r => r.k,
    label: r => punto(r.from).name + ' → ' + punto(r.to).name,
    ask(r, q) {
      const A = punto(r.from),
        B = punto(r.to)
      preguntarPasos(q, {
        A,
        B,
        steps: r.steps.map(s => ({ label: s.n, x: s.x, g: s.g })),
        filler: callesDeRelleno(),
        sub: `En auto · ~${String(r.km).replace('.', ',')} km · ${r.steps.length} calles principales (las chicas se omiten)`,
        firstQ: '¿por qué calle partes?',
        nextQ: '¿a qué calle sigues?',
        summary: `<p><b>${r.steps.map(s => escaparHtml(s.n)).join(' → ')}</b></p><p class="muted">~${String(r.km).replace('.', ',')} km, ~${r.min} min sin taco. Ruta calculada por OSRM; puede haber otras igual de buenas (y no considera TAG ni tacos).</p>`,
      })
    },
  })
}
export const colorDeTransporte = l =>
  l.t === 'metro' && LINEAS_DE_METRO[l.r[0]]
    ? LINEAS_DE_METRO[l.r[0]].color
    : l.t === 'bus'
      ? '#ea580c'
      : '#1d4ed8'
export const htmlDePasoDeTransporte = v => {
  const m = v.match(/^(Micro|Metro|Tren) (.+?) → hasta (.+)$/)
  if (!m) return escaparHtml(v)
  const pildoras = m[2]
    .split(' / ')
    .map(n =>
      m[1] === 'Metro' && LINEAS_DE_METRO[n]
        ? pildoraDeLinea(n)
        : `<span class="lpill" style="background:${m[1] === 'Micro' ? '#ea580c' : '#1d4ed8'}">${escaparHtml(n)}</span>`,
    )
    .join('')
  return `${m[1] === 'Micro' ? '🚌' : m[1] === 'Metro' ? '🚇' : '🚆'} ${pildoras} hasta <b>${escaparHtml(m[3])}</b>`
}
export function registrarModoDePasosEnTransporte(id, nombre, filtro) {
  registrarModo({
    id,
    group: 'Ruteo',
    aids: true,
    name: nombre,
    balance: r => (otroExtremo(r) || {}).comuna,
    pool: () => (DATOS.transit || []).filter(filtro),
    key: r => r.k,
    label: r => punto(r.from).name + ' → ' + punto(r.to).name,
    ask(r, q) {
      const A = punto(r.from),
        B = punto(r.to)
      preguntarPasos(q, {
        A,
        B,
        html: htmlDePasoDeTransporte,
        steps: r.legs.map(l => ({
          label: l.label,
          short: (l.t === 'bus' ? 'Micro ' : '') + l.r.join('/'),
          x: l.x,
          g: l.g,
          color: colorDeTransporte(l),
        })),
        pre: () => dibujarMetro(capa, { dots: false, opacity: 0.22, weight: 3 }),
        sub: `En micro y metro · ~${r.min} min en total · ${r.legs.length} tramos`,
        firstQ: '¿qué tomas primero y hasta dónde?',
        nextQ: '¿qué tomas ahora?',
        summary: `<ol class="blist">${r.legs.map(l => `<li>${htmlDePasoDeTransporte(l.label)} <span class="muted">(${l.n} paradas, ~${l.min} min)</span></li>`).join('')}</ol><p class="muted">~${r.min} min en total, contando esperas${r.walk > 150 ? ` y ${r.walk} m a pie al final` : ''}. Calculado con los recorridos oficiales de Red (día laboral, media mañana); las alternativas incorrectas demoran al menos 8 min más.</p>`,
      })
    },
  })
}
