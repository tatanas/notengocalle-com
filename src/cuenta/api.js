// Códigos propios de este cliente, además de los que devuelve el servidor (ver servidor/errores.js).
export const SIN_CONEXION = 'sin_conexion'
export const NO_DISPONIBLE = 'no_disponible'

export class ErrorDeApi extends Error {
  constructor(estado, codigo, mensaje) {
    super(mensaje)
    this.estado = estado
    this.codigo = codigo
  }
}

export async function api(metodo, camino, cuerpo) {
  let respuesta
  try {
    respuesta = await fetch('/api' + camino, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
  } catch {
    throw new ErrorDeApi(0, SIN_CONEXION, 'No hay conexión')
  }
  // Un hosting sin funciones (o el service worker sin red) responde HTML en vez del API.
  if (!respuesta.headers.get('content-type')?.includes('application/json'))
    throw new ErrorDeApi(respuesta.status, NO_DISPONIBLE, 'Las cuentas no están disponibles en este momento')
  const datos = await respuesta.json()
  if (!respuesta.ok) throw new ErrorDeApi(respuesta.status, datos.error, datos.mensaje)
  return datos
}
