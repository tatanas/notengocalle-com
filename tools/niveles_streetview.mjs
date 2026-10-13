// Le pone nivel (1 fácil, 2 medio, 3 difícil) a cada pregunta de src/datos/lugaresStreetView.json.
// Fácil: una calle famosa por comuna, unas pocas históricas y los lugares más conocidos.
// Medio: lo anterior, las avenidas largas (5 km o más) y lugares de categorías muy conocidas.
// Difícil: todo. Se corre después de tools/streetview_lugares.mjs:  node tools/niveles_streetview.mjs
import fs from 'node:fs'

const ARCHIVO = 'src/datos/lugaresStreetView.json'
const datos = (() => {
  const ventana = {}
  new Function('window', fs.readFileSync('public/data/data.js', 'utf8'))(ventana)
  return ventana.DATA
})()

const CALLES_FACILES = [
  // una por comuna, la más famosa o concurrida
  "Alameda (Av. Libertador Bernardo O'Higgins)", // Santiago
  'Av. Providencia',
  'Av. Apoquindo', // Las Condes
  'Av. Vitacura',
  'Av. Irarrázaval', // Ñuñoa
  'Av. Príncipe de Gales', // La Reina
  'Av. La Dehesa', // Lo Barnechea
  'Av. Tobalaba', // Peñalolén
  'Av. Vicuña Mackenna', // La Florida
  'Av. Macul',
  'Av. Presidente Salvador Allende Gossens', // San Joaquín
  'Gran Avenida (José Miguel Carrera)', // San Miguel
  'Av. El Parrón', // La Cisterna
  'Av. Santa Rosa', // La Pintana
  'Av. Concha y Toro', // Puente Alto
  'Av. Padre Hurtado (sur)', // San Bernardo
  'Av. Pajaritos', // Maipú
  'Av. Pedro Aguirre Cerda', // Cerrillos
  'Av. Carlos Valdovinos', // Pedro Aguirre Cerda
  'Av. Las Rejas', // Estación Central
  'Av. Mapocho', // Quinta Normal
  'José Joaquín Pérez', // Cerro Navia
  'Av. San Pablo', // Pudahuel
  'Av. Neptuno', // Lo Prado
  'Av. José Miguel Infante', // Renca
  'Av. Independencia', // Conchalí
  'Av. Fermín Vivaceta', // Independencia
  'Av. Recoleta',
  'Av. El Salto', // Huechuraba
  // históricas o muy transitadas
  'Paseo Ahumada',
  'Av. Presidente Kennedy',
  'Av. Matta (Manuel Antonio Matta)',
]
const LUGARES_FACILES = [
  'Plaza de Armas', 'Palacio de La Moneda', 'Estación Mapocho', 'Mercado Central', 'Plaza Italia (Plaza Baquedano)',
  'Cerro Santa Lucía', 'Costanera Center / Gran Torre Santiago', 'Parque Arauco', 'Alto Las Condes',
  'Estadio Nacional (selección chilena; hace de local la U. de Chile)', 'PUC – Casa Central', 'Mall Plaza Vespucio',
  'Terminal Sur / Alameda (buses)', 'Zoológico Nacional',
]
const CATEGORIAS_MEDIAS = ['Centro histórico', 'Gobierno y justicia', 'Deporte', 'Malls y edificios', 'Cerros y parques', 'Transporte']
const LARGO_DE_AVENIDA_LARGA_KM = 5

const categoriaDeLugar = referencia => datos.landmarks.find(lugar => lugar.name === referencia)?.cat
const largoDeCalle = nombre => datos.streets.find(calle => calle.name === nombre)?.km ?? 0

function nivelDe(pregunta) {
  if (pregunta.tipo === 'calle') {
    if (CALLES_FACILES.includes(pregunta.nombre)) return 1
    return largoDeCalle(pregunta.nombre) >= LARGO_DE_AVENIDA_LARGA_KM ? 2 : 3
  }
  const referencia = pregunta.referencia ?? pregunta.nombre
  if (LUGARES_FACILES.includes(referencia)) return 1
  return CATEGORIAS_MEDIAS.includes(categoriaDeLugar(referencia)) ? 2 : 3
}

const preguntas = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'))
const cuenta = { 1: 0, 2: 0, 3: 0 }
for (const pregunta of preguntas) {
  pregunta.nivel = nivelDe(pregunta)
  cuenta[pregunta.nivel]++
}
const faltantes = [...CALLES_FACILES].filter(nombre => !preguntas.some(p => p.nombre === nombre))
const lugaresFaltantes = LUGARES_FACILES.filter(nombre => !preguntas.some(p => p.referencia === nombre))
if (faltantes.length || lugaresFaltantes.length) console.log('Sin pregunta:', [...faltantes, ...lugaresFaltantes].join(' | '))
fs.writeFileSync(ARCHIVO, JSON.stringify(preguntas))
console.log(`Nivel 1: ${cuenta[1]} · nivel 2: ${cuenta[2]} · nivel 3: ${cuenta[3]} (acumulados: fácil ${cuenta[1]}, medio ${cuenta[1] + cuenta[2]}, difícil ${preguntas.length})`)
