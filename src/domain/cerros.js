import { escapeHtml } from '../core/util.js'
import { cerros } from '../data/dataset.js'
import { fit } from '../map/map.js'
import { photoHtml } from '../ui/photos.js'
import { comunasText } from './metro.js'

export function cerroInfo(cerro) {
  const height = cerro.ele ? ` · ${cerro.ele.toLocaleString('es-CL')} m` : ''
  return `<p><b>${escapeHtml(cerro.name)}</b>${height} · ${escapeHtml(cerro.tipo)} · ${comunasText(cerro)}</p>
    <p class="muted">${escapeHtml(cerro.desc)}</p>${photoHtml('c:' + cerro.name)}`
}

export const fitCerros = () => fit(L.latLngBounds(cerros.map(cerro => [cerro.lat, cerro.lon])).pad(0.03), 12)
