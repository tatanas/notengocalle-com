import { invalido } from './errores.js'

// Reportes de puntos de Street View que no sirven (hoy, solo túneles). No piden cuenta: cualquiera puede avisar.
const MOTIVOS = ['tunel']
const MAXIMO_DE_CARACTERES_DEL_LUGAR = 120
const dentroDeSantiago = (lat, lon) => lat > -34.2 && lat < -32.9 && lon > -71.4 && lon < -69.9

export async function reportarPunto({ db, cuerpo }) {
  const lugar = String(cuerpo.lugar ?? '').slice(0, MAXIMO_DE_CARACTERES_DEL_LUGAR)
  const { lat, lon, motivo } = cuerpo
  const valido =
    lugar &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    dentroDeSantiago(lat, lon) &&
    MOTIVOS.includes(motivo)
  if (!valido) throw invalido('reporte_invalido', 'Reporte no válido')
  await db.query(`insert into reportes_de_puntos (lugar, lat, lon, motivo) values ($1, $2, $3, $4)`, [
    lugar,
    lat,
    lon,
    motivo,
  ])
  return { estado: 201, datos: { ok: true } }
}
