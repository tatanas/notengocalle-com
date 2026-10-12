import { ajustes } from '../nucleo/almacen.js'
import { dibujarMetro, delinearComunas } from './dibujo.js'
import { mapa } from './mapa.js'

// Ayudas del modo fácil: los bordes de las comunas y las líneas del metro, dibujados aparte de la pregunta para
// poder encenderlos y apagarlos en pleno juego. En una ronda oficial el modo es siempre difícil: no se dibuja nada.
const capaDeAyudas = L.layerGroup().addTo(mapa)
let solicitado = null

// borders: comunas a delinear (los juegos donde las comunas son la pregunta no las delinean); metro: líneas del metro.
export function mostrarAyudas({ borders: bordes = null, metro = true } = {}) {
  solicitado = { borders: bordes, metro }
  redibujarAyudas()
}

export function redibujarAyudas() {
  capaDeAyudas.clearLayers()
  if (!solicitado || !ajustes.easy) return
  if (solicitado.borders) delinearComunas(solicitado.borders).addTo(capaDeAyudas)
  if (solicitado.metro) dibujarMetro(capaDeAyudas, { dots: false, weight: 3, opacity: 0.55 })
}

export function limpiarAyudas() {
  solicitado = null
  capaDeAyudas.clearLayers()
}
