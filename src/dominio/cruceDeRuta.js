import { esLaMismaCalle } from '../../compartido/rutaEnAuto.js'
import { distanciaKm } from '../nucleo/geografia.js'
import { giro, puntoAntesDelFinal, puntoCardinal, puntoDesdeElInicio, rumbo } from './maniobras.js'

// Qué se puede hacer de verdad en el cruce donde la ruta entra a un paso: las calles que salen de él son las que trae el paso
// (`ent`, de Valhalla: con su nombre, su clase y el rumbo con que salen). Las preguntas del ruteo solo ofrecen eso.

const KM_PARA_MEDIR_EL_RUMBO = 0.06
const KM_PARA_MEDIR_LA_CALLE_SIGUIENTE = 0.15
// Una calle que sale a menos de esto del rumbo que se lleva es seguir derecho.
const GRADOS_DE_SEGUIR_DERECHO_POSIBLE = 45

// La calle anterior se deja en su fin; lo que viene después (conectores y la calle nueva) es otro trazado.
export function separarEnElFin(anterior) {
  const fin = anterior.fin ?? anterior.g.at(-1)
  let indiceDelFin = 0
  anterior.g.forEach((punto, indice) => {
    if (distanciaKm(punto, fin) < distanciaKm(anterior.g[indiceDelFin], fin)) indiceDelFin = indice
  })
  return { fin, propio: anterior.g.slice(0, indiceDelFin + 1), conector: anterior.g.slice(indiceDelFin) }
}

// El cruce donde se entra a `paso` viniendo de `anterior`: dónde está, con qué rumbo se llega, cuánto hay que girar para
// seguir la ruta y qué calles salen de él (con cuánto habría que girar para tomar cada una).
export function cruceDeLaRuta(anterior, paso) {
  const { fin, propio, conector } = separarEnElFin(anterior)
  const rumboEnElFin = rumbo(puntoAntesDelFinal(propio, KM_PARA_MEDIR_EL_RUMBO), fin)
  const rumboDeLaSiguiente = rumbo(paso.g[0], puntoDesdeElInicio(paso.g, KM_PARA_MEDIR_LA_CALLE_SIGUIENTE))
  const conConectores = !!anterior.c?.length
  // Con calles chicas entremedio, la pregunta es al llegar a la calle nueva, viniendo por la última de ellas.
  const rumboDeLlegada = conConectores
    ? rumbo(puntoAntesDelFinal(conector, KM_PARA_MEDIR_EL_RUMBO), conector.at(-1))
    : rumboEnElFin
  const calles = (paso.ent ?? []).map(calle => ({ ...calle, grados: giro(rumboDeLlegada, calle.h) }))
  return {
    fin,
    propio,
    conector,
    conConectores,
    cruce: paso.x ?? fin,
    rumboEnElFin,
    rumbo: rumboDeLlegada,
    // Sin calles chicas entremedio, el giro se mide contra la calle siguiente (no contra la rampa, que en un trébol se curva
    // hacia atrás).
    grados: giro(rumboDeLlegada, rumboDeLaSiguiente),
    calleActual: conConectores ? anterior.c.at(-1) : anterior.n,
    calles,
  }
}

// ¿La calle por la que se viene sigue derecho en este cruce, además de la ruta que se toma?
export const seguirDerechoEs = (cruce, nombreDeLaCalle) =>
  cruce.calles.find(
    calle =>
      esLaMismaCalle(calle.n, nombreDeLaCalle) && Math.abs(calle.grados) <= GRADOS_DE_SEGUIR_DERECHO_POSIBLE,
  )

// Cuando la calle a la que se entra también sale del cruce en otro sentido (José Alcalde Délano hacia El Rodeo o hacia Santa
// Teresa), por el nombre no se distinguen: se dicen por hacia dónde va cada una, medido sobre el recorrido de la ruta por esa
// calle. Sin calle de ida y vuelta (o si se sigue por la misma calle) es null.
export function sentidosDeLaMismaCalle(cruce, paso) {
  const hayOtroSentido = !cruce.conConectores && cruce.calles.some(calle => esLaMismaCalle(calle.n, paso.n))
  if (!hayOtroSentido) return null
  const rumboDelPaso = rumbo(paso.g[0], paso.g.at(-1))
  return {
    correcto: puntoCardinal(rumboDelPaso),
    opuesto: puntoCardinal((rumboDelPaso + 180) % 360),
  }
}

// Las otras calles que salen del cruce, las más importantes primero y sin repetir nombre. Las de la ruta (y la actual) no
// cuentan: no sirven de alternativa porque son lo mismo que la respuesta o la calle por la que ya se va.
export function otrasCalles(cruce, esDeLaRuta) {
  const vistas = new Set()
  return [...cruce.calles]
    .filter(calle => !esDeLaRuta(calle.n) && !esLaMismaCalle(calle.n, cruce.calleActual))
    .sort((a, b) => a.k - b.k || Math.abs(a.grados) - Math.abs(b.grados))
    .filter(calle => !vistas.has(calle.n) && vistas.add(calle.n))
}
