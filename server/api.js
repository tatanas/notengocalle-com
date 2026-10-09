import * as auth from './auth.js'
import { HttpError, forbidden, invalid, notFound, unavailable } from './errors.js'
import * as scores from './scores.js'
import { sessionUser } from './sessions.js'

// Cada ruta recibe { db, request, url, body, user } y devuelve { data, status?, cookie? }.
const ROUTES = {
  'POST /api/register': auth.register,
  'POST /api/login': auth.logIn,
  'POST /api/logout': auth.logOut,
  'POST /api/recover': auth.recover,
  'GET /api/me': auth.me,
  'POST /api/scores': scores.submit,
  'GET /api/leaderboard': scores.leaderboard,
  'GET /api/leaders': scores.leaders,
}

const MAX_BODY_BYTES = 10_000

function json(status, data, cookie) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  if (cookie) headers['Set-Cookie'] = cookie
  return new Response(JSON.stringify(data), { status, headers })
}

// Los navegadores declaran el origen en todo POST: uno ajeno es otro sitio intentando actuar por el usuario.
function assertSameOrigin(request, url) {
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== url.host) throw forbidden('Origen no permitido')
}

async function readBody(request) {
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw invalid('too_large', 'Solicitud demasiado grande')
  if (!text) return {}
  try {
    const body = JSON.parse(text)
    if (body && typeof body === 'object') return body
  } catch {
    // cae al error de abajo
  }
  throw invalid('invalid_json', 'Solicitud mal formada')
}

// El mismo manejador sirve en Netlify Functions y en el servidor local: recibe un Request y devuelve un Response.
export function createApi(db) {
  return async function handle(request) {
    const url = new URL(request.url)
    try {
      const route = ROUTES[`${request.method} ${url.pathname}`]
      if (!route) throw notFound()
      if (!db) throw unavailable()
      const isPost = request.method === 'POST'
      if (isPost) assertSameOrigin(request, url)
      const body = isPost ? await readBody(request) : {}
      const user = await sessionUser(db, request)
      const { status = 200, data, cookie } = await route({ db, request, url, body, user })
      return json(status, data, cookie)
    } catch (error) {
      if (error instanceof HttpError) return json(error.status, { error: error.code, message: error.message })
      console.error(error)
      return json(500, { error: 'server_error', message: 'Error interno del servidor' })
    }
  }
}
