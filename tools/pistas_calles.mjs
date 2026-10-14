// Para cada calle del juego busca "pistas": tramos que ayudan a reconocerla (un río o canal al lado, muchas automotoras,
// una feria, un estadio, un mall, un parque u otro lugar emblemático junto a ella). El generador de Street View
// (tools/streetview_lugares.mjs) pone parte de sus puntos en esos tramos y el juego muestra la pista al responder.
// Se corre desde la raíz del proyecto:  node tools/pistas_calles.mjs   → escribe src/datos/pistasCalles.json
// Las automotoras, ferias y estadios vienen de OpenStreetMap (Overpass, cacheado en tools/pistas_osm.json; si falta o
// se quiere actualizar, borrar ese archivo y volver a correr: puede dar timeout, hay que reintentar).
// Para agregar una pista a mano (un bandejón ancho, un paseo con árboles al medio…), usar PISTAS_MANUALES.
import fs from 'node:fs'
import { puntoMasCercanoEnLineas } from '../src/nucleo/geografia.js'

const datos = (() => {
  const ventana = {}
  new Function('window', fs.readFileSync('public/data/data.js', 'utf8'))(ventana)
  return ventana.DATA
})()

// { 'Nombre de la calle': [{ lat, lon, pista: 'texto' }] }: se suman a las encontradas solas.
const PISTAS_MANUALES = {}

const CAJA = '(-33.75,-70.90,-33.25,-70.40)'
const ARCHIVO_OSM = 'tools/pistas_osm.json'
async function descargarOsm() {
  const consulta = ['"shop"="car"', '"amenity"="marketplace"', '"leisure"="stadium"']
    .map(filtro => `nwr[${filtro}]${CAJA};`)
    .join('')
  const cuerpo = new URLSearchParams({ data: `[out:json][timeout:120];(${consulta});out center tags;` })
  for (const servidor of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    const respuesta = await fetch(servidor, {
      method: 'POST',
      body: cuerpo,
      headers: { 'User-Agent': 'NoTengoCalle/1.0 (ssilvamc@uc.cl)' },
    })
    const texto = await respuesta.text()
    if (texto.startsWith('{')) return JSON.parse(texto).elements
  }
  throw new Error('Overpass no respondió: reintentar más tarde')
}
const elementosOsm = fs.existsSync(ARCHIVO_OSM)
  ? JSON.parse(fs.readFileSync(ARCHIVO_OSM, 'utf8'))
  : await descargarOsm()
fs.writeFileSync(ARCHIVO_OSM, JSON.stringify(elementosOsm))

const centro = elemento => [elemento.lat ?? elemento.center?.lat, elemento.lon ?? elemento.center?.lon]
const automotoras = elementosOsm.filter(e => e.tags?.shop === 'car').map(centro)
const ferias = elementosOsm.filter(e => e.tags?.amenity === 'marketplace').map(e => ({ punto: centro(e), nombre: e.tags.name }))
const estadios = elementosOsm.filter(e => e.tags?.leisure === 'stadium' && e.tags.name).map(e => ({ punto: centro(e), nombre: e.tags.name }))

const CATEGORIAS_QUE_AYUDAN = ['Malls y edificios', 'Deporte', 'Cerros y parques', 'Cultura', 'Centro histórico', 'Gobierno y justicia', 'Transporte', 'Universidades']
const CUERPOS_DE_AGUA = datos.streets.filter(calle => calle.kind === 'agua')
const CALLES = datos.streets.filter(calle => !calle.kind || calle.kind === 'calle' || calle.kind === 'autopista')

const KM_LAT = 111.2
const KM_LON = 92.9
const entreKm = (a, b) => Math.hypot((a[0] - b[0]) * KM_LAT, (a[1] - b[1]) * KM_LON)
const sobreLaCalle = (calle, punto) => puntoMasCercanoEnLineas(punto, calle.lines)

// Prioridad: lo que más ayuda a reconocer una calle va primero.
const PRIORIDAD = { agua: 0, automotoras: 1, feria: 2, estadio: 3, mall: 4, parque: 5, otro: 6, manual: -1 }
const MAXIMO_DE_PISTAS = 5
const SEPARACION_ENTRE_PISTAS_KM = 0.5

function pistasDe(calle) {
  const candidatas = []

  for (const agua of CUERPOS_DE_AGUA) {
    const cercanos = calle.lines.flat().filter(vertice => sobreLaCalle(agua, vertice).km <= 0.08)
    if (cercanos.length >= 3)
      candidatas.push({ tipo: 'agua', punto: cercanos[Math.floor(cercanos.length / 2)], pista: `cerca del ${agua.name.replace(/^(Río|Canal) /, m => m.toLowerCase())}` })
  }

  const automotorasCerca = automotoras
    .map(punto => ({ punto, enLaCalle: sobreLaCalle(calle, punto) }))
    .filter(({ enLaCalle }) => enLaCalle.km <= 0.06)
    .map(({ enLaCalle }) => enLaCalle.point)
  const agrupadas = []
  for (const punto of automotorasCerca) {
    const grupo = agrupadas.find(g => entreKm(g.centro, punto) <= 0.35)
    if (grupo) grupo.puntos.push(punto)
    else agrupadas.push({ centro: punto, puntos: [punto] })
  }
  for (const grupo of agrupadas.filter(g => g.puntos.length >= 4))
    candidatas.push({ tipo: 'automotoras', punto: grupo.puntos[Math.floor(grupo.puntos.length / 2)], pista: 'muchas automotoras a los lados' })

  for (const feria of ferias)
    if (sobreLaCalle(calle, feria.punto).km <= 0.08)
      candidatas.push({ tipo: 'feria', punto: sobreLaCalle(calle, feria.punto).point, pista: /feria|mercado/i.test(feria.nombre ?? '') ? `junto a «${feria.nombre.split('.')[0]}»` : 'junto a una feria o mercado' })

  for (const estadio of estadios)
    if (sobreLaCalle(calle, estadio.punto).km <= 0.2)
      candidatas.push({ tipo: 'estadio', punto: sobreLaCalle(calle, estadio.punto).point, pista: `cerca del ${estadio.nombre}` })

  for (const lugar of datos.landmarks) {
    if (!CATEGORIAS_QUE_AYUDAN.includes(lugar.cat) || lugar.line) continue
    const enLaCalle = sobreLaCalle(calle, [lugar.lat, lugar.lon])
    if (enLaCalle.km > 0.1) continue
    const tipo = lugar.cat === 'Malls y edificios' ? 'mall' : lugar.cat === 'Cerros y parques' ? 'parque' : 'otro'
    candidatas.push({ tipo, punto: enLaCalle.point, pista: `junto a ${lugar.name.replace(/\s*\([^)]*\s[^)]*\)/g, '')}` })
  }

  for (const manual of PISTAS_MANUALES[calle.name] ?? []) candidatas.push({ tipo: 'manual', punto: [manual.lat, manual.lon], pista: manual.pista })

  const elegidas = []
  for (const candidata of candidatas.sort((a, b) => PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo])) {
    if (elegidas.length >= MAXIMO_DE_PISTAS) break
    if (elegidas.some(otra => entreKm(otra.punto, candidata.punto) < SEPARACION_ENTRE_PISTAS_KM)) continue
    elegidas.push(candidata)
  }
  return elegidas.map(({ punto, pista, tipo }) => ({ lat: +punto[0].toFixed(5), lon: +punto[1].toFixed(5), pista, tipo }))
}

const resultado = {}
const cuenta = {}
for (const calle of CALLES) {
  const pistas = pistasDe(calle)
  if (!pistas.length) continue
  resultado[calle.name] = pistas
  for (const { tipo } of pistas) cuenta[tipo] = (cuenta[tipo] ?? 0) + 1
}
fs.writeFileSync('src/datos/pistasCalles.json', JSON.stringify(resultado))
console.log(`${Object.keys(resultado).length} de ${CALLES.length} calles con pistas`, cuenta)
