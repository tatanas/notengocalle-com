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

// "Sigue derecho" es solo cuando la calle cambia de nombre sin doblar; un desvío suave es "mantente a la derecha".
export const GRADOS_DE_SEGUIR_DERECHO = 20
const GRADOS_DE_DESVIO_SUAVE = 60
export const GRADOS_DE_VUELTA_EN_U = 150

export const ladoDelGiro = grados => (grados > 0 ? 'derecha' : 'izquierda')

// La instrucción como la diría un navegador: "Dobla a la derecha en Av. Grecia", "Sigue derecho por Av. Apoquindo"…
// El lado solo se dice cuando importa: en una salida o entrada de autopista hay una sola rampa (y en un trébol el giro
// medido en el mapa no coincide con el lado de la salida), y cuando la calle sale hacia un solo lado (`conLado: false`)
// no hay de dónde elegir.
export function textoDeManiobra(
  grados,
  calle,
  { desdeAutopista = false, haciaAutopista = false, numeroDeSalida = null, conLado = true } = {},
) {
  const cuanto = Math.abs(grados)
  if (cuanto > GRADOS_DE_VUELTA_EN_U) return `Da la vuelta y sigue por ${calle}`
  // Al dejar una autopista por otra calle siempre es una salida, aunque la rampa salga derecho: "sigue derecho" confunde.
  if (desdeAutopista && (!haciaAutopista || numeroDeSalida || cuanto >= GRADOS_DE_SEGUIR_DERECHO))
    return `Toma la salida${numeroDeSalida ? ` ${numeroDeSalida}` : ''} hacia ${calle}`
  if (haciaAutopista && !desdeAutopista) return `Toma la entrada a ${calle}`
  if (cuanto < GRADOS_DE_SEGUIR_DERECHO) return `Sigue derecho por ${calle}`
  const suave = cuanto < GRADOS_DE_DESVIO_SUAVE
  if (!conLado) return suave ? `Sigue hacia ${calle}` : `Dobla en ${calle}`
  const lado = ladoDelGiro(grados)
  return suave ? `Mantente a la ${lado} hacia ${calle}` : `Dobla a la ${lado} en ${calle}`
}

const PUNTOS_CARDINALES = [
  'norte',
  'nororiente',
  'oriente',
  'suroriente',
  'sur',
  'surponiente',
  'poniente',
  'norponiente',
]
// "norte", "suroriente"… para un rumbo en grados.
export const puntoCardinal = grados => PUNTOS_CARDINALES[Math.round(grados / 45) % PUNTOS_CARDINALES.length]
