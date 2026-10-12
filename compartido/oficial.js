// Lo comparten el navegador y el servidor: define qué rondas son comparables entre jugadores.

// Una ronda oficial ignora las preferencias del jugador y usa siempre estas reglas.
// Lo único que el jugador elige es cuántas preguntas: cada largo tiene su propio ranking.
export const REGLAS_OFICIALES = {
  scope: 'core',
  cats: null,
  lines: null,
  strict: false,
  ownStreets: false,
  easy: false,
}

// Juegos con ranking.
export const MODOS_OFICIALES = [
  'com-name',
  'com-all',
  'lm-loc',
  'lm-com',
  'mt-find',
  'mt-name',
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

// Categorías de ranking según el largo de la ronda: 20 preguntas o "todas" las del juego.
export const TODAS_LAS_PREGUNTAS = 'todas'
export const CATEGORIAS_DE_RONDA = ['20', TODAS_LAS_PREGUNTAS]

export const etiquetaDeCategoria = categoria => (categoria === TODAS_LAS_PREGUNTAS ? 'Todas' : categoria)

// Una ronda que recorre todo el conjunto del juego es "todas", sin importar cuántas sean.
export const categoriaDe = (tamano, tamanoDelConjunto) =>
  tamano >= tamanoDelConjunto ? TODAS_LAS_PREGUNTAS : String(tamano)

// Los puntajes enviados antes de que existieran las categorías no la traen.
export const categoriaHeredada = ({ modo, total }) =>
  modo.endsWith('-all') || total > 20 ? TODAS_LAS_PREGUNTAS : String(total)

export const PERIODOS = ['todo', 'semana']

// Más aciertos gana; a igual número de aciertos, gana el menor tiempo.
export const esMejorPuntaje = (a, b) => a.aciertos > b.aciertos || (a.aciertos === b.aciertos && a.ms < b.ms)

const MS_RESPUESTA_HUMANA_MAS_RAPIDA = 250
const MS_RONDA_MAS_LENTA = 6 * 60 * 60 * 1000
const PREGUNTAS_MINIMAS = 10
const PREGUNTAS_MAXIMAS = 2000

export function problemaDelPuntaje({ modo, categoria, aciertos, total, ms }) {
  if (!MODOS_OFICIALES.includes(modo)) return 'modo desconocido'
  if (!CATEGORIAS_DE_RONDA.includes(categoria)) return 'categoría desconocida'
  if (!Number.isInteger(total)) return 'largo de la ronda no válido'
  if (
    categoria === TODAS_LAS_PREGUNTAS
      ? total < PREGUNTAS_MINIMAS || total > PREGUNTAS_MAXIMAS
      : total !== +categoria
  )
    return 'la ronda no tiene el largo de su categoría'
  if (!Number.isInteger(aciertos) || aciertos < 0 || aciertos > total) return 'aciertos fuera de rango'
  if (!Number.isInteger(ms) || ms < total * MS_RESPUESTA_HUMANA_MAS_RAPIDA || ms > MS_RONDA_MAS_LENTA)
    return 'tiempo fuera de rango'
  return null
}
