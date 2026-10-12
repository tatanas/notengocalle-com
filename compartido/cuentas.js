// Reglas de cuentas que conocen tanto el formulario como el servidor.
export const PATRON_DE_USUARIO = /^[\p{L}\p{N}_.-]{3,20}$/u
export const REGLAS_DE_USUARIO = 'De 3 a 20 letras, números, puntos o guiones, sin espacios.'
export const LARGO_MINIMO_DE_CLAVE = 8
export const LARGO_MAXIMO_DE_CLAVE = 200

// Dos nombres que solo difieren en mayúsculas o tildes son el mismo usuario.
export const llaveDeUsuario = nombre => nombre.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
