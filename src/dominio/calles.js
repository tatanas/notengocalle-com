import { distanciaKm, masCercanosSegun } from '../nucleo/geografia.js'
import { anguloEntre, pesoDeParecido, formaDeCalle } from '../nucleo/parecido.js'
import { muestraPonderada } from '../nucleo/progreso.js'
import { almacen } from '../nucleo/almacen.js'
import { escaparHtml } from '../nucleo/utilidades.js'
import { sonParalelas, esVia, paralelasDe, vias, callePorNombre } from '../datos/datos.js'
import { COLORES_DE_TRAMOS } from '../mapa/dibujo.js'
import { partida } from '../juego/engine.js'

export const PREGUNTA_DE_CALLE = {
  calle: '¿Qué calle está marcada en azul?',
  autopista: '¿Qué autopista o carretera está marcada en azul?',
  tren: '¿Qué es lo que está marcado en azul?',
}

// street.tr = { n: [[nombre, km], ...], i: índice de tramo por cada línea } para calles que cambian de nombre.
export function htmlDeTramosConNombre(calle) {
  if (!calle.tr) return ''
  const elementos = calle.tr.n.map(([nombre, km], indice) => {
    const color = COLORES_DE_TRAMOS[indice % COLORES_DE_TRAMOS.length]
    return `<li><span class="dot" style="background:${color}"></span>${escaparHtml(nombre)} — ${String(km).replace('.', ',')} km</li>`
  })
  return `<p><b>Cambia de nombre por tramos:</b></p><ul class="blist">${elementos.join('')}</ul>`
}

const formas = new Map()
const formaDe = calle => {
  if (!formas.has(calle)) formas.set(calle, formaDeCalle(calle.lines))
  return formas.get(calle)
}

// Las calles que se pueden confundir con esta: las vecinas, las que corren pegadas a ella y las que el jugador
// ya confundió con ella (aunque queden lejos). En una ronda oficial no cuenta lo que haya confundido cada uno:
// las alternativas son las mismas para todos.
function parecidas(calle) {
  const personales = new Map(partida?.ranked ? [] : confusionesDe(calle.name))
  const distanciaA = new Map(calle.nb || [])
  const nombres = new Set([...distanciaA.keys(), ...paralelasDe(calle.name), ...personales.keys()])
  const forma = formaDe(calle)
  const candidatas = []
  for (const nombre of nombres) {
    const otro = callePorNombre[nombre]
    if (!otro || otro === calle || !esVia(otro)) continue
    const formaDeLaOtra = formaDe(otro)
    candidatas.push({
      street: otro,
      weight: pesoDeParecido({
        distanceKm: distanciaA.get(nombre) ?? distanciaKm(calle.mid, otro.mid),
        angleDiff: anguloEntre(forma.angle, formaDeLaOtra.angle),
        straightness: Math.min(forma.straightness, formaDeLaOtra.straightness),
        sameKind: (calle.kind || 'calle') === (otro.kind || 'calle'),
        overlaps: sonParalelas(calle.name, nombre),
        confusions: personales.get(nombre) || 0,
      }),
    })
  }
  return candidatas
}

// Alternativas incorrectas que cuesten: calles cercanas que apuntan hacia el mismo lado (Holanda, Suecia, Luis Thayer
// Ojeda), las que van una dentro de la otra (Eduardo Frei y la Ruta 5) y las que el jugador ha confundido antes.
export function distractoresDeCalle(calle, cantidad = 3) {
  const elegida = muestraPonderada(parecidas(calle), cantidad, {
    weightOf: candidata => candidata.weight,
  }).map(candidata => candidata.street)
  if (elegida.length >= cantidad) return elegida
  const rellenos = masCercanosSegun(
    vias(),
    calle.mid,
    otro => otro.mid,
    cantidad,
    otro => otro === calle || elegida.includes(otro),
  )
  return [...elegida, ...rellenos].slice(0, cantidad)
}

// ----- confusiones: qué calles ha mezclado el jugador entre sí
const confusiones = almacen.get('conf', {})
const llaveDeConfusion = (a, b) => [a, b].sort().join('|')

export function anotarConfusion(a, b) {
  if (!a || !b || a === b) return
  const llave = llaveDeConfusion(a, b)
  confusiones[llave] = (confusiones[llave] || 0) + 1
  almacen.set('conf', confusiones)
}

// [[otraCalle, veces], ...]
export const confusionesDe = nombre =>
  Object.entries(confusiones)
    .filter(([llave]) => llave.split('|').includes(nombre))
    .map(([llave, veces]) => [llave.split('|').find(otro => otro !== nombre) || nombre, veces])
    .filter(([otro]) => callePorNombre[otro])
