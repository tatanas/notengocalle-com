import { neon } from '@neondatabase/serverless'

// Una "db" es cualquier objeto con query(sql, params) → filas. En producción es Neon (Postgres);
// en desarrollo y pruebas, PGlite (dev/localDatabase.js). El resto del servidor no distingue.

// Netlify DB define NETLIFY_DATABASE_URL; con un Postgres propio se usa DATABASE_URL.
const connectionString = () => process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL

export function connectProductionDatabase() {
  if (!connectionString()) return null
  const sql = neon(connectionString())
  return { query: (text, params = []) => sql.query(text, params) }
}
