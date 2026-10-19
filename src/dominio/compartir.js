// El texto que se comparte al terminar una ronda (las de práctica no se comparten: sus reglas cambian según cada uno).

const SITIO = 'notengocalle.com'

// Qué se acertó en cada juego, para que el texto se lea natural: "Le achunté a 30 de 34 comunas de Santiago".
const LOGRO_POR_JUEGO = {
  'com-name': (ok, max) => `Le achunté a ${ok} de ${max} comunas de Santiago`,
  'com-all': (ok, max) => `Le achunté a ${ok} de ${max} comunas de Santiago`,
  'st-name': (ok, max) => `Reconocí ${ok} de ${max} calles de Santiago`,
  'st-punto': (ok, max) => `Reconocí ${ok} de ${max} calles de Santiago (en difícil)`,
  'st-find': (ok, max) => `Encontré ${ok} de ${max} calles de Santiago en el mapa`,
  'lm-loc': (ok, max) => `Ubiqué ${ok} de ${max} lugares emblemáticos de Santiago`,
  'lm-com': (ok, max) => `Le achunté a la comuna de ${ok} de ${max} lugares emblemáticos de Santiago`,
  'mt-find': (ok, max) => `Encontré ${ok} de ${max} estaciones del metro de Santiago`,
  'mt-name': (ok, max) => `Reconocí ${ok} de ${max} estaciones del metro de Santiago`,
  'ch-find': (ok, max) => `Ubiqué ${ok} de ${max} regiones de Chile`,
  'ch-all': (ok, max) => `Ubiqué ${ok} de ${max} regiones de Chile`,
  'ch-city': (ok, max) => `Ubiqué ${ok} de ${max} ciudades de Chile`,
  'ch-cityreg': (ok, max) => `Le achunté a la región de ${ok} de ${max} ciudades de Chile`,
  'pn-reg': (ok, max) => `Le achunté a la región de ${ok} de ${max} parques nacionales`,
  'pn-photo': (ok, max) => `Reconocí ${ok} de ${max} parques nacionales por su foto`,
  'sv-ubicar': (ok, max, nivel) =>
    `Saqué ${ok} de ${max} puntos ubicándome en Santiago con Street View${nivel ? ` (nivel ${nivel})` : ''}`,
}

const plural = (cantidad, singular, varios) => `${cantidad} ${cantidad === 1 ? singular : varios}`

export function tiempoEnPalabras(ms) {
  const segundos = Math.round(ms / 1000)
  if (segundos < 60) return plural(segundos, 'segundo', 'segundos')
  const minutos = plural(Math.floor(segundos / 60), 'minuto', 'minutos')
  const resto = segundos % 60
  return resto ? `${minutos} y ${plural(resto, 'segundo', 'segundos')}` : minutos
}

// ronda: { idDeModo, nombreDelJuego, aciertos, maximo, ms, nivel?, nuevoRecord, puesto?, jugadores? }
export function textoParaCompartir(ronda) {
  const { idDeModo, nombreDelJuego, aciertos, maximo, ms, nivel, nuevoRecord, puesto, jugadores } = ronda
  const logro =
    LOGRO_POR_JUEGO[idDeModo]?.(aciertos, maximo, nivel) ??
    `Le achunté a ${aciertos} de ${maximo} en "${nombreDelJuego}"`
  const record = nuevoRecord ? `¡Saqué nuevo récord en "${nombreDelJuego}"! ` : ''
  const ranking = puesto ? `, y voy ${puesto}.º de ${jugadores} en el ranking 🏆` : ''
  return `${record}${logro} en ${tiempoEnPalabras(ms)}${ranking}. ¿Teni calle? ${SITIO}`
}
