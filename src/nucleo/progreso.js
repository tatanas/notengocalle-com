import { almacen } from './almacen.js'

// stats[clave] = { n, ok, streak, last }, con clave = "<modo>:<ítem>"
export const estadisticas = almacen.get('stats', {})

// bests["<modo>:<preguntas>"] = { ok, ms, d }
export const mejores = almacen.get('best', {})

export function registrar(llave, ok) {
  const entrada = estadisticas[llave] || (estadisticas[llave] = { n: 0, ok: 0, streak: 0 })
  entrada.n++
  if (ok) {
    entrada.ok++
    entrada.streak++
  } else {
    entrada.streak = 0
  }
  entrada.last = Date.now()
  almacen.set('stats', estadisticas)
}

export function guardarMejor(llave, mejor) {
  mejores[llave] = mejor
  almacen.set('best', mejores)
}

export function reiniciarProgreso() {
  for (const llave in estadisticas) delete estadisticas[llave]
  for (const llave in mejores) delete mejores[llave]
  almacen.set('stats', estadisticas)
  almacen.set('best', mejores)
}

// Lo nuevo y lo fallado pesan más; lo que ya se acierta seguido pesa menos.
export function pesoAdaptativo(llave) {
  const entrada = estadisticas[llave]
  if (!entrada) return 2.5
  const tasaDeFallos = 1 - entrada.ok / entrada.n
  return Math.max(
    0.25,
    1 + 4 * tasaDeFallos + (entrada.streak === 0 ? 1.5 : 0) - Math.min(entrada.streak, 4) * 0.3,
  )
}

const PARTICIPACION_MAXIMA_POR_GRUPO = 15

// Sorteo sin reposición. groupOf (ej. la comuna) evita que un grupo muy poblado domine la ronda.
export function muestraPonderada(
  elementos,
  cantidad,
  { weightOf: pesoDe = () => 1, groupOf: grupoDe = null } = {},
) {
  const tamanoDeGrupo = {}
  if (grupoDe)
    for (const elemento of elementos)
      tamanoDeGrupo[grupoDe(elemento)] = (tamanoDeGrupo[grupoDe(elemento)] || 0) + 1
  const conjunto = elementos.map(elemento => ({
    item: elemento,
    weight:
      pesoDe(elemento) *
      (grupoDe ? Math.min(1, PARTICIPACION_MAXIMA_POR_GRUPO / tamanoDeGrupo[grupoDe(elemento)]) : 1),
  }))
  const muestra = []
  while (muestra.length < cantidad && conjunto.length) {
    const total = conjunto.reduce((suma, entrada) => suma + entrada.weight, 0)
    let umbral = Math.random() * total
    let indice = 0
    for (; indice < conjunto.length - 1; indice++) {
      umbral -= conjunto[indice].weight
      if (umbral <= 0) break
    }
    muestra.push(conjunto[indice].item)
    conjunto.splice(indice, 1)
  }
  return muestra
}
