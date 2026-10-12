import { escaparHtml } from '../nucleo/utilidades.js'
import { cerros } from '../datos/datos.js'
import { encuadrar } from '../mapa/mapa.js'
import { htmlDeFoto } from '../interfaz/fotos.js'
import { textoDeComunas } from './metro.js'

export function infoDeCerro(cerro) {
  const altura = cerro.ele ? ` · ${cerro.ele.toLocaleString('es-CL')} m` : ''
  return `<p><b>${escaparHtml(cerro.name)}</b>${altura} · ${escaparHtml(cerro.tipo)} · ${textoDeComunas(cerro)}</p>
    <p class="muted">${escaparHtml(cerro.desc)}</p>${htmlDeFoto('c:' + cerro.name)}`
}

export const encuadrarCerros = () =>
  encuadrar(L.latLngBounds(cerros.map(cerro => [cerro.lat, cerro.lon])).pad(0.03), 12)
