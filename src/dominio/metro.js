import { ajustes } from '../nucleo/almacen.js'
import { escaparHtml } from '../nucleo/utilidades.js'
import { IDS_DE_LINEA, LINEAS_DE_METRO, estaciones } from '../datos/datos.js'

export const lineasElegidas = () => (ajustes.lines?.length ? ajustes.lines : IDS_DE_LINEA)

export const conjuntoDeMetro = () =>
  estaciones.filter(estacion => estacion.lines.some(id => lineasElegidas().includes(id)))

export const nombreDeLinea = id => id.replace('L', 'Línea ')

export const pildoraDeLinea = id =>
  `<span class="lpill" style="background:${LINEAS_DE_METRO[id].color}">${id}</span>`

export const etiquetaDeEstacion = estacion =>
  `${estacion.name} ${estacion.lines.map(pildoraDeLinea).join('')}`

// "Providencia / Ñuñoa" para lo que queda justo en un límite comunal.
export const textoDeComunas = sitio => [sitio.comuna || '', ...(sitio.alt || [])].map(escaparHtml).join(' / ')
