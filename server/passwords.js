import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)
const KEY_LENGTH = 64
const COST = 16384

// Formato guardado: scrypt$<costo>$<sal>$<hash>, para poder subir el costo más adelante.
export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await deriveKey(password, salt, KEY_LENGTH, { N: COST })
  return ['scrypt', COST, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function passwordMatches(password, stored) {
  const [, cost, salt, key] = stored.split('$')
  const expected = Buffer.from(key, 'base64')
  const actual = await deriveKey(password, Buffer.from(salt, 'base64'), expected.length, { N: +cost })
  return timingSafeEqual(actual, expected)
}

// Los tokens son aleatorios y largos: basta un hash rápido para no guardarlos en claro.
export const fingerprint = secret => createHash('sha256').update(secret).digest('hex')

export const newToken = () => randomBytes(32).toString('base64url')
