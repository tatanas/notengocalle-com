import { distanciaKmCualquierLatitud } from '../nucleo/geografia.js'
import { COMUNAS_DE_CHILE, comunasDeLaRegion } from '../datos/comunasDeChile.js'

// Alternativas incorrectas creíbles para "¿Qué comuna es esta?": las comunas más cercanas de la misma región (si la región tiene
// pocas, también las de más allá).
export function distractoresDeComunaDeChile(comuna, cantidad = 3) {
  const distancia = otra => distanciaKmCualquierLatitud(comuna.lab, otra.lab)
  const porCercania = lista =>
    lista.filter(otra => otra !== comuna).sort((a, b) => distancia(a) - distancia(b))
  const deLaRegion = porCercania(comunasDeLaRegion(comuna.region))
  const deOtras = porCercania(COMUNAS_DE_CHILE.filter(otra => otra.region !== comuna.region))
  return [...deLaRegion, ...deOtras].slice(0, cantidad)
}
