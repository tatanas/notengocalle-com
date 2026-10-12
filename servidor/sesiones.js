import { huella, fichaNueva } from './claves.js'

const GALLETA = 'ntc_sesion'
const DIAS_DE_VIDA = 180
const SEGUNDOS_DE_VIDA = DIAS_DE_VIDA * 24 * 60 * 60

// HttpOnly: el JavaScript de la página no puede leerla. SameSite=Lax: no viaja en POST desde otros sitios.
function encabezadoDeGalleta(solicitud, valor, edadMaxima) {
  const seguro = new URL(solicitud.url).protocol === 'https:' ? '; Secure' : ''
  return `${GALLETA}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${edadMaxima}${seguro}`
}

function fichaDeSesion(solicitud) {
  const galletas = solicitud.headers.get('cookie') || ''
  return galletas.match(new RegExp(`(?:^|;\\s*)${GALLETA}=([^;]+)`))?.[1] || null
}

// En la base solo queda la huella de la ficha: una filtración de la tabla no entrega sesiones válidas.
export async function iniciarSesion(db, solicitud, idDeUsuario) {
  const ficha = fichaNueva()
  await db.query(
    `insert into sesiones (ficha_cifrada, usuario_id, expira_en) values ($1, $2, now() + make_interval(days => $3))`,
    [huella(ficha), idDeUsuario, DIAS_DE_VIDA],
  )
  return encabezadoDeGalleta(solicitud, ficha, SEGUNDOS_DE_VIDA)
}

export async function terminarSesion(db, solicitud) {
  const ficha = fichaDeSesion(solicitud)
  if (ficha) await db.query(`delete from sesiones where ficha_cifrada = $1`, [huella(ficha)])
  return encabezadoDeGalleta(solicitud, '', 0)
}

export async function terminarTodasLasSesiones(db, idDeUsuario) {
  await db.query(`delete from sesiones where usuario_id = $1`, [idDeUsuario])
}

export async function usuarioDeSesion(db, solicitud) {
  const ficha = fichaDeSesion(solicitud)
  if (!ficha) return null
  const [usuario] = await db.query(
    `select usuarios.id, usuarios.nombre from sesiones join usuarios on usuarios.id = sesiones.usuario_id
     where sesiones.ficha_cifrada = $1 and sesiones.expira_en > now()`,
    [huella(ficha)],
  )
  return usuario || null
}
