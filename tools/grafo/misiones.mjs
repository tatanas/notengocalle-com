// Revisa las rutas de prueba de la conducción libre: dónde se parte y se llega, la ruta óptima (km y minutos) y cuántas decisiones
// tiene, y comprueba que seguir el óptimo termina con 100 puntos.
//   node tools/grafo/misiones.mjs
import { existsSync, readFileSync } from 'node:fs'
import vm from 'node:vm'
import { cargarGrafo } from '../../compartido/grafoVial.js'
import { elegirOpcion, opcionQueSigue } from '../../src/dominio/conduccion.js'
import { nombreDeCalle } from '../../src/dominio/cruces.js'
import { accesosDelLugar, prepararRuta } from '../../src/dominio/lugaresDeRuteo.js'
import { analizarRecorrido } from '../../src/dominio/mision.js'
import { MISIONES_DE_CONDUCCION, nombreCortoDelLugar } from '../../src/dominio/misionesDeConduccion.js'

const ventana = { window: {} }
vm.runInNewContext(readFileSync('public/data/data.js', 'utf8'), ventana)
const lugares = new Map(ventana.window.DATA.landmarks.map(lugar => [lugar.id, lugar]))
const grafo = cargarGrafo(JSON.parse(readFileSync('public/data/grafo/santiago.json', 'utf8')))
const ARCHIVO_DE_HUELLAS = 'src/datos/huellasDeLugares.json'
const huellas = existsSync(ARCHIVO_DE_HUELLAS) ? JSON.parse(readFileSync(ARCHIVO_DE_HUELLAS, 'utf8')) : {}

for (const { id, origen, destino } of MISIONES_DE_CONDUCCION) {
  const a = lugares.get(origen)
  const b = lugares.get(destino)
  console.log(`\n${id}: ${nombreCortoDelLugar(a.name)} → ${nombreCortoDelLugar(b.name)}`)
  const { mision, estado, optima } = prepararRuta(grafo, a, b, huellas)
  console.log(
    `  llegada por: ${[...new Set([...mision.destinos].map(arista => nombreDeCalle(grafo, arista)))].join(', ')} (${accesosDelLugar(grafo, b, huellas[b.id]).size} tramos, ${huellas[b.id] ? 'con huella' : 'sin huella'}); salidas: ${estado.opcionesDePartida.length}`,
  )
  console.log(
    `  óptima: ${(optima.metros / 1000).toFixed(1)} km, ${(optima.segundos / 60).toFixed(1)} min normal, ${(optima.segundosEnPunta / 60).toFixed(1)} min en punta`,
  )
  let decisiones = 0
  while (estado.decision && !estado.llego && decisiones < 200) {
    const sigue = opcionQueSigue(estado, optima.aristas.slice(estado.recorrido.length))
    if (!sigue) break
    if (estado.decision.opciones.length > 1) decisiones++
    elegirOpcion(estado, sigue.id)
  }
  const resultado = analizarRecorrido(estado, optima)
  console.log(
    `  siguiendo el óptimo: ${decisiones} decisiones, llegó: ${estado.llego}, ${(resultado.jugador.segundos / 60).toFixed(1)} min, puntaje ${resultado.puntaje}`,
  )
}
