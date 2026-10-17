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

// La barra superior son pestañas (como las de un navegador): se marca la de la pantalla actual. Las rondas son parte
// del inicio.
export function marcarPestana(nombre) {
  for (const pestana of document.querySelectorAll('.pestana')) {
    const activa = pestana.dataset.pantalla === nombre
    pestana.classList.toggle('activa', activa)
    if (activa) pestana.setAttribute('aria-current', 'page')
    else pestana.removeAttribute('aria-current')
  }
}

export async function navegar(nombre, ...argumentos) {
  if (!(await puedeSalir())) return
  salirDeLaActual?.()
  marcarPestana(nombre)
  salirDeLaActual = pantallas[nombre](...argumentos) || null
}
