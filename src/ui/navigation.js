// Las pantallas se registran por nombre para poder abrirse entre sí sin importarse mutuamente.
// Al abrirse, una pantalla puede devolver una función que deshace lo suyo cuando se navega a otra.
const screens = {}
let leaveCurrent = null

export function defineScreen(name, open) {
  screens[name] = open
}

export function navigate(name, ...args) {
  leaveCurrent?.()
  leaveCurrent = screens[name](...args) || null
}
