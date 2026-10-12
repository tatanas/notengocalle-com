import { readFileSync } from 'node:fs'

// Parte el SQL en sentencias separadas por «;», sin cortar lo que va entre $$ ... $$ (bloques do).
function separarSentencias(sql) {
  const sentencias = []
  let actual = ''
  let dentroDeBloque = false
  for (let posicion = 0; posicion < sql.length; posicion++) {
    if (sql.startsWith('$$', posicion)) {
      dentroDeBloque = !dentroDeBloque
      actual += '$$'
      posicion++
    } else if (sql[posicion] === ';' && !dentroDeBloque) {
      sentencias.push(actual)
      actual = ''
    } else actual += sql[posicion]
  }
  sentencias.push(actual)
  return sentencias.map(sentencia => sentencia.trim()).filter(Boolean)
}

// El driver de Neon acepta una sentencia por llamada, así que esquema.sql se envía por partes.
export async function aplicarEsquema(db) {
  const esquema = readFileSync(new URL('./esquema.sql', import.meta.url), 'utf8')
  for (const sentencia of separarSentencias(esquema.replace(/^--.*$/gm, ''))) await db.query(sentencia)
}
