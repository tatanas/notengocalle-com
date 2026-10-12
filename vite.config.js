import { defineConfig } from 'vite'
import { apiLocal } from './desarrollo/apiLocal.js'
import { serviceWorker } from './desarrollo/pluginServiceWorker.js'

export default defineConfig({
  plugins: [
    apiLocal({ dataDir: process.env.LOCAL_DB_DIR ?? '.local/db' }),
    serviceWorker({ source: 'src/service-worker.js', publicDir: 'public' }),
  ],
  server: { port: 5173 },
  preview: { port: 8766, host: '127.0.0.1', strictPort: true },
})
