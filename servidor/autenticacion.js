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

const INTENTOS_FALLIDOS_MAXIMOS = 10
const MINUTOS_DE_VENTANA_DE_INTENTOS = 15

const usuarioPublico = usuario => ({ nombre: usuario.nombre })

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
  if (!usuario || !(await claveCoincide(String(cuerpo.clave ?? ''), usuario.clave_cifrada))) {
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
