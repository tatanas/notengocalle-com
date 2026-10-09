// Los puntos son [lat, lon]. Las distancias usan una proyección plana, válida a la latitud de Santiago.
export const KM_PER_DEG_LON = 92.9
export const KM_PER_DEG_LAT = 111.2

export const distanceKm = (a, b) => Math.hypot((a[1] - b[1]) * KM_PER_DEG_LON, (a[0] - b[0]) * KM_PER_DEG_LAT)

// Para el mapa de Chile completo, donde la proyección plana de Santiago ya no sirve.
export const distanceKmAnyLatitude = (a, b) =>
  Math.hypot(
    (a[0] - b[0]) * KM_PER_DEG_LAT,
    (a[1] - b[1]) * KM_PER_DEG_LAT * Math.cos((b[0] * Math.PI) / 180),
  )

// lines = [[[lat, lon], ...], ...]
export function distanceToPolyline(point, lines) {
  let best = Infinity
  for (const line of lines)
    for (let i = 0; i < line.length - 1; i++) {
      const ax = (line[i][1] - point[1]) * KM_PER_DEG_LON
      const ay = (line[i][0] - point[0]) * KM_PER_DEG_LAT
      const dx = (line[i + 1][1] - point[1]) * KM_PER_DEG_LON - ax
      const dy = (line[i + 1][0] - point[0]) * KM_PER_DEG_LAT - ay
      const lengthSq = dx * dx + dy * dy
      const t = lengthSq ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq)) : 0
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
    }
  return best
}

const crossesRay = (a, b, x, y) =>
  a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]

function insideRing(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    if (crossesRay(ring[i], ring[j], x, y)) inside = !inside
  return inside
}

// GeoJSON guarda [lon, lat]
export function pointInFeature(lat, lon, feature) {
  const { type, coordinates } = feature.geometry
  const polygons = type === 'Polygon' ? [coordinates] : coordinates
  return polygons.some(polygon => insideRing(polygon[0], lon, lat))
}

// polygon = [[lat, lon], ...]
export const pointInPolygon = (point, polygon) =>
  insideRing(
    polygon.map(([lat, lon]) => [lon, lat]),
    point[1],
    point[0],
  )

export function nearestBy(items, origin, positionOf, count, exclude) {
  return items
    .filter(item => !exclude(item))
    .map(item => ({ item, distance: distanceKm(origin, positionOf(item)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
    .map(entry => entry.item)
}
