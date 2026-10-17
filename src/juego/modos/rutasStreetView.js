import { vias } from '../../datos/datos.js'
import { puntoMasCercanoEnLineas } from '../../nucleo/geografia.js'
import { escaparHtml, mezclar } from '../../nucleo/utilidades.js'
import {
  giro,
  puntoAntesDelFinal,
  puntoDesdeElInicio,
  rumbo,
  textoDeManiobra,
} from '../../dominio/maniobras.js'
import { nombreDeRuteoDeCalle } from '../../dominio/rutaEnAuto.js'
import { COLORES_DE_TRAMOS, iconoDiv } from '../../mapa/dibujo.js'
import { capa, encuadrar } from '../../mapa/mapa.js'
import { mostrarPanorama, ocultarPanorama, streetViewDisponible } from '../../mapa/streetView.js'
import { mostrarPanel, panel } from '../../interfaz/panel.js'
import { encabezadoDePregunta, partida, responder } from '../engine.js'
import { extremoDeRuta, lugarDeLaRuta, rutaCalculada, rutasEnAuto } from '../pasos.js'
import { registrarModo } from '../registry.js'

// Ruteo en auto mirando Street View en vez del mapa: se salta de cruce en cruce de la ruta. En cada uno se ve la calle
// un poco antes del cruce, mirando hacia donde se avanza, y se elige qué hacer ("Dobla a la derecha en Av. Grecia"…).
// Si se equivoca, se corrige al tiro y la ruta sigue por donde correspondía. El mapa aparece solo al llegar.
const KM_ANTES_DEL_CRUCE = 0.05
const KM_PARA_MEDIR_EL_RUMBO = 0.06
// Una calle que pasa a menos de esto del cruce sale del mismo cruce: no se sabe para qué lado, se elige al azar.
const KM_DE_CALLE_EN_EL_CRUCE = 0.08
const OPCIONES = 4
const MS_TRAS_ACERTAR = 700
const GRADOS_DE_GIRO_COMUN = 90

let lineasPorNombre = null
const lineasDe = nombre =>
  (lineasPorNombre ??= new Map(vias().map(calle => [nombreDeRuteoDeCalle(calle), calle.lines]))).get(nombre)
let autopistas = null
const esAutopista = nombre =>
  (autopistas ??= new Set(
    vias()
      .filter(calle => calle.kind === 'autopista')
      .map(nombreDeRuteoDeCalle),
  )).has(nombre)

const maniobra = (grados, calle) => textoDeManiobra(grados, calle, { autopista: esAutopista(calle) })
const giroAlAzar = () => (Math.random() < 0.5 ? GRADOS_DE_GIRO_COMUN : -GRADOS_DE_GIRO_COMUN)
const formatearKm = km => String(km).replace('.', ',')

// Una decisión por calle de la ruta: la primera es por qué calle se parte; las demás, qué hacer al llegar a ella.
function decisionesDeLaRuta(pasos) {
  return pasos.map((paso, indice) => {
    if (indice === 0) {
      const salida = paso.g[0]
      return {
        paso,
        camara: salida,
        rumbo: rumbo(salida, puntoDesdeElInicio(paso.g, KM_PARA_MEDIR_EL_RUMBO)),
        correcta: paso.n,
        hecha: `Parte por ${paso.n}`,
      }
    }
    const anterior = pasos[indice - 1]
    const cruce = paso.g[0]
    const rumboDeLlegada = rumbo(puntoAntesDelFinal(anterior.g, KM_PARA_MEDIR_EL_RUMBO), anterior.g.at(-1))
    const grados = giro(rumboDeLlegada, rumbo(cruce, puntoDesdeElInicio(paso.g, KM_PARA_MEDIR_EL_RUMBO)))
    const correcta = maniobra(grados, paso.n)
    return {
      paso,
      anterior,
      cruce,
      camara: puntoAntesDelFinal(anterior.g, KM_ANTES_DEL_CRUCE),
      rumbo: rumboDeLlegada,
      grados,
      correcta,
      hecha: correcta,
    }
  })
}

// Para qué lado queda una calle vista desde el cruce, si no pasa por él mismo.
function giroHacia(nombre, decision) {
  const lineas = lineasDe(nombre)
  if (!lineas) return giroAlAzar()
  const { km, point: punto } = puntoMasCercanoEnLineas(decision.cruce, lineas)
  return km > KM_DE_CALLE_EN_EL_CRUCE ? giro(decision.rumbo, rumbo(decision.cruce, punto)) : giroAlAzar()
}

function alternativasDelCruce(decision, nombresDeLaRuta) {
  const { paso, anterior, grados } = decision
  const alOtroLado = Math.abs(grados) >= 30 ? -grados : giroAlAzar()
  const candidatas = [maniobra(alOtroLado, paso.n), `Sigue derecho por ${anterior.n}`]
  for (const nombre of mezclar(paso.x || []))
    if (!nombresDeLaRuta.has(nombre)) candidatas.push(maniobra(giroHacia(nombre, decision), nombre))
  const incorrectas = [...new Set(candidatas)].filter(texto => texto !== decision.correcta)
  return mezclar([decision.correcta, ...incorrectas.slice(0, OPCIONES - 1)])
}

function alternativasDeLaPartida(decision, nombresDeLaRuta) {
  const otras = (decision.paso.x || []).filter(nombre => !nombresDeLaRuta.has(nombre))
  return mezclar([decision.correcta, ...mezclar(otras).slice(0, OPCIONES - 1)])
}

function dibujarRutaCompleta(pasos) {
  pasos.forEach((paso, indice) => {
    L.polyline(paso.g, { pane: 'routes', color: '#fff', weight: 9, opacity: 0.9, interactive: false }).addTo(
      capa,
    )
    L.polyline(paso.g, {
      pane: 'routes',
      color: COLORES_DE_TRAMOS[indice % COLORES_DE_TRAMOS.length],
      weight: 5,
      interactive: false,
    }).addTo(capa)
    L.tooltip({ permanent: true, direction: 'top', className: 'lbl', offset: [0, -4] })
      .setLatLng(paso.g[Math.floor(paso.g.length / 2)])
      .setContent(escaparHtml(paso.n))
      .addTo(capa)
  })
  const salida = pasos[0].g[0]
  const llegada = pasos.at(-1).g.at(-1)
  L.marker(salida, { icon: iconoDiv('pin a', 'A', 28), pane: 'points' }).addTo(capa)
  L.marker(llegada, { icon: iconoDiv('pin b', 'B', 28), pane: 'points' }).addTo(capa)
  encuadrar(L.latLngBounds(pasos.flatMap(paso => paso.g)).pad(0.1), 15)
}

export function salirDelRuteoConStreetView() {
  ocultarPanorama()
  document.body.classList.remove('ruteo-sv')
}

function recorrerConStreetView(q, { A, B, recorrido }) {
  const pasos = recorrido.steps
  const decisiones = decisionesDeLaRuta(pasos)
  const nombresDeLaRuta = new Set(pasos.map(paso => paso.n))
  const respuestas = []
  let indice = 0
  document.body.classList.add('ruteo-sv')

  const cabecera = () =>
    encabezadoDePregunta(q) +
    `<div class="q-prompt">De <b style="color:#2563eb">${escaparHtml(A.name)}</b> a <b style="color:#db2777">${escaparHtml(B.name)}</b></div>`

  function terminar() {
    salirDelRuteoConStreetView()
    dibujarRutaCompleta(pasos)
    const errores = respuestas.filter(ok => !ok).length
    const instrucciones = decisiones
      .map(
        (decision, i) =>
          `<li>${respuestas[i] ? '✅' : '❌'} ${escaparHtml(decision.hecha)} <span class="muted">· ${formatearKm(decision.paso.km)} km</span></li>`,
      )
      .join('')
    responder(
      errores === 0,
      `<p>${errores === 0 ? 'Llegaste sin errores.' : `Te equivocaste en ${errores} de ${decisiones.length} decisiones.`}</p>
      <ol class="blist">${instrucciones}<li>Llegas a ${escaparHtml(B.name)}.</li></ol>
      <p class="muted">~${formatearKm(recorrido.km)} km, ~${recorrido.min} min sin taco. Ruta calculada por OSRM; puede haber otras igual de buenas.</p>`,
      { partial: errores === 1 && decisiones.length >= 4 },
    )
  }

  function elegir(boton, opcion, decision, caja) {
    if (caja.dataset.done) return
    caja.dataset.done = '1'
    const acierto = opcion === decision.correcta
    respuestas.push(acierto)
    for (const otro of caja.querySelectorAll('.opt')) {
      otro.disabled = true
      if (otro.dataset.opcion === decision.correcta) otro.classList.add('ok')
    }
    if (!acierto) boton.classList.add('bad')
    const avanzar = () => {
      if (partida !== q || q.answered) return
      indice++
      if (indice < decisiones.length) mostrarDecision()
      else terminar()
    }
    if (acierto) return setTimeout(avanzar, MS_TRAS_ACERTAR)
    const seguir = document.createElement('button')
    seguir.className = 'btn next'
    seguir.textContent = 'Seguir por la ruta correcta →'
    seguir.onclick = () => {
      seguir.remove()
      avanzar()
    }
    panel.appendChild(seguir)
  }

  async function mostrarDecision() {
    const decision = decisiones[indice]
    const progreso = `<div class="q-sub" style="margin:8px 0 6px"><b>Paso ${indice + 1} de ${decisiones.length}</b></div>`
    mostrarPanel(cabecera() + progreso + '<p class="muted tight">Cargando Street View…</p>')
    const [lat, lon] = decision.camara
    const conImagen = await mostrarPanorama({ lat, lon, rumbo: decision.rumbo }).catch(() => null)
    if (partida !== q || q.answered) return
    const pregunta =
      indice === 0
        ? 'Estás en la salida. <b>¿Por qué calle partes?</b>'
        : `Vas por <b>${escaparHtml(decision.anterior.n)}</b> (${formatearKm(decision.anterior.km)} km). <b>¿Qué haces en el cruce que viene?</b>`
    const sinImagen = conImagen
      ? ''
      : '<p class="muted tight">Aquí no hay Street View: decide con lo que sabes.</p>'
    mostrarPanel(cabecera() + progreso + `<p class="tight">${pregunta}</p>${sinImagen}`)
    const opciones =
      indice === 0
        ? alternativasDeLaPartida(decision, nombresDeLaRuta)
        : alternativasDelCruce(decision, nombresDeLaRuta)
    const caja = document.createElement('div')
    caja.className = 'opts one'
    opciones.forEach((opcion, numero) => {
      const boton = document.createElement('button')
      boton.className = 'opt'
      boton.dataset.opcion = opcion
      boton.innerHTML = `<span class="k">${numero + 1}</span> ${escaparHtml(opcion)}`
      boton.onclick = () => elegir(boton, opcion, decision, caja)
      caja.appendChild(boton)
    })
    panel.appendChild(caja)
  }

  mostrarDecision()
}

registrarModo({
  id: 'rs-sv-car',
  group: 'Ruteo',
  name: 'Paso a paso · con Street View',
  noHint: true,
  disponible: streetViewDisponible,
  balance: ruta => lugarDeLaRuta(ruta)?.comuna,
  pool: rutasEnAuto,
  key: ruta => ruta.k,
  label: ruta => extremoDeRuta(ruta.from).name + ' → ' + extremoDeRuta(ruta.to).name,
  limpiar: salirDelRuteoConStreetView,
  async ask(ruta, q) {
    const recorrido = await rutaCalculada(ruta, q)
    if (!recorrido) return
    recorrerConStreetView(q, { A: extremoDeRuta(ruta.from), B: extremoDeRuta(ruta.to), recorrido })
  },
})
