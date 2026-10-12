import { conectarBaseDeProduccion } from './baseDeDatos.js'
import { aplicarEsquema } from './esquema.js'

// Corre antes de cada build (npm run build). Sin base de datos configurada el sitio se publica igual,
// solo que sin cuentas ni ranking.
const db = conectarBaseDeProduccion()
if (db) {
  await aplicarEsquema(db)
  console.log('Base de datos: esquema al día.')
} else {
  console.log('Base de datos: no hay NETLIFY_DATABASE_URL ni DATABASE_URL; se omite el esquema.')
}
