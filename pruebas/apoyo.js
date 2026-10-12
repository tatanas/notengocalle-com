import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { build, createServer, preview } from 'vite'

export const URL_BASE = 'http://127.0.0.1:8765'
export const CAPTURAS = fileURLToPath(new URL('./capturas/', import.meta.url))

const RUTAS_DE_CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const ESCRITORIO = { width: 1366, height: 820 }
const CELULAR = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

// Servicios externos (teselas, fotos) que pueden fallar sin que sea un error del juego.
const EXTERNOS = /terrarium|openfreemap|openstreetmap|wikimedia|panoramax/

export const dormir = ms => new Promise(resolver => setTimeout(resolver, ms))

const PUERTO = +new URL(URL_BASE).port

// Sirve el build de producción con el API sobre una base en memoria, igual que `npm run preview`.
// Con dev: true sirve el código sin empaquetar, para que los errores apunten al archivo y línea reales.
export async function iniciarServidor({ reconstruir = true, dev = false } = {}) {
  process.env.LOCAL_DB_DIR = 'memory://'
  if (dev) {
    const servidor = await createServer({
      logLevel: 'warn',
      server: { port: PUERTO, host: '127.0.0.1', strictPort: true },
    })
    await servidor.listen()
    return () => servidor.close()
  }
  if (reconstruir) await build({ logLevel: 'warn' })
  // Puerto propio de las pruebas, para no chocar con un `npm run preview` abierto.
  const servidor = await preview({
    logLevel: 'warn',
    preview: { port: PUERTO, host: '127.0.0.1', strictPort: true },
  })
  return () => new Promise(resolver => servidor.httpServer.close(resolver))
}

export async function abrirNavegador() {
  const rutaDelEjecutable = RUTAS_DE_CHROME.find(camino => camino && existsSync(camino))
  if (!rutaDelEjecutable)
    throw new Error('No encontré Chrome; define CHROME_PATH con la ruta del ejecutable.')
  mkdirSync(CAPTURAS, { recursive: true })
  return puppeteer.launch({ executablePath: rutaDelEjecutable, headless: 'new', args: ['--no-sandbox'] })
}

// Cada página abre en un contexto limpio (sin sesión ni progreso), salvo que se le pase uno.
export async function abrirPagina(
  navegador,
  { celular = false, path: camino = '/', storage: almacenamiento = {}, context: contexto } = {},
) {
  contexto ||= await navegador.createBrowserContext()
  const pagina = await contexto.newPage()
  await pagina.setViewport(celular ? CELULAR : ESCRITORIO)
  const errores = []
  let cargas = 0
  let paso = 'inicio'
  const informe = problema => errores.push(`[${paso}] ${problema}`)
  const primerasLineas = pila => pila.split(/\n/).slice(0, 4).join(' ← ')
  pagina.on('pageerror', error => informe('PAGEERROR ' + primerasLineas(error.stack || error.message)))
  const describir = argumentoDado =>
    argumentoDado.evaluate(valor => (valor instanceof Error ? valor.message : String(valor))).catch(() => '?')
  pagina.on('console', async mensaje => {
    if (mensaje.type() !== 'error' || EXTERNOS.test(mensaje.location().url || '')) return
    const detalles = (await Promise.all(mensaje.args().map(describir))).join(' ') || mensaje.text()
    if (!EXTERNOS.test(detalles)) informe(`CONSOLE ${detalles} @${mensaje.location().url || ''}`)
  })
  pagina.on('requestfailed', solicitud => {
    if (!EXTERNOS.test(solicitud.url())) informe('REQFAIL ' + solicitud.url())
  })
  pagina.on('load', () => cargas++)
  await pagina.evaluateOnNewDocument(entradas => {
    for (const [llave, valor] of Object.entries(entradas))
      if (localStorage.getItem('ntc:' + llave) === null)
        localStorage.setItem('ntc:' + llave, JSON.stringify(valor))
  }, almacenamiento)
  await pagina.goto(URL_BASE + camino, { waitUntil: 'networkidle2' })
  // during(nombre) etiqueta los errores que aparezcan desde ahí, para saber en qué paso ocurrieron.
  return {
    page: pagina,
    context: contexto,
    errors: errores,
    reloads: () => cargas - 1,
    during: nombre => (paso = nombre),
  }
}

export const texto = (pagina, selector) => pagina.$eval(selector, nodo => nodo.innerText)
export const existe = async (pagina, selector) => !!(await pagina.$(selector))
// Con una ronda en curso, el menú pide confirmación: se acepta. Sin ronda, no aparece ningún aviso.
export async function irAlInicio(pagina) {
  await pagina.evaluate(() => document.getElementById('btnHome').click())
  await dormir(60)
  if (await pagina.$('#confirmDialog[open]')) await pagina.click('#confirmOk')
  await pagina.waitForSelector('#screen:not(.hidden) [data-mode]')
}

// Un punto del mapa sobre algo que se puede tocar (una comuna, una región); si no hay, un punto fijo.
// Con attempt distinto se elige otra figura: en "completa el mapa" tocar una ya respondida no cuenta.
const puntoTocable = (pagina, intento) =>
  pagina.evaluate(intento => {
    const mapa = document.getElementById('map').getBoundingClientRect()
    const encontrados = new Map()
    for (let fy = 0.15; fy < 0.9; fy += 0.05)
      for (let fx = 0.05; fx < 0.9; fx += 0.03) {
        const x = mapa.left + mapa.width * fx
        const y = mapa.top + mapa.height * fy
        const nodo = document.elementFromPoint(x, y)
        if (nodo?.matches('path.leaflet-interactive') && !encontrados.has(nodo))
          encontrados.set(nodo, { x, y })
      }
    const puntos = [...encontrados.values()]
    return puntos.length
      ? puntos[intento % puntos.length]
      : { x: mapa.left + mapa.width * 0.45, y: mapa.top + mapa.height * 0.35 }
  }, intento)

// Da un paso hacia responder la pregunta en pantalla: una alternativa, una línea de metro o un toque en el mapa.
export async function responderComoSea(pagina, intento = 0) {
  const eleccion = (await pagina.$('.opt:not([disabled])')) || (await pagina.$('.linebtn'))
  if (eleccion) {
    await eleccion.click()
    const confirmacion = await pagina.$('#btnConfirm:not([disabled])')
    if (confirmacion) await confirmacion.click()
    return
  }
  const { x, y } = await puntoTocable(pagina, intento)
  await pagina.mouse.click(x, y)
}

// Juega la ronda entera eligiendo siempre la primera alternativa. Solo sirve para juegos de alternativas.
// La pausa imita a una persona: el servidor descarta rondas respondidas más rápido de lo humanamente posible.
export async function jugarRondaDeAlternativas(pagina, { thinkMs: msDePensar = 320 } = {}) {
  for (;;) {
    await pagina.waitForSelector('.opt:not([disabled]), #again', { timeout: 15000 })
    if (await existe(pagina, '#again')) return
    await dormir(msDePensar)
    await pagina.click('.opt:not([disabled])')
    await pagina.waitForSelector('#btnNext')
    await clicEnSiguiente(pagina)
  }
}

export function crearVerificador(conjunto) {
  const fallas = []
  return {
    fallas,
    verificar(condicion, descripcionDeLaPrueba) {
      console.log(`  ${condicion ? '✓' : '✗'} ${descripcionDeLaPrueba}`)
      if (!condicion) fallas.push(`${conjunto}: ${descripcionDeLaPrueba}`)
    },
  }
}

// "Siguiente" queda al final del panel, que se desplaza suavemente al responder: un clic por coordenadas puede
// caer a mitad del desplazamiento. El clic del DOM no depende de dónde esté el botón en ese instante.
export const clicEnSiguiente = pagina => pagina.$eval('#btnNext', boton => boton.click())
