import { masCercanosSegun } from '../nucleo/geografia.js'
import { mezclar } from '../nucleo/utilidades.js'
import { comunaPorNombre, puntoDeEtiqueta, comunasDelAlcance } from '../datos/datos.js'

// Alternativas incorrectas creíbles: primero las vecinas; si faltan, las más cercanas.
export function distractoresDeComuna(nombre, cantidad = 3) {
  const comuna = comunaPorNombre[nombre]
  const enJuego = comunasDelAlcance().map(rasgo => rasgo.properties.name)
  const vecinas = mezclar(comuna.properties.nb.filter(vecina => enJuego.includes(vecina)))
  if (vecinas.length >= cantidad) return vecinas.slice(0, cantidad)
  const cercanos = masCercanosSegun(
    comunasDelAlcance(),
    puntoDeEtiqueta(comuna),
    puntoDeEtiqueta,
    8,
    rasgo => rasgo.properties.name === nombre || vecinas.includes(rasgo.properties.name),
  ).map(rasgo => rasgo.properties.name)
  return [...vecinas, ...mezclar(cercanos)].slice(0, cantidad)
}
