// Consulta public/data/data.js sin abrirlo (pesa 2 MB en 2 líneas). La expresión se evalúa con `D` = window.DATA.
//   npm run datos -- "Object.keys(D)"
//   npm run datos -- "D.streets.filter(c => /Apoquindo/.test(c.name)).map(c => c.name)"
// La salida se corta en LIMITE caracteres: para ver más, filtrar mejor la expresión.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const LIMITE = 6000

const expresion = process.argv[2]
if (!expresion) {
  console.error('Uso: npm run datos -- "<expresión sobre D>"')
  process.exit(1)
}

const ventana = { window: {} }
vm.runInNewContext(readFileSync('public/data/data.js', 'utf8'), ventana)
const resultado = vm.runInNewContext(expresion, { D: ventana.window.DATA })
const texto = JSON.stringify(resultado, null, 1) ?? String(resultado)
console.log(
  texto.length > LIMITE ? `${texto.slice(0, LIMITE)}\n… (cortado: ${texto.length} caracteres)` : texto,
)
