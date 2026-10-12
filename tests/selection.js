// Qué suites de navegador conviene correr según los archivos que cambiaron.
// La suite completa tarda más de 10 minutos: se reserva para cambios que tocan todo el juego.

const ROUND_SUITES = [
  'timer',
  'own-streets',
  'official-rounds',
  'leave-confirm',
  'menu-layout',
  'countdown',
  'mobile-fit',
  'easy-hard',
  'restart-round',
  'ranking-categories',
]
const ENGINE_SUITES = ['timer', 'countdown', 'restart-round', 'leave-confirm', 'easy-hard', 'official-rounds']
const RANKING_SUITES = ['accounts', 'ranking-categories', 'official-rounds']

// Prefijo de los ids de juego que juega cada archivo de src/quiz/modes/, para que la prueba de humo juegue solo esos.
const MODE_PREFIX_OF_FILE = {
  comunas: 'com-',
  landmarks: 'lm-',
  metro: 'mt-',
  streets: 'st-',
  routes: 'rs-',
  chile: 'ch-',
  parks: 'pn-',
  connections: 'cx',
}

// Cambios que afectan a todo: no vale la pena adivinar qué probar.
const EVERYTHING = [
  /^package(-lock)?\.json$/,
  /^vite\.config\./,
  /^index\.html$/,
  /^src\/main\.js$/,
  /^server\/schema\.sql$/,
  /^tests\/(run|support|selection)\.js$/,
]
const MANY_FILES = 30

// [patrón, suites, ¿la prueba de humo juega todos los juegos?]
const RULES = [
  [/^src\/quiz\/(engine|options|registry|steps)\.js$/, ENGINE_SUITES, true],
  [/^src\/map\//, ['mobile-fit', 'easy-hard'], true],
  [/^src\/ui\/(home|navigation)\.js$/, ['menu-layout'], false],
  [/^src\/ui\/myStreets\.js$/, ['own-streets'], false],
  [/^src\/ui\/(leaderboard|officialOutcome|account)\.js$/, RANKING_SUITES, false],
  [/^src\/account\//, RANKING_SUITES, false],
  [/^(shared|server|netlify)\//, RANKING_SUITES, false],
  [/^src\/ui\/photos\.js$/, ['photos'], false],
  [/^public\/data\//, ['official-rounds', 'photos'], true],
  [/^src\/(data|domain|core|ui)\//, [], true],
  [/^tests\/suites\/accounts\.js$/, ['accounts'], false],
  [/^tests\/suites\/rounds\.js$/, ROUND_SUITES, false],
  [/^tests\/suites\/smoke\.js$/, [], true],
]

const modePrefixOf = file => {
  const match = file.match(/^src\/quiz\/modes\/(\w+)\.js$/)
  return match ? (MODE_PREFIX_OF_FILE[match[1]] ?? null) : null
}

// Devuelve { everything, suites, smokePrefixes }: smokePrefixes null = todos los juegos; [] = no correr la prueba de humo.
export function selectSuites(files) {
  if (files.length > MANY_FILES || files.some(file => EVERYTHING.some(pattern => pattern.test(file))))
    return { everything: true, suites: [], smokePrefixes: null }

  const suites = new Set()
  const prefixes = new Set()
  let smokeAllModes = false
  let smokeNeeded = false
  for (const file of files) {
    const prefix = modePrefixOf(file)
    if (prefix) {
      prefixes.add(prefix)
      smokeNeeded = true
      continue
    }
    if (/^src\/quiz\/modes\//.test(file)) {
      smokeNeeded = smokeAllModes = true
      continue
    }
    for (const [pattern, ruleSuites, smokeAll] of RULES) {
      if (!pattern.test(file)) continue
      ruleSuites.forEach(suite => suites.add(suite))
      if (smokeAll) smokeNeeded = smokeAllModes = true
      break
    }
  }
  const smokePrefixes = !smokeNeeded ? [] : smokeAllModes ? null : [...prefixes]
  return { everything: false, suites: [...suites], smokePrefixes }
}
