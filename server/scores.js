import { OFFICIAL_ROUNDS, PERIODS, isBetterScore, scoreProblem } from '../shared/ranked.js'
import { invalid, tooMany, unauthorized } from './errors.js'

const BOARD_SIZE = 50
const MAX_ROUNDS_PER_WINDOW = 40
const ROUND_WINDOW_MINUTES = 10
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function periodStart(url) {
  const period = url.searchParams.get('period') || 'all'
  if (!PERIODS.includes(period)) throw invalid('invalid_period', 'Período desconocido')
  return new Date(period === 'week' ? Date.now() - WEEK_MS : 0).toISOString()
}

// De cada jugador cuenta su mejor ronda: más aciertos y, a igual número, menos tiempo.
const BEST_PER_PLAYER = `
  select distinct on (mode, user_id) mode, user_id, correct, total, ms, created_at
  from scores
  where created_at >= $1
  order by mode, user_id, correct desc, ms asc, created_at asc`

const STANDINGS = `
  with best as (${BEST_PER_PLAYER})
  select best.mode, best.user_id, users.name, best.correct, best.total, best.ms, best.created_at as at,
         rank() over (partition by best.mode order by best.correct desc, best.ms asc)::int as rank,
         count(*) over (partition by best.mode)::int as players
  from best join users on users.id = best.user_id`

const entry = row => ({
  rank: row.rank,
  name: row.name,
  correct: row.correct,
  total: row.total,
  ms: row.ms,
  at: row.at,
})

async function board(db, mode, since, userId) {
  const rows = await db.query(
    `select * from (${STANDINGS}) standings
     where mode = $2 and (rank <= $3 or user_id = $4)
     order by rank, at`,
    [since, mode, BOARD_SIZE, userId],
  )
  const mine = rows.find(row => row.user_id === userId)
  return {
    rows: rows.filter(row => row.rank <= BOARD_SIZE).map(entry),
    players: rows[0]?.players ?? 0,
    me: mine ? entry(mine) : null,
  }
}

export async function leaderboard({ db, url, user }) {
  const mode = url.searchParams.get('mode')
  if (!(mode in OFFICIAL_ROUNDS)) throw invalid('invalid_mode', 'Ese juego no tiene ranking')
  return { data: await board(db, mode, periodStart(url), user?.id ?? null) }
}

// Por cada juego: quién va primero y, si hay sesión, en qué puesto va el usuario.
export async function leaders({ db, url, user }) {
  const userId = user?.id ?? null
  const rows = await db.query(
    `select * from (${STANDINGS}) standings where rank = 1 or user_id = $2 order by mode, rank, at`,
    [periodStart(url), userId],
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
  const round = { mode: body.mode, correct: body.correct, total: body.total, ms: body.ms }
  const problem = scoreProblem(round)
  if (problem) throw invalid('invalid_score', `Puntaje no válido: ${problem}`)
  await assertNotFlooding(db, user.id)

  const everything = new Date(0).toISOString()
  const previous = (await board(db, round.mode, everything, user.id)).me
  await db.query(`insert into scores (user_id, mode, correct, total, ms) values ($1, $2, $3, $4, $5)`, [
    user.id,
    round.mode,
    round.correct,
    round.total,
    round.ms,
  ])
  const { me, players } = await board(db, round.mode, everything, user.id)
  return {
    status: 201,
    data: {
      rank: me.rank,
      players,
      improved: !previous || isBetterScore(round, previous),
      best: { correct: me.correct, total: me.total, ms: me.ms },
    },
  }
}
