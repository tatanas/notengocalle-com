// Las opciones de un cruce (src/dominio/cruces.js) dichas como las diría un navegador.

import { TIPO } from './cruces.js'

const ladoDelGiro = giro => (giro >= 0 ? 'derecha' : 'izquierda')
const haciaLaCalle = opcion =>
  (opcion.destino ?? opcion.calle) ? ` hacia ${opcion.destino ?? opcion.calle}` : ''
const porLaCalle = opcion =>
  opcion.esRamal ? ` por el ramal${haciaLaCalle(opcion)}` : opcion.calle ? ` por ${opcion.calle}` : ''

const sinTilde = texto => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Lo que dice el cartel de la salida y, si es otra cosa, a qué calle llega ("«Manquehue» (llega a Presidente Kennedy Lateral)").
function textoDelCartel(opcion) {
  if (!opcion.destino) return haciaLaCalle(opcion)
  const llegaAOtraCalle = opcion.calle && !sinTilde(opcion.destino).includes(sinTilde(opcion.calle))
  return ` «${opcion.destino}»${llegaAOtraCalle ? ` (llega a ${opcion.calle})` : ''}`
}

const TEXTO_POR_TIPO = {
  [TIPO.PARTIDA]: opcion => `Salir hacia el ${opcion.hacia}${porLaCalle(opcion)}`,
  [TIPO.SEGUIR]: opcion => {
    if (opcion.mismaCalle || !opcion.calle) return `Seguir derecho${porLaCalle(opcion)}`
    return /^Autopista /i.test(opcion.calle)
      ? `Seguir derecho: te unes a ${opcion.calle}`
      : `Seguir derecho (la calle pasa a llamarse ${opcion.calle})`
  },
  [TIPO.LEVE]: opcion => `Doblar levemente a la ${ladoDelGiro(opcion.giroInicial)}${porLaCalle(opcion)}`,
  [TIPO.GIRO]: opcion => `Doblar a la ${ladoDelGiro(opcion.giroInicial)}${porLaCalle(opcion)}`,
  [TIPO.MANTENERSE]: opcion =>
    opcion.posicion === 'centro'
      ? `Seguir por el centro${porLaCalle(opcion)}`
      : `Mantenerse a la ${opcion.posicion}${porLaCalle(opcion)}`,
  [TIPO.VUELTA]: opcion => (opcion.porRetorno ? 'Dar la vuelta en U por el retorno' : 'Dar la vuelta en U'),
  [TIPO.ROTONDA]: opcion => `Tomar la ${opcion.numeroDeSalida}ª salida de la rotonda${porLaCalle(opcion)}`,
  [TIPO.SALIDA]: opcion =>
    `Tomar la salida${opcion.numeroDeSalida ? ` ${opcion.numeroDeSalida}` : ''}${textoDelCartel(opcion)}`,
  [TIPO.ENTRADA]: opcion => `Tomar la entrada${opcion.calle ? ` a ${opcion.calle}` : ''}`,
  [TIPO.RAMAL]: opcion => `Tomar el ramal${haciaLaCalle(opcion)}`,
}

// Cada opción con su texto. Si dos dicen lo mismo (dos calles que se llaman igual), se distinguen por hacia dónde van.
export function textosDelCruce(opciones) {
  const textos = opciones.map(opcion => TEXTO_POR_TIPO[opcion.tipo](opcion))
  return opciones.map((opcion, indice) => {
    const repetido = textos.filter(texto => texto === textos[indice]).length > 1
    return repetido ? `${textos[indice]} (hacia el ${opcion.hacia})` : textos[indice]
  })
}
