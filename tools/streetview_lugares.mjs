// Arma los lugares del juego "¿Dónde estás?" (Street View): todas las calles, con varios puntos repartidos a lo largo
// de cada una (uno cada ~1,2 km; cada vez que sale la calle, el juego elige uno al azar, para ir conociendo cómo se ve en
// distintos tramos), y hasta 3 puntos en las calles más cercanas a cada lugar emblemático importante, por lados distintos (no dentro del recinto: estacionamientos, patios o estaciones de metro no sirven para
// aprender a ubicarse en la ciudad). Cada punto se comprueba contra Street View: panorama oficial de Google, al aire
// libre, sobre una calle pública y lejos de túneles.
// Necesita la llave de Google en .env.local y se ejecuta desde la raíz del proyecto:
//   node tools/streetview_lugares.mjs
// Para agregar o rehacer solo algunas preguntas sin tocar el resto (se mezclan con las que ya existen):
//   SV_CALLES="Costanera Norte|Américo Vespucio" SV_EXTRAS=1 SV_LUGARES="Templo Bahá'í" node tools/streetview_lugares.mjs
// y después correr tools/niveles_streetview.mjs.
// Escribe src/datos/lugaresStreetView.json. Son unas mil consultas de metadatos a la API de Google.
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

// ----- azar con semilla, para que el resultado salga igual cada vez
function azarConSemilla(semilla) {
  let estado = semilla
  return () => {
    estado = (estado + 0x6d2b79f5) | 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const azar = azarConSemilla(20261013)

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

// Un punto sobre el trazado de una calle a cierta fracción (0 a 1) de su largo total.
function puntoEnLaCalle(calle, fraccion) {
  const tramos = []
  let total = 0
  for (const linea of calle.lines)
    for (let i = 0; i < linea.length - 1; i++) {
      const largo = distanciaKm(linea[i], linea[i + 1])
      tramos.push({ a: linea[i], b: linea[i + 1], largo })
      total += largo
    }
  let objetivo = fraccion * total
  for (const tramo of tramos) {
    if (objetivo <= tramo.largo) {
      const t = tramo.largo ? objetivo / tramo.largo : 0
      return [tramo.a[0] + t * (tramo.b[0] - tramo.a[0]), tramo.a[1] + t * (tramo.b[1] - tramo.a[1])]
    }
    objetivo -= tramo.largo
  }
  return tramos[0].a
}

// ----- túneles: OpenStreetMap sabe qué calles van bajo tierra; un panorama sobre ellas se descarta
const TUNELES = []
for (const archivo of fs.readdirSync('tools/btiles')) {
  const datosOsm = JSON.parse(fs.readFileSync('tools/btiles/' + archivo, 'utf8'))
  for (const via of datosOsm.elements)
    if (via.type === 'way' && via.geometry && via.tags?.highway && via.tags.tunnel === 'yes')
      TUNELES.push(via.geometry.map(p => [p.lat, p.lon]))
}
// Se puede caminar hasta 80 m desde el punto de partida: un túnel más cerca que eso ya es alcanzable.
const DISTANCIA_A_UN_TUNEL_KM = 0.1
// Túneles que OpenStreetMap no marca como tales (descubiertos jugando): [lat, lon, radio en km].
const ZONAS_EXCLUIDAS = [
  [-33.41274, -70.5826, 0.25], // Los Militares, túnel bajo la avenida
]
const cajaDe = linea => ({
  minLat: Math.min(...linea.map(p => p[0])) - 0.0013,
  maxLat: Math.max(...linea.map(p => p[0])) + 0.0013,
  minLon: Math.min(...linea.map(p => p[1])) - 0.0013,
  maxLon: Math.max(...linea.map(p => p[1])) + 0.0013,
})
const TUNELES_CON_CAJA = TUNELES.map(linea => ({ linea, caja: cajaDe(linea) }))
const estaEnUnTunel = (panorama, distanciaMaxima = DISTANCIA_A_UN_TUNEL_KM) =>
  ZONAS_EXCLUIDAS.some(([lat, lon, radio]) => distanciaKm([panorama.lat, panorama.lon], [lat, lon]) <= radio) ||
  TUNELES_CON_CAJA.some(
    ({ linea, caja }) =>
      panorama.lat >= caja.minLat &&
      panorama.lat <= caja.maxLat &&
      panorama.lon >= caja.minLon &&
      panorama.lon <= caja.maxLon &&
      distanciaYRumboALinea([panorama.lat, panorama.lon], [linea]).km <= distanciaMaxima,
  )
let descartadosPorTunel = 0
console.log('tramos de túnel en los datos de OpenStreetMap:', TUNELES.length)

// ----- calles públicas de OpenStreetMap: un punto válido tiene que estar sobre una de ellas (no en un estacionamiento,
// un patio o un acceso privado)
const TIPOS_DE_CALLE_PUBLICA = new Set([
  'motorway', 'motorway_link', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian',
  'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
])
const TAMANO_DE_CELDA = 0.002
const celdas = new Map()
// Cruces entre calles con nombre distinto: ahí cuelgan los letreros con el nombre de la calle, así que se evitan.
const nombresPorVertice = new Map()
const llaveDeVertice = (lat, lon) => lat.toFixed(5) + ',' + lon.toFixed(5)
const llaveDeCelda = (lat, lon) => Math.floor(lat / TAMANO_DE_CELDA) + ':' + Math.floor(lon / TAMANO_DE_CELDA)
for (const archivo of fs.readdirSync('tools/btiles')) {
  const datosOsm = JSON.parse(fs.readFileSync('tools/btiles/' + archivo, 'utf8'))
  for (const via of datosOsm.elements) {
    const etiquetas = via.tags
    if (via.type !== 'way' || !via.geometry || !TIPOS_DE_CALLE_PUBLICA.has(etiquetas?.highway)) continue
    if (['private', 'no'].includes(etiquetas.access) || etiquetas.service) continue
    const linea = via.geometry.map(p => [p.lat, p.lon])
    const nombreDeLaVia = etiquetas.name ?? etiquetas.ref
    if (nombreDeLaVia)
      for (const [lat, lon] of linea) {
        const llave = llaveDeVertice(lat, lon)
        if (!nombresPorVertice.has(llave)) nombresPorVertice.set(llave, new Set())
        nombresPorVertice.get(llave).add(nombreDeLaVia)
      }
    const vistas = new Set()
    for (const [lat, lon] of linea) {
      const llave = llaveDeCelda(lat, lon)
      if (vistas.has(llave)) continue
      vistas.add(llave)
      if (!celdas.has(llave)) celdas.set(llave, [])
      celdas.get(llave).push(linea)
    }
  }
}
const DISTANCIA_A_UNA_CALLE_PUBLICA_KM = 0.015
function estaSobreUnaCalle(panorama) {
  const celdaLat = Math.floor(panorama.lat / TAMANO_DE_CELDA)
  const celdaLon = Math.floor(panorama.lon / TAMANO_DE_CELDA)
  for (let dLat = -1; dLat <= 1; dLat++)
    for (let dLon = -1; dLon <= 1; dLon++)
      for (const linea of celdas.get(celdaLat + dLat + ':' + (celdaLon + dLon)) ?? [])
        if (distanciaYRumboALinea([panorama.lat, panorama.lon], [linea]).km <= DISTANCIA_A_UNA_CALLE_PUBLICA_KM) return true
  return false
}
console.log('celdas con calles públicas:', celdas.size)

const cruces = new Map()
for (const [llave, nombres] of nombresPorVertice) {
  if (nombres.size < 2) continue
  const [lat, lon] = llave.split(',').map(Number)
  const celda = llaveDeCelda(lat, lon)
  if (!cruces.has(celda)) cruces.set(celda, [])
  cruces.get(celda).push([lat, lon])
}
const DISTANCIA_A_UN_CRUCE_KM = 0.04
function estaCercaDeUnCruce(panorama) {
  const celdaLat = Math.floor(panorama.lat / TAMANO_DE_CELDA)
  const celdaLon = Math.floor(panorama.lon / TAMANO_DE_CELDA)
  for (let dLat = -1; dLat <= 1; dLat++)
    for (let dLon = -1; dLon <= 1; dLon++)
      for (const cruce of cruces.get(celdaLat + dLat + ':' + (celdaLon + dLon)) ?? [])
        if (distanciaKm([panorama.lat, panorama.lon], cruce) <= DISTANCIA_A_UN_CRUCE_KM) return true
  return false
}
console.log('cruces entre calles con nombre:', [...cruces.values()].reduce((suma, lista) => suma + lista.length, 0))

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

// Solo vale un panorama que sea a la vez oficial de Google y al aire libre: el mismo que devuelven las dos búsquedas
// (así se descartan interiores, como estaciones de metro, y fotos de usuarios).
async function panoramaCerca(lat, lon, radio) {
  return pagina.evaluate(
    async (latitud, longitud, radioM) => {
      const buscar = async fuente => {
        try {
          const r = await new google.maps.StreetViewService().getPanorama({
            location: { lat: latitud, lng: longitud },
            radius: radioM,
            preference: 'nearest',
            sources: [fuente],
          })
          return r.data.location
        } catch {
          return null
        }
      }
      const oficial = await buscar('google')
      if (!oficial) return null
      const alAireLibre = await buscar('outdoor')
      if (!alAireLibre || alAireLibre.pano !== oficial.pano) return null
      return { lat: oficial.latLng.lat(), lon: oficial.latLng.lng(), pano: oficial.pano }
    },
    lat,
    lon,
    radio,
  )
}

// Un panorama sirve si además queda sobre una calle pública y lejos de túneles.
let descartados = { tunel: 0, noEsCalle: 0 }
async function panoramaUtil(lat, lon, radio, distanciaAUnTunelKm = DISTANCIA_A_UN_TUNEL_KM) {
  const panorama = await panoramaCerca(lat, lon, radio)
  if (!panorama) return null
  if (estaEnUnTunel(panorama, distanciaAUnTunelKm)) {
    descartados.tunel++
    return null
  }
  if (!estaSobreUnaCalle(panorama)) {
    descartados.noEsCalle++
    return null
  }
  return panorama
}
const redondear = x => +x.toFixed(5)
const punto = (panorama, rumbo) => ({ lat: redondear(panorama.lat), lon: redondear(panorama.lon), rumbo: ((Math.round(rumbo) % 360) + 360) % 360 })

const RECINTOS = JSON.parse(fs.readFileSync('src/datos/recintos.json', 'utf8'))
const PISTAS = JSON.parse(fs.readFileSync('src/datos/pistasCalles.json', 'utf8'))
const resultado = []
// Modo parcial: solo las calles de SV_CALLES y/o los puntos extra, mezclados con lo que ya hay en el archivo.
const SOLO_CALLES = process.env.SV_CALLES?.split('|')
const CON_EXTRAS = process.env.SV_EXTRAS === '1'
const SOLO_LUGARES = process.env.SV_LUGARES?.split('|')
const PARCIAL = !!SOLO_CALLES || CON_EXTRAS || !!SOLO_LUGARES

// ----- puntos de referencia fijos (revisados a mano) y puntos sobre la calle más cercana a cada lugar importante
const MANUALES = [
  { nombre: 'Kennedy con Las Tranqueras', comuna: 'Vitacura', lat: -33.39089, lon: -70.55333, rumbo: 180 },
  { nombre: 'Rotonda Atenas', comuna: 'Las Condes', lat: -33.41717, lon: -70.5531, rumbo: 180 },
  { nombre: 'Frente al Estadio Nacional', comuna: 'Ñuñoa', lat: -33.46211, lon: -70.61037, rumbo: 180 },
]
const DESPLAZAMIENTOS = [[0, 0], [0.0007, 0], [-0.0007, 0], [0, 0.0009], [0, -0.0009], [0.0014, 0], [-0.0014, 0], [0, 0.0018], [0, -0.0018], [0.0021, 0], [-0.0021, 0], [0.0028, 0], [-0.0028, 0]]
for (const manual of PARCIAL ? [] : MANUALES) {
  let elegido = null
  for (const [dLat, dLon] of DESPLAZAMIENTOS) {
    elegido = await panoramaUtil(manual.lat + dLat, manual.lon + dLon, 40)
    if (elegido) break
  }
  if (!elegido) {
    console.log('  se omite (no hay un buen panorama alrededor):', manual.nombre)
    continue
  }
  resultado.push({ nombre: manual.nombre, tipo: 'lugar', referencia: manual.nombre, comuna: manual.comuna, puntos: [punto(elegido, manual.rumbo)] })
}

const IMPORTANTES = [
  // centro histórico y gobierno
  'Plaza de Armas', 'Mercado Central', 'La Vega Central', 'Estación Mapocho', 'Biblioteca Nacional', 'Teatro Municipal',
  'Plaza Italia (Plaza Baquedano)', 'Paseo Ahumada', 'Cementerio General', 'Palacio de La Moneda',
  'Barrio Cívico / Paseo Bulnes', 'Ex Congreso Nacional', 'Palacio de Tribunales', 'Banco Central de Chile',
  'Bolsa de Comercio', 'Municipalidad de Santiago', 'Escuela Militar', 'Cancillería (ex Hotel Carrera)',
  // deporte
  'Estadio Monumental (Colo-Colo)', 'Estadio Nacional (selección chilena; hace de local la U. de Chile)',
  'Claro Arena (U. Católica)', 'Estadio Santa Laura (Unión Española)',
  'Estadio Bicentenario de La Florida (Audax Italiano)', 'Movistar Arena (Santander Arena)', 'Club Hípico',
  'Hipódromo Chile', 'Estadio Español',
  // malls y edificios
  'Costanera Center / Gran Torre Santiago', 'Torre Entel', 'Sanhattan (El Golf / Isidora Goyenechea)', 'Parque Arauco',
  'Alto Las Condes', 'Mall Plaza Egaña', 'Mall Plaza Vespucio', 'Mall Florida Center', 'Mall Plaza Oeste',
  'Mall Plaza Norte', 'Mall Arauco Maipú', 'Mall Plaza Tobalaba', 'Apumanque', 'MUT (Mercado Urbano Tobalaba)',
  // cultura
  'Museo de Bellas Artes', 'GAM', 'Museo de la Memoria', 'Museo Nacional de Historia Natural', 'Museo Precolombino',
  'Museo Interactivo Mirador (MIM)', 'Fantasilandia', 'La Chascona (casa de Neruda)', 'Teatro Caupolicán',
  'Matucana 100', 'Museo Nacional Aeronáutico',
  // salud
  'Clínica Las Condes', 'Clínica Alemana', 'Clínica Santa María', 'Hospital Clínico UC (Marcoleta)',
  'Hospital Clínico U. de Chile (J.J. Aguirre)', 'Posta Central', 'Hospital del Salvador', 'Hospital Sótero del Río',
  'Hospital Militar',
  // universidades y colegios
  'PUC – Casa Central', 'PUC – Campus San Joaquín', 'PUC – Campus Oriente', 'U. de Chile – Casa Central',
  'U. de Chile – Beauchef (FCFM)', 'U. de Chile – Juan Gómez Millas', 'USACH', 'Universidad del Desarrollo (UDD)',
  'Universidad de los Andes', 'Universidad Finis Terrae', 'Universidad Adolfo Ibáñez (campus principal)',
  'Universidad Diego Portales', 'Universidad Alberto Hurtado', 'Universidad Andrés Bello – República',
  'UTFSM – Campus San Joaquín', 'Duoc UC – sede San Carlos de Apoquindo', 'Instituto Nacional', 'Liceo 1 Javiera Carrera',
  "Saint George's College", 'Colegio Alemán de Santiago',
  // religión
  'Templo Votivo de Maipú', "Templo Bahá'í", 'Basílica de Lourdes', 'Santuario Padre Hurtado',
  'Templo Mayor de los Mormones', 'Catedral Metropolitana', 'Mezquita As-Salam',
  // transporte
  'Estación Central (ferrocarriles)', 'Aeropuerto Arturo Merino Benítez', 'Terminal Sur / Alameda (buses)',
  'Terminal San Borja',
  // parques
  'Parque Forestal', 'Parque Bicentenario', 'Parque Araucano', "Parque O'Higgins", 'Parque Quinta Normal',
  'Parque Balmaceda', 'Parque Bustamante', 'Parque Almagro', 'Parque Juan Pablo II', 'Pueblito Los Dominicos',
  'Cerro Santa Lucía', 'Zoológico Nacional',
  // restaurantes y barrios
  'Fuente Alemana', 'La Piojera', 'Mercado Tirso de Molina', 'Barrio Lastarria', 'Barrio Bellavista', 'Barrio Italia',
  'Barrio Yungay', 'Barrio Brasil', 'Patronato', 'Persa Bío Bío', 'Plaza Ñuñoa', 'Plaza de Maipú', 'Plaza de Puente Alto',
]

// Desde el centro del lugar se busca hacia afuera, en anillos, el panorama válido más cercano: así el punto queda en la
// calle del frente y no dentro del recinto.
const ANILLOS_KM = [0, 0.06, 0.12, 0.2, 0.3]
const ANILLOS_LEJANOS_KM = [0.5, 0.8] // solo si no se encontró nada más cerca y se pidió a mano con SV_LUGARES
const DIRECCIONES = 8
const RADIO_DE_BUSQUEDA_M = 40
const PUNTOS_POR_LUGAR = 3
const SEPARACION_ENTRE_PUNTOS_DE_UN_LUGAR_KM = 0.06
async function panoramasEnAnillos(lugar, anillos, elegidos) {
  for (const anillo of anillos) {
    const candidatos = []
    for (let i = 0; i < (anillo === 0 ? 1 : DIRECCIONES); i++) {
      const angulo = (2 * Math.PI * i) / DIRECCIONES
      const lat = lugar.lat + (anillo * Math.cos(angulo)) / KM_LAT
      const lon = lugar.lon + (anillo * Math.sin(angulo)) / KM_LON
      const panorama = await panoramaUtil(lat, lon, anillo === 0 ? 60 : RADIO_DE_BUSQUEDA_M)
      if (panorama) candidatos.push(panorama)
    }
    const cercaDeCruce = candidato => (estaCercaDeUnCruce(candidato) ? 1 : 0)
    candidatos.sort(
      (a, b) =>
        cercaDeCruce(a) - cercaDeCruce(b) ||
        distanciaKm([a.lat, a.lon], [lugar.lat, lugar.lon]) - distanciaKm([b.lat, b.lon], [lugar.lat, lugar.lon]),
    )
    for (const candidato of candidatos)
      if (
        elegidos.length < PUNTOS_POR_LUGAR &&
        elegidos.every(otro => distanciaKm([otro.lat, otro.lon], [candidato.lat, candidato.lon]) >= SEPARACION_ENTRE_PUNTOS_DE_UN_LUGAR_KM)
      )
        elegidos.push(candidato)
    if (elegidos.length >= PUNTOS_POR_LUGAR) break
  }
  return elegidos
}
const panoramasEnLasCallesCercaDe = async lugar => {
  const elegidos = await panoramasEnAnillos(lugar, ANILLOS_KM, [])
  return elegidos.length || !process.env.SV_LUGARES ? elegidos : panoramasEnAnillos(lugar, ANILLOS_LEJANOS_KM, elegidos)
}
// Un cerro grande: los puntos van dentro de su recinto y en el juego vale cualquier toque dentro de él.
const PUNTOS_POR_RECINTO = 6
const SEPARACION_EN_UN_RECINTO_KM = 0.25
function estaEnElPoligono([lat, lon], poligono) {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [latI, lonI] = poligono[i]
    const [latJ, lonJ] = poligono[j]
    if (lonI > lon !== lonJ > lon && lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI) dentro = !dentro
  }
  return dentro
}
async function panoramasDentroDe(poligono) {
  const lats = poligono.map(p => p[0])
  const lons = poligono.map(p => p[1])
  const elegidos = []
  for (let intento = 0; intento < 150 && elegidos.length < PUNTOS_POR_RECINTO; intento++) {
    const lat = Math.min(...lats) + azar() * (Math.max(...lats) - Math.min(...lats))
    const lon = Math.min(...lons) + azar() * (Math.max(...lons) - Math.min(...lons))
    if (!estaEnElPoligono([lat, lon], poligono)) continue
    const panorama = await panoramaUtil(lat, lon, 40)
    if (!panorama || !estaEnElPoligono([panorama.lat, panorama.lon], poligono)) continue
    if (estaCercaDeUnCruce(panorama) && intento < 100) continue
    if (elegidos.some(otro => distanciaKm([otro.lat, otro.lon], [panorama.lat, panorama.lon]) < SEPARACION_EN_UN_RECINTO_KM)) continue
    elegidos.push(panorama)
  }
  return elegidos
}

const sinCalleCerca = []
for (const nombre of SOLO_LUGARES ?? (PARCIAL ? [] : IMPORTANTES)) {
  const lugar = datos.landmarks.find(l => l.name === nombre)
  if (!lugar) {
    console.log('  no existe en los datos:', nombre)
    continue
  }
  if (RECINTOS[lugar.name] && lugar.name.startsWith('Cerro')) {
    const dentro = await panoramasDentroDe(RECINTOS[lugar.name])
    if (dentro.length) {
      const puntosDentro = dentro.map(panorama => punto(panorama, azar() * 360))
      resultado.push({ nombre: 'Dentro de ' + lugar.name.replace(/\s*\(.*\)/, ''), tipo: 'lugar', referencia: lugar.name, comuna: lugar.comuna, puntos: puntosDentro })
      continue
    }
  }
  const panoramas = await panoramasEnLasCallesCercaDe(lugar)
  if (!panoramas.length) {
    sinCalleCerca.push(nombre)
    continue
  }
  const puntos = panoramas.map(panorama => punto(panorama, rumboHacia([panorama.lat, panorama.lon], [lugar.lat, lugar.lon])))
  resultado.push({ nombre: 'Cerca de ' + lugar.name, tipo: 'lugar', referencia: lugar.name, comuna: lugar.comuna, puntos })
}
console.log('lugares:', resultado.length, '| sin calle pública cerca:', sinCalleCerca.join(', ') || 'ninguno')

// ----- puntos extra: sobre una calle, mirando a un lugar importante
const EXTRAS = [{ nombre: 'Providencia frente al Costanera Center', calle: 'Av. Providencia', referencia: 'Costanera Center / Gran Torre Santiago' }]
if (CON_EXTRAS)
  for (const extra of EXTRAS) {
    const lugar = datos.landmarks.find(l => l.name === extra.referencia)
    const calle = datos.streets.find(c => c.name === extra.calle)
    const vertices = calle.lines.flat()
    const masCercano = vertices.reduce((mejor, v) => (distanciaKm(v, [lugar.lat, lugar.lon]) < distanciaKm(mejor, [lugar.lat, lugar.lon]) ? v : mejor))
    let elegido = null
    for (const [dLat, dLon] of [[0, 0], [0.0003, 0], [-0.0003, 0], [0, 0.0004], [0, -0.0004], [0.0006, 0], [-0.0006, 0]]) {
      // Estos puntos se piden a mano: se acepta estar más cerca de un túnel (basta con no estar dentro de él).
      elegido = await panoramaUtil(masCercano[0] + dLat, masCercano[1] + dLon, 30, 0.02)
      if (elegido) break
    }
    if (!elegido) {
      console.log('  sin panorama para', extra.nombre)
      continue
    }
    resultado.push({ nombre: extra.nombre, tipo: 'lugar', referencia: lugar.name, comuna: lugar.comuna, puntos: [punto(elegido, rumboHacia([elegido.lat, elegido.lon], [lugar.lat, lugar.lon]))] })
  }

// ----- calles: un punto cada ~1,2 km (entre 3 y 14), repartidos por toda su longitud y sobre la calle misma
const KM_POR_PUNTO = 1.2
const MINIMO_DE_PUNTOS_POR_CALLE = 3
const MAXIMO_DE_PUNTOS_POR_CALLE = 14
const REINTENTOS_POR_TRAMO = 6
const INTENTOS_SIN_CRUCE = 4 // los primeros intentos exigen estar lejos de un cruce; los últimos aceptan cualquiera
const SEPARACION_MINIMA_KM = 0.3
const puntosParaCalle = calle =>
  Math.max(MINIMO_DE_PUNTOS_POR_CALLE, Math.min(MAXIMO_DE_PUNTOS_POR_CALLE, Math.round(calle.km / KM_POR_PUNTO)))
const MARGEN_SOBRE_LA_CALLE_KM = 0.03
const calles = datos.streets.filter(calle =>
  PARCIAL ? SOLO_CALLES?.includes(calle.name) : !calle.kind || calle.kind === 'calle',
)
const callesIncompletas = []
for (const calle of calles) {
  const puntos = []
  const cantidad = puntosParaCalle(calle)
  const sirveSobreLaCalle = panorama => distanciaYRumboALinea([panorama.lat, panorama.lon], calle.lines).km <= MARGEN_SOBRE_LA_CALLE_KM
  const muyCerca = panorama => puntos.some(otro => distanciaKm([otro.lat, otro.lon], [panorama.lat, panorama.lon]) < SEPARACION_MINIMA_KM)
  const agregar = (panorama, extra = {}) => {
    const sobreLaCalle = distanciaYRumboALinea([panorama.lat, panorama.lon], calle.lines)
    puntos.push({ ...punto(panorama, sobreLaCalle.rumbo + (azar() < 0.5 ? 0 : 180)), ...extra })
  }
  // primero los tramos que ayudan a reconocer la calle (un río al lado, automotoras, una feria, un mall…)
  for (const pista of PISTAS[calle.name] ?? []) {
    for (let intento = 0; intento < REINTENTOS_POR_TRAMO; intento++) {
      const corrimiento = () => (intento ? (azar() - 0.5) * 0.0006 : 0)
      const panorama = await panoramaUtil(pista.lat + corrimiento(), pista.lon + corrimiento(), 30)
      if (!panorama || !sirveSobreLaCalle(panorama) || muyCerca(panorama)) continue
      if (estaCercaDeUnCruce(panorama) && intento < INTENTOS_SIN_CRUCE) continue
      agregar(panorama, { pista: pista.pista })
      break
    }
  }
  // un tramo por punto: dentro de cada uno se elige un lugar al azar, así quedan repartidos por toda la calle
  for (let tramo = 0; tramo < cantidad && puntos.length < cantidad; tramo++)
    for (let intento = 0; intento < REINTENTOS_POR_TRAMO; intento++) {
      const candidato = puntoEnLaCalle(calle, (tramo + azar()) / cantidad)
      const panorama = await panoramaUtil(candidato[0], candidato[1], 30)
      if (!panorama || !sirveSobreLaCalle(panorama) || muyCerca(panorama)) continue
      if (estaCercaDeUnCruce(panorama) && intento < INTENTOS_SIN_CRUCE) continue
      agregar(panorama)
      break
    }
  if (!puntos.length) {
    callesIncompletas.push(calle.name)
    continue
  }
  if (puntos.length < MINIMO_DE_PUNTOS_POR_CALLE) console.log(`  ${calle.name}: ${puntos.length} punto(s)`)
  resultado.push({ nombre: calle.name, tipo: 'calle', comuna: calle.comunas[0], puntos })
}
console.log(`calles: ${calles.length - callesIncompletas.length}/${calles.length}; sin cobertura: ${callesIncompletas.join(', ') || 'ninguna'}`)
console.log('panoramas descartados:', descartados)

if (PARCIAL) {
  const nuevos = new Set(resultado.map(pregunta => pregunta.nombre))
  const existentes = JSON.parse(fs.readFileSync('src/datos/lugaresStreetView.json', 'utf8')).filter(pregunta => !nuevos.has(pregunta.nombre))
  resultado.unshift(...existentes)
}
fs.writeFileSync('src/datos/lugaresStreetView.json', JSON.stringify(resultado))
console.log('Total:', resultado.length, 'lugares escritos en src/datos/lugaresStreetView.json')
await navegador.close()
await detener()
