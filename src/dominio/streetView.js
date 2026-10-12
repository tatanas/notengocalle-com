// Cómo se puntúa "¿Dónde estás?": ubicación exacta = puntaje completo; hasta cierta distancia, el puntaje baja
// de a poco hasta la mitad; más allá, nada.
export const PUNTOS_MAXIMOS = 100
export const DISTANCIA_PERFECTA_KM = 0.02
export const DISTANCIA_MAXIMA_KM = 0.15

export const esAciertoDeStreetView = distanciaKm => distanciaKm <= DISTANCIA_MAXIMA_KM

export function puntajeDeStreetView(distanciaKm) {
  if (distanciaKm <= DISTANCIA_PERFECTA_KM) return PUNTOS_MAXIMOS
  if (distanciaKm > DISTANCIA_MAXIMA_KM) return 0
  const avance = (distanciaKm - DISTANCIA_PERFECTA_KM) / (DISTANCIA_MAXIMA_KM - DISTANCIA_PERFECTA_KM)
  return Math.round(PUNTOS_MAXIMOS * (1 - avance / 2))
}
