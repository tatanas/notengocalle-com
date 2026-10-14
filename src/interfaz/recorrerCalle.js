import { verticeMedioDeCalle } from '../datos/datos.js'
import LUGARES from '../datos/lugaresStreetView.json'
import { marcarRecorrido, mostrarPanorama, streetViewDisponible } from '../mapa/streetView.js'
import { aviso } from './panel.js'

// Después de responder en los juegos de calles: botón para ver la calle en Street View y recorrerla.
const puntosDeLaCalle = calle =>
  LUGARES.find(pregunta => pregunta.tipo === 'calle' && pregunta.nombre === calle.name)?.puntos ?? []

export const htmlDeRecorrerCalle = () =>
  streetViewDisponible()
    ? '<button class="btn sec wide" id="recorrerCalle">🚶 Recorrer la calle en Street View</button>'
    : ''

// Mientras se recorre, en escritorio el panel se achica a esto: el nombre de la calle y "Siguiente" (ver estilos.css).
function ponerNombreEnElPanel(boton, calle) {
  const comentario = boton.closest('.fb')
  if (!comentario || comentario.querySelector('.recorrido-titulo')) return
  const titulo = document.createElement('div')
  titulo.className = 'recorrido-titulo'
  titulo.textContent = '🚶 ' + calle.name
  comentario.prepend(titulo)
}

// Se llama justo después de responder(): el botón ya está en el panel.
// inicio = [lat, lon] exacto donde partir (el punto marcado en el mapa o el que tocó el jugador); sin él, un punto al azar de la calle.
export function conectarRecorrerCalle(calle, inicio = null) {
  const boton = document.getElementById('recorrerCalle')
  if (!boton) return
  boton.onclick = async () => {
    const puntos = puntosDeLaCalle(calle)
    const alAzar = puntos[Math.floor(Math.random() * puntos.length)]
    const [lat, lon] = inicio ?? (alAzar ? [alAzar.lat, alAzar.lon] : verticeMedioDeCalle(calle))
    boton.disabled = true
    try {
      const partida = await mostrarPanorama(
        { lat, lon, rumbo: inicio ? undefined : alAzar?.rumbo },
        { caminable: true },
      )
      if (!partida) return aviso('No hay Street View en esta calle.')
      ponerNombreEnElPanel(boton, calle)
      marcarRecorrido()
      if (!inicio && alAzar?.pista) aviso(`Este tramo: ${alAzar.pista}.`)
    } catch {
      aviso('No pude cargar Street View. Revisa tu conexión.')
    } finally {
      boton.disabled = false
    }
  }
}
