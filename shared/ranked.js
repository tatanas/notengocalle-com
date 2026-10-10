// Lo comparten el navegador y el servidor: define qué rondas son comparables entre jugadores.

// Una ronda oficial ignora las preferencias del jugador y usa siempre estas reglas.
// Lo único que el jugador elige es cuántas preguntas: cada largo tiene su propio ranking.
export const OFFICIAL_RULES = {
  scope: 'core',
  cats: null,
  lines: null,
  strict: false,
  ownStreets: false,
  easy: false,
}

// Juegos con ranking.
export const RANKED_MODES = [
  'com-name',
  'com-all',
  'lm-loc',
  'lm-com',
  'st-name',
  'st-find',
  'rs-any-car',
  'rs-any-tp',
  'ch-find',
  'ch-city',
  'ch-cityreg',
  'ch-all',
  'pn-reg',
  'pn-photo',
  'cx',
]

// Categorías de ranking según el largo de la ronda: 10, 15, 20 o 30 preguntas, o "todas" las del juego.
export const ALL_QUESTIONS = 'all'
export const ROUND_CATEGORIES = ['10', '15', '20', '30', ALL_QUESTIONS]

export const categoryLabel = category => (category === ALL_QUESTIONS ? 'Todas' : category)

// Una ronda que recorre todo el conjunto del juego es "todas", sin importar cuántas sean.
export const categoryOf = (size, poolSize) => (size >= poolSize ? ALL_QUESTIONS : String(size))

// Los puntajes enviados antes de que existieran las categorías no la traen.
export const legacyCategory = ({ mode, total }) =>
  mode.endsWith('-all') || total > 30 ? ALL_QUESTIONS : String(total)

export const PERIODS = ['all', 'week']

// Más aciertos gana; a igual número de aciertos, gana el menor tiempo.
export const isBetterScore = (a, b) => a.correct > b.correct || (a.correct === b.correct && a.ms < b.ms)

const FASTEST_HUMAN_ANSWER_MS = 250
const SLOWEST_ROUND_MS = 6 * 60 * 60 * 1000
const MIN_QUESTIONS = 10
const MAX_QUESTIONS = 2000

export function scoreProblem({ mode, category, correct, total, ms }) {
  if (!RANKED_MODES.includes(mode)) return 'modo desconocido'
  if (!ROUND_CATEGORIES.includes(category)) return 'categoría desconocida'
  if (!Number.isInteger(total)) return 'largo de la ronda no válido'
  if (category === ALL_QUESTIONS ? total < MIN_QUESTIONS || total > MAX_QUESTIONS : total !== +category)
    return 'la ronda no tiene el largo de su categoría'
  if (!Number.isInteger(correct) || correct < 0 || correct > total) return 'aciertos fuera de rango'
  if (!Number.isInteger(ms) || ms < total * FASTEST_HUMAN_ANSWER_MS || ms > SLOWEST_ROUND_MS)
    return 'tiempo fuera de rango'
  return null
}
