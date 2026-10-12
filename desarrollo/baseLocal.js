import { PGlite } from '@electric-sql/pglite'
import { aplicarEsquema } from '../servidor/esquema.js'

// Postgres real corriendo dentro de Node: mismo SQL que producción, sin instalar nada.
// Con dataDir persiste en disco (desarrollo); sin él vive en memoria (pruebas).
export async function abrirBaseLocal(carpetaDeDatos) {
  const postgres = new PGlite(carpetaDeDatos)
  const db = { query: async (texto, parametros = []) => (await postgres.query(texto, parametros)).rows }
  await aplicarEsquema(db)
  return db
}
