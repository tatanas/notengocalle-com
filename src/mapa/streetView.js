import { distanciaKm } from '../nucleo/geografia.js'
import { aviso } from '../interfaz/panel.js'
import { encuadrarCiudad, mapa } from './mapa.js'

// Street View viene de Google Maps: el script se carga solo cuando alguien juega un modo que lo necesita,
// para que el resto del juego siga siendo instantáneo y sin depender de Google.
const LLAVE = __LLAVE_DE_GOOGLE_MAPS__
const RADIO_DE_BUSQUEDA_M = 60
// Cuánto se puede caminar desde el punto de partida: más allá, el panorama vuelve al inicio.
const RADIO_DE_MOVIMIENTO_KM = 0.08

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
let alVolverAlInicio = () => {}
let mapaEncuadrado = false

const botonAlternar = () => document.getElementById('alternarVista')

// En el celular se ve el panorama o el mapa, uno a la vez.
function alternarEntrePanoramaYMapa() {
  const verMapa = document.body.classList.toggle('ver-mapa')
  botonAlternar().textContent = verMapa ? '👁 Ver panorama' : '🗺️ Abrir mapa'
  if (!verMapa) return
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
  botones.innerHTML = `<button type="button" id="volverAlInicio" title="Volver al punto de partida">↩ Inicio</button>
    <button type="button" id="alternarVista"></button>`
  app.appendChild(botones)
  document.getElementById('volverAlInicio').onclick = () => alVolverAlInicio()
  botonAlternar().onclick = alternarEntrePanoramaYMapa
}

// Deja al jugador mirando desde el panorama de Street View más cercano a (lat, lon).
// Devuelve el punto real del panorama (puede quedar a unos metros del pedido) o null si ahí no hay cobertura.
export async function mostrarPanorama({ lat, lon, rumbo = Math.random() * 360 }) {
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
  document.body.classList.remove('ver-mapa')
  document.body.classList.add('con-panorama')
  botonAlternar().textContent = '🗺️ Abrir mapa'
  contenedor.hidden = false
  botones.hidden = false
  const panorama = new StreetViewPanorama(contenedor, {
    pano: lugar.pano,
    pov: { heading: rumbo, pitch: 0 },
    addressControl: false,
    showRoadLabels: false,
    fullscreenControl: false,
    enableCloseButton: false,
    motionTracking: false,
    motionTrackingControl: false,
    panControl: false,
  })

  const volverAlInicio = () => {
    const direccion = panorama.getPov()
    panorama.setPano(lugar.pano)
    panorama.setPov(direccion)
  }
  alVolverAlInicio = volverAlInicio
  panorama.addListener('position_changed', () => {
    const posicion = panorama.getPosition()
    if (!posicion) return
    if (distanciaKm([posicion.lat(), posicion.lng()], inicio) <= RADIO_DE_MOVIMIENTO_KM) return
    volverAlInicio()
    aviso(
      'No puedes alejarte más de ' + Math.round(RADIO_DE_MOVIMIENTO_KM * 1000) + ' m del punto de partida.',
    )
  })
  return inicio
}

export function ocultarPanorama() {
  if (contenedor) contenedor.hidden = true
  if (botones) botones.hidden = true
  document.body.classList.remove('con-panorama', 'ver-mapa')
  alVolverAlInicio = () => {}
}
