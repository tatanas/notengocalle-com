import { distanciaKm } from '../nucleo/geografia.js'
import { aviso } from '../interfaz/panel.js'
import { encuadrarCiudad, mapa, repararMapaBase } from './mapa.js'

// Street View viene de Google Maps: el script se carga solo cuando alguien juega un modo que lo necesita,
// para que el resto del juego siga siendo instantáneo y sin depender de Google.
const LLAVE = __LLAVE_DE_GOOGLE_MAPS__
const RADIO_DE_BUSQUEDA_M = 60
// En las preguntas se puede caminar para ubicarse, pero sin nombres de calles y sin alejarse más que esto del punto de
// partida (el puntaje se mide desde ahí). Al terminar una pregunta de calles se recorre la calle sin límite y con nombres.
export const DISTANCIA_MAXIMA_DE_CAMINATA_KM = 0.5
// Para dibujar lo caminado basta un punto cada tantos metros.
const PASO_MINIMO_DEL_CAMINO_KM = 0.005

export const streetViewDisponible = () => !!LLAVE

// Los autos de Google van por su pista: el panorama más cercano a la línea de una calle puede ser el de la pista contraria, y se
// vería el tránsito de frente. Al ir siguiendo una ruta se busca un panorama tomado en el sentido en que se avanza, corriéndose
// hacia la derecha (donde va el tránsito en Chile) si hace falta.
const GRADOS_DE_SENTIDO_ACEPTADO = 70
const METROS_A_LA_DERECHA = [4, 8, 12]
const RADIO_ALREADEDOR_DE_LA_PISTA_M = 12
const M_POR_GRADO_LATITUD = 111200
const M_POR_GRADO_LONGITUD = 92900

const diferenciaDeRumbo = (a, b) => Math.abs(((b - a + 540) % 360) - 180)
// El sentido en que iba el auto al tomar el panorama (si Google no lo dice, se lo da por bueno).
const esDelSentido = (resultado, rumbo) => {
  const sentido = resultado.data.tiles?.originHeading ?? resultado.data.tiles?.centerHeading
  return sentido == null || diferenciaDeRumbo(sentido, rumbo) <= GRADOS_DE_SENTIDO_ACEPTADO
}

function corridoALaDerecha(lat, lon, rumbo, metros) {
  const radianes = ((rumbo + 90) * Math.PI) / 180
  return {
    lat: lat + (Math.cos(radianes) * metros) / M_POR_GRADO_LATITUD,
    lng: lon + (Math.sin(radianes) * metros) / M_POR_GRADO_LONGITUD,
  }
}

// Un panorama que quedó pasado el lugar de la decisión muestra el cruce ya cruzado (o la calle de al lado): no sirve.
const METROS_DE_TOLERANCIA_PASADO_EL_LUGAR = 8
const RADIO_ESTRECHO_M = 25
function quedaAntesDelLugar(resultado, lugar, rumbo) {
  const { latLng } = resultado.data.location
  const radianes = (rumbo * Math.PI) / 180
  const haciaDelante =
    (latLng.lat() - lugar[0]) * M_POR_GRADO_LATITUD * Math.cos(radianes) +
    (latLng.lng() - lugar[1]) * M_POR_GRADO_LONGITUD * Math.sin(radianes)
  return haciaDelante <= METROS_DE_TOLERANCIA_PASADO_EL_LUGAR
}

// Prueba cada cámara con un radio estrecho y se queda con el primer panorama bien orientado y antes del lugar de la decisión.
async function buscarAntesDelLugar(pedir, camaras, lugar, rumbo) {
  for (const [lat, lon] of camaras) {
    try {
      const resultado = await pedir({ lat, lng: lon }, RADIO_ESTRECHO_M)
      if (esDelSentido(resultado, rumbo) && quedaAntesDelLugar(resultado, lugar, rumbo)) return resultado
    } catch {
      // ahí no hay panorama: se prueba más atrás
    }
  }
  return null
}

async function buscarPanorama(
  servicio,
  { lat, lon, rumbo, camarasDeRespaldo, lugarDeLaDecision },
  enLaPista,
) {
  const pedir = (location, radius) =>
    servicio.getPanorama({ location, radius, preference: 'nearest', sources: ['google'] })
  if (lugarDeLaDecision) {
    const antes = await buscarAntesDelLugar(
      pedir,
      [[lat, lon], ...(camarasDeRespaldo ?? [])],
      lugarDeLaDecision,
      rumbo,
    )
    if (antes) return antes
  }
  const primero = await pedir({ lat, lng: lon }, RADIO_DE_BUSQUEDA_M)
  if (!enLaPista || esDelSentido(primero, rumbo)) return primero
  for (const metros of METROS_A_LA_DERECHA) {
    try {
      const otro = await pedir(corridoALaDerecha(lat, lon, rumbo, metros), RADIO_ALREADEDOR_DE_LA_PISTA_M)
      if (esDelSentido(otro, rumbo)) return otro
    } catch {
      // ahí no hay panorama: se prueba más a la derecha
    }
  }
  return primero
}

let promesaDeGoogle = null

function cargarGoogleMaps() {
  promesaDeGoogle ||= new Promise((resolver, rechazar) => {
    window.gm_authFailure = () =>
      aviso('Google Maps rechazó la llave para este sitio (revisa las restricciones de dominio).')
    window.__alCargarGoogleMaps = () => resolver(window.google.maps)
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${LLAVE}&v=weekly&loading=async&language=es&region=CL&callback=__alCargarGoogleMaps`
    script.async = true
    script.onerror = () => {
      promesaDeGoogle = null
      rechazar(new Error('No se pudo cargar Google Maps'))
    }
    document.head.appendChild(script)
  })
  return promesaDeGoogle
}

// ----- el panorama y los botones que lo acompañan
let contenedor = null
let botones = null
let alReportar = () => {}
// Quien muestra el panorama puede encuadrar el mapa a su manera al abrirlo, y enterarse de hacia dónde se mira.
let alVerElMapa = null
let alGirarLaVista = null
let mapaEncuadrado = false

// Un solo panorama para todas las preguntas: cada StreetViewPanorama nuevo abre otro contexto WebGL y, en los
// celulares (que dejan pocos), el navegador termina quitándole el suyo al mapa base, que queda gris para siempre.
let panorama = null
let inicioDeLaPregunta = null
let panoDeInicio = null
let ultimoPanoPermitido = null
let caminoDeLaPregunta = []

// Lo que caminó el jugador en la pregunta actual, desde el punto de partida: [[lat, lon], …].
export const caminoRecorrido = () => [...caminoDeLaPregunta]

function anotarEnElCamino(lugar) {
  const ultimo = caminoDeLaPregunta.at(-1)
  if (!ultimo || distanciaKm(ultimo, lugar) >= PASO_MINIMO_DEL_CAMINO_KM) caminoDeLaPregunta.push(lugar)
}

function volverAlPanorama(pano) {
  const direccion = panorama.getPov()
  panorama.setPano(pano)
  panorama.setPov(direccion)
}

// Al recorrer una calle, un punto azul en el mapa sigue al jugador.
let marcadorDePosicion = null
const quitarMarcadorDePosicion = () => {
  marcadorDePosicion?.remove()
  marcadorDePosicion = null
}

function seguirEnElMapa(posicion) {
  const lugar = [posicion.lat(), posicion.lng()]
  if (!marcadorDePosicion) {
    marcadorDePosicion = L.circleMarker(lugar, {
      pane: 'points',
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: '#2563eb',
      fillOpacity: 1,
    }).addTo(mapa)
    return
  }
  marcadorDePosicion.setLatLng(lugar)
  const panoramaTapa = window.matchMedia('(min-width: 761px)').matches ? window.innerWidth / 2 : 0
  mapa.panInside(lugar, { paddingTopLeft: [panoramaTapa + 40, 70], paddingBottomRight: [270, 40] })
}

function crearPanorama(StreetViewPanorama) {
  panorama = new StreetViewPanorama(contenedor, {
    clickToGo: true,
    linksControl: true,
    addressControl: false,
    showRoadLabels: false,
    fullscreenControl: false,
    enableCloseButton: false,
    motionTracking: false,
    motionTrackingControl: false,
    panControl: false,
  })
  panorama.addListener('pov_changed', () => alGirarLaVista?.(panorama.getPov().heading))
  panorama.addListener('position_changed', () => {
    const posicion = panorama.getPosition()
    if (!posicion) return
    if (!inicioDeLaPregunta) {
      if (document.body.classList.contains('recorriendo')) seguirEnElMapa(posicion)
      return
    }
    const lugar = [posicion.lat(), posicion.lng()]
    if (distanciaKm(lugar, inicioDeLaPregunta) > DISTANCIA_MAXIMA_DE_CAMINATA_KM) {
      volverAlPanorama(ultimoPanoPermitido)
      aviso(
        `Hasta aquí: puedes alejarte hasta ${DISTANCIA_MAXIMA_DE_CAMINATA_KM * 1000} m del punto de partida.`,
      )
      return
    }
    ultimoPanoPermitido = panorama.getPano()
    anotarEnElCamino(lugar)
  })
}

const botonAlternar = () => document.getElementById('alternarVista')

// En el celular se ve el panorama o el mapa, uno a la vez.
function alternarEntrePanoramaYMapa() {
  const verMapa = document.body.classList.toggle('ver-mapa')
  botonAlternar().textContent = verMapa ? '👁 Ver panorama' : '🗺️ Abrir mapa'
  if (!verMapa) return
  repararMapaBase()
  mapa.invalidateSize()
  if (alVerElMapa) alVerElMapa()
  else if (!mapaEncuadrado) encuadrarCiudad()
  mapaEncuadrado = true
}

function crearElementos() {
  const app = document.getElementById('app')
  contenedor = document.createElement('div')
  contenedor.id = 'panorama'
  contenedor.hidden = true
  app.appendChild(contenedor)

  botones = document.createElement('div')
  botones.id = 'botonesDePanorama'
  botones.hidden = true
  botones.innerHTML = `<button type="button" id="reportarTunel" title="Este punto está en un túnel: que no vuelva a salir">🚧 Reportar túnel</button>
    <button type="button" id="volverAlInicio" title="Volver al punto de partida">↩ Al inicio</button>
    <button type="button" id="cerrarRecorrido" hidden>✖ Cerrar Street View</button>
    <button type="button" id="alternarVista"></button>`
  app.appendChild(botones)
  document.getElementById('cerrarRecorrido').onclick = ocultarPanorama
  document.getElementById('reportarTunel').onclick = () => alReportar()
  document.getElementById('volverAlInicio').onclick = () => volverAlPanorama(panoDeInicio)
  botonAlternar().onclick = alternarEntrePanoramaYMapa
}

// Deja al jugador en el panorama de Street View más cercano a (lat, lon). En una pregunta puede caminar un poco, sin
// nombres de calles; con recorrerCalle: true camina sin límite y con nombres.
// Devuelve el punto real del panorama (puede quedar a unos metros del pedido) o null si ahí no hay cobertura. Con enLaPista busca
// uno tomado en el sentido de `rumbo` (para seguir una ruta sin ver el tránsito de frente). Con lugarDeLaDecision, el panorama
// tiene que quedar antes de ese punto (si ahí no hay uno, se prueba en camarasDeRespaldo, cada vez más atrás).
// alReportarTunel se llama cuando el jugador avisa que ese punto está en un túnel.
export async function mostrarPanorama(
  { lat, lon, rumbo = Math.random() * 360, camarasDeRespaldo, lugarDeLaDecision },
  {
    alReportarTunel = null,
    recorrerCalle = false,
    alVerElMapa: encuadrarAlVerElMapa = null,
    alGirarLaVista: alGirar = null,
    enLaPista = false,
  } = {},
) {
  const maps = await cargarGoogleMaps()
  const { StreetViewPanorama, StreetViewService } = await maps.importLibrary('streetView')
  let resultado
  try {
    resultado = await buscarPanorama(
      new StreetViewService(),
      { lat, lon, rumbo, camarasDeRespaldo, lugarDeLaDecision },
      enLaPista,
    )
  } catch {
    return null
  }
  if (!contenedor) crearElementos()
  const lugar = resultado.data.location
  const inicio = [lugar.latLng.lat(), lugar.latLng.lng()]

  mapaEncuadrado = false
  quitarMarcadorDePosicion()
  alReportar = alReportarTunel ?? (() => {})
  alVerElMapa = encuadrarAlVerElMapa
  alGirarLaVista = alGirar
  document.body.classList.remove('ver-mapa')
  document.body.classList.add('con-panorama')
  botonAlternar().textContent = '🗺️ Abrir mapa'
  contenedor.hidden = false
  botones.hidden = false
  if (!panorama) crearPanorama(StreetViewPanorama)
  panorama.setOptions({ showRoadLabels: recorrerCalle })
  document.getElementById('reportarTunel').hidden = !alReportarTunel
  document.getElementById('volverAlInicio').hidden = recorrerCalle
  document.getElementById('cerrarRecorrido').hidden = !recorrerCalle
  inicioDeLaPregunta = recorrerCalle ? null : inicio
  caminoDeLaPregunta = recorrerCalle ? [] : [inicio]
  panoDeInicio = lugar.pano
  ultimoPanoPermitido = lugar.pano
  panorama.setPano(lugar.pano)
  panorama.setPov({ heading: rumbo, pitch: 0 })
  panorama.setVisible(true)
  return inicio
}

// En escritorio el panorama tapa la mitad izquierda del mapa: al empezar a recorrer una calle, lo que estaba al centro
// del mapa pasa al centro de la mitad visible, y se devuelve al cerrar.
const CORRIMIENTO_DE_RECORRIDO = () =>
  window.matchMedia('(min-width: 761px)').matches ? window.innerWidth / 4 : 0
let corrimientoAplicado = 0

export function marcarRecorrido() {
  if (document.body.classList.contains('recorriendo')) return
  document.body.classList.add('recorriendo')
  corrimientoAplicado = CORRIMIENTO_DE_RECORRIDO()
  mapa.panBy([-corrimientoAplicado, 0], { animate: false })
  const posicion = panorama.getPosition()
  if (posicion) seguirEnElMapa(posicion)
}

export function ocultarPanorama() {
  quitarMarcadorDePosicion()
  if (corrimientoAplicado) mapa.panBy([corrimientoAplicado, 0], { animate: false })
  corrimientoAplicado = 0
  if (contenedor) contenedor.hidden = true
  if (botones) botones.hidden = true
  inicioDeLaPregunta = null
  document.body.classList.remove('con-panorama', 'ver-mapa', 'recorriendo')
  alReportar = () => {}
  alVerElMapa = null
  alGirarLaVista = null
}
