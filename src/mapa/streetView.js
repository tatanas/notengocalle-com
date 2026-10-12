import { aviso } from '../interfaz/panel.js'

// Street View viene de Google Maps: el script se carga solo cuando alguien juega un modo que lo necesita,
// para que el resto del juego siga siendo instantáneo y sin depender de Google.
const LLAVE = __LLAVE_DE_GOOGLE_MAPS__
const RADIO_DE_BUSQUEDA_M = 80

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

let contenedor = null

function contenedorDelPanorama() {
  if (!contenedor) {
    contenedor = document.createElement('div')
    contenedor.id = 'panorama'
    contenedor.hidden = true
    document.getElementById('app').appendChild(contenedor)
  }
  return contenedor
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
      sources: ['outdoor'],
    })
  } catch {
    return null
  }
  const lugar = resultado.data.location
  const caja = contenedorDelPanorama()
  caja.hidden = false
  new StreetViewPanorama(caja, {
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
  return [lugar.latLng.lat(), lugar.latLng.lng()]
}

export function ocultarPanorama() {
  if (contenedor) contenedor.hidden = true
}
