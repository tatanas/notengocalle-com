import { api } from './api.js'

// Avisa al servidor que un punto de Street View no sirve. Si no hay conexión o cuentas, no pasa nada: el punto
// igual queda descartado en este dispositivo.
export const reportarPunto = reporte => api('POST', '/reportes', reporte).catch(() => {})
