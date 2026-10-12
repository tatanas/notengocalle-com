import { distanciaKm, puntoMasCercanoEnLineas, puntoEnRasgo } from '../nucleo/geografia.js'
import { ajustes, almacen } from '../nucleo/almacen.js'

// window.DATA viene de public/data/data.js, que genera el pipeline de tools/ (ver ARQUITECTURA.md).
export const DATOS = window.DATA

// ----- comunas (features GeoJSON; properties: name, group core|peri|rural, nb vecinas, lab [lon, lat], km2)
export const comunas = DATOS.comunas.features
export const comunaPorNombre = Object.fromEntries(comunas.map(rasgo => [rasgo.properties.name, rasgo]))
export const puntoDeEtiqueta = rasgo => [rasgo.properties.lab[1], rasgo.properties.lab[0]]
export const esUrbana = rasgo => rasgo.properties.group !== 'rural'
export const enElAlcance = rasgo =>
  ajustes.scope === 'all' ||
  rasgo.properties.group === 'core' ||
  (ajustes.scope === 'peri' && rasgo.properties.group === 'peri')
export const comunasDelAlcance = () => comunas.filter(enElAlcance)
export const comunasDelNucleo = () => comunasDelAlcance().filter(esUrbana)

// ----- metro
export const LINEAS_DE_METRO = DATOS.metro.lines
export const IDS_DE_LINEA = ['L1', 'L2', 'L3', 'L4', 'L4A', 'L5', 'L6']
export const estaciones = DATOS.metro.stations
export const estacionPorNombre = Object.fromEntries(estaciones.map(estacion => [estacion.name, estacion]))

// ----- cerros, barrios, Chile
export const cerros = DATOS.cerros || []
export const ZONAS = DATOS.zones || []
export const CHILE = DATOS.chile || { regions: { features: [] }, cities: [] }
export const REGIONES = CHILE.regions.features
export const regionPorNombre = Object.fromEntries(REGIONES.map(rasgo => [rasgo.properties.name, rasgo]))
export const PARQUES = CHILE.parks || []

export const FOTOS = DATOS.photos || {}

// ----- lugares emblemáticos: a los de landmarks.json se suman barrios con perímetro y cerros destacados
const NOMBRE_DE_LUGAR_DE_ZONA = {
  'Barrio República (barrio universitario)': 'Barrio República',
  'Barrio Franklin (persas)': 'Barrio Franklin',
  'El Golf / Sanhattan': 'Barrio El Golf',
  'Estadio Nacional (recinto)': 'Estadio Nacional (selección chilena; hace de local la U. de Chile)',
  'Barrio Cívico': 'Barrio Cívico / Paseo Bulnes',
}
const CUMBRES_DESTACADAS = [
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
const TOLERANCIA_DE_CUMBRE_KM = { Cordillera: 3, Precordillera: 1.8 }
export const toleranciaDeCumbreKm = cumbre => TOLERANCIA_DE_CUMBRE_KM[cumbre.tipo] || 1

ZONAS.forEach((zona, indice) => {
  const nombre = NOMBRE_DE_LUGAR_DE_ZONA[zona.name] || zona.name
  let lugar = DATOS.landmarks.find(candidata => candidata.name === nombre)
  if (!lugar) {
    lugar = {
      id: 'z' + indice,
      name: zona.name,
      cat: 'Barrios',
      desc: zona.desc,
      lat: zona.c[0],
      lon: zona.c[1],
      comuna: zona.comunas[0],
      alt: zona.comunas.slice(1),
    }
    DATOS.landmarks.push(lugar)
  }
  lugar.zone = zona
  if (lugar.cat === 'Barrios') lugar.desc = zona.desc
})

// Los ríos y canales son lugares con forma de línea: se aciertan tocando cerca de su cauce, y no tienen una comuna.
const CENTRO_DEL_AGUA = [-33.45, -70.65]
for (const cauce of DATOS.streets.filter(calle => calle.kind === 'agua')) {
  const masCercanoALaCiudad = puntoMasCercanoEnLineas(CENTRO_DEL_AGUA, cauce.lines).point
  DATOS.landmarks.push({
    id: 'w' + cauce.id,
    name: cauce.name,
    cat: 'Ríos y canales',
    desc: cauce.hint,
    lat: masCercanoALaCiudad[0],
    lon: masCercanoALaCiudad[1],
    comuna: cauce.comunas[0],
    alt: cauce.comunas.slice(1),
    pk: 's:' + cauce.name,
    line: cauce.lines,
    obvious: true,
  })
}

for (const cumbre of cerros.filter(cumbre => CUMBRES_DESTACADAS.includes(cumbre.name)))
  DATOS.landmarks.push({
    id: 'k' + cumbre.id,
    name: cumbre.name,
    cat: 'Cerros y parques',
    desc: (cumbre.ele ? cumbre.ele.toLocaleString('es-CL') + ' m. ' : '') + cumbre.desc,
    lat: cumbre.lat,
    lon: cumbre.lon,
    comuna: cumbre.comuna,
    alt: cumbre.alt || [],
    pk: 'c:' + cumbre.name,
    tol: toleranciaDeCumbreKm(cumbre),
  })

export const lugarPorId = Object.fromEntries(DATOS.landmarks.map(lugar => [lugar.id, lugar]))
export const CATEGORIAS = [...new Set(DATOS.landmarks.map(lugar => lugar.cat))]

// ----- calles: a las de streets.json se suman las que el usuario guardó en este navegador ("Mis calles")
export const misCalles = almacen.get('myStreets', [])

export function comunasDeLineas(lineas) {
  const aciertos = {}
  for (const linea of lineas)
    for (let i = 0; i < linea.length; i += 2) {
      const comuna = comunas.find(rasgo => puntoEnRasgo(linea[i][0], linea[i][1], rasgo))
      if (comuna) aciertos[comuna.properties.name] = (aciertos[comuna.properties.name] || 0) + 1
    }
  return Object.entries(aciertos)
    .sort((a, b) => b[1] - a[1])
    .map(([nombre]) => nombre)
}

misCalles.forEach((guardado, indice) => {
  if (DATOS.streets.some(calle => calle.name === guardado.name)) return
  DATOS.streets.push({
    id: 'u' + indice,
    name: guardado.name,
    kind: 'calle',
    custom: true,
    hint: 'Calle agregada por ti.',
    km: guardado.km,
    comunas: guardado.comunas,
    cl: Object.fromEntries(guardado.comunas.map(comuna => [comuna, 1000])),
    lines: guardado.lines,
    nb: [],
  })
})

function cajaDelimitadora(lineas) {
  const puntos = lineas.flat()
  const latitudes = puntos.map(punto => punto[0])
  const longitudes = puntos.map(punto => punto[1])
  return [
    [Math.min(...latitudes), Math.min(...longitudes)],
    [Math.max(...latitudes), Math.max(...longitudes)],
  ]
}

for (const calle of DATOS.streets) {
  calle.bb = cajaDelimitadora(calle.lines)
  calle.mid = [(calle.bb[0][0] + calle.bb[1][0]) / 2, (calle.bb[0][1] + calle.bb[1][1]) / 2]
}

export const esVia = calle => !calle.kind || calle.kind === 'calle' || calle.kind === 'autopista'
const esOficial = calle => !calle.custom

// Las calles propias traen sus vecinas sin precalcular: se estiman por cercanía.
for (const calle of DATOS.streets.filter(calle => calle.custom))
  calle.nb = DATOS.streets
    .filter(otro => otro !== calle && otro.kind !== 'agua' && otro.kind !== 'tren')
    .map(otro => [otro.name, distanciaKm(calle.mid, otro.mid)])
    .sort((a, b) => a[1] - b[1])
    .slice(0, 12)

export const callePorNombre = Object.fromEntries(DATOS.streets.map(calle => [calle.name, calle]))
const todasLasVias = DATOS.streets.filter(esVia)
const todasLasCallesDelJuego = todasLasVias
export const vias = () => (ajustes.ownStreets ? todasLasVias : todasLasVias.filter(esOficial))
export const callesDelJuego = () =>
  ajustes.ownStreets ? todasLasCallesDelJuego : todasLasCallesDelJuego.filter(esOficial)

export function verticeMedioDeCalle(calle) {
  const masLarga = calle.lines.reduce((a, b) => (b.length > a.length ? b : a))
  return masLarga[Math.floor(masLarga.length / 2)]
}

// ----- relaciones entre calles (precalculadas por tools/relations.js)
const paresDeParalelas = new Set((DATOS.para || []).map(par => par.join('|')))
export const sonParalelas = (a, b) => paresDeParalelas.has(a + '|' + b) || paresDeParalelas.has(b + '|' + a)
export const paralelasDe = nombre =>
  (DATOS.para || []).filter(par => par.includes(nombre)).map(([a, b]) => (a === nombre ? b : a))
export const crucesDe = nombre =>
  (DATOS.inter || [])
    .filter(cruce => cruce.a === nombre || cruce.b === nombre)
    .map(cruce => ({ other: cruce.a === nombre ? cruce.b : cruce.a, i: cruce }))
