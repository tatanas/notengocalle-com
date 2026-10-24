// Sigue en el navegador, con Street View real, el recorrido que calcula el motor entre dos puntos, y mide cada decisión: que el
// panorama esté donde está el auto del mapa, mirando hacia donde se avanza, sobre la calle y antes del cruce.
//   node tools/grafo/recorrerEnNavegador.mjs <lat,lon de partida> <lat,lon de llegada> [calles permitidas separadas por |]
// Necesita el servidor de desarrollo en http://localhost:5173 (la llave de Google solo autoriza localhost), el grafo construido y
// Chrome (o CHROME_PATH). Es una prueba manual: cada decisión carga un panorama y gasta cuota. ESPERA_CAPTURA=ms espera antes de
// cada captura (el panorama termina de dibujarse unos segundos después de cargar). Las capturas quedan en .local/capturas-conducir/.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { buscarCamino, cargarGrafo } from '../../compartido/grafoVial.js'
import { aristaMasCercana } from '../../src/dominio/conduccion.js'
import { nombreDeCalle } from '../../src/dominio/cruces.js'

const [, , textoDePartida, textoDeLlegada, textoDeCalles] = process.argv
const punto = texto => texto.split(',').map(Number)
const grafo = cargarGrafo(JSON.parse(readFileSync('public/data/grafo/santiago.json', 'utf8')))
const partida = aristaMasCercana(grafo, punto(textoDePartida))
const llegada = aristaMasCercana(grafo, punto(textoDeLlegada))
const permitidas = textoDeCalles ? new RegExp(`^(${textoDeCalles})$`) : null
const candidatos = [partida.arista, grafo.inversa[partida.arista]]
  .filter(arista => arista !== -1)
  .map(salida => ({
    salida,
    camino: buscarCamino(grafo, salida, {
      esMeta: arista => arista === llegada.arista,
      puedeUsar: arista => !permitidas || permitidas.test(nombreDeCalle(grafo, arista)),
    }),
  }))
  .filter(candidato => candidato.camino)
const { salida, camino } = candidatos.reduce((a, b) => (b.camino.segundos < a.camino.segundos ? b : a))
const planeadas = [salida, ...camino.aristas]

const RUTAS_DE_CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
]
const CAPTURAS = '.local/capturas-conducir'
mkdirSync(CAPTURAS, { recursive: true })
const dormir = ms => new Promise(r => setTimeout(r, ms))
const navegador = await puppeteer.launch({
  executablePath: RUTAS_DE_CHROME.find(ruta => ruta && existsSync(ruta)),
  headless: 'new',
  args: [
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
})
const pagina = await navegador.newPage()
await pagina.setViewport({ width: 1366, height: 820 })
pagina.on('pageerror', error => console.log('  [error de página]', error.message.slice(0, 300)))
await pagina.goto(`http://localhost:5173/?inicio=${textoDePartida}`, { waitUntil: 'domcontentloaded' })
await pagina.waitForSelector('.pestana[data-pantalla=drive]', { timeout: 60000 })
await pagina.click('.pestana[data-pantalla=drive]')

const leer = () =>
  pagina.evaluate(() => {
    const api = window.__conducir
    const estado = api.estado()
    const vista = api.vista()
    return {
      panel: document.querySelector('#panel')?.innerText ?? '',
      habilitadas: [...document.querySelectorAll('#panel .opt[data-id]')].every(b => !b.disabled),
      hay: document.querySelectorAll('#panel .opt[data-id]').length,
      panorama: api.panorama(),
      auto: api.auto(),
      rumboDeLaVista: api.rumboDeLaVista(),
      rumboEsperado: vista?.rumbo ?? null,
      aproximado: vista?.aproximado ?? null,
      sinVista: vista === null,
      carga: vista?.milisegundosDeCarga ?? null,
      lateral: vista?.distanciaAlTrazado ?? null,
      lado: vista?.ladoDelTrazado ?? null,
      alCruce: vista?.metrosAntesDelCruce ?? null,
      largo: vista?.camara?.largo ?? null,
      metrosRecorridos: estado?.metros ?? 0,
      recorrido: estado?.recorrido.length ?? 0,
      opciones: estado?.decision?.opciones.map(o => ({ id: o.id, camino: o.camino })) ?? [],
      camara: vista?.camara ? { largo: vista.camara.largo } : null,
    }
  })
const metros = (a, b) => Math.hypot((a[0] - b[0]) * 111200, (a[1] - b[1]) * 92900)
const dif = (a, b) => Math.abs(((b - a + 540) % 360) - 180)

let resumen = { decisiones: 0, aproximadas: 0, sinVista: 0, peorDesvio: 0, peorDistancia: 0 }
for (let paso = 0; paso < 80; paso++) {
  let datos
  for (let intento = 0; intento < 160; intento++) {
    await dormir(400)
    datos = await leer().catch(() => null)
    if (datos?.hay && datos.habilitadas) break
  }
  if (!datos?.hay) {
    console.log('Fin: no hay más decisiones.', datos?.panel.slice(0, 120))
    break
  }
  await dormir(1300)
  datos = await leer()
  const distancia = datos.panorama && datos.auto ? metros(datos.panorama, datos.auto) : null
  const desvio = datos.rumboEsperado === null ? null : dif(datos.rumboDeLaVista, datos.rumboEsperado)
  resumen.decisiones++
  if (datos.aproximado) resumen.aproximadas++
  if (datos.sinVista) resumen.sinVista++
  resumen.peorDesvio = Math.max(resumen.peorDesvio, desvio ?? 0)
  resumen.peorDistancia = Math.max(resumen.peorDistancia, distancia ?? 0)
  const lineas = datos.panel.split('\n').filter(Boolean)
  console.log(
    `#${paso} km ${(datos.metrosRecorridos / 1000).toFixed(2)} | ${lineas[1] ?? ''} | pano↔auto ${distancia?.toFixed(1) ?? '—'} m, desvío ${desvio?.toFixed(0) ?? '—'}°${datos.aproximado ? ' APROXIMADO' : ''}${datos.sinVista ? ' SIN STREET VIEW' : ''} | calle ${datos.lateral?.toFixed(1)} m al ${datos.lado === 1 ? 'DER' : 'IZQ'}, ${datos.alCruce?.toFixed(0)} m antes del cruce (tramo ${datos.largo?.toFixed(0)} m), carga ${datos.carga} ms`,
  )
  await dormir(+(process.env.ESPERA_CAPTURA ?? 0))
  await pagina.screenshot({ path: `${CAPTURAS}/ruta-${String(paso).padStart(2, '0')}.png` })
  const quedan = planeadas.slice(datos.recorrido)
  const elegida = datos.opciones.find(o => o.camino.every((arista, i) => arista === quedan[i]))
  if (!elegida) {
    console.log('El recorrido planeado ya no calza con ninguna opción: fin.')
    break
  }
  await pagina.click(`#panel .opt[data-id="${elegida.id}"]`)
}
console.log('\nResumen:', JSON.stringify(resumen))
await navegador.close()
