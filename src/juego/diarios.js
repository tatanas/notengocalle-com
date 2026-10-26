import { fechaDeHoyEnChile } from '../../compartido/oficial.js'
import { almacen } from '../nucleo/almacen.js'
import { elegirConSemilla } from '../nucleo/semilla.js'

// Los desafíos diarios son los mismos para todos: lo que se pregunta sale de la fecha de Chile (America/Santiago), no del azar.
// Y se juegan una sola vez por día: aquí se anota en este navegador cuándo se empezó cada uno y cómo salió (el servidor además
// rechaza una segunda jugada de la misma cuenta).
const DIAS_QUE_SE_GUARDAN = 7

// ----- la selección del día

// `cuantos` elementos de la lista, los mismos para todos en el día de hoy. La lista debe venir siempre en el mismo orden.
export const elegirDelDia = (lista, cuantos, clave, fecha = fechaDeHoyEnChile()) =>
  elegirConSemilla(lista, cuantos, `${fecha}:${clave}`)

// ----- lo jugado en este navegador

// { 'AAAA-MM-DD': { 'dd-calles': { aciertos?, total?, ms? } } }: con resultado si terminó; sin él, si se empezó y no se terminó.
const jugados = almacen.get('desafiosDiarios', {})

function guardar() {
  for (const fecha of Object.keys(jugados).sort().slice(0, -DIAS_QUE_SE_GUARDAN)) delete jugados[fecha]
  almacen.set('desafiosDiarios', jugados)
}

export const yaSeEmpezo = (idDeModo, fecha = fechaDeHoyEnChile()) => !!jugados[fecha]?.[idDeModo]
export const resultadoDelDia = (idDeModo, fecha = fechaDeHoyEnChile()) => jugados[fecha]?.[idDeModo] ?? null

export function anotarQueSeEmpezo(idDeModo, fecha = fechaDeHoyEnChile()) {
  jugados[fecha] ||= {}
  jugados[fecha][idDeModo] ||= {}
  guardar()
}

// Lo que lleva un desafío empezado: por si se cierra la pestaña a medias, se cuenta lo que se alcanzó.
export function anotarAvance(idDeModo, avance, fecha = fechaDeHoyEnChile()) {
  const anotado = jugados[fecha]?.[idDeModo]
  if (!anotado || anotado.total) return
  anotado.avance = avance
  guardar()
}

// Los desafíos que se empezaron y no se terminaron (ni de hoy ni de los días que se guardan).
export const desafiosSinTerminar = () =>
  Object.entries(jugados).flatMap(([fecha, delDia]) =>
    Object.entries(delDia)
      .filter(([, anotado]) => !anotado.total)
      .map(([idDeModo, anotado]) => ({ fecha, idDeModo, avance: anotado.avance ?? { aciertos: 0, ms: 0 } })),
  )

export function anotarResultado(idDeModo, resultado, fecha = fechaDeHoyEnChile()) {
  jugados[fecha] ||= {}
  jugados[fecha][idDeModo] = resultado
  guardar()
}
