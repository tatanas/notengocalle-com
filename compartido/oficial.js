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
  puntoDeRuteo: null,
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
  'st-punto',
  'st-find',
  'rs-any-car',
  'rs-any-tp',
  'ch-find',
  'ch-city',
  'ch-cityreg',
  'ch-all',
  'pn-reg',
  'pn-photo',
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
const LARGO_NORMAL = { 'sv-ubicar': 10, 'rs-sv-car': 5 }
export const largoNormalDe = modo => LARGO_NORMAL[modo] ?? 20
// Hay juegos con demasiadas preguntas para recorrerlas todas: su ronda siempre es del largo normal.
const SIN_RONDA_DE_TODAS = new Set(['sv-ubicar', 'rs-any-car', 'rs-any-tp', 'rs-sv-car'])
export const tieneRondaDeTodas = modo => !SIN_RONDA_DE_TODAS.has(modo)

// Algunos juegos no se separan por largo sino por un ajuste del jugador, y cada valor tiene su propio ranking:
// Street View por nivel de dificultad (siempre 10 preguntas) y los de comunas por alcance (cuántas comunas hay).
export const NIVELES_DE_STREET_VIEW = ['facil', 'medio', 'dificil', 'extremo']
export const ALCANCES_DE_COMUNAS = ['core', 'peri', 'all']
// Cuántas comunas tiene cada alcance (public/data/data.js; lo comprueba una prueba unitaria).
export const COMUNAS_POR_ALCANCE = { core: 34, peri: 42, all: 52 }
const AJUSTE_DE_CATEGORIA = {
  'sv-ubicar': { ajuste: 'nivelStreetView', valores: NIVELES_DE_STREET_VIEW },
  'com-name': { ajuste: 'scope', valores: ALCANCES_DE_COMUNAS },
  'com-all': { ajuste: 'scope', valores: ALCANCES_DE_COMUNAS },
}
// { ajuste, valores } si la categoría del ranking de este juego es un ajuste del jugador; si no, null.
export const ajusteDeCategoria = modo => AJUSTE_DE_CATEGORIA[modo] ?? null

const ETIQUETA_DE_CATEGORIA = {
  [TODAS_LAS_PREGUNTAS]: 'Todas',
  facil: 'Fácil',
  medio: 'Medio',
  dificil: 'Difícil',
  extremo: 'Extremo',
  core: 'Gran Santiago',
  peri: 'Con periferia',
  all: 'Toda la RM',
}
export const etiquetaDeCategoria = categoria => ETIQUETA_DE_CATEGORIA[categoria] ?? categoria

export const categoriasValidasDe = modo => {
  const delAjuste = ajusteDeCategoria(modo)
  if (delAjuste) return delAjuste.valores
  return tieneRondaDeTodas(modo)
    ? [String(largoNormalDe(modo)), TODAS_LAS_PREGUNTAS]
    : [String(largoNormalDe(modo))]
}
// Lo que se puede pedir al ranking: cualquiera de los largos y ajustes que algún juego use.
export const CATEGORIAS_DE_CONSULTA = [
  ...new Set([
    ...Object.values(LARGO_NORMAL).map(String),
    ...CATEGORIAS_DE_RONDA,
    ...NIVELES_DE_STREET_VIEW,
    ...ALCANCES_DE_COMUNAS,
  ]),
]

// Cuántas preguntas tiene una ronda de esta categoría (null = las que sean: "todas").
export function preguntasDeCategoria(modo, categoria) {
  if (modo === 'sv-ubicar') return largoNormalDe(modo)
  if (ajusteDeCategoria(modo)) return COMUNAS_POR_ALCANCE[categoria]
  return categoria === TODAS_LAS_PREGUNTAS ? null : +categoria
}

// Cómo se nombra la categoría al contar dónde quedó la ronda: "con 20 preguntas", "en el nivel Fácil"…
export function textoDeCategoria(modo, categoria) {
  if (categoria === TODAS_LAS_PREGUNTAS) return 'todas las preguntas'
  if (ajusteDeCategoria(modo))
    return modo === 'sv-ubicar'
      ? `el nivel ${etiquetaDeCategoria(categoria)}`
      : etiquetaDeCategoria(categoria)
  return `${categoria} preguntas`
}

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
  const preguntasEsperadas = preguntasDeCategoria(modo, categoria)
  if (
    categoria === TODAS_LAS_PREGUNTAS
      ? preguntas < PREGUNTAS_MINIMAS || preguntas > PREGUNTAS_MAXIMAS
      : preguntas !== preguntasEsperadas
  )
    return 'la ronda no tiene el largo de su categoría'
  if (!Number.isInteger(aciertos) || aciertos < 0 || aciertos > total) return 'aciertos fuera de rango'
  if (!Number.isInteger(ms) || ms < preguntas * MS_RESPUESTA_HUMANA_MAS_RAPIDA || ms > MS_RONDA_MAS_LENTA)
    return 'tiempo fuera de rango'
  return null
}
