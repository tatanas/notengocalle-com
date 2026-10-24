// Cuánto se demora un recorrido. Dos estimaciones, ambas con un modelo propio (no es tráfico real):
//  - normal: velocidad de cada tipo de calle (o 0,8 × la máxima indicada), más semáforos, pares y giros (compartido/grafoVial.js).
//  - hora punta: las mismas calles con velocidades máximas bajas, calibradas con mediciones públicas de Santiago (UOCT/Waze: unos
//    14 km/h en el centro y el nororiente; TomTom 2025: bajo 20 km/h en las horas de más demanda), y giros más lentos.

import { segundosDeArista, segundosDeGiro } from '../../compartido/grafoVial.js'

// Por rango de calle: 0 autopista, 1 troncal, 2 primaria, 3 secundaria, 4 terciaria, 5 sin clasificar, 6 residencial, 7 de servicio.
const KMH_MAXIMOS_EN_PUNTA = [40, 30, 22, 20, 18, 16, 15, 10]
const FACTOR_DE_LOS_GIROS_EN_PUNTA = 1.3

export const segundosEnPuntaDeArista = (grafo, arista) =>
  grafo.metros[arista] / (Math.min(grafo.kmh[arista], KMH_MAXIMOS_EN_PUNTA[grafo.rango[arista]]) / 3.6)

export const segundosEnPuntaDeGiro = (grafo, entrada, salida) =>
  segundosDeGiro(grafo, entrada, salida) * FACTOR_DE_LOS_GIROS_EN_PUNTA

// Metros y segundos (normales y en hora punta) de una lista de aristas seguidas. De la primera solo se recorre `metrosDeLaPrimera`
// (se parte a mitad de calle).
export function costosDelRecorrido(grafo, aristas, metrosDeLaPrimera = grafo.metros[aristas[0]]) {
  const total = { metros: 0, segundos: 0, segundosEnPunta: 0 }
  let anterior = null
  aristas.forEach((arista, indice) => {
    const fraccion = indice === 0 ? metrosDeLaPrimera / grafo.metros[arista] : 1
    total.metros += grafo.metros[arista] * fraccion
    total.segundos += segundosDeArista(grafo, arista) * fraccion
    total.segundosEnPunta += segundosEnPuntaDeArista(grafo, arista) * fraccion
    if (anterior !== null) {
      total.segundos += segundosDeGiro(grafo, anterior, arista)
      total.segundosEnPunta += segundosEnPuntaDeGiro(grafo, anterior, arista)
    }
    anterior = arista
  })
  return total
}
