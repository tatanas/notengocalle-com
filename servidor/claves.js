import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derivarLlave = promisify(scrypt)
const LARGO_DE_LLAVE = 64
// Costo de scrypt: la memoria por intento es 128 × COST × 8 bytes (hoy 64 MB). Subirlo encarece cada intento
// de quien robe los hashes e intente adivinar claves.
export const COSTO = 65536
const BYTES_MAXIMOS_DE_MEMORIA = 256 * 1024 * 1024

// Formato guardado: scrypt$<costo>$<sal>$<hash>. El costo va dentro para poder subirlo sin invalidar claves viejas.
export async function cifrarClave(clave, costo = COSTO) {
  const sal = randomBytes(16)
  const llave = await derivarLlave(clave, sal, LARGO_DE_LLAVE, { N: costo, maxmem: BYTES_MAXIMOS_DE_MEMORIA })
  return ['scrypt', costo, sal.toString('base64'), llave.toString('base64')].join('$')
}

export async function claveCoincide(clave, almacenada) {
  const [, costo, sal, llave] = almacenada.split('$')
  const esperado = Buffer.from(llave, 'base64')
  const obtenido = await derivarLlave(clave, Buffer.from(sal, 'base64'), esperado.length, {
    N: +costo,
    maxmem: BYTES_MAXIMOS_DE_MEMORIA,
  })
  return timingSafeEqual(obtenido, esperado)
}

// Un hash guardado con menos costo que el actual se recalcula la próxima vez que la persona entra.
export const necesitaRecifrado = almacenada => +almacenada.split('$')[1] < COSTO

// Los tokens son aleatorios y largos: basta un hash rápido para no guardarlos en claro.
export const huella = secreto => createHash('sha256').update(secreto).digest('hex')

export const fichaNueva = () => randomBytes(32).toString('base64url')

const MS_LIMITE_DE_REVISION_DE_FILTRACION = 2500

// ¿Esta clave aparece en filtraciones públicas? Se consulta Pwned Passwords (Have I Been Pwned), que nunca recibe
// la clave: solo los primeros 5 caracteres de su SHA-1, y la comparación se hace aquí (k-anonimato).
// Si el servicio no responde se deja pasar: una caída ajena no debe impedir registrarse.
export async function claveFiltrada(clave, pedirDesde = fetch) {
  const sha1 = createHash('sha1').update(clave).digest('hex').toUpperCase()
  try {
    const respuesta = await pedirDesde(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(MS_LIMITE_DE_REVISION_DE_FILTRACION),
    })
    if (!respuesta.ok) return false
    const sufijo = sha1.slice(5)
    return (await respuesta.text()).split(/\r?\n/).some(linea => {
      const [candidata, cantidad] = linea.split(':')
      return candidata === sufijo && +cantidad > 0
    })
  } catch {
    return false
  }
}
