import {
  LARGO_MAXIMO_DE_CLAVE,
  LARGO_MINIMO_DE_CLAVE,
  PATRON_DE_USUARIO,
  REGLAS_DE_USUARIO,
  llaveDeUsuario,
} from '../compartido/cuentas.js'
import { conflicto, invalido, demasiados, noAutorizado } from './errores.js'
import { cifrarClave, necesitaRecifrado, claveCoincide } from './claves.js'
import { terminarTodasLasSesiones, terminarSesion, iniciarSesion } from './sesiones.js'
import { identificadorDeGoogle } from './google.js'

const INTENTOS_FALLIDOS_MAXIMOS = 10
const MINUTOS_DE_VENTANA_DE_INTENTOS = 15

const usuarioPublico = usuario => ({ nombre: usuario.nombre, ...(usuario.google_sub && { google: true }) })

function nombreValido(cuerpo) {
  const nombre = String(cuerpo.nombre ?? '').trim()
  if (!PATRON_DE_USUARIO.test(nombre)) throw invalido('nombre_invalido', REGLAS_DE_USUARIO)
  return nombre
}

function claveValida(clave) {
  if (typeof clave !== 'string' || clave.length < LARGO_MINIMO_DE_CLAVE)
    throw invalido('clave_invalida', `La clave debe tener al menos ${LARGO_MINIMO_DE_CLAVE} caracteres`)
  if (clave.length > LARGO_MAXIMO_DE_CLAVE) throw invalido('clave_invalida', 'La clave es demasiado larga')
  return clave
}

async function exigirClaveNoFiltrada(clave, estaFiltrada) {
  if (await estaFiltrada(clave))
    throw invalido(
      'clave_filtrada',
      'Esa clave aparece en filtraciones de datos de otros sitios. Elige otra, distinta a las que usas en otras partes.',
    )
}

// Frena a quien prueba claves en serie contra un mismo nombre.
async function exigirSinLimite(db, llaveDeNombre) {
  const [{ fallas }] = await db.query(
    `select count(*)::int as fallas from intentos_fallidos
     where llave_de_nombre = $1 and en > now() - make_interval(mins => $2)`,
    [llaveDeNombre, MINUTOS_DE_VENTANA_DE_INTENTOS],
  )
  if (fallas >= INTENTOS_FALLIDOS_MAXIMOS)
    throw demasiados(
      `Demasiados intentos fallidos. Espera ${MINUTOS_DE_VENTANA_DE_INTENTOS} minutos y prueba de nuevo.`,
    )
}

async function registrarFalla(db, llaveDeNombre) {
  await db.query(`delete from intentos_fallidos where en < now() - interval '1 day'`)
  await db.query(`insert into intentos_fallidos (llave_de_nombre) values ($1)`, [llaveDeNombre])
}

const buscarUsuario = async (db, llaveDeNombre) =>
  (await db.query(`select * from usuarios where llave_de_nombre = $1`, [llaveDeNombre]))[0]

export async function registrarse({ db, solicitud, cuerpo, estaFiltrada }) {
  const nombre = nombreValido(cuerpo)
  const clave = claveValida(cuerpo.clave)
  if (clave.toLowerCase() === nombre.toLowerCase())
    throw invalido('clave_invalida', 'La clave no puede ser igual al nombre de usuario')
  await exigirClaveNoFiltrada(clave, estaFiltrada)
  const [usuario] = await db.query(
    `insert into usuarios (nombre, llave_de_nombre, clave_cifrada) values ($1, $2, $3)
     on conflict (llave_de_nombre) do nothing returning id, nombre`,
    [nombre, llaveDeUsuario(nombre), await cifrarClave(clave)],
  )
  if (!usuario) throw conflicto('nombre_en_uso', 'Ese nombre ya está en uso')
  return {
    estado: 201,
    datos: { usuario: usuarioPublico(usuario) },
    galleta: await iniciarSesion(db, solicitud, usuario.id),
  }
}

export async function entrar({ db, solicitud, cuerpo }) {
  const llaveDeNombre = llaveDeUsuario(String(cuerpo.nombre ?? '').trim())
  await exigirSinLimite(db, llaveDeNombre)
  const usuario = await buscarUsuario(db, llaveDeNombre)
  // Las cuentas creadas con Google no tienen clave.
  const claveCorrecta =
    usuario?.clave_cifrada && (await claveCoincide(String(cuerpo.clave ?? ''), usuario.clave_cifrada))
  if (!claveCorrecta) {
    await registrarFalla(db, llaveDeNombre)
    throw noAutorizado('credenciales_incorrectas', 'Nombre o clave incorrectos')
  }
  const clave = String(cuerpo.clave ?? '')
  if (necesitaRecifrado(usuario.clave_cifrada))
    await db.query(`update usuarios set clave_cifrada = $1 where id = $2`, [
      await cifrarClave(clave),
      usuario.id,
    ])
  return {
    datos: { usuario: usuarioPublico(usuario) },
    galleta: await iniciarSesion(db, solicitud, usuario.id),
  }
}

const sesionIniciada = async (db, solicitud, usuario) => ({
  datos: { usuario: usuarioPublico(usuario) },
  galleta: await iniciarSesion(db, solicitud, usuario.id),
})

const buscarPorGoogle = async (db, idDeGoogle) =>
  (await db.query(`select * from usuarios where google_sub = $1`, [idDeGoogle]))[0]

// "Continuar con Google": entra a la cuenta vinculada a ese Google o, si no hay, la crea. La primera vez falta el
// nombre de usuario (no se usa el de Google, para no publicar nombres reales en el ranking): se responde
// necesitaNombre y el navegador vuelve a mandar el mismo token con el nombre elegido.
export async function entrarConGoogle({ db, solicitud, cuerpo, llavesDeGoogle }) {
  const idDeGoogle = await identificadorDeGoogle(cuerpo.credencial, llavesDeGoogle)
  const existente = await buscarPorGoogle(db, idDeGoogle)
  if (existente) return sesionIniciada(db, solicitud, existente)
  if (cuerpo.nombre === undefined) return { datos: { necesitaNombre: true } }
  const nombre = nombreValido(cuerpo)
  const [creado] = await db.query(
    `insert into usuarios (nombre, llave_de_nombre, google_sub) values ($1, $2, $3)
     on conflict do nothing returning *`,
    [nombre, llaveDeUsuario(nombre), idDeGoogle],
  )
  if (creado) return { estado: 201, ...(await sesionIniciada(db, solicitud, creado)) }
  const creadoEnParalelo = await buscarPorGoogle(db, idDeGoogle)
  if (creadoEnParalelo) return sesionIniciada(db, solicitud, creadoEnParalelo)
  throw conflicto('nombre_en_uso', 'Ese nombre ya está en uso')
}

// Vincular solo se puede con la sesión ya iniciada y a pedido de la persona: nunca se juntan cuentas por el nombre.
export async function vincularGoogle({ db, cuerpo, usuario, llavesDeGoogle }) {
  if (!usuario) throw noAutorizado('sin_sesion', 'Entra a tu cuenta para vincularla con Google')
  const idDeGoogle = await identificadorDeGoogle(cuerpo.credencial, llavesDeGoogle)
  const otro = await buscarPorGoogle(db, idDeGoogle)
  if (otro && otro.id !== usuario.id)
    throw conflicto('google_en_uso', 'Esa cuenta de Google ya está vinculada a otro usuario')
  const [vinculado] = await db.query(
    `update usuarios set google_sub = $1 where id = $2 and (google_sub is null or google_sub = $1) returning *`,
    [idDeGoogle, usuario.id],
  )
  if (!vinculado) throw conflicto('ya_vinculada', 'Tu cuenta ya está vinculada a otra cuenta de Google')
  return { datos: { usuario: usuarioPublico(vinculado) } }
}

// Para el administrador (servidor/admin.js): el usuario no puede recuperar su cuenta por su cuenta.
export async function restablecerClave(db, nombre, claveNueva) {
  const [usuario] = await db.query(
    `update usuarios set clave_cifrada = $1 where llave_de_nombre = $2 returning id, nombre`,
    [await cifrarClave(claveValida(claveNueva)), llaveDeUsuario(nombre)],
  )
  if (!usuario) return null
  await terminarTodasLasSesiones(db, usuario.id)
  return usuario.nombre
}

export async function salir({ db, solicitud }) {
  return { datos: { ok: true }, galleta: await terminarSesion(db, solicitud) }
}

export async function yo({ usuario }) {
  return { datos: { usuario: usuario ? usuarioPublico(usuario) : null } }
}
