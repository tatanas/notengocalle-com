// Un índice por cuadrículas para encontrar rápido las calles del grafo cerca de un punto (178 mil tramos: recorrerlos todos por
// cada consulta tardaba decenas de milisegundos, y hay una por lugar emblemático).

import { puntosDeArista } from '../../compartido/grafoVial.js'

const GRADOS_POR_CELDA = 0.003
const METROS_POR_GRADO_DE_LATITUD = 111200
// Los tramos más largos que esto se meten en todas las celdas por las que pasan; los demás, solo en las de sus extremos.
const METROS_DE_UN_TRAMO_LARGO = 150

const indicesPorGrafo = new WeakMap()
const celdaDe = (latitud, longitud) =>
  `${Math.floor(latitud / GRADOS_POR_CELDA)},${Math.floor(longitud / GRADOS_POR_CELDA)}`

function construirIndice(grafo) {
  const celdas = new Map()
  const agregar = (latitud, longitud, arista) => {
    const clave = celdaDe(latitud, longitud)
    if (!celdas.has(clave)) celdas.set(clave, new Set())
    celdas.get(clave).add(arista)
  }
  for (let arista = 0; arista < grafo.cantidadDeAristas; arista++) {
    agregar(grafo.latitud[grafo.desde[arista]], grafo.longitud[grafo.desde[arista]], arista)
    agregar(grafo.latitud[grafo.hasta[arista]], grafo.longitud[grafo.hasta[arista]], arista)
    if (grafo.metros[arista] > METROS_DE_UN_TRAMO_LARGO)
      for (const [latitud, longitud] of puntosDeArista(grafo, arista)) agregar(latitud, longitud, arista)
  }
  return celdas
}

// Los tramos que pueden pasar a menos de `radioM` de `punto` (un poco más: quien llama mide la distancia exacta).
export function aristasCercaDe(grafo, [latitud, longitud], radioM) {
  if (!indicesPorGrafo.has(grafo)) indicesPorGrafo.set(grafo, construirIndice(grafo))
  const celdas = indicesPorGrafo.get(grafo)
  const celdasDeRadio = Math.ceil(radioM / METROS_POR_GRADO_DE_LATITUD / GRADOS_POR_CELDA) + 1
  const celdaLatitud = Math.floor(latitud / GRADOS_POR_CELDA)
  const celdaLongitud = Math.floor(longitud / GRADOS_POR_CELDA)
  const encontradas = new Set()
  for (let i = -celdasDeRadio; i <= celdasDeRadio; i++)
    for (let j = -celdasDeRadio; j <= celdasDeRadio; j++)
      for (const arista of celdas.get(`${celdaLatitud + i},${celdaLongitud + j}`) ?? [])
        encontradas.add(arista)
  return encontradas
}
