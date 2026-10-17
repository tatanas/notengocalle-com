import { consultaDeRuta, nombreDeRuteoDeCalle, rutaDelJuego } from '../../compartido/rutaEnAuto.js'
import { vias } from '../datos/datos.js'
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

const SIN_CAMINO = 400

async function pedirRuta(desde, hasta) {
  const respuesta = await fetch(consultaDeRuta(desde, hasta))
  // Valhalla responde 400 cuando no hay camino entre los dos puntos: esa ruta no sirve, pero no es un error de conexión.
  if (respuesta.status === SIN_CAMINO) return null
  if (!respuesta.ok) throw new Error(`Valhalla respondió ${respuesta.status}`)
  const { trip: viaje } = await respuesta.json()
  return viaje ? rutaDelJuego(viaje, { lineasPorNombre: lineasDeLasCallesDelJuego() }) : null
}

// Las rutas ya calculadas se guardan en el navegador: el servidor público de Valhalla es solo para uso liviano.
const RUTAS_GUARDADAS_MAXIMAS = 80
const guardadas = almacen.get('rutasEnAuto', {})
const enCurso = new Map()
const llaveDeRuta = (desde, hasta) =>
  [desde.lat, desde.lon, hasta.lat, hasta.lon].map(numero => numero.toFixed(5)).join(',')

function guardar(llave, ruta) {
  guardadas[llave] = ruta
  const llaves = Object.keys(guardadas)
  for (const vieja of llaves.slice(0, Math.max(0, llaves.length - RUTAS_GUARDADAS_MAXIMAS)))
    delete guardadas[vieja]
  almacen.set('rutasEnAuto', guardadas)
}

// { km, min, steps: [{ n, km, g, fin, c?, x }] } como las rutas precalculadas, o null si la ruta no sirve para el juego
// (muy corta o por calles sin nombre). Falla si no hay conexión con Valhalla.
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
