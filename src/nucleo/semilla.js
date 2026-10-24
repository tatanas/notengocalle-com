// Un "azar" que da lo mismo cada vez que se parte de la misma semilla (texto): sirve para que todos los jugadores reciban las
// mismas preguntas en un día.

// mulberry32 sobre un resumen del texto.
function generadorConSemilla(texto) {
  let resumen = 1779033703 ^ texto.length
  for (let i = 0; i < texto.length; i++) {
    resumen = Math.imul(resumen ^ texto.charCodeAt(i), 3432918353)
    resumen = (resumen << 13) | (resumen >>> 19)
  }
  let estado = resumen >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let valor = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    valor = (valor + Math.imul(valor ^ (valor >>> 7), 61 | valor)) ^ valor
    return ((valor ^ (valor >>> 14)) >>> 0) / 4294967296
  }
}

// `cuantos` elementos de la lista, elegidos y ordenados por la semilla. La lista debe venir siempre en el mismo orden.
export function elegirConSemilla(lista, cuantos, semilla) {
  const azar = generadorConSemilla(semilla)
  const mezclada = [...lista]
  for (let i = mezclada.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[mezclada[i], mezclada[j]] = [mezclada[j], mezclada[i]]
  }
  return mezclada.slice(0, cuantos)
}
