// Rutas en auto "paso a paso" entre lugares emblemáticos (los pares de routes.json), calculadas con Valhalla y convertidas
// en pasos con compartido/rutaEnAuto.js (lo mismo que usa el navegador para el punto fijo del jugador).
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

// Lo que no es calle pública (accesos de servicio, estacionamientos): las rutas no parten ni terminan ahí.
const CLASES_INTERNAS = /^(service|footway|path|track|pedestrian|steps|cycleway)$/

// Solo lo que se usa de la respuesta, para que el caché no crezca de más.
const viajeResumido = viaje => ({
  summary: { length: viaje.summary.length, time: viaje.summary.time },
  legs: [
    {
      shape: viaje.legs[0].shape,
      maneuvers: viaje.legs[0].maneuvers.map(maniobra => ({
        street_names: maniobra.street_names,
        length: maniobra.length,
        begin_shape_index: maniobra.begin_shape_index,
        end_shape_index: maniobra.end_shape_index,
      })),
    },
  ],
})

async function pedirViaje(url) {
  for (let intento = 0; intento < 4; intento++) {
    try {
      const respuesta = await fetch(url, { headers: { 'User-Agent': 'NoTengoCalle/1.0 (juego educativo de Santiago)' } })
      if (respuesta.status === 400) return null // no hay camino
      if (respuesta.ok) return viajeResumido((await respuesta.json()).trip)
    } catch {
      // se reintenta
    }
    await dormir(3000 * (intento + 1))
  }
  return null
}

;(async () => {
  const { consultaDeRuta, nombreDeRuteo, nombreDeRuteoDeCalle, rutaDelJuego } = await import(
    '../compartido/rutaEnAuto.js'
  )
  const lineasPorNombre = new Map()
  for (const calle of calles.filter(calle => calle.kind === 'calle' || calle.kind === 'autopista')) {
    const nombre = nombreDeRuteoDeCalle(calle.name)
    lineasPorNombre.set(nombre, [...(lineasPorNombre.get(nombre) || []), ...calle.lines])
  }
  const clasesPorNombre = {}
  for (const llave of Object.keys(require('./nameidx.json'))) {
    const [nombre, clase] = llave.split(' | ')
    const deRuteo = nombreDeRuteo(nombre)
    ;(clasesPorNombre[deRuteo] ||= new Set()).add(clase)
  }
  const esNombreInterno = nombre =>
    !!clasesPorNombre[nombre] && [...clasesPorNombre[nombre]].every(clase => CLASES_INTERNAS.test(clase))

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
    if (!(url in cache)) {
      cache[url] = await pedirViaje(url)
      fs.writeFileSync(CACHE, JSON.stringify(cache))
      await dormir(MS_ENTRE_CONSULTAS)
    }
    const ruta = cache[url] && rutaDelJuego(cache[url], { lineasPorNombre, pasosMinimos: PASOS_MINIMOS, esNombreInterno })
    if (!ruta) {
      omitidas++
      continue
    }
    rutas.push({ k: desde.id + '>' + hasta.id, from: desde.id, to: hasta.id, ...ruta })
  }
  fs.writeFileSync('steproutes.json', JSON.stringify(rutas))
  console.log('rutas', rutas.length, 'omitidas', omitidas, 'bytes', fs.statSync('steproutes.json').size)
})()
