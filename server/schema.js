import { readFileSync } from 'node:fs'

// El driver de Neon acepta una sentencia por llamada, así que schema.sql se envía por partes.
export async function applySchema(db) {
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
  const statements = schema
    .replace(/^--.*$/gm, '')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)
  for (const statement of statements) await db.query(statement)
}
