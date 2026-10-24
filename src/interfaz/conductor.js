import { cargarGrafo } from '../../compartido/grafoVial.js'
import { camaraDeLaDecision, evaluarPanorama } from '../dominio/camaraDeConduccion.js'
import { elegirOpcion } from '../dominio/conduccion.js'
import { nombreDeCalle } from '../dominio/cruces.js'
import { textosDelCruce } from '../dominio/instruccionesDeCruce.js'
import {
  analizarRecorrido,
  costosDeLasOpciones,
  segundosDeDesvio,
  yaSeFueDemasiadoLejos,
} from '../dominio/mision.js'
import { puntoCardinal, recortarTrazado } from '../dominio/trazado.js'
import { COLORES_DE_TRAMOS } from '../mapa/dibujo.js'
import { capa, encuadrar, mapa } from '../mapa/mapa.js'
import {
  apuntarPanoramaHacia,
  escucharPanorama,
  mostrarPanoramaDeConduccion,
  ocultarPanorama,
  posicionDelPanorama,
  rumboDeLaVista,
  streetViewDisponible,
} from '../mapa/streetView.js'
import { $, escaparHtml } from '../nucleo/utilidades.js'
import { mostrarPanel } from './panel.js'

// El manejo: el auto avanza de decisión en decisión por el grafo vial, viendo la calle en Street View, y el auto del mapa siempre
// está donde está el panorama. Lo usan el modo libre (src/interfaz/conducir.js) y el juego de ruteo en auto
// (src/juego/modos/ruteoEnAuto.js). En el juego (con `ruta`) se cuenta el desvío, se puede uno rendir y se termina al llegar; en la
// ronda real (`ciego`) el mapa no se ve: solo Street View y las opciones.
const URL_DEL_GRAFO = '/data/grafo/santiago.json'
const ZOOM_AL_CONDUCIR = 17
const METROS_DE_CADA_OPCION_EN_EL_MAPA = 70

let grafoPendiente = null
let estado = null
// La ruta del juego { etiqueta, mision, optima }; null al conducir libremente.
let ruta = null
let ciego = false
let encabezado = () => '<h4>🚗 Conducir libre</h4>'
let alTerminar = null
let alSalir = null
let capaDelCruce = null
let autoEnElMapa = null
let ultimaVista = null
let confirmandoRendicion = false
let resultado = null
let desactivar = null

export function cargarElGrafo() {
  grafoPendiente ||= fetch(URL_DEL_GRAFO)
    .then(respuesta => {
      if (!respuesta.ok) throw new Error('Falta el grafo: node tools/grafo/construirSantiago.mjs')
      return respuesta.json()
    })
    .then(cargarGrafo)
    .catch(error => {
      grafoPendiente = null
      throw error
    })
  return grafoPendiente
}

const iconoDelAuto = () =>
  L.divIcon({
    className: 'flecha-de-rumbo',
    html: '<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11" fill="#2563eb" stroke="#fff" stroke-width="2"/><path d="M12 4 L17.5 16 L12 13 L6.5 16 Z" fill="#fff"/></svg>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })

function rotarAuto(rumbo) {
  const flecha = autoEnElMapa?.getElement()?.querySelector('svg')
  if (flecha) flecha.style.transform = `rotate(${Math.round(rumbo)}deg)`
}

// En escritorio el panorama tapa la mitad izquierda del mapa: el auto va al centro de la mitad que se ve.
function centrarEnLaMitadVisible(posicion) {
  const zoom = Math.max(mapa.getZoom(), ZOOM_AL_CONDUCIR)
  const tapado =
    document.body.classList.contains('con-panorama') && window.matchMedia('(min-width: 761px)').matches
  const centro = mapa.project(posicion, zoom).subtract([tapado ? window.innerWidth / 4 : 0, 0])
  mapa.setView(mapa.unproject(centro, zoom), zoom, { animate: true })
}

function ponerAuto(posicion, rumbo) {
  if (ciego) return
  if (!autoEnElMapa)
    autoEnElMapa = L.marker(posicion, { icon: iconoDelAuto(), pane: 'points', zIndexOffset: 1000 }).addTo(
      mapa,
    )
  autoEnElMapa.setLatLng(posicion)
  rotarAuto(rumbo)
  centrarEnLaMitadVisible(posicion)
}

function quitarElAuto() {
  autoEnElMapa?.remove()
  autoEnElMapa = null
}

// ----- el mapa: lo recorrido y las opciones del cruce, numeradas (no en la ronda real)

function dibujarRecorrido() {
  capaDelCruce?.remove()
  if (ciego) return []
  capaDelCruce = L.layerGroup().addTo(capa)
  const { puntosRecorridos, decision } = estado
  L.polyline(puntosRecorridos, {
    pane: 'routes',
    color: '#fff',
    weight: 9,
    opacity: 0.9,
    interactive: false,
  }).addTo(capaDelCruce)
  L.polyline(puntosRecorridos, { pane: 'routes', color: '#2563eb', weight: 5, interactive: false }).addTo(
    capaDelCruce,
  )
  return decision.opciones.map((opcion, indice) => {
    const color = COLORES_DE_TRAMOS[(indice + 1) % COLORES_DE_TRAMOS.length]
    const trazado = recortarTrazado(opcion.trazado, METROS_DE_CADA_OPCION_EN_EL_MAPA)
    const linea = L.polyline(trazado, {
      pane: 'routes',
      color,
      weight: 5,
      dashArray: '2 8',
      interactive: false,
    }).addTo(capaDelCruce)
    L.marker(trazado.at(-1), {
      pane: 'points',
      icon: L.divIcon({
        className: '',
        html: `<div class="cd-insignia" style="background:${color}">${indice + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(capaDelCruce)
    return linea
  })
}

// ----- el panel

const formatearKm = metros => (metros / 1000).toFixed(1).replace('.', ',')

// Cuánto más se demoraría el recorrido, desde aquí, que la ruta óptima (no dice qué opción es la mejor). No en la ronda real.
function textoDelDesvio() {
  if (!ruta || ciego || !estado.decision || estado.decision.esPartida) return ''
  const segundos = Math.round(segundosDeDesvio(estado, ruta.optima))
  return segundos < 10
    ? ' · ✅ vas por una ruta óptima'
    : ` · ⏱️ +${Math.floor(segundos / 60)} min ${segundos % 60} s sobre lo mejor`
}

function htmlDeLaDecision(textos, { cargando, vista }) {
  const { decision } = estado
  const calle = estado.entrada === null ? '' : nombreDeCalle(estado.grafo, estado.entrada)
  const rumbo = vista?.rumbo ?? decision.opciones[0].rumboFinal
  const donde = decision.esPartida
    ? 'Estás en la partida'
    : `Vas por <b>${escaparHtml(calle || 'una calle sin nombre')}</b> hacia el ${puntoCardinal(rumbo)}`
  const botones = decision.opciones
    .map(
      (opcion, indice) =>
        `<button class="opt" data-id="${opcion.id}" ${cargando ? 'disabled' : ''}><span class="k">${indice + 1}</span> ${escaparHtml(textos[indice])}</button>`,
    )
    .join('')
  const avisos = [
    ...estado.avisos,
    decision.sinSalida ? `${decision.sinSalida} calle(s) sin salida no se muestran.` : '',
    cargando ? 'Buscando el panorama…' : '',
    vista === null ? 'Aquí no hay Street View.' : '',
    vista?.aproximado ? 'Este panorama queda a un lado de la calle (es el más cercano que hay).' : '',
  ].filter(Boolean)
  const botonesDeAbajo = [
    ruta
      ? `<button class="btn sec small" id="cdRendirse">${confirmandoRendicion ? '¿Seguro? Se muestra la óptima' : '🏳️ Rendirme'}</button>`
      : '',
    alSalir ? '<button class="btn sec small" id="cdOtraPartida">↩ Otra partida</button>' : '',
  ].join('')
  return `${encabezado()}
    <div class="cd-donde" data-rumbo="${Math.round(rumbo)}">${donde}</div>
    <div class="muted nota">${formatearKm(estado.metros)} km · ${Math.round(estado.segundos / 60)} min${textoDelDesvio()}</div>
    <p class="q-sub">${decision.esPartida ? '¿Hacia dónde sales?' : decision.esObligada ? 'No hay otra salida:' : '¿Qué haces en el cruce?'}</p>
    <div class="opts one">${botones}</div>
    ${avisos.map(aviso => `<p class="muted nota">${escaparHtml(aviso)}</p>`).join('')}
    <div class="row">${botonesDeAbajo}</div>`
}

function conectarOpciones(lineas) {
  const botones = [...document.querySelectorAll('#panel .opt[data-id]')]
  botones.forEach((boton, indice) => {
    boton.onclick = () => elegir(+boton.dataset.id)
    if (!lineas[indice]) return
    boton.onmouseenter = () => lineas[indice].setStyle({ weight: 10, dashArray: null })
    boton.onmouseleave = () => lineas[indice].setStyle({ weight: 5, dashArray: '2 8' })
  })
  if ($('#cdOtraPartida')) $('#cdOtraPartida').onclick = () => alSalir()
  const rendirse = $('#cdRendirse')
  if (rendirse)
    rendirse.onclick = () => {
      if (confirmandoRendicion) return terminar('rendicion')
      confirmandoRendicion = true
      rendirse.textContent = '¿Seguro? Se muestra la óptima'
    }
}

async function mostrarDecision() {
  if (ruta && yaSeFueDemasiadoLejos(estado, ruta.optima)) return terminar('lejos')
  confirmandoRendicion = false
  const { decision } = estado
  const lineas = dibujarRecorrido()
  const textos = textosDelCruce(decision.opciones)
  const camara = camaraDeLaDecision(estado)
  mostrarPanel(htmlDeLaDecision(textos, { cargando: true, vista: undefined }))
  const estadoAlPedir = estado
  const vista = streetViewDisponible()
    ? await mostrarPanoramaDeConduccion(camara, posicion => evaluarPanorama(camara, posicion), {
        alVerElMapa: () => autoEnElMapa && centrarEnLaMitadVisible(autoEnElMapa.getLatLng()),
      })
    : null
  if (estado !== estadoAlPedir || estado.decision !== decision) return
  ultimaVista = { ...vista, camara }
  if (vista) ponerAuto(vista.posicion, vista.rumbo)
  else {
    ocultarPanorama()
    ponerAuto(camara.candidatas[0].punto, camara.candidatas[0].rumbo)
  }
  mostrarPanel(htmlDeLaDecision(textos, { cargando: false, vista }))
  conectarOpciones(lineas)
}

function elegir(id) {
  const opcion = estado.decision.opciones.find(candidata => candidata.id === id)
  if (estado.decision.esPartida) apuntarPanoramaHacia(opcion.rumboFinal)
  elegirOpcion(estado, id)
  if (estado.llego) terminar('llegada')
  else if (estado.decision) mostrarDecision()
  else mostrarPanel(`${encabezado()}<p>El camino sigue sin cruces donde decidir.</p>`)
}

// ----- el final de una ruta del juego: el recorrido y el óptimo en el mapa y el análisis para quien llama

// Dibuja lo recorrido (azul) y la ruta óptima (verde) y encuadra el mapa.
function dibujarElResultado() {
  capaDelCruce?.remove()
  capaDelCruce = L.layerGroup().addTo(capa)
  const trazos = [
    [ruta.optima.trazado, '#16a34a', 6, 10],
    [estado.puntosRecorridos, '#2563eb', 4, 8],
  ]
  for (const [puntos, color, peso, pesoDelBorde] of trazos) {
    L.polyline(puntos, { pane: 'routes', color: '#fff', weight: pesoDelBorde, interactive: false }).addTo(
      capaDelCruce,
    )
    L.polyline(puntos, { pane: 'routes', color, weight: peso, interactive: false }).addTo(capaDelCruce)
  }
  encuadrar(L.latLngBounds([...ruta.optima.trazado, ...estado.puntosRecorridos]).pad(0.1), 16)
}

function terminar(motivo) {
  const analisis = analizarRecorrido(estado, ruta.optima)
  ocultarPanorama()
  quitarElAuto()
  document.body.classList.remove('ruteo-ciego')
  dibujarElResultado()
  resultado = { motivo, analisis }
  alTerminar?.(resultado)
}

// ----- empezar y dejar de conducir

// estado: lo que devuelve empezarEn (src/dominio/conduccion.js). ruta: la del juego ({ etiqueta, mision, optima }) o null.
// encabezado(): el HTML de arriba del panel. alTerminar({ motivo, analisis }): al llegar, rendirse o alejarse demasiado.
// alSalir(): solo en el modo libre, para elegir otra partida.
export function conducir(parametros) {
  dejarDeConducir()
  estado = parametros.estado
  ruta = parametros.ruta ?? null
  ciego = parametros.ciego ?? false
  encabezado = parametros.encabezado ?? (() => '<h4>🚗 Conducir libre</h4>')
  alTerminar = parametros.alTerminar ?? null
  alSalir = parametros.alSalir ?? null
  resultado = null
  document.body.classList.add('conduciendo')
  document.body.classList.toggle('ruteo-ciego', ciego)
  const dejarDeEscucharAlPanorama = escucharPanorama({
    alMoverse: posicion => {
      if (!autoEnElMapa) return
      autoEnElMapa.setLatLng(posicion)
      centrarEnLaMitadVisible(posicion)
    },
    alGirar: rotarAuto,
  })
  const alApretarUnaTecla = evento => {
    if (evento.target.matches('input, textarea') || !/^[1-9]$/.test(evento.key)) return
    document.querySelectorAll('#panel .opt[data-id]:not([disabled])')[+evento.key - 1]?.click()
  }
  document.addEventListener('keydown', alApretarUnaTecla)
  desactivar = () => {
    dejarDeEscucharAlPanorama()
    document.removeEventListener('keydown', alApretarUnaTecla)
  }
  mostrarDecision()
}

export function dejarDeConducir() {
  desactivar?.()
  desactivar = null
  estado = null
  ruta = null
  ciego = false
  alTerminar = null
  alSalir = null
  quitarElAuto()
  capaDelCruce?.remove()
  capaDelCruce = null
  ocultarPanorama()
  document.body.classList.remove('conduciendo', 'ruteo-ciego')
}

// Para las pruebas con navegador (tools/grafo/…): lo que se ve en el panorama y en el mapa, sin importar los módulos otra vez.
window.__conducir = {
  panorama: posicionDelPanorama,
  rumboDeLaVista,
  auto: () => autoEnElMapa && [autoEnElMapa.getLatLng().lat, autoEnElMapa.getLatLng().lng],
  estado: () => estado,
  vista: () => ultimaVista,
  ruta: () => ruta,
  resultado: () => resultado,
  costos: () => estado?.mision && estado.decision && costosDeLasOpciones(estado),
}
