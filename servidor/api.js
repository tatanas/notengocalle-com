import * as autenticacion from './autenticacion.js'
import { ErrorHttp, prohibido, invalido, noEncontrado, noDisponible } from './errores.js'
import * as progreso from './progreso.js'
import * as puntajes from './puntajes.js'
import * as reportes from './reportes.js'
import { claveFiltrada } from './claves.js'
import { usuarioDeSesion } from './sesiones.js'
import { llavesPublicasDeGoogle } from './google.js'

// Cada ruta recibe { db, solicitud, url, cuerpo, usuario, estaFiltrada, llavesDeGoogle } y devuelve { datos, estado?, galleta? }.
const RUTAS = {
  'POST /api/registrarse': autenticacion.registrarse,
  'POST /api/entrar': autenticacion.entrar,
  'POST /api/salir': autenticacion.salir,
  'GET /api/yo': autenticacion.yo,
  'POST /api/google': autenticacion.entrarConGoogle,
  'POST /api/google/vincular': autenticacion.vincularGoogle,
  'POST /api/puntajes': puntajes.enviarPuntaje,
  'GET /api/tabla': puntajes.tablaDePosiciones,
  'GET /api/lideres': puntajes.lideres,
  'POST /api/reportes': reportes.reportarPunto,
  'GET /api/progreso': progreso.leerProgreso,
  'POST /api/progreso': progreso.guardarProgreso,
  'POST /api/progreso/borrar': progreso.borrarProgreso,
}

const BYTES_MAXIMOS_DE_CUERPO = 10_000

function json(estado, datos, galleta) {
  const encabezados = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  if (galleta) encabezados['Set-Cookie'] = galleta
  return new Response(JSON.stringify(datos), { status: estado, headers: encabezados })
}

// Los navegadores declaran el origen en todo POST: uno ajeno es otro sitio intentando actuar por el usuario.
function exigirMismoOrigen(solicitud, url) {
  const origen = solicitud.headers.get('origin')
  if (origen && new URL(origen).host !== url.host) throw prohibido('Origen no permitido')
}

async function leerCuerpo(solicitud) {
  const texto = await solicitud.text()
  if (texto.length > BYTES_MAXIMOS_DE_CUERPO) throw invalido('demasiado_grande', 'Solicitud demasiado grande')
  if (!texto) return {}
  try {
    const cuerpo = JSON.parse(texto)
    if (cuerpo && typeof cuerpo === 'object') return cuerpo
  } catch {
    // cae al error de abajo
  }
  throw invalido('json_invalido', 'Solicitud mal formada')
}

// El mismo manejador sirve en Netlify Functions y en el servidor local: recibe un Request y devuelve un Response.
export function crearApi(db, { estaFiltrada = claveFiltrada, llavesDeGoogle = llavesPublicasDeGoogle } = {}) {
  return async function manejar(solicitud) {
    const url = new URL(solicitud.url)
    try {
      const ruta = RUTAS[`${solicitud.method} ${url.pathname}`]
      if (!ruta) throw noEncontrado()
      if (!db) throw noDisponible()
      const esPost = solicitud.method === 'POST'
      if (esPost) exigirMismoOrigen(solicitud, url)
      const cuerpo = esPost ? await leerCuerpo(solicitud) : {}
      const usuario = await usuarioDeSesion(db, solicitud)
      const {
        estado = 200,
        datos,
        galleta,
      } = await ruta({ db, solicitud, url, cuerpo, usuario, estaFiltrada, llavesDeGoogle })
      return json(estado, datos, galleta)
    } catch (error) {
      if (error instanceof ErrorHttp)
        return json(error.estado, { error: error.codigo, mensaje: error.message })
      console.error(error)
      return json(500, { error: 'error_del_servidor', mensaje: 'Error interno del servidor' })
    }
  }
}
