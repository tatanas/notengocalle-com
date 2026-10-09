import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)
const KEY_LENGTH = 64
// Costo de scrypt: la memoria por intento es 128 × COST × 8 bytes (hoy 64 MB). Subirlo encarece cada intento
// de quien robe los hashes e intente adivinar claves.
export const COST = 65536
const MAX_MEMORY_BYTES = 256 * 1024 * 1024

// Formato guardado: scrypt$<costo>$<sal>$<hash>. El costo va dentro para poder subirlo sin invalidar claves viejas.
export async function hashPassword(password, cost = COST) {
  const salt = randomBytes(16)
  const key = await deriveKey(password, salt, KEY_LENGTH, { N: cost, maxmem: MAX_MEMORY_BYTES })
  return ['scrypt', cost, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function passwordMatches(password, stored) {
  const [, cost, salt, key] = stored.split('$')
  const expected = Buffer.from(key, 'base64')
  const actual = await deriveKey(password, Buffer.from(salt, 'base64'), expected.length, {
    N: +cost,
    maxmem: MAX_MEMORY_BYTES,
  })
  return timingSafeEqual(actual, expected)
}

// Un hash guardado con menos costo que el actual se recalcula la próxima vez que la persona entra.
export const needsRehash = stored => +stored.split('$')[1] < COST

// Los tokens son aleatorios y largos: basta un hash rápido para no guardarlos en claro.
export const fingerprint = secret => createHash('sha256').update(secret).digest('hex')

export const newToken = () => randomBytes(32).toString('base64url')

const BREACH_CHECK_TIMEOUT_MS = 2500

// ¿Esta clave aparece en filtraciones públicas? Se consulta Pwned Passwords (Have I Been Pwned), que nunca recibe
// la clave: solo los primeros 5 caracteres de su SHA-1, y la comparación se hace aquí (k-anonimato).
// Si el servicio no responde se deja pasar: una caída ajena no debe impedir registrarse.
export async function isBreachedPassword(password, fetchFrom = fetch) {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
  try {
    const response = await fetchFrom(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(BREACH_CHECK_TIMEOUT_MS),
    })
    if (!response.ok) return false
    const suffix = sha1.slice(5)
    return (await response.text()).split(/\r?\n/).some(line => {
      const [candidate, count] = line.split(':')
      return candidate === suffix && +count > 0
    })
  } catch {
    return false
  }
}
