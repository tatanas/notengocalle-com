import { ID_DE_CLIENTE_DE_GOOGLE } from '../compartido/configuracion.js'
import { noAutorizado } from './errores.js'

const URL_DE_LLAVES = 'https://www.googleapis.com/oauth2/v3/certs'
const EMISORES = ['accounts.google.com', 'https://accounts.google.com']
const SEGUNDOS_DE_DESFASE_TOLERADO = 60
const ALGORITMO = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }

let enCache = { vencen: 0, llaves: [] }

// Google rota sus llaves: se guardan lo que diga su Cache-Control, y se vuelven a pedir si llega una desconocida.
export async function llavesPublicasDeGoogle({ forzar = false } = {}, pedir = fetch) {
  if (!forzar && Date.now() < enCache.vencen) return enCache.llaves
  const respuesta = await pedir(URL_DE_LLAVES)
  if (!respuesta.ok) throw new Error(`Google respondió ${respuesta.status} al pedir sus llaves`)
  const { keys } = await respuesta.json()
  const segundos = +(respuesta.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 3600)
  enCache = { vencen: Date.now() + segundos * 1000, llaves: keys }
  return keys
}

const tokenInvalido = () => noAutorizado('google_invalido', 'No se pudo verificar tu cuenta de Google')
const decodificar = parte => JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'))

function partesDelToken(credencial) {
  const partes = typeof credencial === 'string' ? credencial.split('.') : []
  if (partes.length !== 3) throw tokenInvalido()
  try {
    return { partes, encabezado: decodificar(partes[0]), contenido: decodificar(partes[1]) }
  } catch {
    throw tokenInvalido()
  }
}

async function llaveDelToken(encabezado, obtenerLlaves) {
  const buscar = llaves => llaves.find(llave => llave.kid === encabezado.kid)
  const jwk = buscar(await obtenerLlaves()) ?? buscar(await obtenerLlaves({ forzar: true }))
  if (!jwk) throw tokenInvalido()
  return crypto.subtle.importKey('jwk', jwk, ALGORITMO, false, ['verify'])
}

const vigente = contenido =>
  typeof contenido.exp === 'number' && contenido.exp > Date.now() / 1000 - SEGUNDOS_DE_DESFASE_TOLERADO

// Verifica el ID token que Google le dio al navegador y devuelve solo su identificador fijo (sub). El token trae
// además nombre, correo y foto: no se leen ni se guardan.
export async function identificadorDeGoogle(credencial, obtenerLlaves = llavesPublicasDeGoogle) {
  const { partes, encabezado, contenido } = partesDelToken(credencial)
  if (encabezado.alg !== 'RS256') throw tokenInvalido()
  const firmaValida = await crypto.subtle.verify(
    ALGORITMO,
    await llaveDelToken(encabezado, obtenerLlaves),
    Buffer.from(partes[2], 'base64url'),
    new TextEncoder().encode(`${partes[0]}.${partes[1]}`),
  )
  const valido =
    firmaValida &&
    contenido.aud === ID_DE_CLIENTE_DE_GOOGLE &&
    EMISORES.includes(contenido.iss) &&
    vigente(contenido) &&
    typeof contenido.sub === 'string' &&
    contenido.sub.length > 0
  if (!valido) throw tokenInvalido()
  return contenido.sub
}
