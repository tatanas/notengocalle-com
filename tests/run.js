// Pruebas de navegador sobre el build de producción.
//   node tests/run.js                 todas
//   node tests/run.js smoke accounts  solo las nombradas
//   node tests/run.js --changed       solo lo que corresponde a los archivos modificados (ver selection.js)
//   node tests/run.js --no-build      reutiliza el dist/ existente
//   node tests/run.js --dev           sirve el código sin empaquetar (errores con archivo y línea reales)
import { execSync } from 'node:child_process'
import { accounts } from './suites/accounts.js'
import {
  countdown,
  easyHard,
  leaveConfirm,
  menuLayout,
  mobileFit,
  officialRounds,
  ownStreets,
  photos,
  rankingCategories,
  restartRound,
  timer,
} from './suites/rounds.js'
import { selectSuites } from './selection.js'
import { smoke } from './suites/smoke.js'
import { SHOTS, createChecker, launchBrowser, startServer } from './support.js'

// Con --changed, la prueba de humo juega solo los juegos que cambiaron (null = todos).
let smokePrefixes = null

const SUITES = {
  smoke: (browser, checker) => smoke(browser, checker, { only: smokePrefixes }),
  'smoke-mobile': (browser, checker) => smoke(browser, checker, { mobile: true, only: smokePrefixes }),
  timer,
  'own-streets': ownStreets,
  'official-rounds': officialRounds,
  'leave-confirm': leaveConfirm,
  'menu-layout': menuLayout,
  countdown,
  'mobile-fit': mobileFit,
  'easy-hard': easyHard,
  'restart-round': restartRound,
  'ranking-categories': rankingCategories,
  photos,
  accounts,
}

const args = process.argv.slice(2)
const names = args.filter(arg => !arg.startsWith('--'))

// Archivos modificados sin confirmar o, si no hay, los del último commit.
function changedFiles() {
  const lines = command => execSync(command, { encoding: 'utf8' }).split('\n').filter(Boolean)
  const uncommitted = [
    ...lines('git diff --name-only HEAD'),
    ...lines('git ls-files --others --exclude-standard'),
  ]
  return uncommitted.length ? uncommitted : lines('git diff --name-only HEAD~1 HEAD')
}

function suitesToRun() {
  if (names.length) return names
  if (!args.includes('--changed')) return Object.keys(SUITES)
  const files = changedFiles()
  const choice = selectSuites(files)
  if (choice.everything) {
    console.log(`Cambios amplios (${files.length} archivos): se corre todo.`)
    return Object.keys(SUITES)
  }
  smokePrefixes = choice.smokePrefixes
  const chosen = new Set(choice.suites)
  if (smokePrefixes === null || smokePrefixes.length) chosen.add('smoke')
  if (smokePrefixes === null && files.some(file => /^src\/(map|ui)\/|\.css$/.test(file)))
    chosen.add('smoke-mobile')
  console.log(`Según ${files.length} archivo(s) modificado(s): ${[...chosen].join(', ') || 'ninguna suite'}`)
  if (smokePrefixes?.length) console.log(`  (la prueba de humo juega solo: ${smokePrefixes.join(', ')})`)
  return [...chosen]
}

const selected = suitesToRun()
if (!selected.length) {
  console.log('Nada que probar en el navegador.')
  process.exit(0)
}
const unknown = selected.filter(name => !SUITES[name])
if (unknown.length)
  throw new Error(`Suites desconocidas: ${unknown.join(', ')}. Existen: ${Object.keys(SUITES).join(', ')}`)

const serveOptions = { dev: args.includes('--dev') }
let stopServer = await startServer({ ...serveOptions, rebuild: !args.includes('--no-build') })
let browser = await launchBrowser()
const failures = []
// Si una suite se interrumpe, queda una captura de cada página abierta para ver qué había en pantalla.
async function savePagesAsEvidence(browser, suite) {
  try {
    const pages = await browser.pages()
    for (const [index, page] of pages.entries())
      await page.screenshot({ path: `${SHOTS}fail_${suite}_${index}.png` }).catch(() => {})
  } catch {
    console.log('  (Chrome ya no responde: no hay captura)')
  }
}

const startedAt = Date.now()
// Estas suites guardan puntajes: cada una parte con la base de datos vacía para que no se mezclen sus rankings.
const NEEDS_EMPTY_DATABASE = new Set(['ranking-categories', 'accounts'])

for (const name of selected) {
  if (NEEDS_EMPTY_DATABASE.has(name) && name !== selected.find(other => NEEDS_EMPTY_DATABASE.has(other))) {
    await stopServer()
    stopServer = await startServer({ ...serveOptions, rebuild: false })
  }
  if (!browser.connected) {
    console.log('\nChrome se cerró solo: se abre de nuevo.')
    browser = await launchBrowser()
  }
  console.log(`\n${name}`)
  const suiteStart = Date.now()
  const checker = createChecker(name)
  try {
    await SUITES[name](browser, checker)
  } catch (error) {
    checker.check(false, `se interrumpió: ${error.message}`)
    await savePagesAsEvidence(browser, name)
  }
  failures.push(...checker.failures)
  console.log(`  (${Math.round((Date.now() - suiteStart) / 1000)} s)`)
}
await browser.close()
await stopServer()

console.log(`\nTotal: ${Math.round((Date.now() - startedAt) / 1000)} s`)
console.log(failures.length ? `\n${failures.length} fallas:\n- ${failures.join('\n- ')}` : '\nTodo bien.')
process.exit(failures.length ? 1 : 0)
