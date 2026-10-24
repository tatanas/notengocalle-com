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
  regiones: null,
}

// Juegos con ranking.
export const MODOS_OFICIALES = [
  'com-name',
  'com-all',
  'cc-name',
  'cc-find',
  'cc-hard',
  'lm-loc',
  'lm-com',
  'mt-find',
  'mt-name',
  'st-name',
  'st-punto',
  'st-find',
  'rs-any-car',
  'rs-any-tp',
  'rs-sv-car',
  'rs-sv-ruta',
  'dd-ruta',
  'dd-calles',
  'dd-comunas',
  'ch-find',
  'ch-city',
  'ch-cityreg',
  'ch-all',
  'pn-reg',
  'pn-photo',
  'sv-ubicar',
]

// Cuánto vale cada pregunta: casi todos los juegos suman 1 por acierto; Street View suma de 0 a 5 según la distancia y el
// ruteo en auto, de 0 a 100 según cuánto más lenta que la óptima fue la ruta.
// En esos juegos "aciertos" son los puntos de la ronda y "total" el máximo posible (preguntas × puntos).
const PUNTOS_POR_PREGUNTA = { 'sv-ubicar': 5, 'rs-sv-ruta': 100, 'dd-ruta': 100 }
export const puntosPorPregunta = modo => PUNTOS_POR_PREGUNTA[modo] ?? 1

// ----- desafíos diarios: los mismos para todos, desde la medianoche de Chile continental. Su categoría de ranking es la fecha
// (AAAA-MM-DD), y cada jugador los juega una sola vez.
export const MODOS_DIARIOS = ['dd-ruta', 'dd-calles', 'dd-comunas']
export const esModoDiario = modo => MODOS_DIARIOS.includes(modo)
export const esCategoriaDiaria = categoria => /^\d{4}-\d{2}-\d{2}$/.test(categoria)

const FORMATO_DE_FECHA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const FORMATO_DE_HORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Santiago',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const MS_DE_UN_DIA = 24 * 60 * 60 * 1000

// AAAA-MM-DD armado por partes: no depende de cómo cada navegador ordena y separa la fecha de un idioma.
export function fechaDeHoyEnChile(ahora = new Date()) {
  const partes = Object.fromEntries(
    FORMATO_DE_FECHA.formatToParts(ahora).map(({ type, value }) => [type, value]),
  )
  return `${partes.year}-${partes.month}-${partes.day}`
}
// El día anterior a una fecha AAAA-MM-DD (sin depender de los cambios de hora).
const diaAntesDe = fecha =>
  new Date(Date.parse(`${fecha}T12:00:00Z`) - MS_DE_UN_DIA).toISOString().slice(0, 10)
export const fechaDeAyerEnChile = (ahora = new Date()) => diaAntesDe(fechaDeHoyEnChile(ahora))

// Cuánto falta para que cambie el día en Chile.
export function segundosHastaLaMedianocheDeChile(ahora = new Date()) {
  const [horas, minutos, segundos] = FORMATO_DE_HORA.format(ahora).split(':').map(Number)
  return 24 * 3600 - (horas * 3600 + minutos * 60 + segundos)
}

// "24 oct" para una fecha AAAA-MM-DD.
const etiquetaDeUnDia = fecha => {
  if (fecha === fechaDeHoyEnChile()) return 'Hoy'
  if (fecha === fechaDeAyerEnChile()) return 'Ayer'
  const [, mes, dia] = fecha.split('-').map(Number)
  return `${dia} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][mes - 1]}`
}

// Categorías de ranking según el largo de la ronda: 10 o 20 preguntas, o "todas" las del juego.
export const TODAS_LAS_PREGUNTAS = 'todas'
export const LARGO_DE_TODAS = 999
export const LARGOS_ELEGIBLES = [10, 20]
export const CATEGORIAS_DE_RONDA = [...LARGOS_ELEGIBLES.map(String), TODAS_LAS_PREGUNTAS]

// Las rondas son de 20 preguntas (o 10 si se prefiere), salvo en los juegos que se juegan más largo y por eso van de a menos y
// siempre del mismo largo: Street View y las rutas (de más largas no vale la pena, y no tiene sentido un "todas").
// El ruteo en auto es una sola ruta por ronda: es larga, y lo que se compara es qué tan bien se la recorre.
const LARGO_FIJO = {
  'sv-ubicar': 10,
  'rs-any-car': 10,
  'rs-any-tp': 10,
  'rs-sv-car': 10,
  'rs-sv-ruta': 1,
  'dd-ruta': 1,
  'dd-calles': 10,
  'dd-comunas': 10,
}
export const largoNormalDe = modo => LARGO_FIJO[modo] ?? 20
// Los juegos que recorren siempre todo su conjunto (las regiones de Chile: son 16) no tienen largos: solo "todas".
const SIEMPRE_TODAS = new Set(['ch-find', 'ch-all'])
// Los de comunas y Street View se separan por un ajuste (alcance, nivel) y no tienen largos elegibles.
export const tieneLargoElegible = modo =>
  !(modo in LARGO_FIJO) && !SIEMPRE_TODAS.has(modo) && !ajusteDeCategoria(modo)
// Los de largo fijo no tienen ronda de "todas".
export const tieneRondaDeTodas = modo => !(modo in LARGO_FIJO)

// Cuántas preguntas pide una ronda de este juego según lo que eligió el jugador (10, 20 o LARGO_DE_TODAS).
export function largoDeRondaDe(modo, elegido) {
  if (!tieneLargoElegible(modo)) return largoNormalDe(modo)
  if (elegido >= LARGO_DE_TODAS) return tieneRondaDeTodas(modo) ? LARGO_DE_TODAS : largoNormalDe(modo)
  return LARGOS_ELEGIBLES.includes(elegido) ? elegido : largoNormalDe(modo)
}

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
  1: 'Una ruta',
  [TODAS_LAS_PREGUNTAS]: 'Todas',
  facil: 'Fácil',
  medio: 'Medio',
  dificil: 'Difícil',
  extremo: 'Extremo',
  core: 'Gran Santiago',
  peri: 'Con periferia',
  all: 'Toda la RM',
}
export const etiquetaDeCategoria = categoria =>
  esCategoriaDiaria(categoria) ? etiquetaDeUnDia(categoria) : (ETIQUETA_DE_CATEGORIA[categoria] ?? categoria)

export const categoriasValidasDe = modo => {
  if (esModoDiario(modo)) return [fechaDeHoyEnChile(), fechaDeAyerEnChile()]
  const delAjuste = ajusteDeCategoria(modo)
  if (delAjuste) return delAjuste.valores
  if (SIEMPRE_TODAS.has(modo)) return [TODAS_LAS_PREGUNTAS]
  if (!tieneLargoElegible(modo)) return [String(largoNormalDe(modo))]
  return tieneRondaDeTodas(modo) ? CATEGORIAS_DE_RONDA : LARGOS_ELEGIBLES.map(String)
}
// Lo que se puede pedir al ranking: cualquiera de los largos y ajustes que algún juego use.
export const CATEGORIAS_DE_CONSULTA = [
  ...new Set([
    ...Object.values(LARGO_FIJO).map(String),
    ...CATEGORIAS_DE_RONDA,
    ...NIVELES_DE_STREET_VIEW,
    ...ALCANCES_DE_COMUNAS,
  ]),
]

// El resumen de líderes tiene una pestaña por largo de ronda. Street View y las comunas de la RM no tienen largos: "20 preguntas" incluye
// a Street View en su nivel más difícil (extremo) y "todas", a las comunas del Gran Santiago.
const AJUSTE_EN_EL_RESUMEN = { 20: 'extremo', [TODAS_LAS_PREGUNTAS]: 'core' }
export const categoriasDelResumen = pestana => [pestana, AJUSTE_EN_EL_RESUMEN[pestana] ?? pestana]
// La categoría con que un juego figura en una pestaña del resumen, o null si ese juego no tiene esa pestaña (no hay "completa
// el mapa" de 10 ni de 20).
export function categoriaEnElResumen(modo, pestana) {
  const delAjuste = ajusteDeCategoria(modo)
  if (delAjuste) {
    const categoria = AJUSTE_EN_EL_RESUMEN[pestana]
    return delAjuste.valores.includes(categoria) ? categoria : null
  }
  return categoriasValidasDe(modo).includes(pestana) ? pestana : null
}

// Cuántas preguntas tiene una ronda de esta categoría (null = las que sean: "todas").
export function preguntasDeCategoria(modo, categoria) {
  if (esModoDiario(modo)) return largoNormalDe(modo)
  if (modo === 'sv-ubicar') return largoNormalDe(modo)
  if (ajusteDeCategoria(modo)) return COMUNAS_POR_ALCANCE[categoria]
  return categoria === TODAS_LAS_PREGUNTAS ? null : +categoria
}

// Cómo se nombra la categoría al contar dónde quedó la ronda: "con 20 preguntas", "en el nivel Fácil"…
export function textoDeCategoria(modo, categoria) {
  if (esCategoriaDiaria(categoria))
    return `el desafío ${categoria === fechaDeHoyEnChile() ? 'de hoy' : categoria === fechaDeAyerEnChile() ? 'de ayer' : `del ${etiquetaDeUnDia(categoria)}`}`
  if (categoria === TODAS_LAS_PREGUNTAS) return 'todas las preguntas'
  if (categoria === '1') return 'una ruta'
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
