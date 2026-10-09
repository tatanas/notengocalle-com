// Prolongaciones de las calles que siguen fuera de la zona descargada (rutas a Valparaíso, San Antonio,
// Melipilla, Los Andes, Rancagua…). El juego las dibuja en línea segmentada.
// Uso (desde tools/):  node extensions.js   → extensions.json   y luego   npm run build
// Descarga las rutas numeradas de toda la Región Metropolitana una sola vez (ruta_raw.json, ignorado por git).
const fs = require('fs')
const turf = require('@turf/turf')
const { distPL } = require('./relations.js')

const MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]
const QUERY = `[out:json][timeout:120];
way["highway"~"^(motorway|trunk|primary)$"]["ref"~"^(5|57|68|76|78)$"](-34.30,-71.80,-32.80,-69.70);
out geom tags;`

// Un punto de la ruta ya está dibujado como línea continua si queda a menos de esto de ella.
const COVERED_KM = 0.4
const SIMPLIFY_DEGREES = 0.0004
const MELIPILLA_END_LON = -71.25
// Las autopistas se dibujan con una pista por sentido; de cada par se conserva una sola.
const SAME_ROAD_KM = 0.12

// nombre del juego → qué tramos de OSM prolongan la calle
const ROADS = {
  'Camino a Melipilla': way => way.tags.ref === '76' || (way.tags.ref === '78' && lonRange(way)[1] < -70.84 && lonRange(way)[0] > MELIPILLA_END_LON),
  'Autopista del Sol (Ruta 78)': way => way.tags.ref === '78',
  'Ruta 68 (a Valparaíso)': way => way.tags.ref === '68',
  'Ruta 5 Norte (Panamericana)': way => way.tags.name === 'Ruta 5 Norte',
  'Autopista Central': way => way.tags.name === 'Ruta 5 Sur',
  'Autopista Los Libertadores (Ruta 57)': way => way.tags.ref === '57',
}

function withoutParallelDuplicates(runs) {
  const kept = []
  for (const run of runs.sort((a, b) => b.length - a.length)) {
    const alreadyDrawn = run.filter(p => kept.length && distPL(p, kept) < SAME_ROAD_KM).length / run.length
    if (alreadyDrawn < 0.5) kept.push(run)
  }
  return kept
}

function lonRange(way) {
  const lons = way.geometry.map(p => p.lon)
  return [Math.min(...lons), Math.max(...lons)]
}

async function download() {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(QUERY),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'notengocalle-dev/1.0 (ssilvamc@uc.cl)' },
      })
      if (res.ok) return res.json()
    } catch {
      // se prueba el siguiente espejo
    }
  }
  throw new Error('Overpass no responde')
}

// De una línea, los tramos que quedan fuera de lo ya dibujado (con un punto de empalme a cada lado).
function uncoveredRuns(points, solidLines) {
  const far = points.map(p => distPL(p, solidLines) > COVERED_KM)
  const runs = []
  let start = null
  far.forEach((isFar, i) => {
    if (isFar && start === null) start = Math.max(0, i - 1)
    if (!isFar && start !== null) {
      runs.push(points.slice(start, i + 1))
      start = null
    }
  })
  if (start !== null) runs.push(points.slice(start))
  return runs.filter(run => run.length >= 2)
}

;(async () => {
  if (!fs.existsSync('ruta_raw.json')) fs.writeFileSync('ruta_raw.json', JSON.stringify(await download()))
  const ways = JSON.parse(fs.readFileSync('ruta_raw.json')).elements.filter(e => e.geometry)
  const streets = JSON.parse(fs.readFileSync('streets.json'))
  const out = {}
  for (const [name, belongs] of Object.entries(ROADS)) {
    const street = streets.find(s => s.name === name)
    if (!street) throw new Error('la calle no existe en streets.json: ' + name)
    const runs = withoutParallelDuplicates(
      ways.filter(belongs).flatMap(way => uncoveredRuns(way.geometry.map(p => [p.lat, p.lon]), street.lines)),
    )
    const simplified = runs.map(run => {
      const line = turf.simplify(turf.lineString(run.map(([lat, lon]) => [lon, lat])), { tolerance: SIMPLIFY_DEGREES })
      return line.geometry.coordinates.map(([lon, lat]) => [+lat.toFixed(5), +lon.toFixed(5)])
    })
    out[name] = simplified
    const km = simplified.reduce((sum, run) => sum + turf.length(turf.lineString(run.map(([lat, lon]) => [lon, lat]))), 0)
    console.log(name.padEnd(40), simplified.length, 'tramos', km.toFixed(1), 'km')
  }
  fs.writeFileSync('extensions.json', JSON.stringify(out))
  console.log('extensions.json', fs.statSync('extensions.json').size, 'bytes')
})()
