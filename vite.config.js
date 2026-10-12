import { defineConfig, loadEnv } from 'vite'
import { apiLocal } from './desarrollo/apiLocal.js'
import { serviceWorker } from './desarrollo/pluginServiceWorker.js'

// La llave de Google Maps (modo de Street View) viene de la variable GOOGLE_MAPS_KEY: en Netlify, de sus variables
// de entorno; en tu computador, de un archivo .env.local (ver .env.example). Es una llave pública: queda dentro del
// JavaScript del sitio, y por eso se restringe por dominio en Google Cloud.
export default defineConfig(({ mode }) => {
  const entorno = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      apiLocal({ dataDir: process.env.LOCAL_DB_DIR ?? '.local/db' }),
      serviceWorker({ source: 'src/service-worker.js', publicDir: 'public' }),
    ],
    define: { __LLAVE_DE_GOOGLE_MAPS__: JSON.stringify(entorno.GOOGLE_MAPS_KEY ?? '') },
    server: { port: 5173 },
    preview: { port: 8766, host: '127.0.0.1', strictPort: true },
  }
})
