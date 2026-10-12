import { crearApi } from '../servidor/api.js'
import { abrirBaseLocal } from './baseLocal.js'

async function aSolicitudWeb(solicitudNode) {
  const trozos = []
  for await (const trozo of solicitudNode) trozos.push(trozo)
  const tieneCuerpo = !['GET', 'HEAD'].includes(solicitudNode.method)
  return new Request(`http://${solicitudNode.headers.host}${solicitudNode.url}`, {
    method: solicitudNode.method,
    headers: solicitudNode.headers,
    body: tieneCuerpo ? Buffer.concat(trozos) : undefined,
  })
}

async function enviarRespuestaWeb(respuestaNode, respuesta) {
  respuestaNode.statusCode = respuesta.status
  respuesta.headers.forEach((valor, nombre) => respuestaNode.setHeader(nombre, valor))
  respuestaNode.end(Buffer.from(await respuesta.arrayBuffer()))
}

// Plugin de Vite: sirve /api con el mismo código que corre en Netlify, sobre una base local.
// Así `npm run dev` y `npm run preview` levantan el juego completo en un solo proceso.
export function apiLocal({ dataDir: carpetaDeDatos } = {}) {
  let manejar = null
  const intermediario = async (solicitudNode, respuestaNode, siguiente) => {
    if (!solicitudNode.url.startsWith('/api/')) return siguiente()
    manejar ||= abrirBaseLocal(carpetaDeDatos).then(db => crearApi(db, { estaFiltrada: async () => false }))
    await enviarRespuestaWeb(respuestaNode, await (await manejar)(await aSolicitudWeb(solicitudNode)))
  }
  return {
    name: 'ntc-local-api',
    configureServer: servidor => void servidor.middlewares.use(intermediario),
    configurePreviewServer: servidor => void servidor.middlewares.use(intermediario),
  }
}
