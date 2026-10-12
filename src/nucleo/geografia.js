// Los puntos son [lat, lon]. Las distancias usan una proyección plana, válida a la latitud de Santiago.
export const KM_POR_GRADO_LONGITUD = 92.9
export const KM_POR_GRADO_LATITUD = 111.2

export const distanciaKm = (a, b) =>
  Math.hypot((a[1] - b[1]) * KM_POR_GRADO_LONGITUD, (a[0] - b[0]) * KM_POR_GRADO_LATITUD)

// Para el mapa de Chile completo, donde la proyección plana de Santiago ya no sirve.
export const distanciaKmCualquierLatitud = (a, b) =>
  Math.hypot(
    (a[0] - b[0]) * KM_POR_GRADO_LATITUD,
    (a[1] - b[1]) * KM_POR_GRADO_LATITUD * Math.cos((b[0] * Math.PI) / 180),
  )

// El punto de unas líneas más cercano a `point`, y a cuántos km queda.
export function puntoMasCercanoEnLineas(punto, lineas) {
  let mejor = { km: Infinity, point: null }
  for (const linea of lineas)
    for (let i = 0; i < linea.length - 1; i++) {
      const ax = (linea[i][1] - punto[1]) * KM_POR_GRADO_LONGITUD
      const ay = (linea[i][0] - punto[0]) * KM_POR_GRADO_LATITUD
      const dx = (linea[i + 1][1] - punto[1]) * KM_POR_GRADO_LONGITUD - ax
      const dy = (linea[i + 1][0] - punto[0]) * KM_POR_GRADO_LATITUD - ay
      const largoCuadrado = dx * dx + dy * dy
      const t = largoCuadrado ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largoCuadrado)) : 0
      const km = Math.hypot(ax + t * dx, ay + t * dy)
      if (km < mejor.km)
        mejor = {
          km,
          point: [
            linea[i][0] + t * (linea[i + 1][0] - linea[i][0]),
            linea[i][1] + t * (linea[i + 1][1] - linea[i][1]),
          ],
        }
    }
  return mejor
}

// lines = [[[lat, lon], ...], ...]
export function distanciaALinea(punto, lineas) {
  let mejor = Infinity
  for (const linea of lineas)
    for (let i = 0; i < linea.length - 1; i++) {
      const ax = (linea[i][1] - punto[1]) * KM_POR_GRADO_LONGITUD
      const ay = (linea[i][0] - punto[0]) * KM_POR_GRADO_LATITUD
      const dx = (linea[i + 1][1] - punto[1]) * KM_POR_GRADO_LONGITUD - ax
      const dy = (linea[i + 1][0] - punto[0]) * KM_POR_GRADO_LATITUD - ay
      const largoCuadrado = dx * dx + dy * dy
      const t = largoCuadrado ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largoCuadrado)) : 0
      mejor = Math.min(mejor, Math.hypot(ax + t * dx, ay + t * dy))
    }
  return mejor
}

const cruzaElRayo = (a, b, x, y) =>
  a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]

function dentroDelAnillo(anillo, x, y) {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++)
    if (cruzaElRayo(anillo[i], anillo[j], x, y)) dentro = !dentro
  return dentro
}

// GeoJSON guarda [lon, lat]
export function puntoEnRasgo(lat, lon, rasgo) {
  const { type: tipo, coordinates: coordenadas } = rasgo.geometry
  const poligonos = tipo === 'Polygon' ? [coordenadas] : coordenadas
  return poligonos.some(poligono => dentroDelAnillo(poligono[0], lon, lat))
}

// polygon = [[lat, lon], ...]
export const puntoEnPoligono = (punto, poligono) =>
  dentroDelAnillo(
    poligono.map(([lat, lon]) => [lon, lat]),
    punto[1],
    punto[0],
  )

export function masCercanosSegun(elementos, origen, posicionDe, cantidad, excluir) {
  return elementos
    .filter(elemento => !excluir(elemento))
    .map(elemento => ({ item: elemento, distance: distanciaKm(origen, posicionDe(elemento)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, cantidad)
    .map(entrada => entrada.item)
}
