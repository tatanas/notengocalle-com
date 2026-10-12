import { escaparHtml } from '../nucleo/utilidades.js'
import {
  IDS_DE_LINEA,
  LINEAS_DE_METRO,
  REGIONES,
  puntoDeEtiqueta,
  estaciones,
  verticeMedioDeCalle,
} from '../datos/datos.js'
import { capa } from './mapa.js'

export const COLORES = {
  base: '#94a3b8',
  fill: '#cbd5e1',
  hi: '#f59e0b',
  ok: '#16a34a',
  ok2: '#84cc16',
  mid: '#f59e0b',
  bad: '#dc2626',
  street: '#2563eb',
}
export const COLORES_DE_TRAMOS = ['#2563eb', '#db2777', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04']
export const COLORES_DE_REGIONES = ['#93c5fd', '#a7f3d0', '#fde68a', '#fbcfe8', '#c4b5fd', '#fdba74']

// ----- marcadores y etiquetas
export const iconoDiv = (claseCss, html = '', tamano = 18) =>
  L.divIcon({
    className: '',
    html: `<div class="${claseCss}">${html}</div>`,
    iconSize: [tamano, tamano],
    iconAnchor: [tamano / 2, tamano / 2],
  })

export const iconoDeCumbre = (claseCss = '') =>
  L.divIcon({
    className: '',
    html: `<div class="tri ${claseCss}"></div>`,
    iconSize: [18, 16],
    iconAnchor: [9, 14],
  })

export const iconoDeParque = (claseCss = '') =>
  L.divIcon({
    className: '',
    html: `<div class="tree ${claseCss}">🌲</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })

export const etiquetaDeMapa = (latlng, texto, claseCss = 'lbl') =>
  L.tooltip({ permanent: true, direction: 'center', className: claseCss, interactive: false })
    .setLatLng(latlng)
    .setContent(escaparHtml(texto))

const etiquetaDeLinea = (latlng, texto) =>
  L.tooltip({ permanent: true, direction: 'top', className: 'lbl', offset: [0, -4] })
    .setLatLng(latlng)
    .setContent(escaparHtml(texto))

// ----- polígonos: comunas y regiones comparten estilo base y manejo de clics
export function capaDeComunas(
  rasgos,
  { style: estilo, onClick: alHacerClic, interactive: interactivo = true } = {},
) {
  const estiloBase = { color: '#ffffff', weight: 1.5, fillColor: COLORES.fill, fillOpacity: 0.55 }
  return L.geoJSON(
    { type: 'FeatureCollection', features: rasgos },
    {
      pane: 'comunas',
      interactive: interactivo,
      style: rasgo => ({ ...estiloBase, ...(estilo ? estilo(rasgo) : {}) }),
      onEachFeature(rasgo, poligono) {
        if (!alHacerClic) return
        poligono.on('click', evento => {
          L.DomEvent.stop(evento)
          alHacerClic(rasgo, poligono, evento)
        })
      },
    },
  )
}

export const delinearComunas = rasgos =>
  capaDeComunas(rasgos, {
    interactive: false,
    style: () => ({ color: '#64748b', weight: 1, fillOpacity: 0.04, fillColor: '#64748b', dashArray: '3 3' }),
  })

export function resaltarComuna(rasgo, color = COLORES.hi) {
  capaDeComunas([rasgo], {
    interactive: false,
    style: () => ({ fillColor: color, fillOpacity: 0.25, color: '#92400e', weight: 2 }),
  }).addTo(capa)
  etiquetaDeMapa(puntoDeEtiqueta(rasgo), rasgo.properties.name, 'lbl big').addTo(capa)
}

export const capaDeRegiones = opciones =>
  capaDeComunas(REGIONES, {
    style: rasgo => ({
      color: '#475569',
      weight: 1,
      fillColor: COLORES_DE_REGIONES[rasgo.properties.ord % COLORES_DE_REGIONES.length],
      fillOpacity: 0.75,
    }),
    ...opciones,
  })

export const limitesDeZona = zona => L.latLngBounds(zona.poly)

export function dibujarZona(zona, color = COLORES.hi, { lab: etiq = true, target: objetivo = capa } = {}) {
  L.polygon(zona.poly, {
    pane: 'comunas',
    color,
    weight: 3,
    fillColor: color,
    fillOpacity: 0.25,
    interactive: false,
  }).addTo(objetivo)
  if (etiq) etiquetaDeMapa(zona.c, zona.name, 'lbl big').addTo(objetivo)
}

// ----- líneas: metro y calles
export function dibujarMetro(
  objetivo,
  { dots: puntitos = true, ids = IDS_DE_LINEA, weight: peso = 4, opacity: opacidad = 0.9 } = {},
) {
  for (const id of ids)
    L.polyline(LINEAS_DE_METRO[id].segs, {
      pane: 'metro',
      color: LINEAS_DE_METRO[id].color,
      weight: peso,
      opacity: opacidad,
      interactive: false,
    }).addTo(objetivo)
  if (!puntitos) return
  for (const estacion of estaciones.filter(estacion => estacion.lines.some(id => ids.includes(id))))
    L.circleMarker([estacion.lat, estacion.lon], {
      pane: 'metro',
      radius: 3.5,
      color: '#fff',
      weight: 1.5,
      fillColor: LINEAS_DE_METRO[estacion.lines[0]].color,
      fillOpacity: 1,
      interactive: false,
    }).addTo(objetivo)
}

// Lo que la calle sigue más allá de lo dibujado (hacia Valparaíso, San Antonio…): línea segmentada.
export const estiloDeContinuacion = (color, peso) => ({
  pane: 'streets',
  color,
  weight: peso,
  opacity: 0.65,
  dashArray: '6 9',
  interactive: false,
})

// El borde blanco separa la calle del mapa base.
export function dibujarCalle(
  calle,
  color,
  { weight: peso = 5, labelText: textoDeEtiqueta = null, target: objetivo = capa } = {},
) {
  L.polyline(calle.lines, {
    pane: 'streets',
    color: '#fff',
    weight: peso + 4,
    opacity: 0.9,
    interactive: false,
  }).addTo(objetivo)
  L.polyline(calle.lines, { pane: 'streets', color, weight: peso, interactive: false }).addTo(objetivo)
  for (const linea of calle.ext || [])
    L.polyline(linea, estiloDeContinuacion(color, peso - 1)).addTo(objetivo)
  if (textoDeEtiqueta) etiquetaDeLinea(verticeMedioDeCalle(calle), textoDeEtiqueta).addTo(objetivo)
}

export function dibujarTramosConNombre(calle, objetivo = capa) {
  if (!calle.tr) return
  const conEtiqueta = new Set()
  calle.lines.forEach((linea, indiceDeLinea) => {
    const tramo = calle.tr.i[indiceDeLinea]
    if (tramo < 0) return
    const color = COLORES_DE_TRAMOS[tramo % COLORES_DE_TRAMOS.length]
    L.polyline(linea, { pane: 'streets', color, weight: 6, interactive: false }).addTo(objetivo)
    if (conEtiqueta.has(tramo) || linea.length <= 3) return
    conEtiqueta.add(tramo)
    etiquetaDeLinea(linea[Math.floor(linea.length / 2)], calle.tr.n[tramo][0]).addTo(objetivo)
  })
}
