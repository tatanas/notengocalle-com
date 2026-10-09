// Todo error esperable sale como { error: código, message: texto para el usuario } con su status HTTP.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const invalid = (code, message) => new HttpError(400, code, message)
export const unauthorized = (code, message) => new HttpError(401, code, message)
export const forbidden = message => new HttpError(403, 'forbidden', message)
export const notFound = () => new HttpError(404, 'not_found', 'Esa dirección no existe')
export const conflict = (code, message) => new HttpError(409, code, message)
export const tooMany = message => new HttpError(429, 'too_many', message)
// El cliente trata 'unavailable' como "este sitio no tiene cuentas" y sigue funcionando sin ellas.
export const unavailable = () =>
  new HttpError(503, 'unavailable', 'Las cuentas no están configuradas en este servidor')
