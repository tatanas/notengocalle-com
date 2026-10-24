import RUTAS_PUBLICAS from '../../datos/rutasLibres.json'
import { BANDERA, cargarGrafo, puntosDeArista, recortarPuntos } from '../../../compartido/grafoVial.js'
import { camaraDeLaDecision } from '../../dominio/camaraRutaLibre.js'
import {
  crearRecorrido,
  elegirOpcion,
  peoresDecisiones,
  reiniciarRecorrido,
  rendirse,
  resultadoDelRecorrido,
  rutaOptima,
} from '../../dominio/rutaLibre.js'
import { escaparHtml } from '../../nucleo/utilidades.js'
import { COLORES, iconoDiv } from '../../mapa/dibujo.js'
import { capa, encuadrar, fijarModoDeEtiquetas } from '../../mapa/mapa.js'
import { CapaDeSentidos } from '../../mapa/sentidosDeCalle.js'
import { mostrarPanorama, ocultarPanorama, streetViewDisponible } from '../../mapa/streetView.js'
import { confirmarAccion } from '../../interfaz/confirmar.js'
import { mostrarPanel, panel } from '../../interfaz/panel.js'
import { encabezadoDePregunta, partida, responder } from '../engine.js'
import { registrarModo } from '../registry.js'

// Ruta libre: se llega de A a B decidiendo en cada cruce relevante, mirando Street View y sin mapa (en la práctica, con mapa).
// No hay "correcto" ni feedback mientras se juega: al final se compara el tiempo estimado con el de la ruta más rápida.
// Qué cruces preguntan y qué opciones hay: src/dominio/rutaLibre.js. Los grafos los genera tools/grafo/generar.mjs.
const CARPETA_DE_LOS_GRAFOS = '/data/ruta-libre/'
const PUNTAJE_PARA_ACERTAR = 80
const PUNTAJE_PARA_ESTAR_CERCA = 40
const COLOR_DE_LA_RUTA_OPTIMA = '#16a34a'
const REINICIOS_EN_UNA_RONDA = 1
const PEORES_DECISIONES_QUE_SE_MUESTRAN = 3

// De rojo (0) a verde (100) pasando por amarillo.
const colorDelPuntaje = puntaje => `hsl(${Math.round(puntaje * 1.2)}, 72%, 36%)`

const rutasDisponibles = RUTAS_PUBLICAS.map(ruta => ({ ...ruta, carpeta: CARPETA_DE_LOS_GRAFOS }))
// Las rutas con direcciones propias de quien desarrolla no se publican: solo se ven al trabajar en local.
if (import.meta.env.DEV)
  fetch(`${CARPETA_DE_LOS_GRAFOS}privadas/indice.json`)
    .then(respuesta => (respuesta.ok ? respuesta.json() : []))
    .then(rutas =>
      rutasDisponibles.push(
        ...rutas.map(ruta => ({ ...ruta, carpeta: `${CARPETA_DE_LOS_GRAFOS}privadas/` })),
      ),
    )
    .catch(() => {})

const grafosCargados = new Map()
async function grafoDeLaRuta(ruta) {
  if (!grafosCargados.has(ruta.id)) {
    const respuesta = await fetch(`${ruta.carpeta}${ruta.id}.json`)
    if (!respuesta.ok) throw new Error(`No se pudo cargar la ruta ${ruta.id}`)
    grafosCargados.set(ruta.id, cargarGrafo(await respuesta.json()))
  }
  return grafosCargados.get(ruta.id)
}

const formatearMinutos = segundos => (segundos / 60).toFixed(1).replace('.', ',')

const flechaDeRumbo = grados =>
  L.divIcon({
    className: 'flecha-de-rumbo',
    html: `<svg viewBox="0 0 24 24" width="30" height="30" style="transform:rotate(${Math.round(grados)}deg)"><circle cx="12" cy="12" r="11" fill="#2563eb" stroke="#fff" stroke-width="2"/><path d="M12 4 L17.5 16 L12 13 L6.5 16 Z" fill="#fff"/></svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

// El trazado de un recorrido, sin pasarse: parte en el punto de A (que queda a mitad de una calle) y, si llegó, termina en B.
function trazadoDeAristas(grafo, aristas, meta, { desdeElOrigen = true, hastaElDestino = false } = {}) {
  return aristas.flatMap((arista, posicion) => {
    const sale =
      desdeElOrigen && posicion === 0 ? meta.origen.aristas.find(salida => salida.arista === arista) : null
    const llega =
      hastaElDestino && posicion === aristas.length - 1
        ? meta.destino.aristas.find(entrada => entrada.arista === arista)
        : null
    return recortarPuntos(puntosDeArista(grafo, arista), sale?.fraccion ?? 0, llega?.fraccion ?? 1)
  })
}

const RANGO_MAXIMO_DE_LAS_CALLES_CON_FLECHAS = 6
const METROS_MINIMOS_DE_UNA_CALLE_CON_FLECHAS = 20

// Los tramos de un solo sentido (menos rotondas y calles de servicio), cada uno en el sentido en que se puede avanzar.
function trazadosDeSentidoUnico(grafo) {
  grafo.trazadosDeSentidoUnico ??= Array.from({ length: grafo.cantidadDeAristas }, (_, arista) => arista)
    .filter(
      arista =>
        grafo.inversa[arista] === -1 &&
        !(grafo.banderas[arista] & BANDERA.ROTONDA) &&
        grafo.rango[arista] <= RANGO_MAXIMO_DE_LAS_CALLES_CON_FLECHAS &&
        grafo.metros[arista] >= METROS_MINIMOS_DE_UNA_CALLE_CON_FLECHAS,
    )
    .map(arista => puntosDeArista(grafo, arista))
  return grafo.trazadosDeSentidoUnico
}

export function salirDeRutaLibre() {
  ocultarPanorama()
  document.body.classList.remove('ruteo-sv', 'ruta-libre-ronda')
}

function jugarRutaLibre(q, ruta, grafo) {
  const { origen, destino } = grafo.meta
  const recorrido = crearRecorrido(grafo, grafo.meta)
  if (import.meta.env.DEV) window.__rutaLibre = recorrido
  const capaDelRecorrido = L.layerGroup().addTo(capa)
  let posicionActual = null
  let camaraActual = null

  const cabecera = () =>
    encabezadoDePregunta(q) +
    `<div class="q-prompt">De <b style="color:#2563eb">${escaparHtml(origen.nombre)}</b> a <b style="color:#db2777">${escaparHtml(destino.nombre)}</b></div>`

  const marcarExtremos = destinoCapa => {
    L.marker(origen.punto, { icon: iconoDiv('pin a', 'A', 28), pane: 'points' }).addTo(destinoCapa)
    L.marker(destino.punto, { icon: iconoDiv('pin b', 'B', 28), pane: 'points' }).addTo(destinoCapa)
  }

  function marcarElMapa() {
    marcarExtremos(capaDelRecorrido)
    capaDelRecorrido.addLayer(new CapaDeSentidos(trazadosDeSentidoUnico(grafo)))
  }

  function planificar() {
    marcarElMapa()
    fijarModoDeEtiquetas(q.ranked ? 'plain' : 'streets')
    encuadrar(L.latLngBounds([origen.punto, destino.punto]).pad(0.35), 16)
    const ayuda = q.ranked
      ? 'Después tendrás que llegar solo con Street View y lo que recuerdes del mapa.'
      : 'Después llegas con Street View; en la práctica puedes abrir el mapa cuando quieras.'
    mostrarPanel(`${cabecera()}
      <p class="tight">Mira el mapa todo el tiempo que necesites y piensa cómo llegar. ${ayuda} El reloj parte cuando aprietes el botón.</p>
      <button class="btn" id="rutaLibreLista">Estoy listo</button>`)
    document.getElementById('rutaLibreLista').onclick = comenzar
  }

  function comenzar() {
    q.t0 = Date.now()
    document.body.classList.add('ruteo-sv')
    document.body.classList.toggle('ruta-libre-ronda', q.ranked)
    mostrarDecision()
  }

  function dibujarLoRecorrido(aristas, desdeElOrigen) {
    L.polyline(trazadoDeAristas(grafo, aristas, grafo.meta, { desdeElOrigen }), {
      pane: 'routes',
      color: COLORES.street,
      weight: 5,
      interactive: false,
    }).addTo(capaDelRecorrido)
  }

  function verDondeEstoy() {
    posicionActual?.remove()
    posicionActual = L.marker([camaraActual.lat, camaraActual.lon], {
      icon: flechaDeRumbo(camaraActual.rumbo),
      pane: 'points',
    })
      .addTo(capaDelRecorrido)
      .bindTooltip('Estás aquí', { permanent: true, direction: 'top', offset: [0, -14] })
    encuadrar(L.latLngBounds([[camaraActual.lat, camaraActual.lon], destino.punto]).pad(0.25), 16)
  }

  const girarFlecha = grados => posicionActual?.setIcon(flechaDeRumbo(grados))

  function elegir(id) {
    const antes = recorrido.aristas.length
    elegirOpcion(recorrido, id)
    if (!q.ranked) {
      const desde = Math.max(0, antes - 1)
      dibujarLoRecorrido(recorrido.aristas.slice(desde), desde === 0)
    }
    mostrarDecision()
  }

  async function mostrarDecision() {
    if (recorrido.fin) return terminar()
    const { decision } = recorrido
    camaraActual = camaraDeLaDecision(grafo, recorrido.aristas, grafo.meta)
    if (import.meta.env.DEV) window.__camaraRutaLibre = camaraActual
    mostrarPanel(`${cabecera()}<div class="q-sub" style="margin:8px 0 6px"><b>Decisión ${decision.numero}</b></div>
      <p class="muted tight">Cargando Street View…</p>`)
    const conImagen = await mostrarPanorama(camaraActual, {
      alVerElMapa: verDondeEstoy,
      alGirarLaVista: girarFlecha,
      enLaPista: true,
      sinCaminar: true,
    }).catch(() => null)
    if (partida !== q || q.answered) return
    const rumbo = decision.ibaHacia ? `hacia el <b>${decision.ibaHacia}</b> ` : ''
    const donde = decision.ibaPor
      ? `Vas ${rumbo}por <b>${escaparHtml(decision.ibaPor)}</b>. ¿Qué haces?`
      : `Partes desde <b>${escaparHtml(origen.nombre)}</b>. ¿Hacia dónde sales?`
    const unicaSalida = decision.forzada
      ? '<p class="muted tight">No hay otra salida: solo puedes seguir.</p>'
      : ''
    const sinImagen = conImagen
      ? ''
      : '<p class="muted tight">Aquí no hay Street View: decide con lo que sabes.</p>'
    mostrarPanel(`${cabecera()}<div class="q-sub" style="margin:8px 0 6px"><b>Decisión ${decision.numero}</b></div>
      <p class="tight">${donde}</p>${unicaSalida}${sinImagen}`)
    const caja = document.createElement('div')
    caja.className = 'opts one'
    decision.opciones.forEach((opcion, numero) => {
      const boton = document.createElement('button')
      boton.className = 'opt'
      boton.innerHTML = `<span class="k">${numero + 1}</span> ${escaparHtml(opcion.texto)}`
      boton.onclick = () => {
        if (caja.dataset.listo) return
        caja.dataset.listo = '1'
        elegir(opcion.id)
      }
      caja.appendChild(boton)
    })
    panel.appendChild(caja)
    panel.appendChild(filaDeAcciones())
  }

  function filaDeAcciones() {
    const fila = document.createElement('div')
    fila.className = 'row'
    fila.style.marginTop = '10px'
    const puedeReiniciar = !q.ranked || recorrido.reinicios < REINICIOS_EN_UNA_RONDA
    if (puedeReiniciar) {
      const reiniciar = document.createElement('button')
      reiniciar.className = 'btn sec'
      reiniciar.textContent = '↺ Volver a A'
      reiniciar.onclick = volverAlInicio
      fila.appendChild(reiniciar)
    }
    const rendirseAhora = document.createElement('button')
    rendirseAhora.className = 'btn sec'
    rendirseAhora.textContent = '🏳️ Rendirme'
    rendirseAhora.onclick = abandonar
    fila.appendChild(rendirseAhora)
    return fila
  }

  async function volverAlInicio() {
    const conCosto = q.ranked
    if (
      conCosto &&
      !(await confirmarAccion({
        title: '¿Volver a A?',
        message:
          'Tienes un solo reinicio en esta ronda. Se suma el tiempo que ya manejaste y lo que toma volver a A desde donde estás.',
        confirmLabel: 'Volver a A',
        cancelLabel: 'Seguir',
      }))
    )
      return
    if (partida !== q || q.answered) return
    reiniciarRecorrido(recorrido, { conCosto })
    capaDelRecorrido.clearLayers()
    marcarElMapa()
    posicionActual = null
    mostrarDecision()
  }

  async function abandonar() {
    const confirmado = await confirmarAccion({
      title: '¿Rendirte?',
      message: q.ranked
        ? 'La ronda termina con 0 puntos y verás la ruta más rápida.'
        : 'La práctica termina y verás la ruta más rápida.',
      confirmLabel: 'Rendirme',
      cancelLabel: 'Seguir',
    })
    if (!confirmado || partida !== q || q.answered) return
    rendirse(recorrido)
    mostrarDecision()
  }

  function terminar() {
    mostrarPanel(cabecera())
    salirDeRutaLibre()
    capaDelRecorrido.remove()
    fijarModoDeEtiquetas('streets')
    const resultado = resultadoDelRecorrido(recorrido)
    const peores = peoresDecisiones(recorrido, PEORES_DECISIONES_QUE_SE_MUESTRAN)
    const optima = trazadoDeAristas(grafo, rutaOptima(recorrido), grafo.meta, { hastaElDestino: true })
    const jugadas = resultado.intentos.map((aristas, intento) =>
      trazadoDeAristas(grafo, aristas, grafo.meta, {
        hastaElDestino: resultado.fin === 'llegada' && intento === resultado.intentos.length - 1,
      }),
    )
    const jugada = jugadas.flat()
    L.polyline(optima, {
      pane: 'routes',
      color: COLOR_DE_LA_RUTA_OPTIMA,
      weight: 9,
      opacity: 0.6,
      interactive: false,
    }).addTo(capa)
    for (const trazado of jugadas)
      L.polyline(trazado, { pane: 'routes', color: COLORES.street, weight: 4, interactive: false }).addTo(
        capa,
      )
    marcarExtremos(capa)
    encuadrar(L.latLngBounds([...optima, ...jugada]).pad(0.1), 16)

    const dondePerdiste = peores.length
      ? `<p class="muted tight" style="margin-bottom:4px">Dónde perdiste más tiempo:</p>
        <ol class="blist">${peores
          .map(
            decision =>
              `<li>${escaparHtml(decision.elegida)}<br><span class="muted">Mejor: ${escaparHtml(decision.mejor)} · te costó ${decision.perdidaEnSegundos} s</span></li>`,
          )
          .join('')}</ol>`
      : '<p class="muted">No perdiste tiempo en ninguna decisión.</p>'
    const reinicios =
      q.ranked && resultado.reinicios
        ? '<p class="muted tight">Usaste un reinicio: cuenta el tiempo que ya habías manejado.</p>'
        : ''
    const veces = resultado.segundos / resultado.optimoSegundos
    const resumen =
      resultado.fin === 'llegada'
        ? `<p>Llegaste en unos <b>${formatearMinutos(resultado.segundos)} min</b>; la ruta más rápida toma ${formatearMinutos(resultado.optimoSegundos)} min${veces > 1.05 ? ` (+${Math.round((veces - 1) * 100)} %)` : ''}.</p>`
        : resultado.fin === 'rendido'
          ? '<p>Te rendiste.</p>'
          : '<p>Te alejaste demasiado de la ruta y no llegaste.</p>'
    responder(
      resultado.puntaje >= PUNTAJE_PARA_ACERTAR,
      `<p class="result-score tight" style="color:${colorDelPuntaje(resultado.puntaje)}">${resultado.puntaje} %</p>${resumen}${reinicios}${dondePerdiste}
      <p class="muted">En verde, la ruta más rápida; en azul, la tuya. Tiempos estimados sin tráfico, con un modelo propio de velocidades y semáforos: puede haber otras rutas casi igual de buenas.</p>`,
      { points: resultado.puntaje, partial: resultado.puntaje >= PUNTAJE_PARA_ESTAR_CERCA },
    )
  }

  planificar()
}

registrarModo({
  id: 'rl-sv',
  group: 'Ruteo',
  name: 'Ruta libre',
  noHint: true,
  puntosPorPregunta: 100,
  disponible: () => streetViewDisponible() && (RUTAS_PUBLICAS.length > 0 || import.meta.env.DEV),
  pool: () => rutasDisponibles,
  key: ruta => ruta.id,
  label: ruta => `${ruta.origen} → ${ruta.destino}`,
  limpiar: salirDeRutaLibre,
  async ask(ruta, q) {
    mostrarPanel(`${encabezadoDePregunta(q)}<p class="muted tight">Cargando la ruta…</p>`)
    let grafo
    try {
      grafo = await grafoDeLaRuta(ruta)
    } catch {
      return mostrarPanel(`${encabezadoDePregunta(q)}<p>No se pudo cargar esta ruta.</p>`)
    }
    if (partida !== q || q.answered) return
    jugarRutaLibre(q, ruta, grafo)
  },
})
