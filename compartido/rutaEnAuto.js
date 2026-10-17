// Rutas en auto con Valhalla (servidor público de FOSSGIS, valhalla1.openstreetmap.de). De su respuesta se arman los pasos
// de los juegos de ruteo: las calles principales en orden, con su trazado, el punto donde de verdad se deja cada calle
// (fin: ahí se decide qué hacer) y alternativas incorrectas cercanas. Lo usan el navegador (rutas desde el punto fijo
// del jugador, en el momento) y tools/steproutes.js (las rutas entre lugares, precalculadas).
// Se cambió de OSRM a Valhalla porque el servidor público de OSRM evitaba la Costanera Norte por el centro.

const URL_DE_VALHALLA = 'https://valhalla1.openstreetmap.de/route'

export const consultaDeRuta = (desde, hasta) =>
  URL_DE_VALHALLA +
  '?json=' +
  encodeURIComponent(
    JSON.stringify({
      locations: [
        { lat: desde.lat, lon: desde.lon },
        { lat: hasta.lat, lon: hasta.lon },
      ],
      costing: 'auto',
      directions_options: { units: 'kilometers', language: 'es-ES' },
    }),
  )

const KM_POR_GRADO_LONGITUD = 92.9
const KM_POR_GRADO_LATITUD = 111.2
function distanciaALinea(punto, lineas) {
  let mejor = Infinity
  for (const linea of lineas)
    for (let i = 0; i < linea.length - 1; i++) {
      const ax = (linea[i][1] - punto[1]) * KM_POR_GRADO_LONGITUD
      const ay = (linea[i][0] - punto[0]) * KM_POR_GRADO_LATITUD
      const dx = (linea[i + 1][1] - punto[1]) * KM_POR_GRADO_LONGITUD - ax
      const dy = (linea[i + 1][0] - punto[0]) * KM_POR_GRADO_LATITUD - ay
      const largo = dx * dx + dy * dy
      const t = largo ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo)) : 0
      mejor = Math.min(mejor, Math.hypot(ax + t * dx, ay + t * dy))
    }
  return mejor
}

// El trazado de Valhalla viene como polilínea codificada con 6 decimales.
export function decodificarPolilinea(texto) {
  const puntos = []
  let indice = 0
  let lat = 0
  let lon = 0
  const siguienteValor = () => {
    let resultado = 0
    let desplazamiento = 0
    let byte
    do {
      byte = texto.charCodeAt(indice++) - 63
      resultado |= (byte & 0x1f) << desplazamiento
      desplazamiento += 5
    } while (byte >= 0x20)
    return resultado & 1 ? ~(resultado >> 1) : resultado >> 1
  }
  while (indice < texto.length) {
    lat += siguienteValor()
    lon += siguienteValor()
    puntos.push([+(lat / 1e6).toFixed(5), +(lon / 1e6).toFixed(5)])
  }
  return puntos
}

const NOMBRES_UNIFICADOS = [
  [/Vespucio/, 'Américo Vespucio'],
  [/Costanera Norte/, 'Costanera Norte'],
  [/Libertador Bernardo O.Higgins/, 'Alameda'],
  [/Presidente Kennedy/, 'Av. Kennedy'],
  [/Autopista Central|General Velásquez/, 'Autopista Central'],
  [/Vicuña Mackenna/, 'Av. Vicuña Mackenna'],
  [/^Ruta 68|Autopista del Pacífico/, 'Ruta 68'],
  [/^Ruta 78|Autopista del Sol/, 'Autopista del Sol'],
  [/^Ruta 5|Panamericana/, 'Ruta 5'],
  [/Gran Avenida/, 'Gran Avenida'],
  [/^Av.*Padre Hurtado/, 'Av. Padre Hurtado'],
  [/^Av.*Manquehue/, 'Av. Manquehue'],
  [/Costanera Sur|Escrivá de Balaguer/, 'Costanera Sur (Escrivá de Balaguer)'],
  [/Túnel San Cristóbal/, 'Túnel San Cristóbal'],
]

// El nombre de una calle como lo muestran los juegos de ruteo: "Av. X", sin el "Norte" o "Sur" de las avenidas y con
// un solo nombre para las que tienen varios.
export function nombreDeRuteo(nombreDeOsm) {
  const nombre = nombreDeOsm
    .replace(/^Avenida /, 'Av. ')
    .replace(/ Lateral$/, '')
    .replace(/^Caletera /, '')
    .trim()
  for (const [patron, unificado] of NOMBRES_UNIFICADOS) if (patron.test(nombre)) return unificado
  return nombre.replace(/ (Norte|Sur|Oriente|Poniente)$/, sufijo => (/^Av\./.test(nombre) ? '' : sufijo))
}

// Las calles del juego con el nombre que usan los juegos de ruteo ("Alameda (Av. Libertador…)" → "Alameda").
export const nombreDeRuteoDeCalle = nombreDelJuego =>
  nombreDeRuteo(nombreDelJuego.replace(/\s*\(.*\)/, '').replace(/^Av\. /, 'Avenida '))

const esCodigoDeRuta = nombre => /^[A-Z]?-?\d+$/.test(nombre)

// Valhalla da varios nombres a un mismo tramo (calle, número de ruta, autopista): se prefiere el de una calle del juego.
function nombreDelTramo(nombres, esCalleDelJuego) {
  const candidatos = nombres.map(nombreDeRuteo)
  return (
    candidatos.find(esCalleDelJuego) ??
    candidatos.find(nombre => !esCodigoDeRuta(nombre)) ??
    (candidatos[0] ? 'Ruta ' + candidatos[0] : '')
  )
}

// Un tramo cuenta como paso si es largo, o algo largo y de una calle del juego; lo demás se pega al paso anterior.
const METROS_DE_TRAMO_LARGO = 500
const METROS_DE_TRAMO_PRINCIPAL = 250

function tramosDeLaRuta(viaje, esCalleDelJuego) {
  const puntos = decodificarPolilinea(viaje.legs[0].shape)
  return viaje.legs[0].maneuvers
    .filter(maniobra => maniobra.end_shape_index > maniobra.begin_shape_index)
    .map(maniobra => ({
      nombre: nombreDelTramo(maniobra.street_names || [], esCalleDelJuego),
      metros: maniobra.length * 1000,
      g: puntos.slice(maniobra.begin_shape_index, maniobra.end_shape_index + 1),
    }))
}

// Los caminos sin nombre (o internos) del comienzo y del final no son parte de la ruta: se parte donde se sale a una
// calle y se llega donde se la deja, no en medio de un recinto.
function sinCaminosInternos(tramos, esNombreInterno) {
  const interno = tramo => !tramo.nombre || esNombreInterno(tramo.nombre)
  let inicio = 0
  let fin = tramos.length
  while (inicio < fin && interno(tramos[inicio])) inicio++
  while (fin > inicio && interno(tramos[fin - 1])) fin--
  return tramos.slice(inicio, fin)
}

// Lo chico se pega al paso anterior, pero la calle se deja donde terminó su último tramo propio (fin), y las calles chicas
// con nombre por las que se pasa hasta la siguiente quedan anotadas (conectores: "doblaste por Vital Apoquindo").
function pasosPrincipales(tramos, esCalleDelJuego) {
  const pasos = []
  for (const tramo of tramos) {
    const relevante =
      tramo.nombre &&
      (tramo.metros >= METROS_DE_TRAMO_LARGO ||
        (tramo.metros >= METROS_DE_TRAMO_PRINCIPAL &&
          (esCalleDelJuego(tramo.nombre) || /^Rotonda/.test(tramo.nombre))))
    const ultimo = pasos.at(-1)
    if (relevante && ultimo?.nombre === tramo.nombre) {
      ultimo.metros += tramo.metros
      ultimo.g = ultimo.g.concat(tramo.g)
      ultimo.fin = tramo.g.at(-1)
      ultimo.conectores = []
    } else if (relevante) pasos.push({ ...tramo, fin: tramo.g.at(-1), conectores: [] })
    else if (ultimo) {
      ultimo.metros += tramo.metros
      ultimo.g = ultimo.g.concat(tramo.g)
      const esConector =
        tramo.nombre && tramo.nombre !== ultimo.nombre && tramo.nombre !== ultimo.conectores.at(-1)
      if (esConector) ultimo.conectores.push(tramo.nombre)
    } else pasos.push({ ...tramo, nombre: '', fin: tramo.g.at(-1), conectores: [] })
  }
  // El trayecto inicial por calles chicas se pega a la primera calle relevante.
  if (pasos.length > 1 && !pasos[0].nombre) {
    const previo = pasos.shift()
    pasos[0].metros += previo.metros
    pasos[0].g = previo.g.concat(pasos[0].g)
  }
  return pasos.some(paso => !paso.nombre) ? [] : pasos
}

// El trazado se simplifica (Douglas-Peucker) para que los datos no pesen de más: se pierden solo desvíos menores a esto.
const KM_DE_TOLERANCIA_DEL_TRAZADO = 0.012

function distanciaAlSegmento(punto, a, b) {
  return distanciaALinea(punto, [[a, b]])
}

function simplificar(trazado) {
  if (trazado.length < 3) return trazado
  const conservar = new Array(trazado.length).fill(false)
  conservar[0] = conservar[trazado.length - 1] = true
  const pendientes = [[0, trazado.length - 1]]
  while (pendientes.length) {
    const [desde, hasta] = pendientes.pop()
    let masLejos = -1
    let distancia = 0
    for (let i = desde + 1; i < hasta; i++) {
      const d = distanciaAlSegmento(trazado[i], trazado[desde], trazado[hasta])
      if (d > distancia) {
        distancia = d
        masLejos = i
      }
    }
    if (distancia > KM_DE_TOLERANCIA_DEL_TRAZADO) {
      conservar[masLejos] = true
      pendientes.push([desde, masLejos], [masLejos, hasta])
    }
  }
  return trazado.filter((_, i) => conservar[i])
}

// Alternativas incorrectas: calles del juego que pasan cerca de donde empieza el paso.
const RADIO_DE_ALTERNATIVAS_KM = 1
const ALTERNATIVAS_POR_PASO = 6
function alternativasCercanas(inicio, nombresDeLaRuta, lineasPorNombre) {
  const cercanas = [...lineasPorNombre]
    .filter(([nombre]) => !nombresDeLaRuta.has(nombre))
    .map(([nombre, lineas]) => ({ nombre, km: distanciaALinea(inicio, lineas) }))
    .filter(({ km }) => km < RADIO_DE_ALTERNATIVAS_KM)
    .sort((a, b) => a.km - b.km)
  return cercanas.slice(0, ALTERNATIVAS_POR_PASO).map(({ nombre }) => nombre)
}

// "Manuel Rodríguez Norte" y "Av. Manuel Rodríguez" son la misma calle.
const nucleoDelNombre = nombre =>
  (nombre ?? '')
    .replace(/^(Av\.|Avenida) /, '')
    .replace(/ (Norte|Sur|Oriente|Poniente)$/, '')
    .toLowerCase()
const esLaMismaCalle = (a, b) => !!b && nucleoDelNombre(a) === nucleoDelNombre(b)

// Arma la ruta del juego a partir de la respuesta de Valhalla. lineasPorNombre: Map de nombre de ruteo → líneas de las
// calles del juego. { km, min, steps: [{ n, km, g, fin, c?, x }] } (c: conectores), o null si no alcanza pasosMinimos.
export function rutaDelJuego(viaje, { lineasPorNombre, pasosMinimos = 2, esNombreInterno = () => false }) {
  const esCalleDelJuego = nombre => lineasPorNombre.has(nombre)
  const tramos = sinCaminosInternos(tramosDeLaRuta(viaje, esCalleDelJuego), esNombreInterno)
  const pasos = pasosPrincipales(tramos, esCalleDelJuego)
  if (pasos.length < pasosMinimos) return null
  // Un "conector" que es un trozo de la calle siguiente (su lateral, por ejemplo) no es un desvío.
  pasos.forEach((paso, indice) => {
    paso.conectores = paso.conectores.filter(nombre => !esLaMismaCalle(nombre, pasos[indice + 1]?.nombre))
  })
  const nombresDeLaRuta = new Set(pasos.map(paso => paso.nombre))
  return {
    km: +viaje.summary.length.toFixed(1),
    min: Math.round(viaje.summary.time / 60),
    steps: pasos.map(paso => ({
      n: paso.nombre,
      km: +(paso.metros / 1000).toFixed(1),
      g: simplificar(paso.g),
      fin: paso.fin,
      ...(paso.conectores.length && { c: paso.conectores }),
      x: alternativasCercanas(paso.g[0], nombresDeLaRuta, lineasPorNombre),
    })),
  }
}
