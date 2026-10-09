import { escapeHtml } from '../core/util.js'
import { LINE_IDS, METRO_LINES, REGIONS, labelPoint, stations, streetMidVertex } from '../data/dataset.js'
import { layer } from './map.js'

export const COLORS = {
  base: '#94a3b8',
  fill: '#cbd5e1',
  hi: '#f59e0b',
  ok: '#16a34a',
  ok2: '#84cc16',
  mid: '#f59e0b',
  bad: '#dc2626',
  street: '#2563eb',
}
export const SEGMENT_COLORS = ['#2563eb', '#db2777', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04']
export const REGION_COLORS = ['#93c5fd', '#a7f3d0', '#fde68a', '#fbcfe8', '#c4b5fd', '#fdba74']

// ----- marcadores y etiquetas
export const divIcon = (cssClass, html = '', size = 18) =>
  L.divIcon({
    className: '',
    html: `<div class="${cssClass}">${html}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })

export const peakIcon = (cssClass = '') =>
  L.divIcon({
    className: '',
    html: `<div class="tri ${cssClass}"></div>`,
    iconSize: [18, 16],
    iconAnchor: [9, 14],
  })

export const parkIcon = (cssClass = '') =>
  L.divIcon({
    className: '',
    html: `<div class="tree ${cssClass}">🌲</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })

export const mapLabel = (latlng, text, cssClass = 'lbl') =>
  L.tooltip({ permanent: true, direction: 'center', className: cssClass, interactive: false })
    .setLatLng(latlng)
    .setContent(escapeHtml(text))

const lineLabel = (latlng, text) =>
  L.tooltip({ permanent: true, direction: 'top', className: 'lbl', offset: [0, -4] })
    .setLatLng(latlng)
    .setContent(escapeHtml(text))

// ----- polígonos: comunas y regiones comparten estilo base y manejo de clics
export function comunaLayer(features, { style, onClick, interactive = true } = {}) {
  const baseStyle = { color: '#ffffff', weight: 1.5, fillColor: COLORS.fill, fillOpacity: 0.55 }
  return L.geoJSON(
    { type: 'FeatureCollection', features },
    {
      pane: 'comunas',
      interactive,
      style: feature => ({ ...baseStyle, ...(style ? style(feature) : {}) }),
      onEachFeature(feature, polygon) {
        if (!onClick) return
        polygon.on('click', event => {
          L.DomEvent.stop(event)
          onClick(feature, polygon, event)
        })
      },
    },
  )
}

export const outlineComunas = features =>
  comunaLayer(features, {
    interactive: false,
    style: () => ({ color: '#64748b', weight: 1, fillOpacity: 0.04, fillColor: '#64748b', dashArray: '3 3' }),
  })

export function highlightComuna(feature, color = COLORS.hi) {
  comunaLayer([feature], {
    interactive: false,
    style: () => ({ fillColor: color, fillOpacity: 0.25, color: '#92400e', weight: 2 }),
  }).addTo(layer)
  mapLabel(labelPoint(feature), feature.properties.name, 'lbl big').addTo(layer)
}

export const regionLayer = options =>
  comunaLayer(REGIONS, {
    style: feature => ({
      color: '#475569',
      weight: 1,
      fillColor: REGION_COLORS[feature.properties.ord % REGION_COLORS.length],
      fillOpacity: 0.75,
    }),
    ...options,
  })

export const zoneBounds = zone => L.latLngBounds(zone.poly)

export function drawZone(zone, color = COLORS.hi, { lab = true, target = layer } = {}) {
  L.polygon(zone.poly, {
    pane: 'comunas',
    color,
    weight: 3,
    fillColor: color,
    fillOpacity: 0.25,
    interactive: false,
  }).addTo(target)
  if (lab) mapLabel(zone.c, zone.name, 'lbl big').addTo(target)
}

// ----- líneas: metro y calles
export function drawMetro(target, { dots = true, ids = LINE_IDS, weight = 4, opacity = 0.9 } = {}) {
  for (const id of ids)
    L.polyline(METRO_LINES[id].segs, {
      pane: 'metro',
      color: METRO_LINES[id].color,
      weight,
      opacity,
      interactive: false,
    }).addTo(target)
  if (!dots) return
  for (const station of stations.filter(station => station.lines.some(id => ids.includes(id))))
    L.circleMarker([station.lat, station.lon], {
      pane: 'metro',
      radius: 3.5,
      color: '#fff',
      weight: 1.5,
      fillColor: METRO_LINES[station.lines[0]].color,
      fillOpacity: 1,
      interactive: false,
    }).addTo(target)
}

// El borde blanco separa la calle del mapa base.
export function drawStreet(street, color, { weight = 5, labelText = null, target = layer } = {}) {
  L.polyline(street.lines, {
    pane: 'streets',
    color: '#fff',
    weight: weight + 4,
    opacity: 0.9,
    interactive: false,
  }).addTo(target)
  L.polyline(street.lines, { pane: 'streets', color, weight, interactive: false }).addTo(target)
  if (labelText) lineLabel(streetMidVertex(street), labelText).addTo(target)
}

export function drawNamedSegments(street, target = layer) {
  if (!street.tr) return
  const labeled = new Set()
  street.lines.forEach((line, lineIndex) => {
    const segment = street.tr.i[lineIndex]
    if (segment < 0) return
    const color = SEGMENT_COLORS[segment % SEGMENT_COLORS.length]
    L.polyline(line, { pane: 'streets', color, weight: 6, interactive: false }).addTo(target)
    if (labeled.has(segment) || line.length <= 3) return
    labeled.add(segment)
    lineLabel(line[Math.floor(line.length / 2)], street.tr.n[segment][0]).addTo(target)
  })
}
