import {
  PERIODS,
  RANKED_MODES,
  ROUND_CATEGORIES,
  isBetterScore,
  legacyCategory,
  scoreProblem,
} from '../shared/ranked.js'
import { invalid, tooMany, unauthorized } from './errors.js'

const BOARD_SIZE = 50
const MAX_ROUNDS_PER_WINDOW = 40
const ROUND_WINDOW_MINUTES = 10
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_CATEGORY = '15'

function periodStart(url) {
  const period = url.searchParams.get('period') || 'all'
  if (!PERIODS.includes(period)) throw invalid('invalid_period', 'Período desconocido')
  return new Date(period === 'week' ? Date.now() - WEEK_MS : 0).toISOString()
}

function categoryOf(url) {
  const category = url.searchParams.get('category') || DEFAULT_CATEGORY
  if (!ROUND_CATEGORIES.includes(category)) throw invalid('invalid_category', 'Categoría desconocida')
  return category
}

// De cada jugador cuenta su mejor ronda de cada categoría: más aciertos y, a igual número, menos tiempo.
const BEST_PER_PLAYER = `
  select distinct on (mode, category, user_id) mode, category, user_id, correct, total, ms, created_at
  from scores
  where created_at >= $1
  order by mode, category, user_id, correct desc, ms asc, created_at asc`

const STANDINGS = `
  with best as (${BEST_PER_PLAYER})
  select best.mode, best.category, best.user_id, users.name, best.correct, best.total, best.ms, best.created_at as at,
         rank() over (partition by best.mode, best.category order by best.correct desc, best.ms asc)::int as rank,
         count(*) over (partition by best.mode, best.category)::int as players
  from best join users on users.id = best.user_id`

const entry = row => ({
  rank: row.rank,
  name: row.name,
  correct: row.correct,
  total: row.total,
  ms: row.ms,
  at: row.at,
})

async function board(db, mode, category, since, userId) {
  const rows = await db.query(
    `select * from (${STANDINGS}) standings
     where mode = $2 and category = $3 and (rank <= $4 or user_id = $5)
     order by rank, at`,
    [since, mode, category, BOARD_SIZE, userId],
  )
  const mine = rows.find(row => row.user_id === userId)
  return {
    rows: rows.filter(row => row.rank <= BOARD_SIZE).map(entry),
    players: rows[0]?.players ?? 0,
    me: mine ? entry(mine) : null,
  }
}

// Qué categorías tienen marcas en un juego, para mostrar solo esas pestañas con su cantidad de jugadores.
async function categoriesPlayed(db, mode, since) {
  const rows = await db.query(
    `select category, count(distinct user_id)::int as players from scores
     where mode = $1 and created_at >= $2 group by category`,
    [mode, since],
  )
  return Object.fromEntries(rows.map(row => [row.category, row.players]))
}

export async function leaderboard({ db, url, user }) {
  const mode = url.searchParams.get('mode')
  if (!RANKED_MODES.includes(mode)) throw invalid('invalid_mode', 'Ese juego no tiene ranking')
  const since = periodStart(url)
  const data = await board(db, mode, categoryOf(url), since, user?.id ?? null)
  return { data: { ...data, played: await categoriesPlayed(db, mode, since) } }
}

// Por cada juego: quién va primero en la categoría pedida y, si hay sesión, en qué puesto va el usuario.
export async function leaders({ db, url, user }) {
  const userId = user?.id ?? null
  const rows = await db.query(
    `select * from (${STANDINGS}) standings
     where category = $2 and (rank = 1 or user_id = $3) order by mode, rank, at`,
    [periodStart(url), categoryOf(url), userId],
  )
  const modes = {}
  for (const row of rows) {
    modes[row.mode] ||= { leader: entry(row), players: row.players, me: null }
    if (row.user_id === userId) modes[row.mode].me = entry(row)
  }
  return { data: { modes } }
}

async function assertNotFlooding(db, userId) {
  const [{ recent }] = await db.query(
    `select count(*)::int as recent from scores
     where user_id = $1 and created_at > now() - make_interval(mins => $2)`,
    [userId, ROUND_WINDOW_MINUTES],
  )
  if (recent >= MAX_ROUNDS_PER_WINDOW) throw tooMany('Demasiadas rondas seguidas. Espera unos minutos.')
}

// El puntaje lo calcula el navegador: aquí solo se descarta lo imposible (ver scoreProblem).
export async function submit({ db, body, user }) {
  if (!user) throw unauthorized('not_signed_in', 'Entra a tu cuenta para guardar el puntaje')
  const round = {
    mode: body.mode,
    category: body.category ?? (typeof body.mode === 'string' ? legacyCategory(body) : undefined),
    correct: body.correct,
    total: body.total,
    ms: body.ms,
  }
  const problem = scoreProblem(round)
  if (problem) throw invalid('invalid_score', `Puntaje no válido: ${problem}`)
  await assertNotFlooding(db, user.id)

  const everything = new Date(0).toISOString()
  const previous = (await board(db, round.mode, round.category, everything, user.id)).me
  await db.query(
    `insert into scores (user_id, mode, category, correct, total, ms) values ($1, $2, $3, $4, $5, $6)`,
    [user.id, round.mode, round.category, round.correct, round.total, round.ms],
  )
  const { me, players } = await board(db, round.mode, round.category, everything, user.id)
  return {
    status: 201,
    data: {
      category: round.category,
      rank: me.rank,
      players,
      improved: !previous || isBetterScore(round, previous),
      best: { correct: me.correct, total: me.total, ms: me.ms },
    },
  }
}
