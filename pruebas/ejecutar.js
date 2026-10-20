// Pruebas de navegador sobre el build de producción.
//   node pruebas/ejecutar.js                  todas
//   node pruebas/ejecutar.js humo cuentas     solo las nombradas
//   node pruebas/ejecutar.js --cambios        solo lo que corresponde a los archivos modificados (ver seleccion.js)
//   node pruebas/ejecutar.js --sin-build      reutiliza el dist/ existente
//   node pruebas/ejecutar.js --dev            sirve el código sin empaquetar (errores con archivo y línea reales)
//   node pruebas/ejecutar.js --verboso        lista también cada verificación que pasa (por defecto solo las fallas)
import { execSync } from 'node:child_process'
import { cuentas } from './conjuntos/cuentas.js'
import { humo } from './conjuntos/humo.js'
import {
  ajusteCelular,
  callesPropias,
  categoriasRanking,
  puntoEnCalle,
  confirmarSalida,
  cronometro,
  cuentaRegresiva,
  disenoMenu,
  facilDificil,
  fotos,
  reiniciarRonda,
  rondasOficiales,
} from './conjuntos/rondas.js'
import { CAPTURAS, crearVerificador, abrirNavegador, iniciarServidor } from './apoyo.js'
import { elegirConjuntos } from './seleccion.js'

// Con --cambios, la prueba de humo juega solo los juegos que cambiaron (null = todos).
let prefijosDeHumo = null

const CONJUNTOS = {
  humo: (navegador, verificador) => humo(navegador, verificador, { solo: prefijosDeHumo }),
  'humo-celular': (navegador, verificador) =>
    humo(navegador, verificador, { celular: true, solo: prefijosDeHumo }),
  cronometro,
  'calles-propias': callesPropias,
  'rondas-oficiales': rondasOficiales,
  'confirmar-salida': confirmarSalida,
  'diseno-menu': disenoMenu,
  'cuenta-regresiva': cuentaRegresiva,
  'ajuste-celular': ajusteCelular,
  'facil-dificil': facilDificil,
  'reiniciar-ronda': reiniciarRonda,
  'categorias-ranking': categoriasRanking,
  'punto-en-calle': puntoEnCalle,
  fotos,
  cuentas,
}

const argumentos = process.argv.slice(2)
const nombres = argumentos.filter(argumento => !argumento.startsWith('--'))

// Archivos modificados sin confirmar o, si no hay, los del último commit.
function archivosModificados() {
  const lineas = comando => execSync(comando, { encoding: 'utf8' }).split('\n').filter(Boolean)
  const sinConfirmar = [
    ...lineas('git diff --name-only HEAD'),
    ...lineas('git ls-files --others --exclude-standard'),
  ]
  return sinConfirmar.length ? sinConfirmar : lineas('git diff --name-only HEAD~1 HEAD')
}

function conjuntosPorCorrer() {
  if (nombres.length) return nombres
  if (!argumentos.includes('--cambios')) return Object.keys(CONJUNTOS)
  const archivos = archivosModificados()
  const eleccion = elegirConjuntos(archivos)
  if (eleccion.todo) {
    console.log(`Cambios amplios (${archivos.length} archivos): se corre todo.`)
    return Object.keys(CONJUNTOS)
  }
  prefijosDeHumo = eleccion.prefijosDeHumo
  const elegidos = new Set(eleccion.conjuntos)
  if (prefijosDeHumo === null || prefijosDeHumo.length) elegidos.add('humo')
  if (prefijosDeHumo === null && archivos.some(archivo => /^src\/(mapa|interfaz)\/|\.css$/.test(archivo)))
    elegidos.add('humo-celular')
  console.log(
    `Según ${archivos.length} archivo(s) modificado(s): ${[...elegidos].join(', ') || 'ningún conjunto'}`,
  )
  if (prefijosDeHumo?.length) console.log(`  (la prueba de humo juega solo: ${prefijosDeHumo.join(', ')})`)
  return [...elegidos]
}

const elegidos = conjuntosPorCorrer()
if (!elegidos.length) {
  console.log('Nada que probar en el navegador.')
  process.exit(0)
}
const desconocidos = elegidos.filter(nombre => !CONJUNTOS[nombre])
if (desconocidos.length)
  throw new Error(
    `Conjuntos desconocidos: ${desconocidos.join(', ')}. Existen: ${Object.keys(CONJUNTOS).join(', ')}`,
  )

const opcionesDelServidor = { dev: argumentos.includes('--dev') }
let detenerServidor = await iniciarServidor({
  ...opcionesDelServidor,
  reconstruir: !argumentos.includes('--sin-build'),
})
let navegador = await abrirNavegador()
const fallas = []

// Si un conjunto se interrumpe, queda una captura de cada página abierta para ver qué había en pantalla.
async function guardarPaginasComoEvidencia(navegadorAbierto, conjunto) {
  try {
    const paginas = await navegadorAbierto.pages()
    for (const [indice, pagina] of paginas.entries())
      await pagina.screenshot({ path: `${CAPTURAS}falla_${conjunto}_${indice}.png` }).catch(() => {})
  } catch {
    console.log('  (Chrome ya no responde: no hay captura)')
  }
}

const inicio = Date.now()
// Estos conjuntos guardan puntajes: cada uno parte con la base de datos vacía para que no se mezclen sus rankings.
const NECESITAN_BASE_VACIA = new Set(['categorias-ranking', 'cuentas'])

for (const nombre of elegidos) {
  if (NECESITAN_BASE_VACIA.has(nombre) && nombre !== elegidos.find(otro => NECESITAN_BASE_VACIA.has(otro))) {
    await detenerServidor()
    detenerServidor = await iniciarServidor({ ...opcionesDelServidor, reconstruir: false })
  }
  if (!navegador.connected) {
    console.log('\nChrome se cerró solo: se abre de nuevo.')
    navegador = await abrirNavegador()
  }
  console.log(`\n${nombre}`)
  const inicioDelConjunto = Date.now()
  const verificador = crearVerificador(nombre)
  try {
    await CONJUNTOS[nombre](navegador, verificador)
  } catch (error) {
    verificador.verificar(false, `se interrumpió: ${error.message}`)
    await guardarPaginasComoEvidencia(navegador, nombre)
  }
  fallas.push(...verificador.fallas)
  const segundos = Math.round((Date.now() - inicioDelConjunto) / 1000)
  console.log(`  ${verificador.aprobadas} verificaciones bien (${segundos} s)`)
}
await navegador.close()
await detenerServidor()

console.log(`\nTotal: ${Math.round((Date.now() - inicio) / 1000)} s`)
console.log(fallas.length ? `\n${fallas.length} fallas:\n- ${fallas.join('\n- ')}` : '\nTodo bien.')
process.exit(fallas.length ? 1 : 0)
