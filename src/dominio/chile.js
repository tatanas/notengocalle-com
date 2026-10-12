import { CHILE } from '../datos/datos.js'
import { escaparHtml } from '../nucleo/utilidades.js'

export const textoDeRegion = f =>
  `<p><b>Región de ${escaparHtml(f.properties.name)}</b> (${f.properties.rom}) — capital: <b>${escaparHtml(f.properties.cap)}</b></p><p class="muted">Ciudades: ${CHILE.cities
    .filter(c => c.region === f.properties.name)
    .map(c => escaparHtml(c.name) + (c.pop ? ' (' + c.pop.toLocaleString('es-CL') + ')' : ''))
    .join(', ')}</p>`
export const formatearPoblacion = n => (n ? n.toLocaleString('es-CL') + ' hab. aprox.' : '')
export const textoDeCiudad = c =>
  `<p><b>${escaparHtml(c.name)}</b> — región de <b>${escaparHtml(c.region)}</b>${c.cap ? ' (capital regional)' : ''}${c.pop ? ` · ${formatearPoblacion(c.pop)}` : ''}</p>`
export const textoDeParque = p =>
  `<p><b>Parque Nacional ${escaparHtml(p.name)}</b> — región de <b>${escaparHtml(p.region)}</b></p>`
export const parqueLejano = p => /Rapa Nui|Juan Fernández/.test(p.name)
