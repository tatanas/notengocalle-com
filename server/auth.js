import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  USERNAME_RULES,
  usernameKey,
} from '../shared/accounts.js'
import { conflict, invalid, tooMany, unauthorized } from './errors.js'
import { hashPassword, newRecoveryCode, passwordMatches, recoveryFingerprint } from './passwords.js'
import { endAllSessions, endSession, startSession } from './sessions.js'

const MAX_FAILED_ATTEMPTS = 10
const ATTEMPT_WINDOW_MINUTES = 15

const publicUser = user => ({ name: user.name })

function validName(body) {
  const name = String(body.name ?? '').trim()
  if (!USERNAME_PATTERN.test(name)) throw invalid('invalid_name', USERNAME_RULES)
  return name
}

function validPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH)
    throw invalid('invalid_password', `La clave debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  if (password.length > PASSWORD_MAX_LENGTH) throw invalid('invalid_password', 'La clave es demasiado larga')
  return password
}

// Frena a quien prueba claves o códigos en serie contra un mismo nombre.
async function assertNotThrottled(db, nameKey) {
  const [{ failures }] = await db.query(
    `select count(*)::int as failures from failed_logins
     where name_key = $1 and at > now() - make_interval(mins => $2)`,
    [nameKey, ATTEMPT_WINDOW_MINUTES],
  )
  if (failures >= MAX_FAILED_ATTEMPTS)
    throw tooMany(`Demasiados intentos fallidos. Espera ${ATTEMPT_WINDOW_MINUTES} minutos y prueba de nuevo.`)
}

async function recordFailure(db, nameKey) {
  await db.query(`delete from failed_logins where at < now() - interval '1 day'`)
  await db.query(`insert into failed_logins (name_key) values ($1)`, [nameKey])
}

const findUser = async (db, nameKey) =>
  (await db.query(`select * from users where name_key = $1`, [nameKey]))[0]

export async function register({ db, request, body }) {
  const name = validName(body)
  const password = validPassword(body.password)
  const recoveryCode = newRecoveryCode()
  const [user] = await db.query(
    `insert into users (name, name_key, password_hash, recovery_hash) values ($1, $2, $3, $4)
     on conflict (name_key) do nothing returning id, name`,
    [name, usernameKey(name), await hashPassword(password), recoveryFingerprint(recoveryCode)],
  )
  if (!user) throw conflict('name_taken', 'Ese nombre ya está en uso')
  return {
    status: 201,
    data: { user: publicUser(user), recoveryCode },
    cookie: await startSession(db, request, user.id),
  }
}

export async function logIn({ db, request, body }) {
  const nameKey = usernameKey(String(body.name ?? '').trim())
  await assertNotThrottled(db, nameKey)
  const user = await findUser(db, nameKey)
  if (!user || !(await passwordMatches(String(body.password ?? ''), user.password_hash))) {
    await recordFailure(db, nameKey)
    throw unauthorized('bad_credentials', 'Nombre o clave incorrectos')
  }
  return { data: { user: publicUser(user) }, cookie: await startSession(db, request, user.id) }
}

// Sin correo, el código de recuperación es la única vía; al usarlo se entrega uno nuevo.
export async function recover({ db, request, body }) {
  const nameKey = usernameKey(String(body.name ?? '').trim())
  const password = validPassword(body.newPassword)
  await assertNotThrottled(db, nameKey)
  const user = await findUser(db, nameKey)
  if (!user || user.recovery_hash !== recoveryFingerprint(body.recoveryCode)) {
    await recordFailure(db, nameKey)
    throw unauthorized('bad_recovery_code', 'El nombre o el código de recuperación no coinciden')
  }
  const recoveryCode = newRecoveryCode()
  await db.query(`update users set password_hash = $1, recovery_hash = $2 where id = $3`, [
    await hashPassword(password),
    recoveryFingerprint(recoveryCode),
    user.id,
  ])
  await endAllSessions(db, user.id)
  return { data: { user: publicUser(user), recoveryCode }, cookie: await startSession(db, request, user.id) }
}

// Para el administrador (server/admin.js): cuando alguien perdió la clave y también su código.
export async function issueRecoveryCode(db, name) {
  const recoveryCode = newRecoveryCode()
  const [user] = await db.query(`update users set recovery_hash = $1 where name_key = $2 returning name`, [
    recoveryFingerprint(recoveryCode),
    usernameKey(name),
  ])
  return user ? { name: user.name, recoveryCode } : null
}

export async function logOut({ db, request }) {
  return { data: { ok: true }, cookie: await endSession(db, request) }
}

export async function me({ user }) {
  return { data: { user: user ? publicUser(user) : null } }
}
