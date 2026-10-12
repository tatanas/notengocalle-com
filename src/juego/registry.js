export const MODOS = []

export function registrarModo(modo) {
  MODOS.push(modo)
}

export const modoPorId = id => MODOS.find(modo => modo.id === id)
