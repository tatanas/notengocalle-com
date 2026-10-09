import { distanceKm, pointInFeature } from '../core/geo.js'
import { settings, store } from '../core/store.js'

// window.DATA viene de public/data/data.js, que genera el pipeline de tools/ (ver ARQUITECTURA.md).
export const DATA = window.DATA

// ----- comunas (features GeoJSON; properties: name, group core|peri|rural, nb vecinas, lab [lon, lat], km2)
export const comunas = DATA.comunas.features
export const comunaByName = Object.fromEntries(comunas.map(feature => [feature.properties.name, feature]))
export const labelPoint = feature => [feature.properties.lab[1], feature.properties.lab[0]]
export const isUrban = feature => feature.properties.group !== 'rural'
export const inScope = feature =>
  settings.scope === 'all' ||
  feature.properties.group === 'core' ||
  (settings.scope === 'peri' && feature.properties.group === 'peri')
export const scopeComunas = () => comunas.filter(inScope)
export const coreComunas = () => scopeComunas().filter(isUrban)

// ----- metro
export const METRO_LINES = DATA.metro.lines
export const LINE_IDS = ['L1', 'L2', 'L3', 'L4', 'L4A', 'L5', 'L6']
export const stations = DATA.metro.stations
export const stationByName = Object.fromEntries(stations.map(station => [station.name, station]))

// ----- cerros, barrios, Chile
export const cerros = DATA.cerros || []
export const ZONES = DATA.zones || []
export const CHILE = DATA.chile || { regions: { features: [] }, cities: [] }
export const REGIONS = CHILE.regions.features
export const regionByName = Object.fromEntries(REGIONS.map(feature => [feature.properties.name, feature]))
export const PARKS = CHILE.parks || []

export const PHOTOS = DATA.photos || {}

// ----- landmarks: a los de landmarks.json se suman barrios con perímetro, cerros destacados y estaciones
const LANDMARK_NAME_OF_ZONE = {
  'Barrio República (barrio universitario)': 'Barrio República',
  'Barrio Franklin (persas)': 'Barrio Franklin',
  'El Golf / Sanhattan': 'Barrio El Golf',
  'Estadio Nacional (recinto)': 'Estadio Nacional (selección chilena; hace de local la U. de Chile)',
  'Barrio Cívico': 'Barrio Cívico / Paseo Bulnes',
}
const FEATURED_PEAKS = [
  'Cerro El Plomo',
  'Cerro Altar',
  'Cerro La Parva',
  'Cerro Colorado (Farellones)',
  'Cerro Provincia',
  'Cerro San Ramón',
  'Alto del Naranjo',
  'Cerro Alto de las Vizcachas',
  'Morro Las Papas',
  'Cerro Pochoco',
  'Cerro El Morado',
  'Cerro Manquehuito',
  'Cerro El Carbón',
  'Cerro Alvarado',
  'Cerro Apoquindo',
  'Cerro San Luis',
  'Cerro Lo Aguirre',
]
const PEAK_TOLERANCE_KM = { Cordillera: 3, Precordillera: 1.8 }
export const peakToleranceKm = peak => PEAK_TOLERANCE_KM[peak.tipo] || 1

ZONES.forEach((zone, index) => {
  const name = LANDMARK_NAME_OF_ZONE[zone.name] || zone.name
  let landmark = DATA.landmarks.find(candidate => candidate.name === name)
  if (!landmark) {
    landmark = {
      id: 'z' + index,
      name: zone.name,
      cat: 'Barrios',
      desc: zone.desc,
      lat: zone.c[0],
      lon: zone.c[1],
      comuna: zone.comunas[0],
      alt: zone.comunas.slice(1),
    }
    DATA.landmarks.push(landmark)
  }
  landmark.zone = zone
  if (landmark.cat === 'Barrios') landmark.desc = zone.desc
})

for (const peak of cerros.filter(peak => FEATURED_PEAKS.includes(peak.name)))
  DATA.landmarks.push({
    id: 'k' + peak.id,
    name: peak.name,
    cat: 'Cerros y parques',
    desc: (peak.ele ? peak.ele.toLocaleString('es-CL') + ' m. ' : '') + peak.desc,
    lat: peak.lat,
    lon: peak.lon,
    comuna: peak.comuna,
    alt: peak.alt || [],
    pk: 'c:' + peak.name,
    tol: peakToleranceKm(peak),
  })

const lineNames = station => station.lines.map(id => id.replace('L', 'Línea ')).join(' y la ')

for (const station of stations)
  DATA.landmarks.push({
    id: 'm:' + station.name,
    name: 'Metro ' + station.name,
    cat: 'Metro',
    metro: station,
    lines: station.lines,
    desc: `Estación de la ${lineNames(station)}${station.lines.length > 1 ? ' (combinación).' : '.'}`,
    lat: station.lat,
    lon: station.lon,
    comuna: station.comuna,
    alt: station.alt || [],
    tol: 0.8,
    obvious: station.name.toLowerCase().includes(station.comuna.toLowerCase()),
  })

export const landmarkById = Object.fromEntries(DATA.landmarks.map(landmark => [landmark.id, landmark]))
export const CATEGORIES = [...new Set(DATA.landmarks.map(landmark => landmark.cat))]

// ----- calles: a las de streets.json se suman las que el usuario guardó en este navegador ("Mis calles")
export const myStreets = store.get('myStreets', [])

export function comunasOfLines(lines) {
  const hits = {}
  for (const line of lines)
    for (let i = 0; i < line.length; i += 2) {
      const comuna = comunas.find(feature => pointInFeature(line[i][0], line[i][1], feature))
      if (comuna) hits[comuna.properties.name] = (hits[comuna.properties.name] || 0) + 1
    }
  return Object.entries(hits)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
}

myStreets.forEach((saved, index) => {
  if (DATA.streets.some(street => street.name === saved.name)) return
  DATA.streets.push({
    id: 'u' + index,
    name: saved.name,
    kind: 'calle',
    custom: true,
    hint: 'Calle agregada por ti.',
    km: saved.km,
    comunas: saved.comunas,
    cl: Object.fromEntries(saved.comunas.map(comuna => [comuna, 1000])),
    lines: saved.lines,
    nb: [],
  })
})

function boundingBox(lines) {
  const points = lines.flat()
  const lats = points.map(point => point[0])
  const lons = points.map(point => point[1])
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ]
}

for (const street of DATA.streets) {
  street.bb = boundingBox(street.lines)
  street.mid = [(street.bb[0][0] + street.bb[1][0]) / 2, (street.bb[0][1] + street.bb[1][1]) / 2]
}

export const isRoad = street => !street.kind || street.kind === 'calle' || street.kind === 'autopista'
const isOfficial = street => !street.custom

// Las calles propias traen sus vecinas sin precalcular: se estiman por cercanía.
for (const street of DATA.streets.filter(street => street.custom))
  street.nb = DATA.streets
    .filter(other => other !== street && other.kind !== 'agua' && other.kind !== 'tren')
    .map(other => [other.name, distanceKm(street.mid, other.mid)])
    .sort((a, b) => a[1] - b[1])
    .slice(0, 12)

export const streetByName = Object.fromEntries(DATA.streets.map(street => [street.name, street]))
const allRoads = DATA.streets.filter(isRoad)
const allQuizStreets = DATA.streets.filter(street => street.kind !== 'tren')
export const roads = () => (settings.ownStreets ? allRoads : allRoads.filter(isOfficial))
export const quizStreets = () => (settings.ownStreets ? allQuizStreets : allQuizStreets.filter(isOfficial))

export function streetMidVertex(street) {
  const longest = street.lines.reduce((a, b) => (b.length > a.length ? b : a))
  return longest[Math.floor(longest.length / 2)]
}

// ----- relaciones entre calles (precalculadas por tools/relations.js)
const parallelPairs = new Set((DATA.para || []).map(pair => pair.join('|')))
export const isPara = (a, b) => parallelPairs.has(a + '|' + b) || parallelPairs.has(b + '|' + a)
export const crossingsOf = name =>
  (DATA.inter || [])
    .filter(crossing => crossing.a === name || crossing.b === name)
    .map(crossing => ({ other: crossing.a === name ? crossing.b : crossing.a, i: crossing }))
