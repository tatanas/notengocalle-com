import {
  PERIODOS,
  MODOS_OFICIALES,
  CATEGORIAS_DE_CONSULTA,
  categoriasDelResumen,
  esMejorPuntaje,
  categoriaHeredada,
  problemaDelPuntaje,
} from '../compartido/oficial.js'
import { invalido, demasiados, noAutorizado } from './errores.js'

const TAMANO_DE_TABLA = 50
const RONDAS_MAXIMAS_POR_VENTANA = 40
const MINUTOS_DE_VENTANA_DE_RONDAS = 10
const MS_DE_SEMANA = 7 * 24 * 60 * 60 * 1000
const CATEGORIA_POR_DEFECTO = '20'

function inicioDelPeriodo(url) {
  const periodo = url.searchParams.get('periodo') || 'todo'
  if (!PERIODOS.includes(periodo)) throw invalido('periodo_invalido', 'Período desconocido')
  return new Date(periodo === 'semana' ? Date.now() - MS_DE_SEMANA : 0).toISOString()
}

function categoriaDe(url) {
  const categoria = url.searchParams.get('categoria') || CATEGORIA_POR_DEFECTO
  if (!CATEGORIAS_DE_CONSULTA.includes(categoria))
    throw invalido('categoria_invalida', 'Categoría desconocida')
  return categoria
}

// De cada jugador cuenta su mejor ronda de cada categoría: más aciertos y, a igual número, menos tiempo.
const MEJOR_POR_JUGADOR = `
  select distinct on (modo, categoria, usuario_id) modo, categoria, usuario_id, aciertos, total, ms, creado_en
  from puntajes
  where creado_en >= $1
  order by modo, categoria, usuario_id, aciertos desc, ms asc, creado_en asc`

const POSICIONES = `
  with mejores as (${MEJOR_POR_JUGADOR})
  select mejores.modo, mejores.categoria, mejores.usuario_id, usuarios.nombre, mejores.aciertos, mejores.total, mejores.ms, mejores.creado_en as en,
         rank() over (partition by mejores.modo, mejores.categoria order by mejores.aciertos desc, mejores.ms asc)::int as puesto,
         count(*) over (partition by mejores.modo, mejores.categoria)::int as jugadores
  from mejores join usuarios on usuarios.id = mejores.usuario_id`

const entrada = fila => ({
  puesto: fila.puesto,
  nombre: fila.nombre,
  aciertos: fila.aciertos,
  total: fila.total,
  ms: fila.ms,
  en: fila.en,
})

async function tabla(db, modo, categoria, desde, idDeUsuario) {
  const filas = await db.query(
    `select * from (${POSICIONES}) posiciones
     where modo = $2 and categoria = $3 and (puesto <= $4 or usuario_id = $5)
     order by puesto, en`,
    [desde, modo, categoria, TAMANO_DE_TABLA, idDeUsuario],
  )
  const mia = filas.find(fila => fila.usuario_id === idDeUsuario)
  return {
    filas: filas.filter(fila => fila.puesto <= TAMANO_DE_TABLA).map(entrada),
    jugadores: filas[0]?.jugadores ?? 0,
    yo: mia ? entrada(mia) : null,
  }
}

// Qué categorías tienen marcas en un juego, para mostrar solo esas pestañas con su cantidad de jugadores.
async function categoriasJugadas(db, modo, desde) {
  const filas = await db.query(
    `select categoria, count(distinct usuario_id)::int as jugadores from puntajes
     where modo = $1 and creado_en >= $2 group by categoria`,
    [modo, desde],
  )
  return Object.fromEntries(filas.map(fila => [fila.categoria, fila.jugadores]))
}

async function usuariosRegistrados(db) {
  const [{ registrados }] = await db.query('select count(*)::int as registrados from usuarios')
  return registrados
}

export async function tablaDePosiciones({ db, url, usuario }) {
  const modo = url.searchParams.get('modo')
  if (!MODOS_OFICIALES.includes(modo)) throw invalido('modo_invalido', 'Ese juego no tiene ranking')
  const desde = inicioDelPeriodo(url)
  const datos = await tabla(db, modo, categoriaDe(url), desde, usuario?.id ?? null)
  return {
    datos: {
      ...datos,
      jugadas: await categoriasJugadas(db, modo, desde),
      registrados: await usuariosRegistrados(db),
    },
  }
}

// Por cada juego: quién va primero en la categoría pedida y, si hay sesión, en qué puesto va el usuario.
export async function lideres({ db, url, usuario }) {
  const idDeUsuario = usuario?.id ?? null
  const filas = await db.query(
    `select * from (${POSICIONES}) posiciones
     where categoria in ($2, $3) and (puesto = 1 or usuario_id = $4) order by modo, puesto, en`,
    [inicioDelPeriodo(url), ...categoriasDelResumen(categoriaDe(url)), idDeUsuario],
  )
  const modos = {}
  for (const fila of filas) {
    modos[fila.modo] ||= { lider: entrada(fila), jugadores: fila.jugadores, yo: null }
    if (fila.usuario_id === idDeUsuario) modos[fila.modo].yo = entrada(fila)
  }
  return { datos: { modos, registrados: await usuariosRegistrados(db) } }
}

async function exigirSinInundacion(db, idDeUsuario) {
  const [{ recientes }] = await db.query(
    `select count(*)::int as recientes from puntajes
     where usuario_id = $1 and creado_en > now() - make_interval(mins => $2)`,
    [idDeUsuario, MINUTOS_DE_VENTANA_DE_RONDAS],
  )
  if (recientes >= RONDAS_MAXIMAS_POR_VENTANA)
    throw demasiados('Demasiadas rondas seguidas. Espera unos minutos.')
}

// El puntaje lo calcula el navegador: aquí solo se descarta lo imposible (ver problemaDelPuntaje).
export async function enviarPuntaje({ db, cuerpo, usuario }) {
  if (!usuario) throw noAutorizado('sin_sesion', 'Entra a tu cuenta para guardar el puntaje')
  const ronda = {
    modo: cuerpo.modo,
    categoria: cuerpo.categoria ?? (typeof cuerpo.modo === 'string' ? categoriaHeredada(cuerpo) : undefined),
    aciertos: cuerpo.aciertos,
    total: cuerpo.total,
    ms: cuerpo.ms,
  }
  const problema = problemaDelPuntaje(ronda)
  if (problema) throw invalido('puntaje_invalido', `Puntaje no válido: ${problema}`)
  await exigirSinInundacion(db, usuario.id)

  const todo = new Date(0).toISOString()
  const anterior = (await tabla(db, ronda.modo, ronda.categoria, todo, usuario.id)).yo
  await db.query(
    `insert into puntajes (usuario_id, modo, categoria, aciertos, total, ms) values ($1, $2, $3, $4, $5, $6)`,
    [usuario.id, ronda.modo, ronda.categoria, ronda.aciertos, ronda.total, ronda.ms],
  )
  const { yo, jugadores } = await tabla(db, ronda.modo, ronda.categoria, todo, usuario.id)
  return {
    estado: 201,
    datos: {
      categoria: ronda.categoria,
      puesto: yo.puesto,
      jugadores,
      mejoro: !anterior || esMejorPuntaje(ronda, anterior),
      mejor: { aciertos: yo.aciertos, total: yo.total, ms: yo.ms },
    },
  }
}
