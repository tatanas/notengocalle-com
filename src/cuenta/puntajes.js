import { almacen } from '../nucleo/almacen.js'
import { SIN_CONEXION, api } from './api.js'
import { cuentasDisponibles, alCambiarLaSesion, sesionExpirada, usuario } from './sesion.js'

// Rondas oficiales que aún no llegan al servidor: jugadas sin cuenta o sin conexión.
const MAXIMO_PENDIENTES = 20
const bandejaDeSalida = almacen.get('outbox', [])
const guardarBandejaDeSalida = () => almacen.set('outbox', bandejaDeSalida)

function encolar(resultado) {
  bandejaDeSalida.push(resultado)
  bandejaDeSalida.splice(0, bandejaDeSalida.length - MAXIMO_PENDIENTES)
  guardarBandejaDeSalida()
}

const NO_AUTORIZADO = 401

// Devuelve { estado } con 'guardado' (más puesto, jugadores, mejoro, mejor), 'invitado', 'sin_conexion', 'no_disponible' o 'rechazado'.
export async function enviarRondaOficial(resultado) {
  if (!cuentasDisponibles) return { estado: 'no_disponible' }
  if (!usuario) {
    encolar(resultado)
    return { estado: 'invitado' }
  }
  try {
    return { estado: 'guardado', ...(await api('POST', '/puntajes', resultado)) }
  } catch (error) {
    if (error.codigo === SIN_CONEXION) {
      encolar(resultado)
      return { estado: 'sin_conexion' }
    }
    if (error.estado === NO_AUTORIZADO) {
      encolar(resultado)
      sesionExpirada()
      return { estado: 'invitado' }
    }
    return { estado: 'rechazado', mensaje: error.message }
  }
}

// Lo que respondió el servidor por cada ronda pendiente que ya se envió.
const entregados = new WeakMap()
export const entregaDe = resultado => entregados.get(resultado)

let vaciando = null

// Envía lo pendiente; si ya hay un envío en curso, espera ese mismo.
export function vaciarBandejaDeSalida() {
  vaciando ||= enviarPendientes().finally(() => (vaciando = null))
  return vaciando
}

async function enviarPendientes() {
  while (usuario && bandejaDeSalida.length) {
    const resultado = bandejaDeSalida[0]
    try {
      entregados.set(resultado, await api('POST', '/puntajes', resultado))
    } catch (error) {
      if (error.codigo === SIN_CONEXION || error.estado === NO_AUTORIZADO) break
    }
    bandejaDeSalida.shift()
    guardarBandejaDeSalida()
  }
}

alCambiarLaSesion(vaciarBandejaDeSalida)

export const pedirTabla = (modo, categoria, periodo) =>
  api('GET', `/tabla?modo=${encodeURIComponent(modo)}&categoria=${categoria}&periodo=${periodo}`)

export const pedirLideres = (categoria, periodo) =>
  api('GET', `/lideres?categoria=${categoria}&periodo=${periodo}`)
