import { CHILE } from '../data/dataset.js'
import { escapeHtml } from '../core/util.js'

export const regionText = f =>
  `<p><b>Región de ${escapeHtml(f.properties.name)}</b> (${f.properties.rom}) — capital: <b>${escapeHtml(f.properties.cap)}</b></p><p class="muted">Ciudades: ${CHILE.cities
    .filter(c => c.region === f.properties.name)
    .map(c => escapeHtml(c.name) + (c.pop ? ' (' + c.pop.toLocaleString('es-CL') + ')' : ''))
    .join(', ')}</p>`
export const formatPopulation = n => (n ? n.toLocaleString('es-CL') + ' hab. aprox.' : '')
export const cityText = c =>
  `<p><b>${escapeHtml(c.name)}</b> — región de <b>${escapeHtml(c.region)}</b>${c.cap ? ' (capital regional)' : ''}${c.pop ? ` · ${formatPopulation(c.pop)}` : ''}</p>`
export const parkText = p =>
  `<p><b>Parque Nacional ${escapeHtml(p.name)}</b> — región de <b>${escapeHtml(p.region)}</b></p>`
export const farPark = p => /Rapa Nui|Juan Fernández/.test(p.name)
