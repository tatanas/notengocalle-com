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
  len: 15,
  cats: null,
  lines: null,
  strict: false,
  ownStreets: true,
  // Modo fácil: se dibujan los bordes de las comunas y las líneas del metro como ayuda.
  easy: true,
}
const preferences = { ...DEFAULT_PREFERENCES, ...store.get('settings', {}) }

let roundRules = null

// Lo que lee el juego: las preferencias del usuario, salvo lo que fije la ronda en curso.
export const settings = new Proxy(preferences, {
  get: (prefs, key) => (roundRules && key in roundRules ? roundRules[key] : prefs[key]),
})

export const saveSettings = () => store.set('settings', preferences)

export function applyRoundRules(rules) {
  roundRules = rules
}
