export const MODES = []

export function registerMode(mode) {
  MODES.push(mode)
}

export const modeById = id => MODES.find(mode => mode.id === id)
