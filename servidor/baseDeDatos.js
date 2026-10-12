import { neon } from '@neondatabase/serverless'

// Una "db" es cualquier objeto con query(sql, params) → filas. En producción es Neon (Postgres);
// en desarrollo y pruebas, PGlite (desarrollo/baseLocal.js). El resto del servidor no distingue.

// Netlify DB define NETLIFY_DATABASE_URL; con un Postgres propio se usa DATABASE_URL.
const cadenaDeConexion = () => process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL

export function conectarBaseDeProduccion() {
  if (!cadenaDeConexion()) return null
  const sql = neon(cadenaDeConexion())
  return { query: (texto, parametros = []) => sql.query(texto, parametros) }
}
