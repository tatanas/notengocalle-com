import { defineConfig } from 'vite'
import { localApi } from './dev/localApi.js'
import { serviceWorker } from './dev/serviceWorkerPlugin.js'

export default defineConfig({
  plugins: [
    localApi({ dataDir: process.env.LOCAL_DB_DIR ?? '.local/db' }),
    serviceWorker({ source: 'src/service-worker.js', publicDir: 'public' }),
  ],
  server: { port: 5173 },
  preview: { port: 8765, host: '127.0.0.1', strictPort: true },
})
