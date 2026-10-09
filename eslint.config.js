import globals from 'globals'

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  'no-import-assign': 'error',
  'no-const-assign': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
}

// L y maplibregl los cargan los <script> de public/vendor antes que el código del juego.
const browser = { ...globals.browser, L: 'readonly', maplibregl: 'readonly' }

export default [
  { ignores: ['dist/', 'public/', 'tools/', 'node_modules/', '.local/'] },
  { files: ['src/**/*.js', 'shared/**/*.js'], languageOptions: { globals: browser }, rules },
  {
    files: ['server/**/*.js', 'netlify/**/*.js', 'dev/**/*.js', '*.js'],
    languageOptions: { globals: globals.node },
    rules,
  },
  // Las pruebas corren en Node, pero pasan funciones que se ejecutan dentro de la página.
  { files: ['tests/**/*.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules },
]
