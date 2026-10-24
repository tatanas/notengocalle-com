// Baja de OpenStreetMap (Overpass) las calles de una zona, por teselas, para construir el grafo vial.
//   node tools/grafo/bajarOsm.mjs [sur oeste norte este]     (por omisión, el Gran Santiago)
// Cada tesela queda en .local/grafo/osm-tesela-<sur>_<oeste>.json; las que ya están se saltan, así que se puede interrumpir y
// seguir. Después: node --max-old-space-size=8192 tools/grafo/construirSantiago.mjs
//
// Las calles de servicio (estacionamientos, accesos) no se bajan: el grafo no las usa. Con 5 s entre pedidos, el Gran Santiago
// son unas 64 teselas y toma más de media hora.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CARPETA = join(RAIZ, '.local', 'grafo')
const GRAN_SANTIAGO = [-33.65, -70.85, -33.28, -70.43]
const GRADOS_POR_TESELA = 0.05
const ESPEJOS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const CLASES = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street'
const MILISEGUNDOS_POR_PEDIDO = 360_000
const MILISEGUNDOS_ENTRE_TESELAS = 5000
const MILISEGUNDOS_ENTRE_REINTENTOS = 30_000
const REINTENTOS = 5
const USUARIO = 'NoTengoCalle-grafo/0.1 (juego educativo)'

const dormir = milisegundos => new Promise(resolver => setTimeout(resolver, milisegundos))

const consulta = ([
  sur,
  oeste,
  norte,
  este,
]) => `[out:json][timeout:300][bbox:${sur},${oeste},${norte},${este}];
(way["highway"~"^(${CLASES})(_link)?$"];);
(._;>;);
out body qt;
rel["type"="restriction"];
out body;`

async function bajarTesela(limites) {
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    for (const espejo of ESPEJOS) {
      try {
        const respuesta = await fetch(espejo, {
          method: 'POST',
          headers: { 'User-Agent': USUARIO, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(consulta(limites)),
          signal: AbortSignal.timeout(MILISEGUNDOS_POR_PEDIDO),
        })
        if (!respuesta.ok) throw new Error(String(respuesta.status))
        const { elements } = await respuesta.json()
        if (!elements) throw new Error('respuesta sin elementos')
        return elements
      } catch (error) {
        console.log(`  ${espejo} falló (intento ${intento}): ${error.message}`)
      }
    }
    await dormir(MILISEGUNDOS_ENTRE_REINTENTOS * intento)
  }
  throw new Error('Overpass no respondió')
}

const [sur, oeste, norte, este] =
  process.argv.length >= 6 ? process.argv.slice(2, 6).map(Number) : GRAN_SANTIAGO
mkdirSync(CARPETA, { recursive: true })
const teselas = []
for (let latitud = sur; latitud < norte; latitud += GRADOS_POR_TESELA)
  for (let longitud = oeste; longitud < este; longitud += GRADOS_POR_TESELA)
    teselas.push([
      latitud,
      longitud,
      Math.min(latitud + GRADOS_POR_TESELA, norte),
      Math.min(longitud + GRADOS_POR_TESELA, este),
    ])

let hechas = 0
for (const limites of teselas) {
  const archivo = join(CARPETA, `osm-tesela-${limites[0].toFixed(2)}_${limites[1].toFixed(2)}.json`)
  hechas++
  if (existsSync(archivo)) continue
  console.log(`${hechas}/${teselas.length} ${limites.map(valor => valor.toFixed(2)).join(' ')}`)
  const elementos = await bajarTesela(limites)
  writeFileSync(archivo, JSON.stringify({ elements: elementos }))
  console.log(`  ${elementos.length} elementos`)
  await dormir(MILISEGUNDOS_ENTRE_TESELAS)
}
console.log('Listo.')
