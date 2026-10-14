import {
  distanciaALinea,
  distanciaKm,
  masCercanosSegun,
  puntoMasCercanoEnLineas,
} from '../nucleo/geografia.js'
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

// ----- "¿Qué calle es?" con un solo punto: se evitan los cruces, que dejarían dudas sobre cuál calle es.
const MUESTRAS_POR_CALLE = 40
const LIBRE_DE_CRUCES_KM = 0.12
const MEDIA_FRANJA_KM = 0.15

function puntoAlAzarEnLaCalle(calle) {
  const tramos = calle.lines.flatMap(linea =>
    linea.slice(1).map((fin, i) => ({ a: linea[i], b: fin, largo: distanciaKm(linea[i], fin) })),
  )
  let objetivo = Math.random() * tramos.reduce((suma, tramo) => suma + tramo.largo, 0)
  for (const tramo of tramos) {
    if (objetivo <= tramo.largo) {
      const t = tramo.largo ? objetivo / tramo.largo : 0
      return [tramo.a[0] + t * (tramo.b[0] - tramo.a[0]), tramo.a[1] + t * (tramo.b[1] - tramo.a[1])]
    }
    objetivo -= tramo.largo
  }
  return tramos[0].a
}

const distanciaALaMasCercana = (punto, calle) =>
  Math.min(
    ...vias()
      .filter(otra => otra !== calle)
      .map(otra => distanciaALinea(punto, otra.lines)),
  )

// Un punto al azar de la calle lejos de cualquier otra. Si no hay ninguno (calle corta, rodeada de otras), se usa el
// menos malo y se marca además una franja de calle alrededor, para que se entienda de cuál se habla.
export function puntoParaPreguntar(calle) {
  const candidatos = Array.from({ length: MUESTRAS_POR_CALLE }, () => {
    const punto = puntoAlAzarEnLaCalle(calle)
    return { punto, libre: distanciaALaMasCercana(punto, calle) }
  })
  const libres = candidatos.filter(({ libre }) => libre >= LIBRE_DE_CRUCES_KM)
  if (libres.length) return { punto: libres[Math.floor(Math.random() * libres.length)].punto, franja: null }
  const mejor = candidatos.reduce((a, b) => (b.libre > a.libre ? b : a))
  return { punto: mejor.punto, franja: franjaAlrededorDe(calle, mejor.punto) }
}

// Los vértices de la calle a hasta MEDIA_FRANJA_KM (por el trazado) a cada lado del punto.
function franjaAlrededorDe(calle, punto) {
  const { point: cercano } = puntoMasCercanoEnLineas(punto, calle.lines)
  const linea = calle.lines.reduce((mejor, actual) =>
    distanciaALinea(cercano, [actual]) < distanciaALinea(cercano, [mejor]) ? actual : mejor,
  )
  const indice = linea.reduce(
    (mejor, vertice, i) => (distanciaKm(vertice, cercano) < distanciaKm(linea[mejor], cercano) ? i : mejor),
    0,
  )
  const hacia = paso => {
    const tramo = []
    let recorrido = 0
    for (let i = indice; i + paso >= 0 && i + paso < linea.length && recorrido < MEDIA_FRANJA_KM; i += paso) {
      recorrido += distanciaKm(linea[i], linea[i + paso])
      tramo.push(linea[i + paso])
    }
    return tramo
  }
  return [...hacia(-1).reverse(), linea[indice], ...hacia(1)]
}
