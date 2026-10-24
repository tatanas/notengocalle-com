// Juega una ronda del "Ruteo en auto" en el navegador, con Street View real: elige siempre la opción más rápida, salvo en las
// decisiones indicadas, donde elige la segunda mejor (un error a propósito). Al terminar imprime el puntaje y el análisis.
//   node tools/grafo/jugarRutaEnNavegador.mjs <id del origen>:<id del destino> [numero,de,decisiones,con,error] [--oficial]
//   node tools/grafo/jugarRutaEnNavegador.mjs l36:l1 3,12      (ids de DATA.landmarks: l36 Estadio Nacional, l1 Plaza de Armas)
//   node tools/grafo/jugarRutaEnNavegador.mjs azar             (una ruta al azar, en la práctica)
// Por omisión es la práctica (con mapa); con --oficial, la ronda real (sin mapa). Necesita el servidor de desarrollo en
// http://localhost:5173 (la llave de Google solo autoriza localhost; la ruta se fuerza con ?ruta=), el grafo construido y Chrome
// (o CHROME_PATH). Cada decisión carga un panorama: gasta cuota. Las capturas quedan en .local/capturas-conducir/.
import { existsSync, mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const argumentos = process.argv.slice(2)
const oficial = argumentos.includes('--oficial')
const [idDeLaRuta, textoDeErrores = ''] = argumentos.filter(argumento => !argumento.startsWith('--'))
const errores = new Set(textoDeErrores.split(',').filter(Boolean).map(Number))
const RUTAS_DE_CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
]
const CAPTURAS = '.local/capturas-conducir'
mkdirSync(CAPTURAS, { recursive: true })
const dormir = ms => new Promise(resolver => setTimeout(resolver, ms))

const navegador = await puppeteer.launch({
  executablePath: RUTAS_DE_CHROME.find(ruta => ruta && existsSync(ruta)),
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const pagina = await navegador.newPage()
await pagina.setViewport({ width: 1366, height: 820 })
pagina.on('pageerror', error => console.log('  [error de página]', error.message.slice(0, 300)))
await pagina.goto(`http://localhost:5173/${idDeLaRuta === 'azar' ? '' : `?ruta=${idDeLaRuta}`}`, {
  waitUntil: 'domcontentloaded',
})
const botonDelJuego = oficial ? '[data-official="rs-sv-ruta"]' : '.practice[data-mode="rs-sv-ruta"]'
await pagina.waitForSelector(botonDelJuego, { timeout: 60000 })
await pagina.click(botonDelJuego)
await pagina.waitForSelector('#rutaEmpezar', { timeout: 120000 })
await pagina.screenshot({ path: `${CAPTURAS}/mision-planificacion.png` })
await pagina.click('#rutaEmpezar')

const leer = () =>
  pagina.evaluate(() => {
    const api = window.__conducir
    return {
      resultado: api.resultado() && {
        motivo: api.resultado().motivo,
        puntaje: api.resultado().analisis.puntaje,
        razon: api.resultado().analisis.razon,
        jugador: api.resultado().analisis.jugador,
        optima: {
          metros: api.resultado().analisis.optima.metros,
          segundos: api.resultado().analisis.optima.segundos,
          segundosEnPunta: api.resultado().analisis.optima.segundosEnPunta,
        },
        errores: api.resultado().analisis.errores.map(e => e.segundosPerdidos),
      },
      listo:
        [...document.querySelectorAll('#panel .opt[data-id]')].length > 0 &&
        [...document.querySelectorAll('#panel .opt[data-id]')].every(b => !b.disabled),
      costos: api.costos(),
      ids: [...document.querySelectorAll('#panel .opt[data-id]')].map(b => +b.dataset.id),
      panel: document.querySelector('#panel')?.innerText ?? '',
    }
  })

let decision = 0
for (let paso = 0; paso < 150; paso++) {
  let datos
  for (let intento = 0; intento < 200; intento++) {
    await dormir(400)
    datos = await leer().catch(() => null)
    if (datos?.resultado || datos?.listo) break
  }
  if (datos?.resultado) break
  if (!datos?.listo) {
    console.log('Se detuvo sin opciones:', datos?.panel.slice(0, 200))
    break
  }
  const ordenadas = datos.ids
    .map((id, indice) => ({ id, costo: datos.costos[indice] }))
    .sort((a, b) => a.costo - b.costo)
  const equivocarse = errores.has(decision) && ordenadas.length > 1
  const elegida = equivocarse ? ordenadas[1] : ordenadas[0]
  console.log(
    `#${decision} ${datos.panel.split('\n')[1]?.slice(0, 60)} → opción ${elegida.id}${equivocarse ? ' (ERROR A PROPÓSITO)' : ''}${datos.ids.length > 1 ? '' : ' (única)'}`,
  )
  if (datos.ids.length > 1) decision++
  if (decision === 3)
    await pagina.screenshot({ path: `${CAPTURAS}/mision-decision${oficial ? '-oficial' : ''}.png` })
  await pagina.click(`#panel .opt[data-id="${elegida.id}"]`)
}
await dormir(2500)
const final = await leer()
await pagina.screenshot({ path: `${CAPTURAS}/mision-resultado.png` })
console.log('\nResultado:', JSON.stringify(final.resultado))
console.log(final.panel)
await navegador.close()
