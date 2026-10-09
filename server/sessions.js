import { fingerprint, newToken } from './passwords.js'

const COOKIE = 'ntc_session'
const LIFETIME_DAYS = 180
const LIFETIME_SECONDS = LIFETIME_DAYS * 24 * 60 * 60

// HttpOnly: el JavaScript de la página no puede leerla. SameSite=Lax: no viaja en POST desde otros sitios.
function cookieHeader(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

function sessionToken(request) {
  const cookies = request.headers.get('cookie') || ''
  return cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1] || null
}

// En la base solo queda la huella del token: una filtración de la tabla no entrega sesiones válidas.
export async function startSession(db, request, userId) {
  const token = newToken()
  await db.query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [fingerprint(token), userId, LIFETIME_DAYS],
  )
  return cookieHeader(request, token, LIFETIME_SECONDS)
}

export async function endSession(db, request) {
  const token = sessionToken(request)
  if (token) await db.query(`delete from sessions where token_hash = $1`, [fingerprint(token)])
  return cookieHeader(request, '', 0)
}

export async function endAllSessions(db, userId) {
  await db.query(`delete from sessions where user_id = $1`, [userId])
}

export async function sessionUser(db, request) {
  const token = sessionToken(request)
  if (!token) return null
  const [user] = await db.query(
    `select users.id, users.name from sessions join users on users.id = sessions.user_id
     where sessions.token_hash = $1 and sessions.expires_at > now()`,
    [fingerprint(token)],
  )
  return user || null
}
