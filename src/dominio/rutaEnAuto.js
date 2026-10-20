import {
  URL_DE_CRUCES,
  URL_DE_TRAZA,
  completarAlternativas,
  consultaDeRuta,
  crucesPorNombrar,
  cuerpoDeLaTraza,
  cuerpoDeLosCruces,
  nombreDeRuteoDeCalle,
  rutaDelJuego,
} from '../../compartido/rutaEnAuto.js'
import { DATOS, vias } from '../datos/datos.js'
import { almacen } from '../nucleo/almacen.js'

// Rutas en auto calculadas en el momento con Valhalla, para el punto fijo del jugador. Arman los mismos pasos que
// tools/steproutes.js deja precalculados para las rutas entre lugares (compartido/rutaEnAuto.js).

export { nombreDeRuteoDeCalle }

let lineasPorNombre = null
export function lineasDeLasCallesDelJuego() {
  if (lineasPorNombre) return lineasPorNombre
  lineasPorNombre = new Map()
  for (const calle of vias()) {
    const nombre = nombreDeRuteoDeCalle(calle.name)
    lineasPorNombre.set(nombre, [...(lineasPorNombre.get(nombre) ?? []), ...calle.lines])
  }
  return lineasPorNombre
}

let nombresDeAutopistas = null
const autopistas = () =>
  (nombresDeAutopistas ??= new Set(
    vias()
      .filter(calle => calle.kind === 'autopista')
      .map(calle => nombreDeRuteoDeCalle(calle.name)),
  ))
export const esAutopista = nombre => autopistas().has(nombre)

// Lo que necesitan las decisiones de una ruta (src/dominio/decisionesEnAuto.js, juegos de ruteo en auto).
export const contextoDeLasDecisiones = () => ({
  esAutopista,
  salidas: DATOS.salidas ?? [],
})

// Por qué calles se ha salido del punto fijo del jugador en las rutas que ya se calcularon desde él: son las salidas que de
// verdad tiene, y sirven de alternativas en la primera pregunta ("¿por qué calle partes?").
const SALIDAS_CONOCIDAS_MAXIMAS = 12
const salidasDelPunto = almacen.get('salidasDelPunto', {})
const llaveDelPunto = punto => [punto.lat, punto.lon].map(numero => numero.toFixed(4)).join(',')
export const salidasConocidasDelPunto = punto => salidasDelPunto[llaveDelPunto(punto)] ?? []

function anotarSalidaDelPunto(punto, calle) {
  const conocidas = salidasConocidasDelPunto(punto)
  if (conocidas.includes(calle)) return
  salidasDelPunto[llaveDelPunto(punto)] = [...conocidas, calle].slice(-SALIDAS_CONOCIDAS_MAXIMAS)
  almacen.set('salidasDelPunto', salidasDelPunto)
}

const SIN_CAMINO = 400

async function pedirJson(url, cuerpo) {
  const respuesta = await fetch(
    url,
    cuerpo && {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    },
  )
  // Valhalla responde 400 cuando no hay camino entre los dos puntos: esa ruta no sirve, pero no es un error de conexión.
  if (respuesta.status === SIN_CAMINO) return null
  if (!respuesta.ok) throw new Error(`Valhalla respondió ${respuesta.status}`)
  return respuesta.json()
}

// Sin los nombres de las calles que salen de cada cruce la ruta sirve igual, solo con menos alternativas.
const nombresDeLosCruces = (puntos, cuerpo) => pedirJson(URL_DE_CRUCES, cuerpo(puntos)).catch(() => null)

async function pedirRuta(desde, hasta) {
  const viaje = (await pedirJson(consultaDeRuta(desde, hasta)))?.trip
  if (!viaje) return null
  const traza = await pedirJson(URL_DE_TRAZA, cuerpoDeLaTraza(viaje))
  const ruta = traza && rutaDelJuego(viaje, traza, { lineasPorNombre: lineasDeLasCallesDelJuego() })
  if (!ruta) return null
  const cruces = crucesPorNombrar(ruta)
  const respuestas = cruces.puntos.length ? await nombresDeLosCruces(cruces.puntos, cuerpoDeLosCruces) : null
  const completa = completarAlternativas(ruta, cruces, respuestas ?? [], {
    lineasPorNombre: lineasDeLasCallesDelJuego(),
    nombresDeAutopistas: autopistas(),
    esAutopista,
  })
  anotarSalidaDelPunto(desde, completa.steps[0].n)
  return completa
}

// Las rutas ya calculadas se guardan en el navegador: el servidor público de Valhalla es solo para uso liviano.
const RUTAS_GUARDADAS_MAXIMAS = 40
const guardadas = almacen.get('rutasEnAutoV2', {})
const enCurso = new Map()
const llaveDeRuta = (desde, hasta) =>
  [desde.lat, desde.lon, hasta.lat, hasta.lon].map(numero => numero.toFixed(5)).join(',')

function guardar(llave, ruta) {
  guardadas[llave] = ruta
  const llaves = Object.keys(guardadas)
  for (const vieja of llaves.slice(0, Math.max(0, llaves.length - RUTAS_GUARDADAS_MAXIMAS)))
    delete guardadas[vieja]
  almacen.set('rutasEnAutoV2', guardadas)
}

// { km, min, steps: [{ n, km, g, fin, c?, salida?, x, ent }] } como las rutas precalculadas, o null si la ruta no sirve para el
// juego (muy corta o por calles sin nombre). Falla si no hay conexión con Valhalla.
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
