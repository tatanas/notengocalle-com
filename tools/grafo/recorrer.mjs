// Juega un recorrido sobre el grafo y muestra cada decisión con sus opciones, para revisar que sean las de la vida real.
//   node tools/grafo/recorrer.mjs <lat,lon de partida> <lat,lon de llegada> [nombres de calle permitidas separados por |]
// Sin nombres sigue el camino más rápido; con ellos, el más rápido que solo usa esas calles (para repetir un recorrido conocido).
import { readFileSync } from 'node:fs'
import { buscarCamino, cargarGrafo } from '../../compartido/grafoVial.js'
import { aristaMasCercana, elegirOpcion, empezarEn, opcionQueSigue } from '../../src/dominio/conduccion.js'
import { nombreDeCalle } from '../../src/dominio/cruces.js'
import { textosDelCruce } from '../../src/dominio/instruccionesDeCruce.js'

const [, , textoDePartida, textoDeLlegada, textoDeCalles] = process.argv
const punto = texto => texto.split(',').map(Number)
const grafo = cargarGrafo(JSON.parse(readFileSync('public/data/grafo/santiago.json', 'utf8')))
const partida = aristaMasCercana(grafo, punto(textoDePartida))
const llegada = aristaMasCercana(grafo, punto(textoDeLlegada))
const permitidas = textoDeCalles ? new RegExp(`^(${textoDeCalles})$`) : null
const buscar = salida =>
  salida === -1
    ? null
    : buscarCamino(grafo, salida, {
        esMeta: arista => arista === llegada.arista,
        puedeUsar: arista => !permitidas || permitidas.test(nombreDeCalle(grafo, arista)),
      })
const candidatos = [partida.arista, grafo.inversa[partida.arista]]
  .map(salida => ({ salida, camino: buscar(salida) }))
  .filter(candidato => candidato.camino)
if (!candidatos.length) throw new Error('No hay camino')
const { salida, camino } = candidatos.reduce((a, b) => (b.camino.segundos < a.camino.segundos ? b : a))
const porRecorrer = [salida, ...camino.aristas]

const estado = empezarEn(grafo, punto(textoDePartida))
const mostrar = () => {
  const { decision } = estado
  const metros = (estado.metros / 1000).toFixed(2)
  console.log(
    `\n#${decision.esPartida ? 'partida' : `km ${metros}`}  ${decision.esPartida ? '' : `vas por ${nombreDeCalle(grafo, estado.entrada)}`}  (${decision.sinSalida} calles sin salida omitidas)`,
  )
  const textos = textosDelCruce(decision.opciones)
  decision.opciones.forEach((opcion, indice) =>
    console.log(
      `   ${opcion.camino.length > 1 ? '⇉' : ' '} ${textos[indice]}   [${opcion.tipo} ${Math.round(opcion.giroInicial)}°, ${opcion.camino.length} tramo(s)]`,
    ),
  )
}
let pasos = 0
while (estado.decision && pasos++ < 200) {
  mostrar()
  const sigue = opcionQueSigue(estado, porRecorrer.slice(estado.recorrido.length))
  if (!sigue) {
    console.log('   (el recorrido pedido no calza con ninguna opción)')
    break
  }
  elegirOpcion(estado, sigue.id)
  if (estado.recorrido.at(-1) === llegada.arista) {
    console.log('\nLlegada')
    break
  }
}
