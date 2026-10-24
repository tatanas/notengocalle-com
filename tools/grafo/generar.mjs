// Genera el grafo de "Ruta libre" de cada par origen-destino de un archivo.
//   node tools/grafo/generar.mjs tools/grafo/rutas.json            (lugares públicos → public/data/ruta-libre/)
//   node tools/grafo/generar.mjs .local/rutas_privadas.json --privadas   (direcciones propias → …/privadas/, ignorado por git)
// Formato del archivo: [{ id, origen: { nombre, punto: [lat, lon] }, destino: { nombre, punto: [lat, lon] }, margenKm? }]
// Los datos de OpenStreetMap se bajan una vez por par y quedan en .local/grafo/ (se borra a mano para repetirlo).
// Por omisión se usa la API de OpenStreetMap por cuadrículas (Overpass suele estar caído); --overpass usa Overpass.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aristasCercaDelPunto, construirGrafo } from './construirGrafo.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ESPEJOS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const MILISEGUNDOS_POR_PEDIDO = 240_000
const MILISEGUNDOS_ENTRE_CUADRICULAS = 400
const MILISEGUNDOS_ENTRE_REINTENTOS = 3000
const REINTENTOS = 6
// 509 es el límite de descarga de la API de OpenStreetMap: se levanta con el tiempo, así que se espera mucho y no se desiste.
const MILISEGUNDOS_SI_LA_API_PIDE_ESPERAR = 180_000
const GRADOS_POR_CUADRICULA = 0.01
const URL_DE_LA_API = 'https://api.openstreetmap.org/api/0.6/map.json'
const USUARIO_DE_LA_HERRAMIENTA = 'NoTengoCalle-grafo/0.1 (juego educativo)'
const MARGEN_POR_OMISION_KM = 3
const RADIO_MAXIMO_PARA_LUGARES_M = 300
const KM_POR_GRADO_DE_LATITUD = 111.2
const CLASES = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service'
const PATRON_DE_CALLE = new RegExp(`^(${CLASES})(_link)?$`)

function areaDelPar(origen, destino, margenKm) {
  const latitudes = [origen[0], destino[0]]
  const longitudes = [origen[1], destino[1]]
  const margenEnLatitud = margenKm / KM_POR_GRADO_DE_LATITUD
  const margenEnLongitud = margenKm / (111.32 * Math.cos((origen[0] * Math.PI) / 180))
  return {
    sur: Math.min(...latitudes) - margenEnLatitud,
    norte: Math.max(...latitudes) + margenEnLatitud,
    oeste: Math.min(...longitudes) - margenEnLongitud,
    este: Math.max(...longitudes) + margenEnLongitud,
  }
}

const dormir = milisegundos => new Promise(resolver => setTimeout(resolver, milisegundos))
const esUnaCalle = elemento => elemento.type === 'way' && PATRON_DE_CALLE.test(elemento.tags?.highway ?? '')
const esUnaRestriccion = elemento => elemento.type === 'relation' && elemento.tags?.type === 'restriction'
const leerCache = ruta => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')).elements : null)

function guardarCache(ruta, elements) {
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, JSON.stringify({ elements }))
}

const consultaOverpass = ({
  sur,
  oeste,
  norte,
  este,
}) => `[out:json][timeout:300][bbox:${sur},${oeste},${norte},${este}];
(way["highway"~"^(${CLASES})(_link)?$"];);
(._;>;);
out body qt;
rel["type"="restriction"];
out body;`

async function bajarOverpass(area, rutaDeCache) {
  const guardado = leerCache(rutaDeCache)
  if (guardado) return guardado
  for (const espejo of ESPEJOS) {
    try {
      console.log('  Overpass:', espejo)
      const respuesta = await fetch(espejo, {
        method: 'POST',
        headers: {
          'User-Agent': USUARIO_DE_LA_HERRAMIENTA,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'data=' + encodeURIComponent(consultaOverpass(area)),
        signal: AbortSignal.timeout(MILISEGUNDOS_POR_PEDIDO),
      })
      if (!respuesta.ok) throw new Error(String(respuesta.status))
      const { elements } = await respuesta.json()
      guardarCache(rutaDeCache, elements)
      return elements
    } catch (error) {
      console.log('  falló:', error.message)
    }
  }
  throw new Error('Ningún espejo de Overpass respondió')
}

async function conReintentos(tarea) {
  for (let intento = 1; ; intento++) {
    try {
      return await tarea()
    } catch (error) {
      const pideEsperar = /: (509|429)$/.test(error.message)
      if (intento === REINTENTOS && !pideEsperar) throw error
      console.log(`  reintento ${intento}: ${error.cause?.code ?? error.message}`)
      await dormir(
        pideEsperar ? MILISEGUNDOS_SI_LA_API_PIDE_ESPERAR : MILISEGUNDOS_ENTRE_REINTENTOS * intento,
      )
    }
  }
}

// La API devuelve todo lo que hay en la cuadrícula; si son demasiados nodos (400) se parte en cuatro.
async function bajarCuadricula(sur, oeste, norte, este) {
  const { estado, elementos } = await conReintentos(async () => {
    const recibida = await fetch(`${URL_DE_LA_API}?bbox=${oeste},${sur},${este},${norte}`, {
      headers: { 'User-Agent': USUARIO_DE_LA_HERRAMIENTA },
      signal: AbortSignal.timeout(MILISEGUNDOS_POR_PEDIDO),
    })
    if (recibida.status >= 500 || recibida.status === 429 || recibida.status === 509)
      throw new Error(`API de OpenStreetMap: ${recibida.status}`)
    return { estado: recibida.status, elementos: recibida.ok ? (await recibida.json()).elements : null }
  })
  if (estado === 400) {
    const medioEnLatitud = (sur + norte) / 2
    const medioEnLongitud = (oeste + este) / 2
    const partes = []
    for (const [desdeLat, hastaLat] of [
      [sur, medioEnLatitud],
      [medioEnLatitud, norte],
    ])
      for (const [desdeLon, hastaLon] of [
        [oeste, medioEnLongitud],
        [medioEnLongitud, este],
      ])
        partes.push(...(await bajarCuadricula(desdeLat, desdeLon, hastaLat, hastaLon)))
    return partes
  }
  if (!elementos) throw new Error(`API de OpenStreetMap: ${estado}`)
  return elementos
}

async function bajarDeLaApi(area, rutaDeCache) {
  const guardado = leerCache(rutaDeCache)
  if (guardado) return guardado
  const nodos = new Map()
  const calles = new Map()
  const restricciones = new Map()
  const cuadriculasEnLatitud = Math.ceil((area.norte - area.sur) / GRADOS_POR_CUADRICULA)
  const cuadriculasEnLongitud = Math.ceil((area.este - area.oeste) / GRADOS_POR_CUADRICULA)
  console.log(`  API de OpenStreetMap: ${cuadriculasEnLatitud * cuadriculasEnLongitud} cuadrículas`)
  for (let i = 0; i < cuadriculasEnLatitud; i++)
    for (let j = 0; j < cuadriculasEnLongitud; j++) {
      const sur = area.sur + i * GRADOS_POR_CUADRICULA
      const oeste = area.oeste + j * GRADOS_POR_CUADRICULA
      const rutaDeLaCuadricula = join(
        dirname(rutaDeCache),
        'cuadriculas',
        `${sur.toFixed(4)}_${oeste.toFixed(4)}.json`,
      )
      let delaCuadricula = leerCache(rutaDeLaCuadricula)
      if (!delaCuadricula) {
        const elementos = await bajarCuadricula(
          sur,
          oeste,
          sur + GRADOS_POR_CUADRICULA,
          oeste + GRADOS_POR_CUADRICULA,
        )
        const callesDeLaCuadricula = elementos.filter(esUnaCalle)
        const necesarios = new Set(callesDeLaCuadricula.flatMap(calle => calle.nodes))
        delaCuadricula = elementos.filter(
          elemento =>
            esUnaCalle(elemento) ||
            esUnaRestriccion(elemento) ||
            (elemento.type === 'node' && necesarios.has(elemento.id)),
        )
        guardarCache(rutaDeLaCuadricula, delaCuadricula)
        await dormir(MILISEGUNDOS_ENTRE_CUADRICULAS)
      }
      for (const elemento of delaCuadricula) {
        if (elemento.type === 'node') nodos.set(elemento.id, elemento)
        else if (elemento.type === 'way') calles.set(elemento.id, elemento)
        else restricciones.set(elemento.id, elemento)
      }
      const hechas = i * cuadriculasEnLongitud + j + 1
      if (hechas % 10 === 0) console.log(`  ${hechas} cuadrículas`)
    }
  const elements = [...nodos.values(), ...calles.values(), ...restricciones.values()]
  guardarCache(rutaDeCache, elements)
  return elements
}

// El juego lista las rutas disponibles en un índice chico, para sortearlas sin bajar sus grafos.
function anotarEnElIndice(rutaDelIndice, entrada) {
  const indice = existsSync(rutaDelIndice) ? JSON.parse(readFileSync(rutaDelIndice, 'utf8')) : []
  const sinLaAnterior = indice.filter(existente => existente.id !== entrada.id)
  writeFileSync(rutaDelIndice, JSON.stringify([...sinLaAnterior, entrada], null, 2) + '\n')
}

const [, , archivoDeRutas, ...opciones] = process.argv
if (!archivoDeRutas)
  throw new Error('Uso: node tools/grafo/generar.mjs <rutas.json> [--privadas] [--overpass] [id…]')
const privadas = opciones.includes('--privadas')
const bajar = opciones.includes('--overpass') ? bajarOverpass : bajarDeLaApi
const soloEstas = opciones.filter(opcion => !opcion.startsWith('--'))
const rutas = JSON.parse(readFileSync(archivoDeRutas, 'utf8')).filter(
  ruta => !soloEstas.length || soloEstas.includes(ruta.id),
)

const fallidas = []
for (const ruta of rutas) {
  try {
    await generarRuta(ruta)
  } catch (error) {
    console.log(`  FALLÓ: ${error.message}`)
    fallidas.push(ruta.id)
  }
}
if (fallidas.length) console.log(`\nNo se pudieron generar: ${fallidas.join(', ')}`)

async function generarRuta(ruta) {
  console.log(ruta.id)
  const area = areaDelPar(ruta.origen.punto, ruta.destino.punto, ruta.margenKm ?? MARGEN_POR_OMISION_KM)
  const elementos = await bajar(area, join(RAIZ, '.local', 'grafo', `osm-${ruta.id}.json`))
  const datos = construirGrafo(elementos, { area, extremos: [ruta.origen.punto, ruta.destino.punto] })
  // El punto de un lugar (una plaza, un mall) puede quedar lejos de la calle: se busca la más cercana hasta `radioMaximoM`.
  const radioMaximoM = ruta.radioMaximoM ?? RADIO_MAXIMO_PARA_LUGARES_M
  const partida = aristasCercaDelPunto(datos, ruta.origen.punto, { radioMaximoM })
  const llegada = aristasCercaDelPunto(datos, ruta.destino.punto, { radioMaximoM })
  if (!partida.length) throw new Error(`no hay calle a menos de ${radioMaximoM} m del origen`)
  if (!llegada.length) throw new Error(`no hay calle a menos de ${radioMaximoM} m del destino`)
  datos.meta = {
    id: ruta.id,
    area,
    origen: { nombre: ruta.origen.nombre, punto: ruta.origen.punto, aristas: partida },
    destino: { nombre: ruta.destino.nombre, punto: ruta.destino.punto, aristas: llegada },
  }
  const carpeta = join(RAIZ, 'public', 'data', 'ruta-libre', privadas ? 'privadas' : '')
  mkdirSync(carpeta, { recursive: true })
  const texto = JSON.stringify(datos)
  writeFileSync(join(carpeta, `${ruta.id}.json`), texto)
  anotarEnElIndice(privadas ? join(carpeta, 'indice.json') : join(RAIZ, 'src', 'datos', 'rutasLibres.json'), {
    id: ruta.id,
    origen: ruta.origen.nombre,
    destino: ruta.destino.nombre,
  })
  console.log(
    `  ${datos.nodos.lat.length} nodos, ${datos.aristas.desde.length} aristas, ${datos.giros.length} giros prohibidos, ` +
      `${(texto.length / 1e6).toFixed(1)} MB; salidas del origen ${partida.length}, entradas del destino ${llegada.length}`,
  )
}
