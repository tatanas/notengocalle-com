// Cómo se puntúa "¿Dónde estás?": de 0 a 5 puntos según qué tan cerca quedó el toque del punto exacto.
export const PUNTOS_MAXIMOS = 5

// [distancia (km) a la que se acaba el tramo, puntos]
const TRAMOS = [
  [0.05, 5],
  [0.1, 4],
  [0.3, 3],
  [0.6, 2],
  [1, 1],
]

export const puntajeDeStreetView = distanciaKm => TRAMOS.find(([limite]) => distanciaKm < limite)?.[1] ?? 0

// Con 3 puntos o más (a menos de 300 m) la pregunta cuenta como acertada.
const PUNTOS_PARA_ACERTAR = 3
export const esAciertoDeStreetView = distanciaKm => puntajeDeStreetView(distanciaKm) >= PUNTOS_PARA_ACERTAR
