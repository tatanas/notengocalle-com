import { invalido, noAutorizado } from './errores.js'

// El progreso de práctica viaja como el del navegador: { "<modo>:<ítem>": { n, ok, streak, last } }.
const ENTRADAS_MAXIMAS_POR_ENVIO = 300
const LARGO_MAXIMO_DE_LLAVE = 200
const MS_DE_DIA = 24 * 60 * 60 * 1000

const exigirSesion = usuario => {
  if (!usuario) throw noAutorizado('sin_sesion', 'Entra a tu cuenta para guardar tu progreso')
}

const esEnteroNoNegativo = valor => Number.isSafeInteger(valor) && valor >= 0
const entradaValida = ([llave, entrada]) =>
  llave.length <= LARGO_MAXIMO_DE_LLAVE &&
  typeof entrada === 'object' &&
  entrada !== null &&
  [entrada.n, entrada.ok, entrada.streak, entrada.last].every(esEnteroNoNegativo) &&
  entrada.ok <= entrada.n &&
  entrada.streak <= entrada.n &&
  entrada.last <= Date.now() + MS_DE_DIA

export async function leerProgreso({ db, usuario }) {
  exigirSesion(usuario)
  const filas = await db.query(
    `select llave, respuestas, aciertos, racha, ultima from progreso where usuario_id = $1`,
    [usuario.id],
  )
  const estadisticas = Object.fromEntries(
    filas.map(fila => [
      fila.llave,
      { n: fila.respuestas, ok: fila.aciertos, streak: fila.racha, last: Number(fila.ultima) },
    ]),
  )
  return { datos: { estadisticas } }
}

// Guarda solo lo que sea más nuevo que lo que ya hay: otro dispositivo pudo haber subido algo después.
export async function guardarProgreso({ db, usuario, cuerpo }) {
  exigirSesion(usuario)
  const entradas = Object.entries(cuerpo.estadisticas ?? {})
  if (entradas.length > ENTRADAS_MAXIMAS_POR_ENVIO || !entradas.every(entradaValida))
    throw invalido('progreso_invalido', 'Progreso no válido')
  if (!entradas.length) return { datos: { guardadas: 0 } }
  const columna = campo => entradas.map(([llave, entrada]) => (campo ? entrada[campo] : llave))
  await db.query(
    `insert into progreso (usuario_id, llave, respuestas, aciertos, racha, ultima)
     select $1, llave, respuestas, aciertos, racha, ultima
     from unnest($2::text[], $3::int[], $4::int[], $5::int[], $6::bigint[]) as nuevas (llave, respuestas, aciertos, racha, ultima)
     on conflict (usuario_id, llave) do update
       set respuestas = excluded.respuestas, aciertos = excluded.aciertos, racha = excluded.racha, ultima = excluded.ultima
       where excluded.ultima > progreso.ultima`,
    [usuario.id, columna(null), columna('n'), columna('ok'), columna('streak'), columna('last')],
  )
  return { datos: { guardadas: entradas.length } }
}

export async function borrarProgreso({ db, usuario }) {
  exigirSesion(usuario)
  await db.query(`delete from progreso where usuario_id = $1`, [usuario.id])
  return { datos: { ok: true } }
}
