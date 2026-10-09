import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { build, createServer, preview } from 'vite'

export const BASE_URL = 'http://127.0.0.1:8765'
export const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url))

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const DESKTOP = { width: 1366, height: 820 }
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

// Servicios externos (teselas, fotos) que pueden fallar sin que sea un error del juego.
const EXTERNAL = /terrarium|openfreemap|openstreetmap|wikimedia|panoramax/

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const PORT = +new URL(BASE_URL).port

// Sirve el build de producción con el API sobre una base en memoria, igual que `npm run preview`.
// Con dev: true sirve el código sin empaquetar, para que los errores apunten al archivo y línea reales.
export async function startServer({ rebuild = true, dev = false } = {}) {
  process.env.LOCAL_DB_DIR = 'memory://'
  if (dev) {
    const server = await createServer({
      logLevel: 'warn',
      server: { port: PORT, host: '127.0.0.1', strictPort: true },
    })
    await server.listen()
    return () => server.close()
  }
  if (rebuild) await build({ logLevel: 'warn' })
  // Puerto propio de las pruebas, para no chocar con un `npm run preview` abierto.
  const server = await preview({
    logLevel: 'warn',
    preview: { port: PORT, host: '127.0.0.1', strictPort: true },
  })
  return () => new Promise(resolve => server.httpServer.close(resolve))
}

export async function launchBrowser() {
  const executablePath = CHROME_PATHS.find(path => path && existsSync(path))
  if (!executablePath) throw new Error('No encontré Chrome; define CHROME_PATH con la ruta del ejecutable.')
  mkdirSync(SHOTS, { recursive: true })
  return puppeteer.launch({ executablePath, headless: 'new', args: ['--no-sandbox'] })
}

// Cada página abre en un contexto limpio (sin sesión ni progreso), salvo que se le pase uno.
export async function openPage(browser, { mobile = false, path = '/', storage = {}, context } = {}) {
  context ||= await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport(mobile ? MOBILE : DESKTOP)
  const errors = []
  let loads = 0
  let step = 'inicio'
  const report = problem => errors.push(`[${step}] ${problem}`)
  const firstLines = stack => stack.split(/\n/).slice(0, 4).join(' ← ')
  page.on('pageerror', error => report('PAGEERROR ' + firstLines(error.stack || error.message)))
  const describe = argument =>
    argument.evaluate(value => (value instanceof Error ? value.message : String(value))).catch(() => '?')
  page.on('console', async message => {
    if (message.type() !== 'error' || EXTERNAL.test(message.location().url || '')) return
    const details = (await Promise.all(message.args().map(describe))).join(' ') || message.text()
    if (!EXTERNAL.test(details)) report(`CONSOLE ${details} @${message.location().url || ''}`)
  })
  page.on('requestfailed', request => {
    if (!EXTERNAL.test(request.url())) report('REQFAIL ' + request.url())
  })
  page.on('load', () => loads++)
  await page.evaluateOnNewDocument(entries => {
    for (const [key, value] of Object.entries(entries))
      if (localStorage.getItem('ntc:' + key) === null)
        localStorage.setItem('ntc:' + key, JSON.stringify(value))
  }, storage)
  await page.goto(BASE_URL + path, { waitUntil: 'networkidle2' })
  // during(nombre) etiqueta los errores que aparezcan desde ahí, para saber en qué paso ocurrieron.
  return { page, context, errors, reloads: () => loads - 1, during: name => (step = name) }
}

export const text = (page, selector) => page.$eval(selector, element => element.innerText)
export const exists = async (page, selector) => !!(await page.$(selector))
// Con una ronda en curso, el menú pide confirmación: se acepta. Sin ronda, no aparece ningún aviso.
export async function goHome(page) {
  await page.evaluate(() => document.getElementById('btnHome').click())
  await sleep(60)
  if (await page.$('#confirmDialog[open]')) await page.click('#confirmOk')
  await page.waitForSelector('#screen:not(.hidden) [data-mode]')
}

// Un punto del mapa sobre algo que se puede tocar (una comuna, una región); si no hay, un punto fijo.
// Con attempt distinto se elige otra figura: en "completa el mapa" tocar una ya respondida no cuenta.
const tappablePoint = (page, attempt) =>
  page.evaluate(attempt => {
    const map = document.getElementById('map').getBoundingClientRect()
    const found = new Map()
    for (let fy = 0.15; fy < 0.9; fy += 0.05)
      for (let fx = 0.05; fx < 0.9; fx += 0.03) {
        const x = map.left + map.width * fx
        const y = map.top + map.height * fy
        const element = document.elementFromPoint(x, y)
        if (element?.matches('path.leaflet-interactive') && !found.has(element)) found.set(element, { x, y })
      }
    const points = [...found.values()]
    return points.length
      ? points[attempt % points.length]
      : { x: map.left + map.width * 0.45, y: map.top + map.height * 0.35 }
  }, attempt)

// Da un paso hacia responder la pregunta en pantalla: una alternativa, una línea de metro o un toque en el mapa.
export async function answerSomehow(page, attempt = 0) {
  const choice = (await page.$('.opt:not([disabled])')) || (await page.$('.linebtn'))
  if (choice) {
    await choice.click()
    const confirm = await page.$('#btnConfirm:not([disabled])')
    if (confirm) await confirm.click()
    return
  }
  const { x, y } = await tappablePoint(page, attempt)
  await page.mouse.click(x, y)
}

// Juega la ronda entera eligiendo siempre la primera alternativa. Solo sirve para juegos de alternativas.
// La pausa imita a una persona: el servidor descarta rondas respondidas más rápido de lo humanamente posible.
export async function playRoundOfChoices(page, { thinkMs = 320 } = {}) {
  for (;;) {
    await page.waitForSelector('.opt:not([disabled]), #again', { timeout: 15000 })
    if (await exists(page, '#again')) return
    await sleep(thinkMs)
    await page.click('.opt:not([disabled])')
    await page.waitForSelector('#btnNext')
    await clickNext(page)
  }
}

export function createChecker(suite) {
  const failures = []
  return {
    failures,
    check(condition, description) {
      console.log(`  ${condition ? '✓' : '✗'} ${description}`)
      if (!condition) failures.push(`${suite}: ${description}`)
    },
  }
}

// "Siguiente" queda al final del panel, que se desplaza suavemente al responder: un clic por coordenadas puede
// caer a mitad del desplazamiento. El clic del DOM no depende de dónde esté el botón en ese instante.
export const clickNext = page => page.$eval('#btnNext', button => button.click())
