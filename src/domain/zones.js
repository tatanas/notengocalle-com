import { ZONES } from '../data/dataset.js'
import { escapeHtml } from '../core/util.js'
import { nearestBy } from '../core/geo.js'
import { zoneLine } from './landmarks.js'

export const zoneInfo = z =>
  `<p><b>${escapeHtml(z.name)}</b> — ${z.comunas.map(escapeHtml).join(' / ')}</p><p class="muted">${escapeHtml(z.desc)}</p>${zoneLine(z)}`
export const zonesNear = (z, n) =>
  nearestBy(
    ZONES,
    z.c,
    x => x.c,
    n,
    x => x === z,
  )
