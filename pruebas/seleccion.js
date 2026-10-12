// Qué conjuntos de pruebas de navegador conviene correr según los archivos que cambiaron.
// El conjunto completo tarda más de 10 minutos: se reserva para cambios que tocan todo el juego.

const CONJUNTOS_DE_RONDAS = [
  'cronometro',
  'calles-propias',
  'rondas-oficiales',
  'confirmar-salida',
  'diseno-menu',
  'cuenta-regresiva',
  'ajuste-celular',
  'facil-dificil',
  'reiniciar-ronda',
  'categorias-ranking',
]
const CONJUNTOS_DEL_MOTOR = [
  'cronometro',
  'cuenta-regresiva',
  'reiniciar-ronda',
  'confirmar-salida',
  'facil-dificil',
  'rondas-oficiales',
]
const CONJUNTOS_DEL_RANKING = ['cuentas', 'categorias-ranking', 'rondas-oficiales']

// Prefijo de los ids de juego que juega cada archivo de src/juego/modos/, para que la prueba de humo juegue solo esos.
const PREFIJO_DE_JUEGO_POR_ARCHIVO = {
  comunas: 'com-',
  lugares: 'lm-',
  metro: 'mt-',
  calles: 'st-',
  rutas: 'rs-',
  chile: 'ch-',
  parques: 'pn-',
  conexiones: 'cx',
}

// Cambios que afectan a todo: no vale la pena adivinar qué probar.
const AFECTAN_A_TODO = [
  /^package(-lock)?\.json$/,
  /^vite\.config\./,
  /^index\.html$/,
  /^src\/main\.js$/,
  /^servidor\/esquema\.sql$/,
  /^pruebas\/(ejecutar|apoyo|seleccion)\.js$/,
]
const MUCHOS_ARCHIVOS = 30

// [patrón, conjuntos, ¿la prueba de humo juega todos los juegos?]
const REGLAS = [
  [/^src\/juego\/(engine|options|registry|pasos)\.js$/, CONJUNTOS_DEL_MOTOR, true],
  [/^src\/mapa\//, ['ajuste-celular', 'facil-dificil'], true],
  [/^src\/interfaz\/(inicio|navegacion)\.js$/, ['diseno-menu'], false],
  [/^src\/interfaz\/misCalles\.js$/, ['calles-propias'], false],
  [/^src\/interfaz\/(ranking|resultadoOficial|cuenta)\.js$/, CONJUNTOS_DEL_RANKING, false],
  [/^src\/cuenta\//, CONJUNTOS_DEL_RANKING, false],
  [/^(compartido|servidor|netlify)\//, CONJUNTOS_DEL_RANKING, false],
  [/^src\/interfaz\/fotos\.js$/, ['fotos'], false],
  [/^public\/data\//, ['rondas-oficiales', 'fotos'], true],
  [/^src\/(datos|dominio|nucleo|interfaz)\//, [], true],
  [/^pruebas\/conjuntos\/cuentas\.js$/, ['cuentas'], false],
  [/^pruebas\/conjuntos\/rondas\.js$/, CONJUNTOS_DE_RONDAS, false],
  [/^pruebas\/conjuntos\/humo\.js$/, [], true],
]

const prefijoDeJuego = archivo => {
  const coincidencia = archivo.match(/^src\/juego\/modos\/(\w+)\.js$/)
  return coincidencia ? (PREFIJO_DE_JUEGO_POR_ARCHIVO[coincidencia[1]] ?? null) : null
}

// Devuelve { todo, conjuntos, prefijosDeHumo }: prefijosDeHumo null = todos los juegos; [] = no correr la prueba de humo.
export function elegirConjuntos(archivos) {
  if (
    archivos.length > MUCHOS_ARCHIVOS ||
    archivos.some(archivo => AFECTAN_A_TODO.some(patron => patron.test(archivo)))
  )
    return { todo: true, conjuntos: [], prefijosDeHumo: null }

  const conjuntos = new Set()
  const prefijos = new Set()
  let hayHumo = false
  let humoConTodosLosJuegos = false
  for (const archivo of archivos) {
    const prefijo = prefijoDeJuego(archivo)
    if (prefijo) {
      prefijos.add(prefijo)
      hayHumo = true
      continue
    }
    if (/^src\/juego\/modos\//.test(archivo)) {
      hayHumo = humoConTodosLosJuegos = true
      continue
    }
    for (const [patron, conjuntosDeLaRegla, humoCompleto] of REGLAS) {
      if (!patron.test(archivo)) continue
      conjuntosDeLaRegla.forEach(conjunto => conjuntos.add(conjunto))
      if (humoCompleto) hayHumo = humoConTodosLosJuegos = true
      break
    }
  }
  const prefijosDeHumo = !hayHumo ? [] : humoConTodosLosJuegos ? null : [...prefijos]
  return { todo: false, conjuntos: [...conjuntos], prefijosDeHumo }
}
