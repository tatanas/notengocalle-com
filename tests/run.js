// Pruebas de navegador sobre el build de producción.
//   node tests/run.js                 todas
//   node tests/run.js smoke accounts  solo las nombradas
//   node tests/run.js --no-build      reutiliza el dist/ existente
//   node tests/run.js --dev           sirve el código sin empaquetar (errores con archivo y línea reales)
import { accounts } from './suites/accounts.js'
import { leaveConfirm, mobileFit, officialRounds, ownStreets, photos, timer } from './suites/rounds.js'
import { smoke } from './suites/smoke.js'
import { createChecker, launchBrowser, startServer } from './support.js'

const SUITES = {
  smoke: (browser, checker) => smoke(browser, checker),
  'smoke-mobile': (browser, checker) => smoke(browser, checker, { mobile: true }),
  'smoke-retired': (browser, checker) => smoke(browser, checker, { retired: true }),
  timer,
  'own-streets': ownStreets,
  'official-rounds': officialRounds,
  'leave-confirm': leaveConfirm,
  'mobile-fit': mobileFit,
  photos,
  accounts,
}

const args = process.argv.slice(2)
const names = args.filter(arg => !arg.startsWith('--'))
const selected = names.length ? names : Object.keys(SUITES)
const unknown = selected.filter(name => !SUITES[name])
if (unknown.length)
  throw new Error(`Suites desconocidas: ${unknown.join(', ')}. Existen: ${Object.keys(SUITES).join(', ')}`)

const stopServer = await startServer({ rebuild: !args.includes('--no-build'), dev: args.includes('--dev') })
const browser = await launchBrowser()
const failures = []
for (const name of selected) {
  console.log(`\n${name}`)
  const checker = createChecker(name)
  try {
    await SUITES[name](browser, checker)
  } catch (error) {
    checker.check(false, `se interrumpió: ${error.message}`)
  }
  failures.push(...checker.failures)
}
await browser.close()
await stopServer()

console.log(failures.length ? `\n${failures.length} fallas:\n- ${failures.join('\n- ')}` : '\nTodo bien.')
process.exit(failures.length ? 1 : 0)
