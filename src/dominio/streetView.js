// Cómo se puntúa "¿Dónde estás?": de 0 a 5 puntos según qué tan cerca quedó el toque del punto exacto.
export const PUNTOS_MAXIMOS = 5

// [hasta qué distancia (km) vale el tramo, puntos]
const TRAMOS = [
  [0.1, 5],
  [0.5, 4],
  [1, 3],
  [1.5, 2],
  [2, 1],
]

export const puntajeDeStreetView = distanciaKm => TRAMOS.find(([limite]) => distanciaKm <= limite)?.[1] ?? 0

// Con 3 puntos o más (a menos de 1 km) la pregunta cuenta como acertada.
const PUNTOS_PARA_ACERTAR = 3
export const esAciertoDeStreetView = distanciaKm => puntajeDeStreetView(distanciaKm) >= PUNTOS_PARA_ACERTAR
