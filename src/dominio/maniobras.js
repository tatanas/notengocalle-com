import { KM_POR_GRADO_LATITUD, KM_POR_GRADO_LONGITUD, distanciaKm } from '../nucleo/geografia.js'

// Rumbo para ir de a hacia b, en grados: 0 es el norte y 90 el oriente.
export function rumbo(a, b) {
  const grados =
    (Math.atan2((b[1] - a[1]) * KM_POR_GRADO_LONGITUD, (b[0] - a[0]) * KM_POR_GRADO_LATITUD) * 180) / Math.PI
  return (grados + 360) % 360
}

// Cuánto gira quien va con rumbo `antes` para quedar con rumbo `despues`: positivo a la derecha, negativo a la izquierda.
export const giro = (antes, despues) => ((despues - antes + 540) % 360) - 180

// El punto que queda a `km` del comienzo de una línea, medido sobre ella.
export function puntoDesdeElInicio(linea, km) {
  let resto = km
  for (let i = 1; i < linea.length; i++) {
    const tramo = distanciaKm(linea[i - 1], linea[i])
    if (tramo >= resto) {
      const t = tramo ? resto / tramo : 0
      return [
        linea[i - 1][0] + t * (linea[i][0] - linea[i - 1][0]),
        linea[i - 1][1] + t * (linea[i][1] - linea[i - 1][1]),
      ]
    }
    resto -= tramo
  }
  return linea.at(-1)
}

export const puntoAntesDelFinal = (linea, km) => puntoDesdeElInicio([...linea].reverse(), km)

const GRADOS_DE_SEGUIR_DERECHO = 30
const GRADOS_DE_VUELTA_EN_U = 150

// La instrucción como la diría un navegador: "Dobla a la derecha en Av. Grecia", "Sigue derecho por Av. Apoquindo"…
export function textoDeManiobra(grados, calle, { autopista = false } = {}) {
  const cuanto = Math.abs(grados)
  if (cuanto < GRADOS_DE_SEGUIR_DERECHO) return `Sigue derecho por ${calle}`
  const lado = grados > 0 ? 'derecha' : 'izquierda'
  if (cuanto > GRADOS_DE_VUELTA_EN_U) return `Da la vuelta y sigue por ${calle}`
  return autopista ? `Toma ${calle} por la ${lado}` : `Dobla a la ${lado} en ${calle}`
}
