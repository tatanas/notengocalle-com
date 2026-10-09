import { settings } from '../core/store.js'
import { escapeHtml } from '../core/util.js'
import { LINE_IDS, METRO_LINES, stations } from '../data/dataset.js'

export const selectedLines = () => (settings.lines?.length ? settings.lines : LINE_IDS)

export const metroPool = () =>
  stations.filter(station => station.lines.some(id => selectedLines().includes(id)))

export const lineName = id => id.replace('L', 'Línea ')

export const linePill = id => `<span class="lpill" style="background:${METRO_LINES[id].color}">${id}</span>`

export const stationLabel = station => `${station.name} ${station.lines.map(linePill).join('')}`

// "Providencia / Ñuñoa" para lo que queda justo en un límite comunal.
export const comunasText = place => [place.comuna || '', ...(place.alt || [])].map(escapeHtml).join(' / ')
