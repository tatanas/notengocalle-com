import { vias } from '../datos/datos.js'
import { almacen } from '../nucleo/almacen.js'
import { distanciaALinea, distanciaKm } from '../nucleo/geografia.js'

// Rutas en auto calculadas en el momento con OSRM, para el punto propio del jugador. Arma los mismos pasos que
// tools/steproutes.js deja precalculados para las rutas entre lugares: las calles principales, en orden.
const OSRM = 'https://router.project-osrm.org/route/v1/driving/'

const NOMBRES_UNIFICADOS = [
  [/Vespucio/, 'Américo Vespucio'],
  [/Costanera Norte/, 'Costanera Norte'],
  [/Libertador Bernardo O.Higgins/, 'Alameda'],
  [/Presidente Kennedy/, 'Av. Kennedy'],
  [/Autopista Central|General Velásquez/, 'Autopista Central'],
  [/Vicuña Mackenna/, 'Av. Vicuña Mackenna'],
  [/^Ruta 68|Autopista del Pacífico/, 'Ruta 68'],
  [/^Ruta 78|Autopista del Sol/, 'Autopista del Sol'],
  [/^Ruta 5|Panamericana/, 'Ruta 5'],
  [/Gran Avenida/, 'Gran Avenida'],
  [/^Av.*Padre Hurtado/, 'Av. Padre Hurtado'],
  [/^Av.*Manquehue/, 'Av. Manquehue'],
  [/Costanera Sur|Escrivá de Balaguer/, 'Costanera Sur (Escrivá de Balaguer)'],
  [/Túnel San Cristóbal/, 'Túnel San Cristóbal'],
]

// El nombre de una calle como lo muestran los juegos de ruteo: "Av. X", sin el "Norte" o "Sur" de las avenidas y con
// un solo nombre para las que tienen varios.
export function nombreDeRuteo(nombreDeOsm) {
  const nombre = nombreDeOsm
    .replace(/^Avenida /, 'Av. ')
    .replace(/ Lateral$/, '')
    .replace(/^Caletera /, '')
    .trim()
  for (const [patron, unificado] of NOMBRES_UNIFICADOS) if (patron.test(nombre)) return unificado
  return nombre.replace(/ (Norte|Sur|Oriente|Poniente)$/, sufijo => (/^Av\./.test(nombre) ? '' : sufijo))
}

export const nombreDeRuteoDeCalle = calle =>
  nombreDeRuteo(calle.name.replace(/\s*\(.*\)/, '').replace(/^Av\. /, 'Avenida '))

let callesDelJuego = null
const esCallePrincipal = nombre => (callesDelJuego ??= new Set(vias().map(nombreDeRuteoDeCalle))).has(nombre)

// Un tramo de calle cuenta como paso si es largo, o algo largo y de una calle principal; lo demás se pega al anterior.
const METROS_DE_TRAMO_LARGO = 500
const METROS_DE_TRAMO_PRINCIPAL = 250
const PASOS_MINIMOS = 2

// Los caminos sin nombre del comienzo y del final (estacionamientos, accesos de un recinto) no son parte de la ruta: se
// parte donde se sale a una calle y se llega donde se la deja.
const esCaminoInterno = paso => !paso.name && !paso.ref && !paso.rotary_name
function sinCaminosInternos(pasosDeOsrm) {
  let inicio = 0
  let fin = pasosDeOsrm.length
  while (inicio < fin && esCaminoInterno(pasosDeOsrm[inicio])) inicio++
  while (fin > inicio && esCaminoInterno(pasosDeOsrm[fin - 1])) fin--
  return pasosDeOsrm.slice(inicio, fin)
}

function tramosConNombre(pasosDeOsrm) {
  const tramos = []
  for (const paso of pasosDeOsrm) {
    const nombreDeOsm = paso.rotary_name || paso.name || (paso.ref ? 'Ruta ' + paso.ref.split(';')[0] : '')
    const nombre = nombreDeOsm ? nombreDeRuteo(nombreDeOsm) : ''
    const geometria = paso.geometry.coordinates.map(([lon, lat]) => [lat, lon])
    const ultimo = tramos.at(-1)
    if (ultimo && (!nombre || nombre === ultimo.nombre)) {
      ultimo.metros += paso.distance
      ultimo.g.push(...geometria)
    } else tramos.push({ nombre, metros: paso.distance, g: geometria })
  }
  return tramos
}

function pegar(destino, tramo, { alInicio = false } = {}) {
  destino.metros += tramo.metros
  destino.g = alInicio ? tramo.g.concat(destino.g) : destino.g.concat(tramo.g)
}

function pasosPrincipales(tramos) {
  const pasos = []
  for (const tramo of tramos) {
    const relevante =
      tramo.nombre &&
      (tramo.metros >= METROS_DE_TRAMO_LARGO ||
        (tramo.metros >= METROS_DE_TRAMO_PRINCIPAL &&
          (esCallePrincipal(tramo.nombre) || /^Rotonda/.test(tramo.nombre))))
    const ultimo = pasos.at(-1)
    if (relevante && ultimo?.nombre === tramo.nombre) pegar(ultimo, tramo)
    else if (relevante) pasos.push({ ...tramo })
    else if (ultimo) pegar(ultimo, tramo)
    else pasos.push({ ...tramo, nombre: '' })
  }
  // El trayecto inicial por calles chicas se pega a la primera calle relevante.
  if (pasos.length > 1 && !pasos[0].nombre) pegar(pasos[1], pasos.shift(), { alInicio: true })
  if (pasos.length < PASOS_MINIMOS || pasos.some(paso => !paso.nombre)) return null
  return pasos
}

// Para dibujar basta un punto cada tantos metros.
const PASO_DE_DIBUJO_KM = 0.02
function aligerar(geometria) {
  const liviana = [geometria[0]]
  for (const punto of geometria.slice(1, -1))
    if (distanciaKm(liviana.at(-1), punto) >= PASO_DE_DIBUJO_KM) liviana.push(punto)
  liviana.push(geometria.at(-1))
  return liviana
}

// Alternativas incorrectas: calles del juego que pasan cerca de donde empieza el paso.
const RADIO_DE_ALTERNATIVAS_KM = 1
const ALTERNATIVAS_POR_PASO = 6
function alternativasCercanas(inicio, nombresDeLaRuta) {
  const cercanas = vias()
    .map(calle => ({ nombre: nombreDeRuteoDeCalle(calle), km: distanciaALinea(inicio, calle.lines) }))
    .filter(({ nombre, km }) => km < RADIO_DE_ALTERNATIVAS_KM && !nombresDeLaRuta.has(nombre))
    .sort((a, b) => a.km - b.km)
    .map(({ nombre }) => nombre)
  return [...new Set(cercanas)].slice(0, ALTERNATIVAS_POR_PASO)
}

async function pedirRuta(desde, hasta) {
  const respuesta = await fetch(
    `${OSRM}${desde.lon},${desde.lat};${hasta.lon},${hasta.lat}?steps=true&overview=false&geometries=geojson`,
  )
  if (!respuesta.ok) throw new Error(`OSRM respondió ${respuesta.status}`)
  const [ruta] = (await respuesta.json()).routes ?? []
  if (!ruta) return null
  const pasos = pasosPrincipales(tramosConNombre(sinCaminosInternos(ruta.legs[0].steps)))
  if (!pasos) return null
  const nombresDeLaRuta = new Set(pasos.map(paso => paso.nombre))
  return {
    km: +(ruta.distance / 1000).toFixed(1),
    min: Math.round(ruta.duration / 60),
    steps: pasos.map(paso => ({
      n: paso.nombre,
      km: +(paso.metros / 1000).toFixed(1),
      g: aligerar(paso.g),
      x: alternativasCercanas(paso.g[0], nombresDeLaRuta),
    })),
  }
}

// Las rutas ya calculadas se guardan en el navegador: OSRM público es solo para uso liviano.
const RUTAS_GUARDADAS_MAXIMAS = 80
const guardadas = almacen.get('rutasPropias', {})
const enCurso = new Map()
const llaveDeRuta = (desde, hasta) =>
  [desde.lat, desde.lon, hasta.lat, hasta.lon].map(numero => numero.toFixed(5)).join(',')

function guardar(llave, ruta) {
  guardadas[llave] = ruta
  const llaves = Object.keys(guardadas)
  for (const vieja of llaves.slice(0, Math.max(0, llaves.length - RUTAS_GUARDADAS_MAXIMAS)))
    delete guardadas[vieja]
  almacen.set('rutasPropias', guardadas)
}

// { km, min, steps: [{ n, km, g, x }] } como las rutas precalculadas, o null si la ruta no sirve para el juego
// (muy corta o por calles sin nombre). Falla si no hay conexión con OSRM.
export function rutaEnAuto(desde, hasta) {
  const llave = llaveDeRuta(desde, hasta)
  if (llave in guardadas) return Promise.resolve(guardadas[llave])
  if (!enCurso.has(llave))
    enCurso.set(
      llave,
      pedirRuta(desde, hasta)
        .then(ruta => {
          guardar(llave, ruta)
          return ruta
        })
        .finally(() => enCurso.delete(llave)),
    )
  return enCurso.get(llave)
}
