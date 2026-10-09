import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
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

// Los tokens y códigos son aleatorios y largos: basta un hash rápido para no guardarlos en claro.
export const fingerprint = secret => createHash('sha256').update(secret).digest('hex')

export const newToken = () => randomBytes(32).toString('base64url')

// Sin 0/O ni 1/I/L, que se confunden al copiar a mano.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_GROUPS = 3
const CODE_GROUP_LENGTH = 4

export function newRecoveryCode() {
  const group = () =>
    Array.from({ length: CODE_GROUP_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
  return Array.from({ length: CODE_GROUPS }, group).join('-')
}

export const normalizeRecoveryCode = code =>
  String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

export const recoveryFingerprint = code => fingerprint(normalizeRecoveryCode(code))
