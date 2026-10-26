// Arma el grafo vial de todo lo que haya bajado de OpenStreetMap y lo deja en public/data/grafo/santiago.json.
//   node --max-old-space-size=8192 tools/grafo/construirSantiago.mjs [archivo.json …]
// Sin argumentos junta todos los .local/grafo/osm-*.json (lo que devuelve la API de OpenStreetMap); un mismo
// cruce o calle que aparece en varios archivos se cuenta una sola vez.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirGrafo } from './construirGrafo.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CARPETA_DE_DESCARGAS = join(RAIZ, '.local', 'grafo')
const DESTINO = join(RAIZ, 'public', 'data', 'grafo', 'santiago.json')

const archivos =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(CARPETA_DE_DESCARGAS)
        .filter(nombre => /^osm-.*\.json$/.test(nombre))
        .map(nombre => join(CARPETA_DE_DESCARGAS, nombre))

const nodos = new Map()
const calles = new Map()
const restricciones = new Map()
for (const archivo of archivos) {
  const { elements } = JSON.parse(readFileSync(archivo, 'utf8'))
  for (const elemento of elements) {
    if (elemento.type === 'node') nodos.set(elemento.id, elemento)
    else if (elemento.type === 'way') calles.set(elemento.id, elemento)
    else restricciones.set(elemento.id, elemento)
  }
  console.log(`${archivo.split(/[\\/]/).pop()}: ${nodos.size} nodos, ${calles.size} calles`)
}

// Errores de OpenStreetMap que cambian lo que se puede hacer (ver correccionesOsm.json): se pisan las etiquetas de esa calle.
const ARCHIVO_DE_CORRECCIONES = join(RAIZ, 'tools', 'grafo', 'correccionesOsm.json')
const correcciones = existsSync(ARCHIVO_DE_CORRECCIONES)
  ? JSON.parse(readFileSync(ARCHIVO_DE_CORRECCIONES, 'utf8'))
  : []
for (const { calle, etiquetas } of correcciones.filter(correccion => correccion.etiquetas))
  if (calles.has(calle)) calles.get(calle).tags = { ...calles.get(calle).tags, ...etiquetas }
// Giros que OSM no prohíbe pero no se pueden hacer: { restriccion, desde, desdeNodo?, via, hacia, motivo } se vuelve una relación.
correcciones
  .filter(correccion => correccion.restriccion)
  .forEach(({ restriccion, desde, desdeNodo, via, hacia }, indice) =>
    restricciones.set(`correccion-${indice}`, {
      type: 'relation',
      id: `correccion-${indice}`,
      tags: { type: 'restriction', restriction: restriccion },
      members: [
        { type: 'way', ref: desde, role: 'from', desdeNodo },
        { type: 'node', ref: via, role: 'via' },
        { type: 'way', ref: hacia, role: 'to' },
      ],
    }),
  )
console.log(`${correcciones.length} correcciones de OSM`)

const latitudes = [...nodos.values()].map(nodo => nodo.lat)
const longitudes = [...nodos.values()].map(nodo => nodo.lon)
const minimo = valores => valores.reduce((a, b) => (b < a ? b : a))
const maximo = valores => valores.reduce((a, b) => (b > a ? b : a))
const area = {
  sur: minimo(latitudes),
  norte: maximo(latitudes),
  oeste: minimo(longitudes),
  este: maximo(longitudes),
}

const datos = construirGrafo([...nodos.values(), ...calles.values(), ...restricciones.values()], {
  area,
  extremos: [],
})
datos.meta = { area }
mkdirSync(dirname(DESTINO), { recursive: true })
const texto = JSON.stringify(datos)
writeFileSync(DESTINO, texto)
console.log(
  `${datos.nodos.lat.length} cruces, ${datos.aristas.desde.length} tramos, ${datos.giros.length} giros prohibidos, ${(texto.length / 1e6).toFixed(1)} MB`,
)
