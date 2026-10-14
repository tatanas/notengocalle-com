import { distanciaKm } from '../nucleo/geografia.js'
import { verticeMedioDeCalle } from '../datos/datos.js'
import LUGARES from '../datos/lugaresStreetView.json'
import { mostrarPanorama, streetViewDisponible } from '../mapa/streetView.js'
import { aviso } from './panel.js'

// Después de responder en los juegos de calles: botón para ver la calle en Street View y recorrerla.
const puntosDeLaCalle = calle =>
  LUGARES.find(pregunta => pregunta.tipo === 'calle' && pregunta.nombre === calle.name)?.puntos ?? []

export const htmlDeRecorrerCalle = () =>
  streetViewDisponible()
    ? '<button class="btn sec wide" id="recorrerCalle">🚶 Recorrer la calle en Street View</button>'
    : ''

// Se llama justo después de responder(): el botón ya está en el panel. cercaDe = dónde tocó el jugador, si tocó.
export function conectarRecorrerCalle(calle, cercaDe = null) {
  const boton = document.getElementById('recorrerCalle')
  if (!boton) return
  boton.onclick = async () => {
    const puntos = puntosDeLaCalle(calle)
    const elegido = cercaDe
      ? puntos.reduce(
          (mejor, actual) =>
            distanciaKm([actual.lat, actual.lon], cercaDe) < distanciaKm([mejor.lat, mejor.lon], cercaDe)
              ? actual
              : mejor,
          puntos[0],
        )
      : puntos[Math.floor(Math.random() * puntos.length)]
    const [lat, lon] = elegido ? [elegido.lat, elegido.lon] : verticeMedioDeCalle(calle)
    boton.disabled = true
    try {
      const inicio = await mostrarPanorama({ lat, lon, rumbo: elegido?.rumbo }, { caminable: true })
      if (!inicio) return aviso('No hay Street View en esta calle.')
      if (elegido?.pista) aviso(`Este tramo: ${elegido.pista}.`)
    } catch {
      aviso('No pude cargar Street View. Revisa tu conexión.')
    } finally {
      boton.disabled = false
    }
  }
}
