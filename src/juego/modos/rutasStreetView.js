import { escaparHtml, mezclar } from '../../nucleo/utilidades.js'
import { decisionesConStreetView } from '../../dominio/decisionesConStreetView.js'
import { contextoDeLasDecisiones } from '../../dominio/rutaEnAuto.js'
import { COLORES, COLORES_DE_TRAMOS, iconoDiv } from '../../mapa/dibujo.js'
import { capa, encuadrar } from '../../mapa/mapa.js'
import { mostrarPanorama, ocultarPanorama, streetViewDisponible } from '../../mapa/streetView.js'
import { mostrarPanel, panel } from '../../interfaz/panel.js'
import { encabezadoDePregunta, partida, responder } from '../engine.js'
import { extremoDeRuta, lugarDeLaRuta, rutaCalculada, rutasEnAuto, salidasConocidasDe } from '../pasos.js'
import { registrarModo } from '../registry.js'

// Ruteo en auto mirando Street View en vez del mapa: se salta de decisión en decisión de la ruta. En cada una se ve la
// calle un poco antes de donde se la deja, mirando hacia donde se avanza, y se elige qué hacer ("Dobla a la derecha en
// Av. Grecia"…). Si la ruta pasa por calles chicas entre dos principales, se cuentan ("doblaste por Vital Apoquindo") y se
// pregunta al llegar a la principal. Si se equivoca, se corrige al tiro y la ruta sigue por donde correspondía.
// El mapa se puede abrir en cualquier momento para ver dónde se está; al llegar muestra la ruta completa.
// Qué se pregunta y qué alternativas hay en cada cruce lo decide src/dominio/decisionesConStreetView.js: donde no hay otra
// cosa que hacer, no hay pregunta y se pasa de largo.
const MS_TRAS_ACERTAR = 700

const formatearKm = km => String(km).replace('.', ',')

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

function recorrerConStreetView(q, { A, B, recorrido, ruta }) {
  const pasos = recorrido.steps
  const decisiones = decisionesConStreetView(pasos, {
    ...contextoDeLasDecisiones(),
    salidasConocidas: salidasConocidasDe(ruta),
  })
  const preguntas = decisiones.filter(decision => decision.incorrectas.length).length
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
  function mostrarDondeEstoy(decision) {
    posicionActual?.remove()
    posicionActual = L.marker(decision.camara, { icon: flechaDeRumbo(decision.rumbo), pane: 'points' })
      .addTo(capaDelRecorrido)
      .bindTooltip('Estás aquí', { permanent: true, direction: 'top', offset: [0, -14] })
    for (const pin of decision.pines ?? [])
      L.marker(pin.p, { icon: iconoDiv('pin salida', '', 18), pane: 'points' })
        .addTo(capaDelRecorrido)
        .bindTooltip(escaparHtml(pin.texto), { permanent: true, direction: 'top', offset: [0, -12] })
  }
  // Lo que se recorrió con la respuesta, del color de si se acertó.
  function marcarRecorrido(decision, acierto) {
    for (const trazado of decision.alResponder)
      L.polyline(trazado, {
        pane: 'routes',
        color: acierto ? COLORES.ok : COLORES.hi,
        weight: 5,
        interactive: false,
      }).addTo(capaDelRecorrido)
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
          `<li>${respuestas[i] ? '✅' : '❌'} ${escaparHtml(decision.hecha)} <span class="muted">· ${formatearKm(decision.km)} km</span></li>`,
      )
      .join('')
    responder(
      errores === 0,
      `<p>${errores === 0 ? 'Llegaste sin errores.' : `Te equivocaste en ${errores} de ${preguntas} decisiones.`}</p>
      <ol class="blist">${instrucciones}<li>Llegas a ${escaparHtml(B.name)}.</li></ol>
      <p class="muted">~${formatearKm(recorrido.km)} km, ~${recorrido.min} min sin taco. Ruta calculada por Valhalla; puede haber otras igual de buenas.</p>`,
      { partial: errores === 1 && preguntas >= 4 },
    )
  }

  function avanzar() {
    if (partida !== q || q.answered) return
    indice++
    if (indice < decisiones.length) mostrarDecision()
    else terminar()
  }

  function botonParaSeguir(texto) {
    const seguir = document.createElement('button')
    seguir.className = 'btn next'
    seguir.textContent = texto
    seguir.onclick = () => {
      seguir.remove()
      avanzar()
    }
    panel.appendChild(seguir)
  }

  function contestar(boton, opcion, decision, caja) {
    if (caja.dataset.done) return
    caja.dataset.done = '1'
    const acierto = opcion === decision.correcta
    respuestas.push(acierto)
    marcarRecorrido(decision, acierto)
    for (const otro of caja.querySelectorAll('.opt')) {
      otro.disabled = true
      if (otro.dataset.opcion === decision.correcta) otro.classList.add('ok')
    }
    if (!acierto) boton.classList.add('bad')
    if (acierto) return setTimeout(avanzar, MS_TRAS_ACERTAR)
    botonParaSeguir('Seguir por la ruta correcta →')
  }

  async function mostrarDecision() {
    const decision = decisiones[indice]
    // Donde no hay otra cosa que hacer no hay pregunta: se pasa de largo sin detenerse.
    if (!decision.incorrectas.length) {
      respuestas.push(true)
      marcarRecorrido(decision, true)
      return avanzar()
    }
    mostrarDondeEstoy(decision)
    const progreso = `<div class="q-sub" style="margin:8px 0 6px"><b>Pregunta ${decisiones.slice(0, indice + 1).filter(d => d.incorrectas.length).length} de ${preguntas}</b></div>`
    mostrarPanel(cabecera() + progreso + '<p class="muted tight">Cargando Street View…</p>')
    const [lat, lon] = decision.camara
    const conImagen = await mostrarPanorama(
      { lat, lon, rumbo: decision.rumbo },
      { alVerElMapa: verDondeEstoy, alGirarLaVista: girarFlecha, enLaPista: true },
    ).catch(() => null)
    if (partida !== q || q.answered) return
    const sinImagen = conImagen
      ? ''
      : '<p class="muted tight">Aquí no hay Street View: decide con lo que sabes.</p>'
    mostrarPanel(cabecera() + progreso + `<p class="tight">${decision.pregunta}</p>${sinImagen}`)
    const opciones = decision.opciones ?? mezclar([decision.correcta, ...decision.incorrectas])
    const caja = document.createElement('div')
    caja.className = 'opts one'
    opciones.forEach((opcion, numero) => {
      const boton = document.createElement('button')
      boton.className = 'opt'
      boton.dataset.opcion = opcion
      boton.innerHTML = `<span class="k">${numero + 1}</span> ${escaparHtml(opcion)}`
      boton.onclick = () => contestar(boton, opcion, decision, caja)
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
    recorrerConStreetView(q, { A: extremoDeRuta(ruta.from), B: extremoDeRuta(ruta.to), recorrido, ruta })
  },
})
