// Las pantallas se registran por nombre para poder abrirse entre sí sin importarse mutuamente.
// Al abrirse, una pantalla puede devolver una función que deshace lo suyo cuando se navega a otra.
const pantallas = {}
let salirDeLaActual = null
let puedeSalir = async () => true

// Quien tenga algo en curso (una ronda) registra aquí una pregunta: devuelve false si hay que quedarse.
export function resguardarSalida(preguntar) {
  puedeSalir = preguntar
}

export function definirPantalla(nombre, abrir) {
  pantallas[nombre] = abrir
}

export async function navegar(nombre, ...argumentos) {
  if (!(await puedeSalir())) return
  salirDeLaActual?.()
  salirDeLaActual = pantallas[nombre](...argumentos) || null
}
