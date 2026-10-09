import { createApi } from '../server/api.js'
import { openLocalDatabase } from './localDatabase.js'

async function toWebRequest(nodeRequest) {
  const chunks = []
  for await (const chunk of nodeRequest) chunks.push(chunk)
  const hasBody = !['GET', 'HEAD'].includes(nodeRequest.method)
  return new Request(`http://${nodeRequest.headers.host}${nodeRequest.url}`, {
    method: nodeRequest.method,
    headers: nodeRequest.headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  })
}

async function sendWebResponse(nodeResponse, response) {
  nodeResponse.statusCode = response.status
  response.headers.forEach((value, name) => nodeResponse.setHeader(name, value))
  nodeResponse.end(Buffer.from(await response.arrayBuffer()))
}

// Plugin de Vite: sirve /api con el mismo código que corre en Netlify, sobre una base local.
// Así `npm run dev` y `npm run preview` levantan el juego completo en un solo proceso.
export function localApi({ dataDir } = {}) {
  let handle = null
  const middleware = async (nodeRequest, nodeResponse, next) => {
    if (!nodeRequest.url.startsWith('/api/')) return next()
    handle ||= openLocalDatabase(dataDir).then(db => createApi(db, { isBreached: async () => false }))
    await sendWebResponse(nodeResponse, await (await handle)(await toWebRequest(nodeRequest)))
  }
  return {
    name: 'ntc-local-api',
    configureServer: server => void server.middlewares.use(middleware),
    configurePreviewServer: server => void server.middlewares.use(middleware),
  }
}
