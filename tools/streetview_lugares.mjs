// Arma la lista de lugares del juego "¿Dónde estás?" (Street View): 100 puntos entre lugares emblemáticos y calles,
// cada uno comprobado contra Street View (que haya panorama a nivel de calle, que no sea un túnel).
// Necesita la llave de Google en .env.local y se ejecuta desde la raíz del proyecto:
//   node tools/streetview_lugares.mjs
// Escribe src/datos/lugaresStreetView.json. Usa la API de Google: son unas pocas centenas de consultas.
import fs from 'node:fs'

process.env.URL_BASE = 'http://localhost:8765' // la llave solo autoriza localhost
const { iniciarServidor, abrirNavegador } = await import('../pruebas/apoyo.js')

const llave = fs.readFileSync('.env.local', 'utf8').match(/^GOOGLE_MAPS_KEY=(.+)$/m)?.[1]?.trim()
if (!llave) throw new Error('Falta GOOGLE_MAPS_KEY en .env.local')

const datos = (() => {
  const ventana = {}
  new Function('window', fs.readFileSync('public/data/data.js', 'utf8'))(ventana)
  return ventana.DATA
})()

// ----- azar con semilla, para que la lista salga igual cada vez
function azarConSemilla(semilla) {
  let estado = semilla
  return () => {
    estado = (estado + 0x6d2b79f5) | 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const azar = azarConSemilla(20261012)
const mezclar = lista => {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// ----- geometría (km, proyección plana válida en Santiago)
const KM_LAT = 111.2
const KM_LON = 92.9
const distanciaKm = (a, b) => Math.hypot((a[0] - b[0]) * KM_LAT, (a[1] - b[1]) * KM_LON)
function distanciaYRumboALinea(punto, lineas) {
  let mejor = { km: Infinity, rumbo: 0 }
  for (const linea of lineas)
    for (let i = 0; i < linea.length - 1; i++) {
      const ax = (linea[i][1] - punto[1]) * KM_LON
      const ay = (linea[i][0] - punto[0]) * KM_LAT
      const dx = (linea[i + 1][1] - punto[1]) * KM_LON - ax
      const dy = (linea[i + 1][0] - punto[0]) * KM_LAT - ay
      const largo2 = dx * dx + dy * dy
      const t = largo2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo2)) : 0
      const km = Math.hypot(ax + t * dx, ay + t * dy)
      if (km < mejor.km) mejor = { km, rumbo: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 }
    }
  return mejor
}
const rumboHacia = (desde, hacia) =>
  ((Math.atan2((hacia[1] - desde[1]) * KM_LON, (hacia[0] - desde[0]) * KM_LAT) * 180) / Math.PI + 360) % 360

// ----- Street View desde una página con la llave
const detener = await iniciarServidor({ reconstruir: false })
const navegador = await abrirNavegador()
const pagina = await navegador.newPage()
await pagina.goto('http://localhost:8765/', { waitUntil: 'networkidle2' })
await pagina.evaluate(
  llaveDeGoogle =>
    new Promise((resolver, rechazar) => {
      window.__listo = () => resolver()
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${llaveDeGoogle}&v=weekly&loading=async&callback=__listo`
      script.onerror = () => rechazar(new Error('No cargó Google Maps'))
      document.head.appendChild(script)
    }),
  llave,
)
await pagina.evaluate(async () => {
  await google.maps.importLibrary('streetView')
})

async function panoramaCerca(lat, lon, radio) {
  return pagina.evaluate(
    async (latitud, longitud, radioM) => {
      try {
        const r = await new google.maps.StreetViewService().getPanorama({
          location: { lat: latitud, lng: longitud },
          radius: radioM,
          preference: 'nearest',
          sources: ['google'],
        })
        const l = r.data.location
        return { lat: l.latLng.lat(), lon: l.latLng.lng(), pano: l.pano, descripcion: l.description ?? '' }
      } catch {
        return null
      }
    },
    lat,
    lon,
    radio,
  )
}
const esTunel = descripcion => /t[uú]nel|subterr|hundid|paso bajo|bajo nivel/i.test(descripcion)

const resultado = []
const nombresUsados = new Set()
const redondear = x => +x.toFixed(5)
function agregar(nombre, tipo, comuna, panorama, rumbo) {
  nombresUsados.add(nombre)
  resultado.push({ nombre, tipo, comuna, lat: redondear(panorama.lat), lon: redondear(panorama.lon), rumbo: Math.round(rumbo) })
}

// ----- los tres lugares de prueba de siempre (ya revisados a mano)
const MANUALES = [
  { nombre: 'Kennedy con Las Tranqueras', comuna: 'Vitacura', lat: -33.39089, lon: -70.55333, rumbo: 180 },
  { nombre: 'Rotonda Atenas', comuna: 'Las Condes', lat: -33.41717, lon: -70.5531, rumbo: 180 },
  { nombre: 'Frente al Estadio Nacional', comuna: 'Ñuñoa', lat: -33.46211, lon: -70.61037, rumbo: 180 },
]
for (const manual of MANUALES) {
  const panorama = await panoramaCerca(manual.lat, manual.lon, 40)
  if (!panorama) throw new Error('Sin cobertura en ' + manual.nombre)
  agregar(manual.nombre, 'lugar', manual.comuna, panorama, manual.rumbo)
}

// ----- lugares emblemáticos
const CUPOS = {
  'Malls y edificios': 7,
  'Centro histórico': 6,
  Deporte: 5,
  Cultura: 5,
  Salud: 4,
  'Gobierno y justicia': 4,
  Universidades: 6,
  Colegios: 2,
  Religión: 3,
  Transporte: 2,
  'Restaurantes y bares': 1,
  'Cerros y parques': 2,
}
const EXCLUIDOS = /Teleférico|Cerro |Valle Nevado|Farellones|Quebrada/
let rechazadosPorTunel = 0
for (const [categoria, cupo] of Object.entries(CUPOS)) {
  let elegidos = 0
  const candidatos = mezclar(
    datos.landmarks.filter(
      l => l.cat === categoria && !EXCLUIDOS.test(l.name) && (categoria !== 'Cerros y parques' || /^Parque/.test(l.name)),
    ),
  )
  for (const lugar of candidatos) {
    if (elegidos >= cupo) break
    if (nombresUsados.has(lugar.name)) continue
    const panorama = await panoramaCerca(lugar.lat, lugar.lon, 60)
    if (!panorama) continue
    if (esTunel(panorama.descripcion)) {
      rechazadosPorTunel++
      continue
    }
    const rumbo = distanciaKm([panorama.lat, panorama.lon], [lugar.lat, lugar.lon]) < 0.015 ? azar() * 360 : rumboHacia([panorama.lat, panorama.lon], [lugar.lat, lugar.lon])
    agregar(lugar.name, 'lugar', lugar.comuna, panorama, rumbo)
    elegidos++
  }
  console.log(`${categoria}: ${elegidos}/${cupo}`)
}

// ----- calles: un punto al azar de cada una, con panorama sobre la calle misma
const comunasUrbanas = new Set(datos.comunas.features.filter(f => f.properties.group === 'core').map(f => f.properties.name))
const calles = mezclar(
  datos.streets.filter(
    c => (!c.kind || c.kind === 'calle') && c.km >= 1 && c.km <= 20 && comunasUrbanas.has(c.comunas[0]),
  ),
)
const porComuna = {}
const META_DE_CALLES = 100 - resultado.length
let hechas = 0
for (const calle of calles) {
  if (hechas >= META_DE_CALLES) break
  const comuna = calle.comunas[0]
  if ((porComuna[comuna] ?? 0) >= 4) continue
  const lineaLarga = calle.lines.reduce((a, b) => (b.length > a.length ? b : a))
  for (let intento = 0; intento < 5; intento++) {
    const punto = lineaLarga[Math.floor(lineaLarga.length * (0.15 + azar() * 0.7))]
    const panorama = await panoramaCerca(punto[0], punto[1], 30)
    if (!panorama || esTunel(panorama.descripcion)) {
      if (panorama) rechazadosPorTunel++
      continue
    }
    const sobreLaCalle = distanciaYRumboALinea([panorama.lat, panorama.lon], calle.lines)
    if (sobreLaCalle.km > 0.03) continue
    agregar(calle.name, 'calle', comuna, panorama, sobreLaCalle.rumbo + (azar() < 0.5 ? 0 : 180))
    porComuna[comuna] = (porComuna[comuna] ?? 0) + 1
    hechas++
    break
  }
}
console.log(`calles: ${hechas}/${META_DE_CALLES}; descartados por túnel: ${rechazadosPorTunel}`)

fs.writeFileSync('src/datos/lugaresStreetView.json', JSON.stringify(resultado, null, 1))
console.log('Total:', resultado.length, 'lugares escritos en src/datos/lugaresStreetView.json')
await navegador.close()
await detener()
