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
  nivelStreetView: 'extremo',
  puntoEnCalle: false,
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
  'sv-ubicar',
]

// Cuánto vale cada pregunta: casi todos los juegos suman 1 por acierto; Street View suma de 0 a 5 según la distancia.
// En esos juegos "aciertos" son los puntos de la ronda y "total" el máximo posible (preguntas × puntos).
const PUNTOS_POR_PREGUNTA = { 'sv-ubicar': 5 }
export const puntosPorPregunta = modo => PUNTOS_POR_PREGUNTA[modo] ?? 1

// Categorías de ranking según el largo de la ronda: 20 preguntas o "todas" las del juego.
export const TODAS_LAS_PREGUNTAS = 'todas'
export const CATEGORIAS_DE_RONDA = ['20', TODAS_LAS_PREGUNTAS]

// Las rondas son de 20 preguntas, salvo en los juegos que se juegan más largo y por eso van de a menos.
const LARGO_NORMAL = { 'sv-ubicar': 10 }
export const largoNormalDe = modo => LARGO_NORMAL[modo] ?? 20
// Hay juegos con demasiadas preguntas para recorrerlas todas: su ronda siempre es del largo normal.
const SIN_RONDA_DE_TODAS = new Set(['sv-ubicar'])
export const tieneRondaDeTodas = modo => !SIN_RONDA_DE_TODAS.has(modo)
export const categoriasValidasDe = modo =>
  tieneRondaDeTodas(modo) ? [String(largoNormalDe(modo)), TODAS_LAS_PREGUNTAS] : [String(largoNormalDe(modo))]
// Lo que se puede pedir al ranking: cualquiera de los largos que algún juego use.
export const CATEGORIAS_DE_CONSULTA = [
  ...new Set([...Object.values(LARGO_NORMAL).map(String), ...CATEGORIAS_DE_RONDA]),
]

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
  if (!categoriasValidasDe(modo).includes(categoria)) return 'categoría desconocida'
  const porPregunta = puntosPorPregunta(modo)
  if (!Number.isInteger(total) || total % porPregunta) return 'largo de la ronda no válido'
  const preguntas = total / porPregunta
  if (
    categoria === TODAS_LAS_PREGUNTAS
      ? preguntas < PREGUNTAS_MINIMAS || preguntas > PREGUNTAS_MAXIMAS
      : preguntas !== +categoria
  )
    return 'la ronda no tiene el largo de su categoría'
  if (!Number.isInteger(aciertos) || aciertos < 0 || aciertos > total) return 'aciertos fuera de rango'
  if (!Number.isInteger(ms) || ms < preguntas * MS_RESPUESTA_HUMANA_MAS_RAPIDA || ms > MS_RONDA_MAS_LENTA)
    return 'tiempo fuera de rango'
  return null
}
