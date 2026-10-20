// Las comunas de todo Chile para "Comunas de Chile": polígonos simplificados de OpenStreetMap (admin_level=8, ODbL). Las 52 de la
// Región Metropolitana no se bajan: el juego usa las que ya tiene (comunas_s.geojson, más detalladas).
// Se pide a Overpass la lista de comunas (con su código oficial `dpachile:id`, cuyos dos primeros dígitos son la región) y a
// Nominatim cada polígono ya simplificado en el servidor (polygon_threshold). Faltan en OpenStreetMap: la Antártica.
// Uso (desde tools/):  node comunas_chile.js   → comunas_chile.json (build_data.js lo pasa a data.js y a public/data/comunas-chile.js)
// Las respuestas quedan en comunas_chile_ids_raw.json y comunas_chile_raw.json (ignorados por git); si existen, se reutilizan.
const fs = require('fs')
const turf = require('@turf/turf')

const REGIONES_POR_CODIGO = {
  '15': 'Arica y Parinacota',
  '01': 'Tarapacá',
  '02': 'Antofagasta',
  '03': 'Atacama',
  '04': 'Coquimbo',
  '05': 'Valparaíso',
  '13': 'Metropolitana de Santiago',
  '06': "O'Higgins",
  '07': 'Maule',
  '16': 'Ñuble',
  '08': 'Biobío',
  '09': 'La Araucanía',
  '14': 'Los Ríos',
  '10': 'Los Lagos',
  '11': 'Aysén',
  '12': 'Magallanes',
}
const REGION_METROPOLITANA = '13'
const UMBRAL_DE_SIMPLIFICACION = 0.003
const COMUNAS_POR_PEDIDO = 40
const DECIMALES = 3
// De los pedazos de una comuna (islas), solo se dejan los que se ven: los chicos pesan y no se distinguen.
const KM2_MINIMOS_DE_UN_PEDAZO = 4
const MS_ENTRE_PEDIDOS = 1200
const USER_AGENT = 'NoTengoCalle/1.0 (juego educativo de Santiago)'
const dormir = ms => new Promise(resolver => setTimeout(resolver, ms))

const ESPEJOS = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter']
async function descargarLista() {
  const consulta = `[out:json][timeout:120];
    area["ISO3166-1"="CL"]->.cl;
    relation["boundary"="administrative"]["admin_level"="8"](area.cl);
    out tags;`
  for (const espejo of ESPEJOS) {
    try {
      const respuesta = await fetch(espejo, {
        method: 'POST',
        signal: AbortSignal.timeout(170000),
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(consulta),
      })
      if (respuesta.ok) return (await respuesta.json()).elements
      console.log(espejo, respuesta.status)
    } catch (error) {
      console.log(espejo, error.message)
    }
  }
  throw new Error('Ningún espejo de Overpass respondió')
}

async function descargarPoligonos(ids) {
  const url =
    'https://nominatim.openstreetmap.org/lookup?format=geojson&polygon_geojson=1&polygon_threshold=' +
    UMBRAL_DE_SIMPLIFICACION +
    '&osm_ids=' +
    ids.map(id => 'R' + id).join(',')
  for (let intento = 0; intento < 4; intento++) {
    const respuesta = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (respuesta.ok) return (await respuesta.json()).features
    await dormir(5000 * (intento + 1))
  }
  throw new Error('Nominatim no respondió')
}

const redondear = numero => +numero.toFixed(DECIMALES)
const redondearAnillo = anillo => anillo.map(([lon, lat]) => [redondear(lon), redondear(lat)])

// Los pedazos que se ven (los más grandes), con las coordenadas redondeadas.
function geometriaLiviana(geometria) {
  const pedazos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates
  const conArea = pedazos.map(pedazo => ({ pedazo, km2: turf.area(turf.polygon(pedazo)) / 1e6 }))
  const mayor = Math.max(...conArea.map(({ km2 }) => km2))
  const quedan = conArea
    .filter(({ km2 }) => km2 >= Math.min(KM2_MINIMOS_DE_UN_PEDAZO, mayor))
    .map(({ pedazo }) => pedazo.map(redondearAnillo))
  return quedan.length === 1
    ? { type: 'Polygon', coordinates: quedan[0] }
    : { type: 'MultiPolygon', coordinates: quedan }
}

;(async () => {
  const archivoDeLaLista = 'comunas_chile_ids_raw.json'
  if (!fs.existsSync(archivoDeLaLista)) fs.writeFileSync(archivoDeLaLista, JSON.stringify(await descargarLista()))
  const lista = JSON.parse(fs.readFileSync(archivoDeLaLista))
  const deOtrasRegiones = lista.filter(
    comuna => (comuna.tags['dpachile:id'] ?? '').slice(0, 2) !== REGION_METROPOLITANA,
  )

  const archivoDePoligonos = 'comunas_chile_raw.json'
  const guardados = fs.existsSync(archivoDePoligonos) ? JSON.parse(fs.readFileSync(archivoDePoligonos)) : {}
  const faltan = deOtrasRegiones.filter(comuna => !guardados[comuna.id])
  for (let i = 0; i < faltan.length; i += COMUNAS_POR_PEDIDO) {
    const lote = faltan.slice(i, i + COMUNAS_POR_PEDIDO)
    for (const rasgo of await descargarPoligonos(lote.map(comuna => comuna.id)))
      guardados[rasgo.properties.osm_id] = rasgo.geometry
    fs.writeFileSync(archivoDePoligonos, JSON.stringify(guardados))
    console.log('polígonos', Object.keys(guardados).length, 'de', deOtrasRegiones.length)
    await dormir(MS_ENTRE_PEDIDOS)
  }

  const comunas = []
  for (const comuna of deOtrasRegiones) {
    const geometria = guardados[comuna.id]
    if (!geometria) {
      console.log('sin polígono:', comuna.tags.name)
      continue
    }
    const liviana = geometriaLiviana(geometria)
    const rasgo = turf.feature(liviana)
    const [oeste, sur, este, norte] = turf.bbox(rasgo)
    const etiqueta = turf.pointOnFeature(rasgo).geometry.coordinates
    comunas.push({
      name: comuna.tags.name,
      region: REGIONES_POR_CODIGO[comuna.tags['dpachile:id'].slice(0, 2)],
      lab: [redondear(etiqueta[1]), redondear(etiqueta[0])],
      bb: [sur, oeste, norte, este].map(redondear),
      km2: Math.round(turf.area(rasgo) / 1e6),
      g: liviana,
    })
  }
  comunas.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  fs.writeFileSync('comunas_chile.json', JSON.stringify(comunas))
  console.log('comunas', comunas.length, 'bytes', fs.statSync('comunas_chile.json').size)
})()
