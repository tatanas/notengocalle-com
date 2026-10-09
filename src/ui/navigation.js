// Las pantallas se registran por nombre para poder abrirse entre sí sin importarse mutuamente.
// Al abrirse, una pantalla puede devolver una función que deshace lo suyo cuando se navega a otra.
const screens = {}
let leaveCurrent = null
let mayLeave = async () => true

// Quien tenga algo en curso (una ronda) registra aquí una pregunta: devuelve false si hay que quedarse.
export function guardLeaving(ask) {
  mayLeave = ask
}

export function defineScreen(name, open) {
  screens[name] = open
}

export async function navigate(name, ...args) {
  if (!(await mayLeave())) return
  leaveCurrent?.()
  leaveCurrent = screens[name](...args) || null
}
