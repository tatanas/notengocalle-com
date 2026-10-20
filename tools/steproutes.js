// Rutas en auto "paso a paso" entre lugares emblemáticos (los pares de routes.json), calculadas con Valhalla y convertidas
// en pasos con compartido/rutaEnAuto.js (lo mismo que usa el navegador para el punto fijo del jugador): la ruta, su traza con
// los nombres de cada calle y las calles que salen de cada cruce, y los nombres de esas calles.
// Uso (desde tools/):  node steproutes.js   → steproutes.json
// Las respuestas se guardan en valhallacache.json (ignorado por git); sin caché hace 1 consulta por segundo.
const fs = require('fs')

const CACHE = 'valhallacache.json'
const PASOS_MINIMOS = 3
const MS_ENTRE_CONSULTAS = 1100
const dormir = ms => new Promise(resolver => setTimeout(resolver, ms))

const lugares = JSON.parse(fs.readFileSync('landmarks.json'))
const calles = JSON.parse(fs.readFileSync('streets.json'))
const pares = JSON.parse(fs.readFileSync('routes.json'))
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE)) : {}

// Solo lo que se usa de cada respuesta, para que el caché no crezca de más.
const viajeResumido = viaje => ({
  summary: { length: viaje.summary.length, time: viaje.summary.time },
  legs: [{ shape: viaje.legs[0].shape }],
})
const trazaResumida = traza => ({
  edges: traza.edges.map(arista => ({
    names: arista.names,
    length: arista.length,
    road_class: arista.road_class,
    begin_shape_index: arista.begin_shape_index,
    end_shape_index: arista.end_shape_index,
    end_heading: arista.end_heading,
    sign: arista.sign,
    end_node: arista.end_node && { intersecting_edges: arista.end_node.intersecting_edges },
  })),
})
const crucesResumidos = respuestas =>
  respuestas.map(respuesta => ({
    edges: (respuesta.edges ?? []).map(arista => ({
      percent_along: arista.percent_along,
      heading: arista.heading,
      edge_info: { names: arista.edge_info?.names },
      edge: {
        classification: { use: arista.edge?.classification?.use, link: arista.edge?.classification?.link },
      },
    })),
  }))

const ENCABEZADOS = {
  'User-Agent': 'NoTengoCalle/1.0 (juego educativo de Santiago)',
  'Content-Type': 'application/json',
}

// null si no hay camino entre los dos puntos; reintenta si el servidor falla.
async function pedir(url, cuerpo, resumir) {
  for (let intento = 0; intento < 4; intento++) {
    try {
      const respuesta = await fetch(
        url,
        cuerpo
          ? { method: 'POST', headers: ENCABEZADOS, body: JSON.stringify(cuerpo) }
          : { headers: ENCABEZADOS },
      )
      if (respuesta.status === 400) return null
      if (respuesta.ok) return resumir(await respuesta.json())
    } catch {
      // se reintenta
    }
    await dormir(3000 * (intento + 1))
  }
  return null
}

async function conCache(llave, obtener) {
  if (llave in cache) return cache[llave]
  cache[llave] = await obtener()
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  await dormir(MS_ENTRE_CONSULTAS)
  return cache[llave]
}

;(async () => {
  const {
    URL_DE_CRUCES,
    URL_DE_TRAZA,
    completarAlternativas,
    consultaDeRuta,
    crucesPorNombrar,
    cuerpoDeLaTraza,
    cuerpoDeLosCruces,
    nombreDeRuteoDeCalle,
    rutaDelJuego,
  } = await import('../compartido/rutaEnAuto.js')
  const lineasPorNombre = new Map()
  for (const calle of calles.filter(calle => calle.kind === 'calle' || calle.kind === 'autopista')) {
    const nombre = nombreDeRuteoDeCalle(calle.name)
    lineasPorNombre.set(nombre, [...(lineasPorNombre.get(nombre) || []), ...calle.lines])
  }
  const nombresDeAutopistas = new Set(
    calles.filter(calle => calle.kind === 'autopista').map(calle => nombreDeRuteoDeCalle(calle.name)),
  )
  const esAutopista = nombre => nombresDeAutopistas.has(nombre)

  const porId = Object.fromEntries(lugares.map(lugar => [lugar.id, lugar]))
  const rutas = []
  let omitidas = 0
  for (const par of pares) {
    const desde = porId[par.from]
    const hasta = porId[par.to]
    if (!desde || !hasta) {
      omitidas++
      continue
    }
    const url = consultaDeRuta(desde, hasta)
    const viaje = await conCache(url, () => pedir(url, null, viajeResumido))
    const traza =
      viaje &&
      (await conCache('traza:' + url, () => pedir(URL_DE_TRAZA, cuerpoDeLaTraza(viaje), trazaResumida)))
    const ruta = traza && rutaDelJuego(viaje, traza, { lineasPorNombre, pasosMinimos: PASOS_MINIMOS })
    if (!ruta) {
      omitidas++
      continue
    }
    const cruces = crucesPorNombrar(ruta)
    const llaveDeLosCruces = 'cruces:' + cruces.puntos.map(punto => punto.join(',')).join(';')
    const respuestas = cruces.puntos.length
      ? ((await conCache(llaveDeLosCruces, () =>
          pedir(URL_DE_CRUCES, cuerpoDeLosCruces(cruces.puntos), crucesResumidos),
        )) ?? [])
      : []
    completarAlternativas(ruta, cruces, respuestas, { lineasPorNombre, nombresDeAutopistas, esAutopista })
    rutas.push({ k: desde.id + '>' + hasta.id, from: desde.id, to: hasta.id, ...ruta })
  }
  fs.writeFileSync('steproutes.json', JSON.stringify(rutas))
  console.log('rutas', rutas.length, 'omitidas', omitidas, 'bytes', fs.statSync('steproutes.json').size)
})()
