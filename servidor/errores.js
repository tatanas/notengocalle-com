// Todo error esperable sale como { error: código, mensaje: texto para el usuario } con su estado HTTP.
export class ErrorHttp extends Error {
  constructor(estado, codigo, mensaje) {
    super(mensaje)
    this.estado = estado
    this.codigo = codigo
  }
}

export const invalido = (codigo, mensaje) => new ErrorHttp(400, codigo, mensaje)
export const noAutorizado = (codigo, mensaje) => new ErrorHttp(401, codigo, mensaje)
export const prohibido = mensaje => new ErrorHttp(403, 'prohibido', mensaje)
export const noEncontrado = () => new ErrorHttp(404, 'no_encontrado', 'Esa dirección no existe')
export const conflicto = (codigo, mensaje) => new ErrorHttp(409, codigo, mensaje)
export const demasiados = mensaje => new ErrorHttp(429, 'demasiados_intentos', mensaje)
// El cliente trata 'no_disponible' como "este sitio no tiene cuentas" y sigue funcionando sin ellas.
export const noDisponible = () =>
  new ErrorHttp(503, 'no_disponible', 'Las cuentas no están configuradas en este servidor')
