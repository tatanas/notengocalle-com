const PREFIX = 'ntc:'

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw ? JSON.parse(raw) : fallback
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // sin almacenamiento (modo privado, cuota llena): el juego sigue, solo no recuerda
    }
  },
}

const DEFAULT_PREFERENCES = {
  scope: 'core',
  // Preguntas por ronda: la de cada grupo de juegos (lengths) o, si no eligió, esta (len).
  len: 20,
  lengths: {},
  cats: null,
  lines: null,
  strict: false,
  ownStreets: true,
  // La práctica siempre es fácil (bordes de las comunas y líneas del metro); las rondas oficiales, difíciles.
}
const ALL_LENGTH = 999
// Antes se podía elegir 10, 15 o 30: ahora solo 20 o todas.
const simplifiedLength = length => (length >= ALL_LENGTH ? ALL_LENGTH : DEFAULT_PREFERENCES.len)
const saved = store.get('settings', {})
const preferences = {
  ...DEFAULT_PREFERENCES,
  ...saved,
  easy: true,
  len: simplifiedLength(saved.len ?? DEFAULT_PREFERENCES.len),
  lengths: Object.fromEntries(
    Object.entries(saved.lengths ?? {}).map(([group, length]) => [group, simplifiedLength(length)]),
  ),
}

let roundRules = null

// Lo que lee el juego: las preferencias del usuario, salvo lo que fije la ronda en curso.
export const settings = new Proxy(preferences, {
  get: (prefs, key) => (roundRules && key in roundRules ? roundRules[key] : prefs[key]),
})

export const lengthFor = group => settings.lengths[group] ?? settings.len

export const saveSettings = () => store.set('settings', preferences)

export function applyRoundRules(rules) {
  roundRules = rules
}
