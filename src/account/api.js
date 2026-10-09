// Códigos propios de este cliente, además de los que devuelve el servidor (ver server/errors.js).
export const OFFLINE = 'offline'
export const UNAVAILABLE = 'unavailable'

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function api(method, path, body) {
  let response
  try {
    response = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, OFFLINE, 'No hay conexión')
  }
  // Un hosting sin funciones (o el service worker sin red) responde HTML en vez del API.
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(response.status, UNAVAILABLE, 'Las cuentas no están disponibles en este momento')
  const data = await response.json()
  if (!response.ok) throw new ApiError(response.status, data.error, data.message)
  return data
}
