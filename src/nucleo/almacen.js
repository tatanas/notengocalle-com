const PREFIJO = 'ntc:'

export const almacen = {
  get(llave, respaldo) {
    try {
      const crudo = localStorage.getItem(PREFIJO + llave)
      return crudo ? JSON.parse(crudo) : respaldo
    } catch {
      return respaldo
    }
  },
  set(llave, valor) {
    try {
      localStorage.setItem(PREFIJO + llave, JSON.stringify(valor))
    } catch {
      // sin almacenamiento (modo privado, cuota llena): el juego sigue, solo no recuerda
    }
  },
}

const PREFERENCIAS_POR_DEFECTO = {
  scope: 'core',
  // Preguntas por ronda: la de cada grupo de juegos (lengths) o, si no eligió, esta (len).
  len: 20,
  lengths: {},
  cats: null,
  lines: null,
  strict: false,
  ownStreets: true,
  // Nivel de "¿Dónde estás?" (facil, medio, dificil o extremo) para una ronda que no traiga el suyo (las del menú lo traen).
  nivelStreetView: 'facil',
  // Punto propio de la práctica de ruteo en auto: { nombre, lat, lon, sentido: 'desde' | 'hacia' } o null.
  puntoDeRuteo: null,
  // Regiones que se practican en "Comunas de Chile" (nombres de región) o null para todas.
  regiones: null,
  // La práctica siempre es fácil (bordes de las comunas y líneas del metro); las rondas oficiales, difíciles.
}
const LARGO_TODAS = 999
// Antes se podía elegir 10, 15, 20 o 30: ahora 10, 20 o todas (los otros valores guardados pasan a 20).
const largoSimplificado = largo =>
  largo >= LARGO_TODAS ? LARGO_TODAS : largo === 10 ? 10 : PREFERENCIAS_POR_DEFECTO.len
const guardado = almacen.get('settings', {})
const preferencias = {
  ...PREFERENCIAS_POR_DEFECTO,
  ...guardado,
  easy: true,
  strict: false, // el modo estricto se retiró del menú
  len: largoSimplificado(guardado.len ?? PREFERENCIAS_POR_DEFECTO.len),
  lengths: Object.fromEntries(
    Object.entries(guardado.lengths ?? {}).map(([grupo, largo]) => [grupo, largoSimplificado(largo)]),
  ),
}

let reglasDeRonda = null

// Lo que lee el juego: las preferencias del usuario, salvo lo que fije la ronda en curso.
export const ajustes = new Proxy(preferencias, {
  get: (preferenciasGuardadas, llave) =>
    reglasDeRonda && llave in reglasDeRonda ? reglasDeRonda[llave] : preferenciasGuardadas[llave],
})

export const largoPara = grupo => ajustes.lengths[grupo] ?? ajustes.len

export const guardarAjustes = () => almacen.set('settings', preferencias)

export function aplicarReglasDeRonda(reglas) {
  reglasDeRonda = reglas
}
