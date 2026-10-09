import { connectProductionDatabase } from './database.js'
import { applySchema } from './schema.js'

// Corre antes de cada build (npm run build). Sin base de datos configurada el sitio se publica igual,
// solo que sin cuentas ni ranking.
const db = connectProductionDatabase()
if (db) {
  await applySchema(db)
  console.log('Base de datos: esquema al día.')
} else {
  console.log('Base de datos: no hay NETLIFY_DATABASE_URL ni DATABASE_URL; se omite el esquema.')
}
