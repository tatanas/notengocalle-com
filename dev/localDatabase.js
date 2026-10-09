import { PGlite } from '@electric-sql/pglite'
import { applySchema } from '../server/schema.js'

// Postgres real corriendo dentro de Node: mismo SQL que producción, sin instalar nada.
// Con dataDir persiste en disco (desarrollo); sin él vive en memoria (pruebas).
export async function openLocalDatabase(dataDir) {
  const postgres = new PGlite(dataDir)
  const db = { query: async (text, params = []) => (await postgres.query(text, params)).rows }
  await applySchema(db)
  return db
}
