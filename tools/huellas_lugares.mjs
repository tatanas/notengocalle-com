// Baja de OpenStreetMap (Nominatim) la huella de cada lugar emblemático (el polígono de su recinto) y la deja simplificada en
// src/datos/huellasDeLugares.json = { idDelLugar: [[lat, lon], …] }. Con la huella, "llegar a un lugar" es pasar por cualquiera
// de las calles que la tocan (un mall o un campus tienen varias entradas), y "partir de un lugar" deja elegir por cuál salir.
//   node tools/huellas_lugares.mjs        (desde la raíz; ~1 minuto; guarda lo bajado en .local/huellas_raw.json)
// Lugares sin polígono en OSM (un punto, una estatua) quedan sin huella: se usa la calle más cercana.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

const USUARIO = 'NoTengoCalle-huellas/0.1 (juego educativo)'
const RAIZ_DE_BATCH = 40
const MILISEGUNDOS_ENTRE_PEDIDOS = 1200
const METROS_MAXIMOS_DE_LA_BUSQUEDA_AL_PUNTO = 600
const METROS_MINIMOS_DE_UNA_HUELLA = 25
// Nominatim a veces devuelve otro lugar con el mismo nombre (otro "Pueblo…", otra "Municipalidad…"): si la huella queda lejos, se descarta.
const METROS_MAXIMOS_DEL_PUNTO_A_LA_HUELLA = 1000
const TOLERANCIA_DE_SIMPLIFICACION_M = 4
const CAJA_DE_SANTIAGO = '-70.95,-33.25,-70.40,-33.75'
const ARCHIVO_CRUDO = '.local/huellas_raw.json'
const DESTINO = 'src/datos/huellasDeLugares.json'

const ventana = { window: {} }
vm.runInNewContext(readFileSync('public/data/data.js', 'utf8'), ventana)
const lugares = ventana.window.DATA.landmarks
const geocodificados = JSON.parse(readFileSync('tools/landmarks_geo.json', 'utf8'))
const cacheDeGeocodificacion = JSON.parse(readFileSync('tools/geocache.json', 'utf8'))
const crudo = existsSync(ARCHIVO_CRUDO)
  ? JSON.parse(readFileSync(ARCHIVO_CRUDO, 'utf8'))
  : { porId: {}, busquedas: {} }
const dormir = milisegundos => new Promise(resolver => setTimeout(resolver, milisegundos))
const pedir = async url => {
  const respuesta = await fetch(url, { headers: { 'User-Agent': USUARIO, 'Accept-Language': 'es' } })
  if (!respuesta.ok) throw new Error(`${respuesta.status} ${url.slice(0, 90)}`)
  await dormir(MILISEGUNDOS_ENTRE_PEDIDOS)
  return respuesta.json()
}

function idDeOsmDe(lugar) {
  const geocodificado =
    geocodificados.find(candidato => candidato.name === lugar.name) ??
    geocodificados.find(
      candidato => lugar.name.startsWith(candidato.name) || candidato.name.startsWith(lugar.name),
    )
  const resultado = geocodificado && cacheDeGeocodificacion[geocodificado.q]?.[0]
  return resultado?.osm_id ? `${resultado.osm_type[0].toUpperCase()}${resultado.osm_id}` : null
}

// 1. Los que ya tienen id de OSM, en lotes.
const conId = lugares.map(lugar => ({ lugar, osm: idDeOsmDe(lugar) })).filter(({ osm }) => osm)
const porBajar = conId.filter(({ lugar }) => !(lugar.id in crudo.porId))
for (let i = 0; i < porBajar.length; i += RAIZ_DE_BATCH) {
  const lote = porBajar.slice(i, i + RAIZ_DE_BATCH)
  const resultados = await pedir(
    `https://nominatim.openstreetmap.org/lookup?format=jsonv2&polygon_geojson=1&polygon_threshold=0.00002&osm_ids=${lote.map(({ osm }) => osm).join(',')}`,
  )
  for (const { lugar, osm } of lote) {
    const encontrado = resultados.find(
      resultado => `${resultado.osm_type[0].toUpperCase()}${resultado.osm_id}` === osm,
    )
    crudo.porId[lugar.id] = encontrado?.geojson ?? null
  }
  writeFileSync(ARCHIVO_CRUDO, JSON.stringify(crudo))
  console.log(`lotes: ${Math.min(i + RAIZ_DE_BATCH, porBajar.length)}/${porBajar.length}`)
}

const metros = ([latA, lonA], [latB, lonB]) =>
  Math.hypot((latB - latA) * 111200, (lonB - lonA) * 111320 * Math.cos((latA * Math.PI) / 180))

// 2. Los que no tienen polígono (no tenían id, o el id era un punto): se buscan por nombre cerca de su punto.
const esPoligono = geometria => ['Polygon', 'MultiPolygon'].includes(geometria?.type)
for (const lugar of lugares.filter(
  candidato => !esPoligono(crudo.porId[candidato.id]) && !crudo.busquedas[candidato.id],
)) {
  const nombre = lugar.name
    .replace(/\(.*\)/, '')
    .replace(/ – /g, ' ')
    .trim()
  let resultados = []
  try {
    resultados = await pedir(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&polygon_threshold=0.00002&limit=5&countrycodes=cl&viewbox=${CAJA_DE_SANTIAGO}&bounded=1&q=${encodeURIComponent(nombre)}`,
    )
  } catch (error) {
    console.log('  falló', nombre, error.message)
    continue
  }
  const cercano = resultados.find(
    resultado =>
      esPoligono(resultado.geojson) &&
      metros([lugar.lat, lugar.lon], [+resultado.lat, +resultado.lon]) <=
        METROS_MAXIMOS_DE_LA_BUSQUEDA_AL_PUNTO,
  )
  if (cercano) crudo.porId[lugar.id] = cercano.geojson
  crudo.busquedas[lugar.id] = true
  console.log(cercano ? 'encontrado' : 'sin polígono cerca', nombre)
  writeFileSync(ARCHIVO_CRUDO, JSON.stringify(crudo))
}

// 3. De cada geometría, el anillo exterior más grande, simplificado.
const PUNTOS_POR_GRADO = [111200, 111320 * Math.cos((-33.45 * Math.PI) / 180)]
const aMetros = ([lon, lat]) => [lat * PUNTOS_POR_GRADO[0], lon * PUNTOS_POR_GRADO[1]]
function areaDelAnillo(anillo) {
  const puntos = anillo.map(aMetros)
  let suma = 0
  for (let i = 0; i < puntos.length; i++) {
    const [ax, ay] = puntos[i]
    const [bx, by] = puntos[(i + 1) % puntos.length]
    suma += ax * by - bx * ay
  }
  return Math.abs(suma) / 2
}
function distanciaALaRecta(punto, a, b) {
  const [px, py] = aMetros(punto)
  const [ax, ay] = aMetros(a)
  const [bx, by] = aMetros(b)
  const largo = (bx - ax) ** 2 + (by - ay) ** 2
  const t = largo ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / largo)) : 0
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)))
}
function simplificar(puntos) {
  if (puntos.length < 3) return puntos
  let lejano = 0
  let indice = 0
  for (let i = 1; i < puntos.length - 1; i++) {
    const distancia = distanciaALaRecta(puntos[i], puntos[0], puntos.at(-1))
    if (distancia > lejano) [lejano, indice] = [distancia, i]
  }
  if (lejano <= TOLERANCIA_DE_SIMPLIFICACION_M) return [puntos[0], puntos.at(-1)]
  return [...simplificar(puntos.slice(0, indice + 1)).slice(0, -1), ...simplificar(puntos.slice(indice))]
}
const anillosDe = geometria =>
  geometria?.type === 'Polygon'
    ? [geometria.coordinates[0]]
    : geometria?.type === 'MultiPolygon'
      ? geometria.coordinates.map(poligono => poligono[0])
      : []

const huellas = {}
for (const lugar of lugares) {
  const anillos = anillosDe(crudo.porId[lugar.id])
  if (!anillos.length) continue
  const mayor = anillos.reduce((a, b) => (areaDelAnillo(b) > areaDelAnillo(a) ? b : a))
  if (Math.sqrt(areaDelAnillo(mayor)) < METROS_MINIMOS_DE_UNA_HUELLA) continue
  const simplificado = simplificar(mayor.slice(0, -1))
  const distanciaAlPunto = Math.min(
    ...simplificado.map(([lon, lat]) => metros([lugar.lat, lugar.lon], [lat, lon])),
  )
  if (distanciaAlPunto > METROS_MAXIMOS_DEL_PUNTO_A_LA_HUELLA) {
    console.log(`huella descartada: ${lugar.name} (a ${Math.round(distanciaAlPunto)} m de su punto)`)
    continue
  }
  if (simplificado.length >= 3)
    huellas[lugar.id] = simplificado.map(([lon, lat]) => [+lat.toFixed(5), +lon.toFixed(5)])
}
writeFileSync(DESTINO, JSON.stringify(huellas))
console.log(`${Object.keys(huellas).length} huellas de ${lugares.length} lugares → ${DESTINO}`)
