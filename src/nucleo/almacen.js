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
  // Qué tan difícil es "¿Dónde estás?" en la práctica: facil, medio, dificil o extremo. La ronda oficial siempre es extremo.
  nivelStreetView: 'facil',
  // La práctica siempre es fácil (bordes de las comunas y líneas del metro); las rondas oficiales, difíciles.
}
const LARGO_TODAS = 999
// Antes se podía elegir 10, 15 o 30: ahora solo 20 o todas.
const largoSimplificado = largo => (largo >= LARGO_TODAS ? LARGO_TODAS : PREFERENCIAS_POR_DEFECTO.len)
const guardado = almacen.get('settings', {})
const preferencias = {
  ...PREFERENCIAS_POR_DEFECTO,
  ...guardado,
  easy: true,
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
