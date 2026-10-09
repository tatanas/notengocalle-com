// Reglas de cuentas que conocen tanto el formulario como el servidor.
export const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]{3,20}$/u
export const USERNAME_RULES = 'De 3 a 20 letras, números, puntos o guiones, sin espacios.'
export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_MAX_LENGTH = 200

// Dos nombres que solo difieren en mayúsculas o tildes son el mismo usuario.
export const usernameKey = name => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
