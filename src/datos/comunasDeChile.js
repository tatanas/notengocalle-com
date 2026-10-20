import { DATOS, REGIONES, comunaPorNombre } from './datos.js'

// Las comunas de todo Chile. El índice (nombre, región, punto de la etiqueta, límites, km²) viene en data.js; los polígonos, que
// pesan, se bajan recién al jugarlas (public/data/comunas-chile.js, hecho por tools/comunas_chile.js). Las de la Región
// Metropolitana ya están en data.js, con más detalle.

export const REGIONES_DE_COMUNAS = REGIONES.map(region => region.properties.name)
export const COMUNAS_DE_CHILE = (DATOS.comunasChile ?? []).map(
  ([name, region, lat, lon, sur, oeste, norte, este, km2]) => ({
    name,
    region,
    lab: [lat, lon],
    limites: [
      [sur, oeste],
      [norte, este],
    ],
    km2,
  }),
)
const comunasPorRegion = new Map()
for (const comuna of COMUNAS_DE_CHILE)
  comunasPorRegion.set(comuna.region, [...(comunasPorRegion.get(comuna.region) ?? []), comuna])
export const comunasDeLaRegion = region => comunasPorRegion.get(region) ?? []

let promesaDeLosPoligonos = null

// Baja los polígonos de las comunas de fuera de la Región Metropolitana (una sola vez).
export function cargarComunasDeChile() {
  promesaDeLosPoligonos ??= new Promise((resolver, rechazar) => {
    if (window.COMUNAS_CHILE) return resolver()
    const script = document.createElement('script')
    script.src = '/data/comunas-chile.js'
    script.onload = resolver
    script.onerror = () => {
      script.remove()
      promesaDeLosPoligonos = null
      rechazar(new Error('No se pudieron bajar las comunas de Chile'))
    }
    document.head.appendChild(script)
  })
  return promesaDeLosPoligonos
}

// La comuna como rasgo GeoJSON, igual a las de la Región Metropolitana (properties: name, region, lab [lon, lat], km2).
// Solo sirve después de cargarComunasDeChile().
const rasgos = new Map()
export function rasgoDeComuna(comuna) {
  if (!rasgos.has(comuna.name))
    rasgos.set(
      comuna.name,
      comunaPorNombre[comuna.name] ?? {
        type: 'Feature',
        properties: {
          name: comuna.name,
          region: comuna.region,
          lab: [comuna.lab[1], comuna.lab[0]],
          km2: comuna.km2,
        },
        geometry: window.COMUNAS_CHILE[comuna.name],
      },
    )
  return rasgos.get(comuna.name)
}
