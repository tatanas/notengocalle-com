// Rutas en auto con Valhalla (servidor público de FOSSGIS, valhalla1.openstreetmap.de). Se arman con tres consultas:
//   1. la ruta (/route): el camino, su largo y su duración;
//   2. la traza de ese camino (/trace_attributes): cada tramo de calle con su nombre de verdad, su clase y las calles que salen
//      de cada cruce (sin nombre);
//   3. los cruces (/locate): los nombres de esas calles, en los cruces donde se decide algo.
// De ahí salen los pasos de los juegos de ruteo: las calles principales en orden, con su trazado, el punto donde de verdad se
// deja cada calle (fin) y las calles que de verdad salen del cruce donde empieza (ent), que son las alternativas posibles.
// Lo usan el navegador (rutas desde el punto fijo del jugador, en el momento) y tools/steproutes.js (las precalculadas).
// Se cambió de OSRM a Valhalla porque el servidor público de OSRM evitaba la Costanera Norte por el centro. Los pasos se arman con
// la traza y no con las maniobras de la ruta porque las maniobras juntan tramos que comparten un nombre de recorrido
// ("Villa Norte - Av. Central - Cerro Alto" es la ruta G-99, no una calle) y esconden decisiones.

const URL_DE_VALHALLA = 'https://valhalla1.openstreetmap.de/'
export const URL_DE_TRAZA = URL_DE_VALHALLA + 'trace_attributes'
export const URL_DE_CRUCES = URL_DE_VALHALLA + 'locate'

export const consultaDeRuta = (desde, hasta) =>
  URL_DE_VALHALLA +
  'route?json=' +
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

// Las consultas de la traza y de los cruces van por POST: la ruta larga no cabe en una dirección.
export const cuerpoDeLaTraza = viaje => ({
  encoded_polyline: viaje.legs[0].shape,
  costing: 'auto',
  shape_match: 'edge_walk',
  filters: {
    action: 'include',
    attributes: [
      'edge.names',
      'edge.length',
      'edge.road_class',
      'edge.use',
      'edge.begin_shape_index',
      'edge.end_shape_index',
      'edge.end_heading',
      'edge.sign.exit_number',
      'edge.sign.exit_branch',
      'edge.sign.exit_toward',
      'node.intersecting_edge.begin_heading',
      'node.intersecting_edge.road_class',
      'node.intersecting_edge.use',
      'node.intersecting_edge.driveability',
    ],
  },
})

export const cuerpoDeLosCruces = puntos => ({
  locations: puntos.map(([lat, lon]) => ({ lat, lon })),
  costing: 'auto',
  verbose: true,
})

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
// Los recorridos y rutas turísticas se nombran con guiones ("Villa Norte - Av. Central - Cerro Alto"): no son una calle.
const esNombreDeRecorrido = nombre => / - /.test(nombre)

// Valhalla da varios nombres a una misma calle (la calle, el número de ruta, el recorrido, la autopista): se prefiere el de una
// calle del juego y, si no, el primero que sea de una calle. Sin nombre propio queda el número de ruta ("Ruta G-99").
export function nombreDeLaCalle(nombres, esCalleDelJuego = () => false) {
  const candidatos = nombres.map(nombreDeRuteo)
  const codigo = candidatos.find(esCodigoDeRuta)
  return (
    candidatos.find(esCalleDelJuego) ??
    candidatos.find(nombre => !esCodigoDeRuta(nombre) && !esNombreDeRecorrido(nombre)) ??
    (codigo ? 'Ruta ' + codigo : (candidatos[0] ?? ''))
  )
}

// "Manuel Rodríguez Norte", "Av. Manuel Rodríguez" y "Camino Manuel Rodríguez" son la misma calle.
const nucleoDelNombre = nombre =>
  (nombre ?? '')
    .replace(/^(Av\.|Avenida|Camino|Calle) /, '')
    .replace(/ (Norte|Sur|Oriente|Poniente)$/, '')
    .toLowerCase()
export const esLaMismaCalle = (a, b) => !!b && nucleoDelNombre(a) === nucleoDelNombre(b)

// De más a menos importante; una calle de la clase `k` no es más importante que otra de clase menor.
const RANGO_DE_CLASE = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  unclassified: 5,
  residential: 6,
}
const rangoDe = clase => RANGO_DE_CLASE[clase] ?? 7
// Hasta qué rango una calle cuenta como importante (terciaria).
export const RANGO_DE_CALLE_IMPORTANTE = 4
const RANGO_DE_CALLE_QUE_SE_OFRECE = 6
const RANGO_DE_AUTOPISTA = 1

const diferenciaDeRumbo = (a, b) => ((b - a + 540) % 360) - 180
// Una bifurcación es una calle tan importante como la actual que sale casi derecho: ahí hay que elegir, aunque el nombre siga.
const GRADOS_DE_BIFURCACION = 60

// Un tramo cuenta como paso si es largo, o algo largo y de una calle del juego, o si es el que sigue de una bifurcación; lo
// demás se pega al paso anterior.
const METROS_DE_TRAMO_LARGO = 500
const METROS_DE_TRAMO_PRINCIPAL = 250
const METROS_DE_TRAMO_DE_BIFURCACION = 30
// Un tramo corto con nombre también cuenta si al entrar había otra calle importante donde elegir (doblar por José Alcalde Délano
// hacia El Rodeo o hacia Gran Vía): es una decisión de orientación, no un detalle.
const METROS_DE_TRAMO_CON_DECISION = 150
const hayDondeElegir = tramo => tramo.entrada.some(calle => calle.k <= RANGO_DE_CALLE_IMPORTANTE)

// Las calles que salen de un cruce y a las que se puede entrar (no las que solo llegan, ni veredas ni accesos de servicio).
const esCalleQueSale = calle =>
  calle.driveability !== 'backward' &&
  ['road', 'ramp'].includes(calle.use) &&
  rangoDe(calle.road_class) <= RANGO_DE_CALLE_QUE_SE_OFRECE

// Cada arista de la traza es un trocito de calle entre dos cruces.
function aristasDeLaTraza(traza, puntos, esCalleDelJuego) {
  return traza.edges.map(arista => ({
    nombre: arista.names?.length ? nombreDeLaCalle(arista.names, esCalleDelJuego) : '',
    metros: arista.length * 1000,
    g: puntos.slice(arista.begin_shape_index, arista.end_shape_index + 1),
    clase: arista.road_class,
    rumboFinal: arista.end_heading,
    cruces: (arista.end_node?.intersecting_edges ?? [])
      .filter(esCalleQueSale)
      .map(calle => ({ h: Math.round(calle.begin_heading), k: rangoDe(calle.road_class) })),
    salida: arista.sign?.exit_number?.length
      ? {
          r: arista.sign.exit_number[0],
          a: arista.sign.exit_branch?.[0] ?? arista.sign.exit_toward?.[0],
        }
      : null,
  }))
}

function bifurcacionesEn(previa) {
  const rango = rangoDe(previa.clase)
  return previa.cruces.filter(
    calle =>
      calle.k <= RANGO_DE_CALLE_IMPORTANTE &&
      calle.k <= rango &&
      Math.abs(diferenciaDeRumbo(previa.rumboFinal, calle.h)) <= GRADOS_DE_BIFURCACION,
  )
}

// Las aristas seguidas con el mismo nombre forman un tramo, salvo donde hay una bifurcación (ahí empieza otro).
function tramosDeLasAristas(aristas) {
  const tramos = []
  aristas.forEach((arista, indice) => {
    const previa = aristas[indice - 1]
    const ultimo = tramos.at(-1)
    const siguePorLaMismaCalle =
      ultimo && (arista.nombre ? esLaMismaCalle(ultimo.nombre, arista.nombre) : !ultimo.nombre)
    // En una autopista las salidas ya son su propia pregunta (src/dominio/salidas.js): no se parte en cada bifurcación.
    const bifurcaciones =
      siguePorLaMismaCalle && arista.nombre && rangoDe(previa.clase) > RANGO_DE_AUTOPISTA
        ? bifurcacionesEn(previa)
        : []
    if (siguePorLaMismaCalle && !bifurcaciones.length) {
      ultimo.aristas.push(arista)
      ultimo.metros += arista.metros
      ultimo.g = ultimo.g.concat(arista.g.slice(1))
      return
    }
    tramos.push({
      nombre: arista.nombre,
      metros: arista.metros,
      g: arista.g,
      aristas: [arista],
      entrada: (previa?.cruces ?? []).map(calle =>
        bifurcaciones.includes(calle) ? { ...calle, f: 1 } : calle,
      ),
      bifurcacion: bifurcaciones.length > 0,
    })
  })
  return tramos
}

// Los caminos sin nombre (o internos) del comienzo y del final no son parte de la ruta: se parte donde se sale a una
// calle y se llega donde se la deja, no en medio de un recinto.
function sinCaminosInternos(tramos) {
  const interno = tramo => !tramo.nombre || tramo.aristas.every(arista => arista.clase === 'service_other')
  let inicio = 0
  let fin = tramos.length
  while (inicio < fin && interno(tramos[inicio])) inicio++
  while (fin > inicio && interno(tramos[fin - 1])) fin--
  return tramos.slice(inicio, fin)
}

// El cruce donde se decide entrar a un paso: si la calle anterior se deja por una rampa o un acceso sin nombre, es donde se la
// deja (el comienzo de ese acceso); si se pasa por calles chicas con nombre, es donde se llega a la nueva (se pregunta ahí).
function nuevoPaso(tramo, anterior) {
  const cruceDeSalida = anterior && !anterior.conectores.length ? anterior.cruceDeSalida : null
  return {
    nombre: tramo.nombre,
    metros: tramo.metros,
    g: tramo.g,
    fin: tramo.g.at(-1),
    conectores: [],
    entrada: cruceDeSalida ? cruceDeSalida.entrada : tramo.entrada,
    cruce: cruceDeSalida ? cruceDeSalida.punto : tramo.g[0],
    bifurcacion: tramo.bifurcacion,
  }
}

// Lo chico se pega al paso anterior, pero la calle se deja donde terminó su último tramo propio (fin), y las calles chicas
// con nombre por las que se pasa hasta la siguiente quedan anotadas (conectores: "doblaste por Vital Apoquindo"). La salida
// por la que se deja una autopista (su rampa, sin nombre) queda anotada en el paso de la autopista.
function pasosPrincipales(tramos, esCalleDelJuego) {
  const pasos = []
  for (const tramo of tramos) {
    const relevante =
      tramo.nombre &&
      (tramo.metros >= METROS_DE_TRAMO_LARGO ||
        (tramo.metros >= METROS_DE_TRAMO_PRINCIPAL &&
          (esCalleDelJuego(tramo.nombre) || /^Rotonda/.test(tramo.nombre))) ||
        (tramo.bifurcacion && tramo.metros >= METROS_DE_TRAMO_DE_BIFURCACION) ||
        (tramo.metros >= METROS_DE_TRAMO_CON_DECISION && hayDondeElegir(tramo)))
    const ultimo = pasos.at(-1)
    if (relevante && !tramo.bifurcacion && ultimo && esLaMismaCalle(ultimo.nombre, tramo.nombre)) {
      ultimo.metros += tramo.metros
      ultimo.g = ultimo.g.concat(tramo.g)
      ultimo.fin = tramo.g.at(-1)
      ultimo.conectores = []
      ultimo.cruceDeSalida = null
    } else if (relevante) pasos.push(nuevoPaso(tramo, ultimo))
    else if (ultimo) {
      ultimo.metros += tramo.metros
      ultimo.g = ultimo.g.concat(tramo.g)
      ultimo.cruceDeSalida ??= { entrada: tramo.entrada, punto: tramo.g[0] }
      const esConector =
        tramo.nombre &&
        !esCodigoDeRuta(tramo.nombre.replace(/^Ruta /, '')) &&
        !esLaMismaCalle(tramo.nombre, ultimo.nombre) &&
        tramo.nombre !== ultimo.conectores.at(-1)
      if (esConector) ultimo.conectores.push(tramo.nombre)
      const salida = tramo.aristas.find(arista => arista.salida)?.salida
      if (salida) ultimo.salida = salida
    } else pasos.push({ ...nuevoPaso(tramo), nombre: '' })
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

// Arma la ruta del juego a partir de la respuesta de /route y de /trace_attributes. lineasPorNombre: Map de nombre de ruteo →
// líneas de las calles del juego. { km, min, steps: [{ n, km, g, fin, c?, salida?, x, ent, bif? }] } o null si no alcanza pasosMinimos.
//   c: calles chicas por las que se pasa hasta la siguiente; salida: la salida que se toma al dejar una autopista;
//   x: el cruce donde se decide entrar al paso; ent: las calles que salen de ese cruce, [{ h: rumbo, k: clase (0 autopista … 6 residencial), n: nombre,
//   f: 1 si es una bifurcación }]; sin nombre hasta que completarAlternativas los pone.
export function rutaDelJuego(viaje, traza, { lineasPorNombre, pasosMinimos = 2 }) {
  const esCalleDelJuego = nombre => lineasPorNombre.has(nombre)
  const puntos = decodificarPolilinea(viaje.legs[0].shape)
  const aristas = aristasDeLaTraza(traza, puntos, esCalleDelJuego)
  const tramos = sinCaminosInternos(tramosDeLasAristas(aristas))
  const pasos = pasosPrincipales(tramos, esCalleDelJuego)
  if (pasos.length < pasosMinimos) return null
  // Un "conector" que es un trozo de la calle siguiente (su lateral, por ejemplo) no es un desvío.
  pasos.forEach((paso, indice) => {
    paso.conectores = paso.conectores.filter(nombre => !esLaMismaCalle(nombre, pasos[indice + 1]?.nombre))
  })
  return {
    km: +viaje.summary.length.toFixed(1),
    min: Math.round(viaje.summary.time / 60),
    steps: pasos.map(paso => ({
      n: paso.nombre,
      km: +(paso.metros / 1000).toFixed(1),
      g: simplificar(paso.g),
      fin: paso.fin,
      ...(paso.conectores.length && { c: paso.conectores }),
      ...(paso.salida && { salida: paso.salida }),
      x: paso.cruce,
      ent: paso.entrada,
      ...(paso.bifurcacion && { bif: 1 }),
    })),
  }
}

// Los puntos donde hay que preguntarle a /locate cómo se llaman las calles que salen del cruce: el cruce de cada paso que
// tiene alguna. `indices` dice a qué paso corresponde cada punto.
export function crucesPorNombrar(ruta) {
  const indices = []
  ruta.steps.forEach((paso, indice) => {
    if (paso.ent.length) indices.push(indice)
  })
  return { indices, puntos: indices.map(indice => ruta.steps[indice].x) }
}

const GRADOS_PARA_EMPAREJAR_CALLES = 25
const KM_PARA_NOMBRAR_UNA_RAMPA = 0.35

// El nombre de la calle de una arista de /locate. Una rampa sin nombre que sale de una calle común (no de una autopista) lleva a
// la autopista más cercana.
function nombreDeLaCalleDelCruce(arista, punto, { esCalleDelJuego, autopistas, ramaDeAutopista }) {
  const nombres = arista.edge_info?.names ?? []
  if (nombres.length) return nombreDeLaCalle(nombres, esCalleDelJuego)
  const esRampa = arista.edge?.classification?.use === 'ramp' || arista.edge?.classification?.link
  if (!esRampa || ramaDeAutopista) return null
  const cercana = [...autopistas]
    .map(([nombre, lineas]) => ({ nombre, km: distanciaALinea(punto, lineas) }))
    .filter(({ km }) => km <= KM_PARA_NOMBRAR_UNA_RAMPA)
    .sort((a, b) => a.km - b.km)[0]
  return cercana?.nombre ?? null
}

// Pone el nombre a las calles que salen de cada cruce, con la respuesta de /locate (una por punto, en el mismo orden que
// cruces.puntos). Las que no se pueden nombrar se descartan: no se puede ofrecer algo que no se sabe cómo se llama. Una
// bifurcación que no lleva a otra calle con nombre no es una decisión: el paso se junta con el anterior.
export function completarAlternativas(
  ruta,
  cruces,
  respuestas,
  { lineasPorNombre, nombresDeAutopistas, esAutopista },
) {
  const esCalleDelJuego = nombre => lineasPorNombre.has(nombre)
  const autopistas = [...lineasPorNombre].filter(([nombre]) => nombresDeAutopistas.has(nombre))
  cruces.indices.forEach((indice, orden) => {
    const paso = ruta.steps[indice]
    const salientes = (respuestas[orden]?.edges ?? []).filter(arista => (arista.percent_along ?? 0) < 0.5)
    const ramaDeAutopista = indice > 0 && esAutopista(ruta.steps[indice - 1].n)
    for (const calle of paso.ent) {
      const parecida = salientes
        .map(arista => ({ arista, grados: Math.abs(diferenciaDeRumbo(arista.heading, calle.h)) }))
        .filter(({ grados }) => grados <= GRADOS_PARA_EMPAREJAR_CALLES)
        .sort((a, b) => a.grados - b.grados)[0]
      const nombre =
        parecida &&
        nombreDeLaCalleDelCruce(parecida.arista, paso.x, { esCalleDelJuego, autopistas, ramaDeAutopista })
      if (nombre) calle.n = nombre
    }
    paso.ent = paso.ent.filter(calle => calle.n)
  })
  const pasos = []
  for (const paso of ruta.steps) {
    const previo = pasos.at(-1)
    const hayQueElegir = paso.ent.some(calle => calle.f && !esLaMismaCalle(calle.n, paso.n))
    if (paso.bif && previo && !hayQueElegir) {
      previo.km = +(previo.km + paso.km).toFixed(1)
      previo.g = previo.g.concat(paso.g)
      previo.fin = paso.fin
      if (paso.c) previo.c = paso.c
      else delete previo.c
      if (paso.salida) previo.salida = paso.salida
      else delete previo.salida
    } else pasos.push(paso)
    delete paso.bif
  }
  ruta.steps = pasos
  return ruta
}
