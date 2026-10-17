import { almacen } from '../nucleo/almacen.js'
import { alRegistrarRespuesta, estadisticas, fusionarEstadisticas } from '../nucleo/progreso.js'
import { api } from './api.js'
import { alCambiarLaSesion, usuario } from './sesion.js'

// Con cuenta, el progreso de práctica ("% dominado", puntos débiles) es el mismo en todos los dispositivos: al entrar se
// trae el del servidor y se junta con el de este navegador, y cada respuesta se sube unos segundos después.
// Sin cuenta (o sin conexión) queda pendiente en el navegador y se sube al entrar.
const ESPERA_ANTES_DE_SUBIR_MS = 4000
const BYTES_MAXIMOS_POR_ENVIO = 8000

const pendientes = new Set(almacen.get('progresoPendiente', []))
const guardarPendientes = () => almacen.set('progresoPendiente', [...pendientes])
let temporizadorDeSubida = null
let subiendo = false
let usuarioTraido = null

const oyentesDelProgresoTraido = new Set()
export const alTraerProgreso = oyente => oyentesDelProgresoTraido.add(oyente)

// El servidor acepta envíos chicos: las llaves pendientes se reparten en tandas.
function tandasDePendientes() {
  const tandas = []
  let tanda = {}
  let bytes = 0
  for (const llave of pendientes) {
    const entrada = estadisticas[llave]
    if (!entrada) continue
    const copia = { n: entrada.n, ok: entrada.ok, streak: entrada.streak, last: entrada.last ?? 0 }
    const tamano = JSON.stringify([llave, copia]).length
    if (bytes && bytes + tamano > BYTES_MAXIMOS_POR_ENVIO) {
      tandas.push(tanda)
      tanda = {}
      bytes = 0
    }
    tanda[llave] = copia
    bytes += tamano
  }
  if (bytes) tandas.push(tanda)
  return tandas
}

async function subirPendientes() {
  if (!usuario || subiendo || !pendientes.size) return
  subiendo = true
  try {
    for (const tanda of tandasDePendientes()) {
      await api('POST', '/progreso', { estadisticas: tanda })
      // Si se volvió a responder mientras subía, esa llave sigue pendiente.
      for (const [llave, enviada] of Object.entries(tanda))
        if (estadisticas[llave]?.last === enviada.last) pendientes.delete(llave)
      guardarPendientes()
    }
  } catch {
    // Sin conexión o sin sesión: queda pendiente para la próxima vez.
  } finally {
    subiendo = false
  }
}

function programarSubida() {
  clearTimeout(temporizadorDeSubida)
  temporizadorDeSubida = setTimeout(subirPendientes, ESPERA_ANTES_DE_SUBIR_MS)
}

async function traerProgreso() {
  const nombre = usuario?.nombre
  if (!nombre || nombre === usuarioTraido) return
  try {
    const { estadisticas: traidas } = await api('GET', '/progreso')
    usuarioTraido = nombre
    for (const llave of fusionarEstadisticas(traidas)) pendientes.add(llave)
    guardarPendientes()
    for (const oyente of oyentesDelProgresoTraido) oyente()
    subirPendientes()
  } catch {
    // Sin conexión: se intenta de nuevo la próxima vez que cambie la sesión o se abra el juego.
  }
}

alRegistrarRespuesta(llave => {
  pendientes.add(llave)
  guardarPendientes()
  programarSubida()
})

alCambiarLaSesion(() => {
  if (usuario) traerProgreso()
  else usuarioTraido = null
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') subirPendientes()
})

// "Borrar progreso" en Mi progreso: también el de la cuenta, o volvería desde el servidor.
export async function borrarProgresoCompartido() {
  pendientes.clear()
  guardarPendientes()
  if (usuario) await api('POST', '/progreso/borrar').catch(() => {})
}
