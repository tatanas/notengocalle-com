// Lo comparten el navegador y el servidor: define qué rondas son comparables entre jugadores.

// Una ronda oficial ignora las preferencias del jugador y usa siempre estas reglas.
export const OFFICIAL_RULES = {
  scope: 'core',
  len: 15,
  cats: null,
  lines: null,
  strict: false,
  ownStreets: false,
  stCom: true,
  stMetro: false,
}

// Preguntas de la ronda oficial de cada modo. Los de "completa el mapa" recorren todo su conjunto.
export const OFFICIAL_ROUNDS = {
  'com-name': 15,
  'com-all': 34,
  'lm-loc': 15,
  'lm-com': 15,
  'st-name': 15,
  'st-find': 15,
  'rs-any-car': 15,
  'rs-any-tp': 15,
  'ch-find': 15,
  'ch-city': 15,
  'ch-cityreg': 15,
  'ch-all': 16,
  'pn-reg': 15,
  'pn-photo': 15,
  cx: 15,
}

export const PERIODS = ['all', 'week']

// Más aciertos gana; a igual número de aciertos, gana el menor tiempo.
export const isBetterScore = (a, b) => a.correct > b.correct || (a.correct === b.correct && a.ms < b.ms)

const FASTEST_HUMAN_ANSWER_MS = 250
const SLOWEST_ROUND_MS = 6 * 60 * 60 * 1000

export function scoreProblem({ mode, correct, total, ms }) {
  const expected = OFFICIAL_ROUNDS[mode]
  if (!expected) return 'modo desconocido'
  if (total !== expected) return 'la ronda no tiene el largo oficial'
  if (!Number.isInteger(correct) || correct < 0 || correct > total) return 'aciertos fuera de rango'
  if (!Number.isInteger(ms) || ms < total * FASTEST_HUMAN_ANSWER_MS || ms > SLOWEST_ROUND_MS)
    return 'tiempo fuera de rango'
  return null
}
