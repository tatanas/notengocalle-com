// Juega la ruta óptima de un grafo de "Ruta libre" e imprime cada decisión que le tocaría al jugador.
//   node tools/grafo/probar.mjs public/data/ruta-libre/privadas/<id>.json
import { readFileSync } from 'node:fs'
import { cargarGrafo } from '../../compartido/grafoVial.js'
import {
  analisisDeLasDecisiones,
  crearRecorrido,
  elegirOpcion,
  resultadoDelRecorrido,
  rutaOptima,
} from '../../src/dominio/rutaLibre.js'

const [, , archivo] = process.argv
const datos = JSON.parse(readFileSync(archivo, 'utf8'))
const grafo = cargarGrafo(datos)
const recorrido = crearRecorrido(grafo, datos.meta)
const minutos = segundos => (segundos / 60).toFixed(1)

const nombreDe = arista =>
  grafo.nombres[grafo.nombre[arista]].n || grafo.nombres[grafo.nombre[arista]].r || '?'
const optima = rutaOptima(recorrido)
const calles = []
let metros = 0
for (const arista of optima) {
  metros += grafo.metros[arista]
  if (calles.at(-1)?.nombre === nombreDe(arista)) calles.at(-1).metros += grafo.metros[arista]
  else calles.push({ nombre: nombreDe(arista), metros: grafo.metros[arista] })
}
console.log(`Óptima del modelo: ${(metros / 1000).toFixed(2)} km, ${minutos(recorrido.optimoSegundos)} min`)
console.log(calles.map(calle => `${calle.nombre} (${(calle.metros / 1000).toFixed(1)})`).join(' > '))

let kilometros = 0
let anterior = 0
while (recorrido.decision) {
  const { decision } = recorrido
  kilometros = recorrido.aristas.reduce((suma, arista) => suma + grafo.metros[arista], 0) / 1000
  console.log(
    `\n#${decision.numero}  km ${kilometros.toFixed(2)}  ${decision.ibaPor ? `vas ${decision.ibaHacia ? `hacia el ${decision.ibaHacia} ` : ''}por ${decision.ibaPor}` : 'en el origen'}`,
  )
  const mejor = decision.opciones.reduce((a, b) => (b.segundosQueFaltan < a.segundosQueFaltan ? b : a))
  for (const opcion of decision.opciones)
    console.log(
      `   ${opcion === mejor ? '✅' : '  '} ${opcion.texto}  ${opcion === mejor ? '' : `(+${Math.round(opcion.segundosQueFaltan - mejor.segundosQueFaltan)} s)`}`,
    )
  anterior = kilometros
  elegirOpcion(recorrido, mejor.id)
}
const resultado = resultadoDelRecorrido(recorrido)
console.log(
  `\nFin: ${resultado.fin}; ${minutos(resultado.segundos)} min (óptimo ${minutos(resultado.optimoSegundos)}); puntaje ${resultado.puntaje}; ${anterior.toFixed(1)} km hasta la última decisión`,
)
console.log(
  analisisDeLasDecisiones(recorrido).filter(d => d.perdidaEnSegundos > 0).length,
  'decisiones que no fueron las mejores',
)
