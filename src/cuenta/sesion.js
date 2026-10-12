import { almacen } from '../nucleo/almacen.js'
import { NO_DISPONIBLE, api } from './api.js'

// Se recuerda el nombre para pintar el botón de cuenta al instante; el servidor confirma después.
const guardado = almacen.get('user', null)
export let usuario = guardado?.nombre ? guardado : null
export let cuentasDisponibles = true

const oyentes = new Set()

export function alCambiarLaSesion(oyente) {
  oyentes.add(oyente)
  oyente()
}

function fijarUsuario(siguiente) {
  usuario = siguiente
  almacen.set('user', usuario)
  for (const oyente of oyentes) oyente()
}

export async function restaurarSesion() {
  try {
    fijarUsuario((await api('GET', '/yo')).usuario)
  } catch (error) {
    if (error.codigo !== NO_DISPONIBLE) return
    cuentasDisponibles = false
    fijarUsuario(null)
  }
}

export function sesionExpirada() {
  fijarUsuario(null)
}

export async function registrarse(nombre, clave) {
  fijarUsuario((await api('POST', '/registrarse', { nombre, clave })).usuario)
}

export async function entrar(nombre, clave) {
  fijarUsuario((await api('POST', '/entrar', { nombre, clave })).usuario)
}

export async function salir() {
  await api('POST', '/salir').catch(() => {})
  fijarUsuario(null)
}
