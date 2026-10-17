import { distanciaALinea, distanciaKm, puntoMasCercanoEnLineas } from '../../nucleo/geografia.js'
import { escaparHtml, mezclar } from '../../nucleo/utilidades.js'
import {
  GRADOS_DE_SEGUIR_DERECHO,
  GRADOS_DE_VUELTA_EN_U,
  giro,
  ladoDelGiro,
  puntoAntesDelFinal,
  puntoCardinal,
  puntoDesdeElInicio,
  rumbo,
  textoDeManiobra,
} from '../../dominio/maniobras.js'
import { lineasDeLasCallesDelJuego } from '../../dominio/rutaEnAuto.js'
import { vias } from '../../datos/datos.js'
import { nombreDeRuteoDeCalle } from '../../../compartido/rutaEnAuto.js'
import { COLORES, COLORES_DE_TRAMOS, iconoDiv } from '../../mapa/dibujo.js'
import { capa, encuadrar } from '../../mapa/mapa.js'
import { mostrarPanorama, ocultarPanorama, streetViewDisponible } from '../../mapa/streetView.js'
import { mostrarPanel, panel } from '../../interfaz/panel.js'
import { encabezadoDePregunta, partida, responder } from '../engine.js'
import { extremoDeRuta, lugarDeLaRuta, rutaCalculada, rutasEnAuto } from '../pasos.js'
import { registrarModo } from '../registry.js'

// Ruteo en auto mirando Street View en vez del mapa: se salta de decisión en decisión de la ruta. En cada una se ve la
// calle un poco antes de donde se la deja, mirando hacia donde se avanza, y se elige qué hacer ("Dobla a la derecha en
// Av. Grecia"…). Si la ruta pasa por calles chicas entre dos principales, se cuentan ("doblaste por Vital Apoquindo") y se
// pregunta al llegar a la principal. Si se equivoca, se corrige al tiro y la ruta sigue por donde correspondía.
// El mapa se puede abrir en cualquier momento para ver dónde se está; al llegar muestra la ruta completa.
const KM_ANTES_DE_DECIDIR = 0.05
const KM_ANTES_DE_LLEGAR_A_LA_CALLE = 0.03
const KM_PARA_MEDIR_EL_RUMBO = 0.06
const KM_PARA_MEDIR_LA_CALLE_SIGUIENTE = 0.15
// Una calle que pasa a menos de esto del cruce sale del mismo cruce: no se sabe para qué lado, se elige al azar.
const KM_DE_CALLE_EN_EL_CRUCE = 0.08
const OPCIONES = 4
// Más calles chicas que esto entre dos principales se resumen ("por X y otras calles chicas").
const CONECTORES_NOMBRADOS = 2
const MS_TRAS_ACERTAR = 700
const GRADOS_DE_GIRO_COMUN = 90

let autopistas = null
const esAutopista = nombre =>
  (autopistas ??= new Set(
    vias()
      .filter(calle => calle.kind === 'autopista')
      .map(calle => nombreDeRuteoDeCalle(calle.name)),
  )).has(nombre)

const maniobra = (grados, calle) => textoDeManiobra(grados, calle, { autopista: esAutopista(calle) })
const giroAlAzar = () => (Math.random() < 0.5 ? GRADOS_DE_GIRO_COMUN : -GRADOS_DE_GIRO_COMUN)
const formatearKm = km => String(km).replace('.', ',')
const conMinuscula = texto => texto[0].toLowerCase() + texto.slice(1)

function decisionDePartida(paso) {
  const salida = paso.g[0]
  const rumboDeSalida = rumbo(salida, puntoDesdeElInicio(paso.g, KM_PARA_MEDIR_EL_RUMBO))
  return {
    paso,
    pregunta: `Estás en la salida, mirando hacia el ${puntoCardinal(rumboDeSalida)}. <b>¿Por qué calle partes?</b>`,
    camara: salida,
    rumbo: rumboDeSalida,
    correcta: paso.n,
    hecha: `Parte por ${paso.n}`,
  }
}

// La calle anterior se deja en su fin; lo que viene después (conectores y la calle nueva) es otro trazado.
function separarEnElFin(anterior) {
  const fin = anterior.fin ?? anterior.g.at(-1)
  let indiceDelFin = 0
  anterior.g.forEach((punto, indice) => {
    if (distanciaKm(punto, fin) < distanciaKm(anterior.g[indiceDelFin], fin)) indiceDelFin = indice
  })
  return { fin, propio: anterior.g.slice(0, indiceDelFin + 1), conector: anterior.g.slice(indiceDelFin) }
}

function textoDelDesvio(grados, conectores) {
  const verbo =
    Math.abs(grados) < GRADOS_DE_SEGUIR_DERECHO ? 'seguiste' : `doblaste a la ${ladoDelGiro(grados)}`
  const nombrar = nombre => (/^Rotonda/.test(nombre) ? `la ${nombre}` : nombre)
  const calles =
    conectores.length > CONECTORES_NOMBRADOS
      ? `${nombrar(conectores[0])} y otras calles chicas`
      : conectores.map(nombrar).join(' y luego por ')
  return { verbo, calles }
}

function decisionDeCruce(anterior, paso) {
  const { fin, propio, conector } = separarEnElFin(anterior)
  const rumboEnElFin = rumbo(puntoAntesDelFinal(propio, KM_PARA_MEDIR_EL_RUMBO), fin)
  const conectores = anterior.c ?? []
  // Sin calles chicas entremedio, el giro se mide contra la calle siguiente (no contra la rampa, que en un trébol se curva
  // hacia atrás); con calles chicas, el primer giro es hacia la primera de ellas.
  const rumboDeLaSiguiente = rumbo(paso.g[0], puntoDesdeElInicio(paso.g, KM_PARA_MEDIR_LA_CALLE_SIGUIENTE))
  const giroEnElFin = conectores.length
    ? giro(rumboEnElFin, rumbo(fin, puntoDesdeElInicio(conector, KM_PARA_MEDIR_LA_CALLE_SIGUIENTE)))
    : giro(rumboEnElFin, rumboDeLaSiguiente)
  if (!conectores.length) {
    const correcta = maniobra(giroEnElFin, paso.n)
    return {
      paso,
      calleActual: anterior.n,
      pregunta: `Vas hacia el ${puntoCardinal(rumboEnElFin)} por <b>${escaparHtml(anterior.n)}</b> (${formatearKm(anterior.km)} km). <b>¿Qué haces en el cruce que viene?</b>`,
      cruce: fin,
      camara: puntoAntesDelFinal(propio, KM_ANTES_DE_DECIDIR),
      rumbo: rumboEnElFin,
      grados: giroEnElFin,
      correcta,
      hecha: correcta,
    }
  }
  // Por calles chicas hasta la siguiente: se cuenta el primer giro y se pregunta al llegar a la calle nueva.
  const cruce = paso.g[0]
  const rumboDeLlegada = rumbo(puntoAntesDelFinal(conector, KM_PARA_MEDIR_EL_RUMBO), conector.at(-1))
  const grados = giro(rumboDeLlegada, rumboDeLaSiguiente)
  const correcta = maniobra(grados, paso.n)
  const { verbo, calles } = textoDelDesvio(giroEnElFin, conectores)
  return {
    paso,
    calleActual: conectores.at(-1),
    pregunta: `Ibas hacia el ${puntoCardinal(rumboEnElFin)} por <b>${escaparHtml(anterior.n)}</b> y ${verbo} por <b>${escaparHtml(calles)}</b>. Ahora vas hacia el ${puntoCardinal(rumboDeLlegada)} y llegas a <b>${escaparHtml(paso.n)}</b>: <b>¿qué haces?</b>`,
    cruce,
    camara: puntoAntesDelFinal(conector, KM_ANTES_DE_LLEGAR_A_LA_CALLE),
    rumbo: rumboDeLlegada,
    grados,
    correcta,
    hecha: `${maniobra(giroEnElFin, conectores[0])} y luego ${conMinuscula(correcta)}`,
  }
}

const decisionesDeLaRuta = pasos =>
  pasos.map((paso, indice) =>
    indice === 0 ? decisionDePartida(paso) : decisionDeCruce(pasos[indice - 1], paso),
  )

// Para qué lado queda una calle vista desde el cruce, si no pasa por él mismo.
function giroHacia(nombre, decision) {
  const lineas = lineasDeLasCallesDelJuego().get(nombre)
  if (!lineas) return giroAlAzar()
  const { km, point: punto } = puntoMasCercanoEnLineas(decision.cruce, lineas)
  return km > KM_DE_CALLE_EN_EL_CRUCE ? giro(decision.rumbo, rumbo(decision.cruce, punto)) : giroAlAzar()
}

// Calles del juego de la más cercana a la más lejana de un punto: completan las alternativas cuando las precalculadas
// no alcanzan.
const callesCercanas = (punto, excluidas) =>
  [...lineasDeLasCallesDelJuego()]
    .filter(([nombre]) => !excluidas.has(nombre))
    .map(([nombre, lineas]) => ({ nombre, km: distanciaALinea(punto, lineas) }))
    .sort((a, b) => a.km - b.km)
    .map(({ nombre }) => nombre)

function alternativasDelCruce(decision, nombresDeLaRuta) {
  const { paso, calleActual, grados, cruce } = decision
  const doblaDeVerdad = Math.abs(grados) >= GRADOS_DE_SEGUIR_DERECHO
  // Si lo correcto es seguir derecho (la calle cambia de nombre), "sigue por la actual sin doblar" sería lo mismo.
  const candidatas = doblaDeVerdad ? [maniobra(-grados, paso.n), `Sigue por ${calleActual} sin doblar`] : []
  const excluidas = new Set([...nombresDeLaRuta, calleActual])
  const cercanas = [...new Set([...mezclar(paso.x || []), ...callesCercanas(cruce, excluidas)])]
  for (const nombre of cercanas.filter(nombre => !excluidas.has(nombre))) {
    const haciaLaCalle = giroHacia(nombre, decision)
    // una calle que queda atrás no es algo que se haga en un cruce
    if (Math.abs(haciaLaCalle) <= GRADOS_DE_VUELTA_EN_U) candidatas.push(maniobra(haciaLaCalle, nombre))
  }
  const incorrectas = [...new Set(candidatas)].filter(texto => texto !== decision.correcta)
  return mezclar([decision.correcta, ...incorrectas.slice(0, OPCIONES - 1)])
}

function alternativasDeLaPartida(decision, nombresDeLaRuta) {
  const { paso } = decision
  const otras = [...new Set([...mezclar(paso.x || []), ...callesCercanas(paso.g[0], nombresDeLaRuta)])]
  return mezclar([
    decision.correcta,
    ...otras.filter(nombre => !nombresDeLaRuta.has(nombre)).slice(0, OPCIONES - 1),
  ])
}

const flechaDeRumbo = grados =>
  L.divIcon({
    className: 'flecha-de-rumbo',
    html: `<svg viewBox="0 0 24 24" width="30" height="30" style="transform:rotate(${Math.round(grados)}deg)"><circle cx="12" cy="12" r="11" fill="#2563eb" stroke="#fff" stroke-width="2"/><path d="M12 4 L17.5 16 L12 13 L6.5 16 Z" fill="#fff"/></svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

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
  const salida = pasos[0].g[0]
  const llegada = pasos.at(-1).g.at(-1)
  let indice = 0
  document.body.classList.add('ruteo-sv')

  // Lo que se ve al abrir el mapa a mitad de camino: A, B, lo ya recorrido y dónde se está ahora.
  const capaDelRecorrido = L.layerGroup().addTo(capa)
  L.marker(salida, { icon: iconoDiv('pin a', 'A', 28), pane: 'points' }).addTo(capaDelRecorrido)
  L.marker(llegada, { icon: iconoDiv('pin b', 'B', 28), pane: 'points' }).addTo(capaDelRecorrido)
  let posicionActual = null
  function marcarAvance(decision) {
    if (indice > 0) {
      const color = respuestas[indice - 1] ? COLORES.ok : COLORES.hi
      L.polyline(pasos[indice - 1].g, { pane: 'routes', color, weight: 5, interactive: false }).addTo(
        capaDelRecorrido,
      )
    }
    posicionActual?.remove()
    posicionActual = L.marker(decision.camara, { icon: flechaDeRumbo(decision.rumbo), pane: 'points' })
      .addTo(capaDelRecorrido)
      .bindTooltip('Estás aquí', { permanent: true, direction: 'top', offset: [0, -14] })
  }
  // La flecha gira con la vista del panorama: apunta hacia donde se está mirando.
  const girarFlecha = grados => posicionActual?.setIcon(flechaDeRumbo(grados))
  const verDondeEstoy = () => encuadrar(L.latLngBounds([decisiones[indice].camara, llegada]).pad(0.25), 16)

  const cabecera = () =>
    encabezadoDePregunta(q) +
    `<div class="q-prompt">De <b style="color:#2563eb">${escaparHtml(A.name)}</b> a <b style="color:#db2777">${escaparHtml(B.name)}</b></div>`

  function terminar() {
    salirDelRuteoConStreetView()
    capaDelRecorrido.remove()
    L.marker(salida, { icon: iconoDiv('pin a', 'A', 28), pane: 'points' }).addTo(capa)
    L.marker(llegada, { icon: iconoDiv('pin b', 'B', 28), pane: 'points' }).addTo(capa)
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
      <p class="muted">~${formatearKm(recorrido.km)} km, ~${recorrido.min} min sin taco. Ruta calculada por Valhalla; puede haber otras igual de buenas.</p>`,
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
    marcarAvance(decision)
    const progreso = `<div class="q-sub" style="margin:8px 0 6px"><b>Paso ${indice + 1} de ${decisiones.length}</b></div>`
    mostrarPanel(cabecera() + progreso + '<p class="muted tight">Cargando Street View…</p>')
    const [lat, lon] = decision.camara
    const conImagen = await mostrarPanorama(
      { lat, lon, rumbo: decision.rumbo },
      { alVerElMapa: verDondeEstoy, alGirarLaVista: girarFlecha },
    ).catch(() => null)
    if (partida !== q || q.answered) return
    const sinImagen = conImagen
      ? ''
      : '<p class="muted tight">Aquí no hay Street View: decide con lo que sabes.</p>'
    mostrarPanel(cabecera() + progreso + `<p class="tight">${decision.pregunta}</p>${sinImagen}`)
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
