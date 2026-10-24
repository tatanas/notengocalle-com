// Anota qué lugares emblemáticos tienen calles en el grafo (con ellas se puede partir y llegar) en src/datos/lugaresConCalles.json.
// El ruteo en auto sortea sus rutas solo entre estos. Hay que repetirlo cuando cambia el grafo o las huellas.
//   node tools/grafo/lugaresConCalles.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'
import { cargarGrafo } from '../../compartido/grafoVial.js'
import { accesosDelLugar } from '../../src/dominio/lugaresDeRuteo.js'
import { esLugarDeRuteo } from '../../src/dominio/misionesDeConduccion.js'

const ventana = { window: {} }
vm.runInNewContext(readFileSync('public/data/data.js', 'utf8'), ventana)
const huellas = JSON.parse(readFileSync('src/datos/huellasDeLugares.json', 'utf8'))
const grafo = cargarGrafo(JSON.parse(readFileSync('public/data/grafo/santiago.json', 'utf8')))
const lugares = ventana.window.DATA.landmarks.filter(esLugarDeRuteo)
const conCalles = lugares.filter(lugar => accesosDelLugar(grafo, lugar, huellas[lugar.id]).size > 0)
writeFileSync('src/datos/lugaresConCalles.json', JSON.stringify(conCalles.map(lugar => lugar.id)))
console.log(`${conCalles.length} de ${lugares.length} lugares tienen calles`)
console.log(
  'sin calles:',
  lugares
    .filter(lugar => !conCalles.includes(lugar))
    .map(lugar => lugar.name)
    .join(' | '),
)
