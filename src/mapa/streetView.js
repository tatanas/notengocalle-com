import { distanciaKm } from '../nucleo/geografia.js'
import { aviso } from '../interfaz/panel.js'
import { encuadrarCiudad, mapa, repararMapaBase } from './mapa.js'

// Street View viene de Google Maps: el script se carga solo cuando alguien juega un modo que lo necesita,
// para que el resto del juego siga siendo instantáneo y sin depender de Google.
const LLAVE = __LLAVE_DE_GOOGLE_MAPS__
const RADIO_DE_BUSQUEDA_M = 60
// En las preguntas no se puede caminar: solo mirar alrededor. Si algo logra moverlo más que esto, vuelve al punto de
// partida. Al terminar una pregunta de calles sí se puede recorrer la calle (modo caminable).
const TOLERANCIA_DE_MOVIMIENTO_KM = 0.005

export const streetViewDisponible = () => !!LLAVE

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
let mapaEncuadrado = false

// Un solo panorama para todas las preguntas: cada StreetViewPanorama nuevo abre otro contexto WebGL y, en los
// celulares (que dejan pocos), el navegador termina quitándole el suyo al mapa base, que queda gris para siempre.
let panorama = null
let inicioDeLaPregunta = null
let panoDeInicio = null

function crearPanorama(StreetViewPanorama) {
  panorama = new StreetViewPanorama(contenedor, {
    clickToGo: false,
    linksControl: false,
    addressControl: false,
    showRoadLabels: false,
    fullscreenControl: false,
    enableCloseButton: false,
    motionTracking: false,
    motionTrackingControl: false,
    panControl: false,
  })
  // Las flechas del teclado también caminan: si algo lo mueve, vuelve.
  panorama.addListener('position_changed', () => {
    const posicion = panorama.getPosition()
    if (!posicion || !inicioDeLaPregunta) return
    if (distanciaKm([posicion.lat(), posicion.lng()], inicioDeLaPregunta) <= TOLERANCIA_DE_MOVIMIENTO_KM)
      return
    const direccion = panorama.getPov()
    panorama.setPano(panoDeInicio)
    panorama.setPov(direccion)
    aviso('Aquí solo puedes mirar alrededor, no caminar.')
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
  if (!mapaEncuadrado) encuadrarCiudad()
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
    <button type="button" id="cerrarRecorrido" hidden>✖ Cerrar Street View</button>
    <button type="button" id="alternarVista"></button>`
  app.appendChild(botones)
  document.getElementById('cerrarRecorrido').onclick = ocultarPanorama
  document.getElementById('reportarTunel').onclick = () => alReportar()
  botonAlternar().onclick = alternarEntrePanoramaYMapa
}

// Deja al jugador mirando desde el panorama de Street View más cercano a (lat, lon), sin poder caminar
// (salvo con caminable: true, que deja recorrer la calle).
// Devuelve el punto real del panorama (puede quedar a unos metros del pedido) o null si ahí no hay cobertura.
// alReportarTunel se llama cuando el jugador avisa que ese punto está en un túnel.
export async function mostrarPanorama(
  { lat, lon, rumbo = Math.random() * 360 },
  { alReportarTunel = () => {}, caminable = false } = {},
) {
  const maps = await cargarGoogleMaps()
  const { StreetViewPanorama, StreetViewService } = await maps.importLibrary('streetView')
  let resultado
  try {
    resultado = await new StreetViewService().getPanorama({
      location: { lat, lng: lon },
      radius: RADIO_DE_BUSQUEDA_M,
      preference: 'nearest',
      sources: ['google'],
    })
  } catch {
    return null
  }
  if (!contenedor) crearElementos()
  const lugar = resultado.data.location
  const inicio = [lugar.latLng.lat(), lugar.latLng.lng()]

  mapaEncuadrado = false
  alReportar = alReportarTunel
  document.body.classList.remove('ver-mapa')
  document.body.classList.add('con-panorama')
  botonAlternar().textContent = '🗺️ Abrir mapa'
  contenedor.hidden = false
  botones.hidden = false
  if (!panorama) crearPanorama(StreetViewPanorama)
  panorama.setOptions({ clickToGo: caminable, linksControl: caminable, showRoadLabels: caminable })
  document.getElementById('reportarTunel').hidden = caminable
  document.getElementById('cerrarRecorrido').hidden = !caminable
  inicioDeLaPregunta = caminable ? null : inicio
  panoDeInicio = lugar.pano
  panorama.setPano(lugar.pano)
  panorama.setPov({ heading: rumbo, pitch: 0 })
  panorama.setVisible(true)
  return inicio
}

export function ocultarPanorama() {
  if (contenedor) contenedor.hidden = true
  if (botones) botones.hidden = true
  inicioDeLaPregunta = null
  document.body.classList.remove('con-panorama', 'ver-mapa')
  alReportar = () => {}
}
