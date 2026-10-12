import { ZONAS } from '../datos/datos.js'
import { escaparHtml } from '../nucleo/utilidades.js'
import { masCercanosSegun } from '../nucleo/geografia.js'
import { lineaDeZona } from './lugares.js'

export const infoDeZona = z =>
  `<p><b>${escaparHtml(z.name)}</b> — ${z.comunas.map(escaparHtml).join(' / ')}</p><p class="muted">${escaparHtml(z.desc)}</p>${lineaDeZona(z)}`
export const zonasCercanas = (z, n) =>
  masCercanosSegun(
    ZONAS,
    z.c,
    x => x.c,
    n,
    x => x === z,
  )
