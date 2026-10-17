// Cruces entre las calles del juego según OpenStreetMap: dos calles se cruzan (o una termina en la otra) solo si sus
// vías comparten un nodo. Un nodo compartido trae exactamente las mismas coordenadas en las dos vías de btiles/.
// En los cruces grandes, OpenStreetMap a veces une las calles con un tramo corto sin nombre (que btiles/ no trae): por eso
// también cuenta que el extremo de una vía quede a menos de KM_DE_UNION de otra calle, salvo en puentes y túneles.
// Los pares que se cortan en el mapa sin cruzarse (uno pasa sobre el otro) se anotan aparte ("a desnivel"): no son ni
// sí ni no, y el juego no los usa como respuesta.
// Uso (desde tools/, después de streets.js):  node cruces.js   → cruces.json
const fs = require('fs')
const lista = require('./streetlist.js')
const calles = require('./streets.json')

const KX = 92.9
const KY = 111.2
const km = (a, b) => Math.hypot((a[0] - b[0]) * KY, (a[1] - b[1]) * KX)
// Una vía es de la calle si tiene su nombre y pasa pegada a su trazado del juego.
const KM_DE_VIA_PEGADA = 0.03
const KM_DE_UNION = 0.02
// Puntos de cruce más cercanos que esto son el mismo cruce (calzadas dobles, rotondas chicas).
const KM_DE_MISMO_CRUCE = 0.3
const CELDA = 0.002

const esVia = calle => calle.kind === 'calle' || calle.kind === 'autopista'
const llaveDeCelda = (lat, lon) => `${Math.floor(lat / CELDA)},${Math.floor(lon / CELDA)}`

function agregarEnCelda(grilla, punto, valor) {
  const llave = llaveDeCelda(punto[0], punto[1])
  if (!grilla.has(llave)) grilla.set(llave, [])
  grilla.get(llave).push(valor)
}

function vecinosEnGrilla(grilla, punto) {
  const fila = Math.floor(punto[0] / CELDA)
  const columna = Math.floor(punto[1] / CELDA)
  const vecinos = []
  for (let f = fila - 1; f <= fila + 1; f++)
    for (let c = columna - 1; c <= columna + 1; c++) vecinos.push(...(grilla.get(`${f},${c}`) || []))
  return vecinos
}

function kmAlSegmento(punto, a, b) {
  const [px, py] = [punto[1] * KX, punto[0] * KY]
  const [ax, ay] = [a[1] * KX, a[0] * KY]
  const [dx, dy] = [b[1] * KX - ax, b[0] * KY - ay]
  const largo = dx * dx + dy * dy
  const t = largo ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo)) : 0
  return Math.hypot(ax + t * dx - px, ay + t * dy - py)
}

const vias = []
for (const archivo of fs.readdirSync('btiles'))
  for (const elemento of JSON.parse(fs.readFileSync('btiles/' + archivo)).elements)
    if (elemento.type === 'way' && elemento.tags?.highway && elemento.tags.name && elemento.geometry)
      vias.push({
        nombre: elemento.tags.name,
        puntos: elemento.geometry.map(p => [p.lat, p.lon]),
        aDesnivel: !!(elemento.tags.bridge || elemento.tags.tunnel),
      })

// Las vías de OpenStreetMap de cada calle del juego.
const delJuego = calles.filter(esVia)
const viasDeCalle = new Map()
for (const calle of delJuego) {
  const patron = new RegExp(lista.find(entrada => entrada[0] === calle.name)[1])
  const trazado = new Map()
  for (const linea of calle.lines) for (const punto of linea) agregarEnCelda(trazado, punto, punto)
  const pegada = punto => vecinosEnGrilla(trazado, punto).some(otro => km(punto, otro) < KM_DE_VIA_PEGADA)
  const propias = vias.filter(
    via =>
      patron.test(via.nombre) &&
      [via.puntos[0], via.puntos[Math.floor(via.puntos.length / 2)], via.puntos.at(-1)].some(pegada),
  )
  if (!propias.length) console.log('sin vías en btiles:', calle.name)
  viasDeCalle.set(calle.name, propias)
}

const puntosPorPar = new Map()
function anotarCruce(nombreA, nombreB, punto) {
  const par = [nombreA, nombreB].sort().join('\n')
  if (!puntosPorPar.has(par)) puntosPorPar.set(par, [])
  const puntos = puntosPorPar.get(par)
  if (!puntos.some(otro => km(otro, punto) < KM_DE_MISMO_CRUCE)) puntos.push([+punto[0].toFixed(5), +punto[1].toFixed(5)])
}

// 1) nodos compartidos
const callesPorNodo = new Map()
for (const [nombre, propias] of viasDeCalle)
  for (const via of propias)
    for (const punto of via.puntos) {
      const llave = punto.join(',')
      if (!callesPorNodo.has(llave)) callesPorNodo.set(llave, new Set())
      callesPorNodo.get(llave).add(nombre)
    }
for (const [llave, nombres] of callesPorNodo) {
  const punto = llave.split(',').map(Number)
  const lista = [...nombres]
  for (let i = 0; i < lista.length; i++)
    for (let j = i + 1; j < lista.length; j++) anotarCruce(lista[i], lista[j], punto)
}

// 2) extremos de vía a pocos metros de otra calle (unidas por un tramo sin nombre)
const segmentos = new Map()
for (const [nombre, propias] of viasDeCalle)
  for (const via of propias.filter(via => !via.aDesnivel))
    for (let i = 0; i < via.puntos.length - 1; i++)
      agregarEnCelda(segmentos, via.puntos[i], { nombre, a: via.puntos[i], b: via.puntos[i + 1] })
for (const [nombre, propias] of viasDeCalle)
  for (const via of propias.filter(via => !via.aDesnivel))
    for (const extremo of [via.puntos[0], via.puntos.at(-1)])
      for (const segmento of vecinosEnGrilla(segmentos, extremo))
        if (segmento.nombre !== nombre && kmAlSegmento(extremo, segmento.a, segmento.b) < KM_DE_UNION)
          anotarCruce(nombre, segmento.nombre, extremo)

const cruces = [...puntosPorPar].map(([par, pts]) => {
  const [a, b] = par.split('\n')
  return { a, b, pts }
})

// 3) pares cuyos trazados se cortan sin cruzarse: pasan uno sobre el otro
function seCortan(lineasA, lineasB) {
  for (const la of lineasA)
    for (let i = 0; i < la.length - 1; i++)
      for (const lb of lineasB)
        for (let j = 0; j < lb.length - 1; j++) {
          const [p, q, r, s] = [la[i], la[i + 1], lb[j], lb[j + 1]].map(([lat, lon]) => [lon * KX, lat * KY])
          const d1 = [q[0] - p[0], q[1] - p[1]]
          const d2 = [s[0] - r[0], s[1] - r[1]]
          const den = d1[0] * d2[1] - d1[1] * d2[0]
          if (Math.abs(den) < 1e-12) continue
          const t = ((r[0] - p[0]) * d2[1] - (r[1] - p[1]) * d2[0]) / den
          const u = ((r[0] - p[0]) * d1[1] - (r[1] - p[1]) * d1[0]) / den
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true
        }
  return false
}
const conCruce = new Set(puntosPorPar.keys())
const aDesnivel = []
for (let i = 0; i < delJuego.length; i++)
  for (let j = i + 1; j < delJuego.length; j++) {
    const par = [delJuego[i].name, delJuego[j].name].sort()
    if (!conCruce.has(par.join('\n')) && seCortan(delJuego[i].lines, delJuego[j].lines)) aDesnivel.push(par)
  }

fs.writeFileSync('cruces.json', JSON.stringify({ cruces, aDesnivel }))
console.log('cruces', cruces.length, '· a desnivel', aDesnivel.length)
