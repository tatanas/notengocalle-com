import { mostrarAyudas } from '../mapa/ayudas.js'
import { COLORES, iconoDiv, dibujarMetro } from '../mapa/dibujo.js'
import { DATOS, LINEAS_DE_METRO, comunasDelNucleo, lugarPorId, vias } from '../datos/datos.js'
import { responder, encabezadoDePregunta, partida, saltarPregunta } from './engine.js'
import { ajustes } from '../nucleo/almacen.js'
import { distanciaKm } from '../nucleo/geografia.js'
import { escaparHtml, mezclar } from '../nucleo/utilidades.js'
import { encuadrar, capa } from '../mapa/mapa.js'
import { pildoraDeLinea } from '../dominio/metro.js'
import { rutaEnAuto } from '../dominio/rutaEnAuto.js'
import { aviso, panel, mostrarPanel } from '../interfaz/panel.js'
import { registrarModo } from './registry.js'

// En la práctica en auto, el jugador puede fijar un punto propio (su casa, su trabajo) del que parten o al que llegan
// todas las rutas: ajustes.puntoDeRuteo = { nombre, lat, lon, sentido: 'desde' | 'hacia' }. Se guarda solo en su navegador.
const PUNTO_PROPIO = 'propio'
const puntoPropio = () => {
  const { nombre, lat, lon } = ajustes.puntoDeRuteo
  return { id: PUNTO_PROPIO, name: nombre, lat, lon }
}
export const extremoDeRuta = id => (id === PUNTO_PROPIO ? puntoPropio() : lugarPorId[id])
export const lugarDeLaRuta = ruta => extremoDeRuta(ruta.from === PUNTO_PROPIO ? ruta.to : ruta.from)

// Los destinos del punto propio: lugares emblemáticos ni tan cerca (la ruta sería trivial) ni tan lejos.
const KM_MINIMOS_DESDE_EL_PUNTO = 3
const KM_MAXIMOS_DESDE_EL_PUNTO = 30
const esLugarDeLandmarks = lugar => /^l\d+$/.test(lugar.id)

function rutasDelPuntoPropio() {
  const punto = puntoPropio()
  const desde = ajustes.puntoDeRuteo.sentido !== 'hacia'
  return DATOS.landmarks
    .filter(lugar => {
      const km = distanciaKm([punto.lat, punto.lon], [lugar.lat, lugar.lon])
      return esLugarDeLandmarks(lugar) && km >= KM_MINIMOS_DESDE_EL_PUNTO && km <= KM_MAXIMOS_DESDE_EL_PUNTO
    })
    .map(lugar => {
      const [from, to] = desde ? [PUNTO_PROPIO, lugar.id] : [lugar.id, PUNTO_PROPIO]
      return { k: `${from}>${to}`, from, to }
    })
}

// Las rutas en auto de la práctica: las de todos o, si el jugador fijó un punto, las de su punto.
export const rutasEnAuto = () => (ajustes.puntoDeRuteo ? rutasDelPuntoPropio() : DATOS.steps || [])

// Las rutas del punto propio se piden a OSRM al llegar a la pregunta (y la siguiente se adelanta).
export async function rutaCalculada(ruta, q) {
  if (ruta.steps) return ruta
  mostrarPanel(encabezadoDePregunta(q) + '<p class="muted">Calculando la ruta…</p>')
  let calculada
  try {
    calculada = await rutaEnAuto(extremoDeRuta(ruta.from), extremoDeRuta(ruta.to))
  } catch {
    aviso('No pude calcular la ruta: revisa tu conexión.')
  }
  if (partida !== q) return null
  const siguiente = q.items[q.i + 1]
  if (siguiente && !siguiente.steps)
    rutaEnAuto(extremoDeRuta(siguiente.from), extremoDeRuta(siguiente.to)).catch(() => {})
  if (!calculada) saltarPregunta()
  return calculada
}

// Nombres de calles reales para completar alternativas cuando la ruta trae pocas.
const callesDeRelleno = () => vias().map(calle => calle.name.replace(/\s*\(.*\)/, ''))
/* cfg: {A, B, steps:[{label, x:[...], g, color}], sub, firstQ, nextQ, summary, porLaCalle} */
// Con porLaCalle, A y B se marcan donde la ruta sale a la calle y donde la deja (no en medio de un recinto).
export function preguntarPasos(q, cfg) {
  const { A, B, steps: pasos } = cfg
  let i = 0,
    errores = 0
  const listo = []
  mostrarAyudas({ borders: comunasDelNucleo(), metro: false })
  const salida = cfg.porLaCalle ? pasos[0].g[0] : [A.lat, A.lon]
  const llegada = cfg.porLaCalle ? pasos.at(-1).g.at(-1) : [B.lat, B.lon]
  L.marker(salida, { icon: iconoDiv('pin a', 'A', 28), pane: 'points' })
    .addTo(capa)
    .bindTooltip(escaparHtml(A.name), { direction: 'top', offset: [0, -14] })
  L.marker(llegada, { icon: iconoDiv('pin b', 'B', 28), pane: 'points' })
    .addTo(capa)
    .bindTooltip(escaparHtml(B.name), { direction: 'top', offset: [0, -14] })
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
    if (i > 0) encuadrar(L.latLngBounds([st.g[0], llegada]).pad(0.3), 14)
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
                  .extend(salida)
                  .extend(llegada)
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
  encuadrar(L.latLngBounds([salida, llegada]).pad(0.2), 14)
  dibujar()
}
export function registrarModoDePasosEnAuto(id, nombre) {
  registrarModo({
    id,
    group: 'Ruteo',
    aids: true,
    name: nombre,
    balance: ruta => lugarDeLaRuta(ruta)?.comuna,
    pool: rutasEnAuto,
    key: ruta => ruta.k,
    label: ruta => extremoDeRuta(ruta.from).name + ' → ' + extremoDeRuta(ruta.to).name,
    async ask(ruta, q) {
      const recorrido = await rutaCalculada(ruta, q)
      if (!recorrido) return
      const A = extremoDeRuta(ruta.from),
        B = extremoDeRuta(ruta.to)
      preguntarPasos(q, {
        A,
        B,
        steps: recorrido.steps.map(paso => ({ label: paso.n, x: paso.x, g: paso.g })),
        filler: callesDeRelleno(),
        porLaCalle: true,
        sub: `En auto · ~${String(recorrido.km).replace('.', ',')} km · ${recorrido.steps.length} calles principales (las chicas se omiten)`,
        firstQ: '¿por qué calle partes?',
        nextQ: '¿a qué calle sigues?',
        summary: `<p><b>${recorrido.steps.map(paso => escaparHtml(paso.n)).join(' → ')}</b></p><p class="muted">~${String(recorrido.km).replace('.', ',')} km, ~${recorrido.min} min sin taco. Ruta calculada por OSRM; puede haber otras igual de buenas (y no considera TAG ni tacos).</p>`,
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
export function registrarModoDePasosEnTransporte(id, nombre) {
  registrarModo({
    id,
    group: 'Ruteo',
    aids: true,
    name: nombre,
    balance: r => lugarPorId[r.from]?.comuna,
    pool: () => DATOS.transit || [],
    key: r => r.k,
    label: r => lugarPorId[r.from].name + ' → ' + lugarPorId[r.to].name,
    ask(r, q) {
      const A = lugarPorId[r.from],
        B = lugarPorId[r.to]
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
