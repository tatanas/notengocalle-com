// Arma los lugares del juego "¿Dónde estás?" (Street View): los lugares emblemáticos más importantes, con un punto
// fijo cada uno, y todas las calles, con hasta 3 puntos repartidos por la calle (cada vez que sale la calle, el juego
// elige uno al azar). Cada punto se comprueba contra Street View: solo panoramas oficiales de Google.
// Necesita la llave de Google en .env.local y se ejecuta desde la raíz del proyecto:
//   node tools/streetview_lugares.mjs
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

// Un punto al azar sobre el trazado de una calle, con probabilidad proporcional al largo de cada tramo.
function puntoAlAzarEnLaCalle(calle) {
  const tramos = []
  let total = 0
  for (const linea of calle.lines)
    for (let i = 0; i < linea.length - 1; i++) {
      const largo = distanciaKm(linea[i], linea[i + 1])
      tramos.push({ a: linea[i], b: linea[i + 1], largo })
      total += largo
    }
  let objetivo = azar() * total
  for (const tramo of tramos) {
    if (objetivo <= tramo.largo) {
      const t = tramo.largo ? objetivo / tramo.largo : 0
      return [tramo.a[0] + t * (tramo.b[0] - tramo.a[0]), tramo.a[1] + t * (tramo.b[1] - tramo.a[1])]
    }
    objetivo -= tramo.largo
  }
  return tramos[0].a
}

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
        return { lat: l.latLng.lat(), lon: l.latLng.lng(), pano: l.pano }
      } catch {
        return null
      }
    },
    lat,
    lon,
    radio,
  )
}
const redondear = x => +x.toFixed(5)
const punto = (panorama, rumbo) => ({ lat: redondear(panorama.lat), lon: redondear(panorama.lon), rumbo: Math.round(rumbo) })

const resultado = []

// ----- los lugares emblemáticos más importantes, uno por lugar
const MANUALES = [
  { nombre: 'Kennedy con Las Tranqueras', comuna: 'Vitacura', lat: -33.39089, lon: -70.55333, rumbo: 180 },
  { nombre: 'Rotonda Atenas', comuna: 'Las Condes', lat: -33.41717, lon: -70.5531, rumbo: 180 },
  { nombre: 'Frente al Estadio Nacional', comuna: 'Ñuñoa', lat: -33.46211, lon: -70.61037, rumbo: 180 },
]
for (const manual of MANUALES) {
  const panorama = await panoramaCerca(manual.lat, manual.lon, 40)
  if (!panorama) throw new Error('Sin cobertura en ' + manual.nombre)
  resultado.push({ nombre: manual.nombre, tipo: 'lugar', comuna: manual.comuna, puntos: [punto(panorama, manual.rumbo)] })
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
let sinCobertura = []
for (const nombre of IMPORTANTES) {
  const lugar = datos.landmarks.find(l => l.name === nombre)
  if (!lugar) {
    console.log('  no existe en los datos:', nombre)
    continue
  }
  // Los recintos grandes (estadios, parques, malls) tienen su calle más lejos del punto central.
  const panorama = (await panoramaCerca(lugar.lat, lugar.lon, 60)) ?? (await panoramaCerca(lugar.lat, lugar.lon, 220))
  if (!panorama) {
    sinCobertura.push(nombre)
    continue
  }
  const cerca = distanciaKm([panorama.lat, panorama.lon], [lugar.lat, lugar.lon]) < 0.015
  const rumbo = cerca ? azar() * 360 : rumboHacia([panorama.lat, panorama.lon], [lugar.lat, lugar.lon])
  resultado.push({ nombre: lugar.name, tipo: 'lugar', comuna: lugar.comuna, puntos: [punto(panorama, rumbo)] })
}
console.log(`lugares: ${resultado.length} (sin cobertura: ${sinCobertura.join(', ') || 'ninguno'})`)

// ----- calles: hasta 3 puntos por calle, lejos uno del otro y sobre la calle misma
const PUNTOS_POR_CALLE = 3
const INTENTOS_POR_CALLE = 14
const SEPARACION_MINIMA_KM = 0.4
const MARGEN_SOBRE_LA_CALLE_KM = 0.03
const calles = datos.streets.filter(calle => !calle.kind || calle.kind === 'calle')
const callesIncompletas = []
for (const calle of calles) {
  const puntos = []
  for (let intento = 0; intento < INTENTOS_POR_CALLE && puntos.length < PUNTOS_POR_CALLE; intento++) {
    const candidato = puntoAlAzarEnLaCalle(calle)
    const panorama = await panoramaCerca(candidato[0], candidato[1], 30)
    if (!panorama) continue
    const sobreLaCalle = distanciaYRumboALinea([panorama.lat, panorama.lon], calle.lines)
    if (sobreLaCalle.km > MARGEN_SOBRE_LA_CALLE_KM) continue
    if (puntos.some(otro => distanciaKm([otro.lat, otro.lon], [panorama.lat, panorama.lon]) < SEPARACION_MINIMA_KM)) continue
    puntos.push(punto(panorama, sobreLaCalle.rumbo + (azar() < 0.5 ? 0 : 180)))
  }
  if (!puntos.length) {
    callesIncompletas.push(calle.name)
    continue
  }
  if (puntos.length < PUNTOS_POR_CALLE) console.log(`  ${calle.name}: ${puntos.length} punto(s)`)
  resultado.push({ nombre: calle.name, tipo: 'calle', comuna: calle.comunas[0], puntos })
}
console.log(`calles: ${calles.length - callesIncompletas.length}/${calles.length}; sin cobertura: ${callesIncompletas.join(', ') || 'ninguna'}`)

fs.writeFileSync('src/datos/lugaresStreetView.json', JSON.stringify(resultado))
console.log('Total:', resultado.length, 'lugares escritos en src/datos/lugaresStreetView.json')
await navegador.close()
await detener()
