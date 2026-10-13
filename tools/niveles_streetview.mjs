// Le pone nivel (1 fácil, 2 medio, 3 difícil, 4 extremo) a cada pregunta de src/datos/lugaresStreetView.json.
// Fácil: un puñado (unas 25) de las calles y lugares que todo el mundo conoce, sobre todo del centro (casi nada del oriente ni autopistas).
// Medio: los grandes ejes y autopistas, las principales avenidas de cada sector (incluido el poniente) y los lugares más conocidos.
// Difícil: lo anterior, las avenidas largas (5 km o más) y lugares de categorías muy conocidas.
// Extremo: todo. Se corre después de tools/streetview_lugares.mjs:  node tools/niveles_streetview.mjs
import fs from 'node:fs'

const ARCHIVO = 'src/datos/lugaresStreetView.json'
const datos = (() => {
  const ventana = {}
  new Function('window', fs.readFileSync('public/data/data.js', 'utf8'))(ventana)
  return ventana.DATA
})()

const CALLES_MUY_FACILES = [
  "Alameda (Av. Libertador Bernardo O'Higgins)", 'Av. Vicuña Mackenna', 'Av. Providencia', 'Av. Apoquindo', 'Pío Nono',
  'Paseo Ahumada', 'Av. Santa Rosa', 'Gran Avenida (José Miguel Carrera)', 'Av. Irarrázaval', 'Av. San Pablo',
  'Av. Independencia', 'Av. Recoleta',
]
const LUGARES_MUY_FACILES = [
  'Plaza de Armas', 'Palacio de La Moneda', 'Estación Mapocho', 'Plaza Italia (Plaza Baquedano)', 'Cerro Santa Lucía',
  'Costanera Center / Gran Torre Santiago', 'Estación Central (ferrocarriles)', 'Mercado Central', 'La Vega Central',
  'Cerro San Cristóbal (cumbre, Virgen)', 'Cementerio General',
  'Estadio Nacional (selección chilena; hace de local la U. de Chile)',
]
const CALLES_FACILES = [
  // los grandes ejes de la ciudad
  "Alameda (Av. Libertador Bernardo O'Higgins)",
  'Av. Vicuña Mackenna',
  'Av. Providencia',
  'Av. Apoquindo',
  'Av. Las Condes',
  'Av. Presidente Kennedy',
  'Gran Avenida (José Miguel Carrera)',
  'Av. Santa Rosa',
  'Av. Irarrázaval',
  'Av. Grecia',
  'Av. Departamental',
  'Av. Independencia',
  'Av. Recoleta',
  'Pío Nono',
  'Av. Matta (Manuel Antonio Matta)',
  'Av. Tobalaba',
  'Av. Quilín',
  'Av. Vitacura',
  'Av. Pedro de Valdivia',
  'Av. Manquehue',
  'Paseo Ahumada',
  // autopistas
  'Costanera Norte',
  'Américo Vespucio',
  'Autopista Central',
  'Autopista del Sol (Ruta 78)',
  'Ruta 68 (a Valparaíso)',
  // poniente
  'Av. San Pablo',
  'Av. Pajaritos',
  'Av. Gladys Marín',
  'Av. 5 de Abril',
  'Av. Las Rejas',
  'Av. Teniente Cruz',
  'Camino a Melipilla',
  'Av. General Velásquez',
  'Av. Matucana',
  'Av. Carrascal',
  // sur, norte y oriente
  'Av. La Florida',
  'Av. Concha y Toro',
  'Av. Macul',
  'Av. Príncipe de Gales',
  'Av. La Dehesa',
  'Av. Padre Hurtado (sur)',
  'Av. Presidente Salvador Allende Gossens',
  'Av. José Miguel Infante',
]
const LUGARES_FACILES = [
  'Plaza de Armas', 'Palacio de La Moneda', 'Barrio Cívico / Paseo Bulnes', 'Estación Mapocho', 'Mercado Central',
  'Plaza Italia (Plaza Baquedano)', 'Cerro Santa Lucía', 'Costanera Center / Gran Torre Santiago', 'Parque Arauco',
  'Alto Las Condes', 'Estadio Nacional (selección chilena; hace de local la U. de Chile)', 'PUC – Casa Central',
  'Mall Plaza Vespucio', 'Estación Central (ferrocarriles)', 'Terminal Sur / Alameda (buses)', 'Zoológico Nacional',
  'Templo Votivo de Maipú', 'Mall Arauco Maipú', 'Mall Plaza Norte', 'Parque Bicentenario',
]
const CATEGORIAS_MEDIAS = ['Centro histórico', 'Gobierno y justicia', 'Deporte', 'Malls y edificios', 'Cerros y parques', 'Transporte']
const LARGO_DE_AVENIDA_LARGA_KM = 5

const categoriaDeLugar = referencia => datos.landmarks.find(lugar => lugar.name === referencia)?.cat
const largoDeCalle = nombre => datos.streets.find(calle => calle.name === nombre)?.km ?? 0

function nivelDe(pregunta) {
  if (pregunta.tipo === 'calle') {
    if (CALLES_MUY_FACILES.includes(pregunta.nombre)) return 1
    if (CALLES_FACILES.includes(pregunta.nombre)) return 2
    return largoDeCalle(pregunta.nombre) >= LARGO_DE_AVENIDA_LARGA_KM ? 3 : 4
  }
  const referencia = pregunta.referencia ?? pregunta.nombre
  if (LUGARES_MUY_FACILES.includes(referencia)) return 1
  if (LUGARES_FACILES.includes(referencia)) return 2
  return CATEGORIAS_MEDIAS.includes(categoriaDeLugar(referencia)) ? 3 : 4
}

const preguntas = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'))
const cuenta = { 1: 0, 2: 0, 3: 0, 4: 0 }
for (const pregunta of preguntas) {
  pregunta.nivel = nivelDe(pregunta)
  cuenta[pregunta.nivel]++
}
const faltantes = [...CALLES_FACILES].filter(nombre => !preguntas.some(p => p.nombre === nombre))
const lugaresFaltantes = LUGARES_FACILES.filter(nombre => !preguntas.some(p => p.referencia === nombre))
if (faltantes.length || lugaresFaltantes.length) console.log('Sin pregunta:', [...faltantes, ...lugaresFaltantes].join(' | '))
fs.writeFileSync(ARCHIVO, JSON.stringify(preguntas))
console.log(`Por nivel: ${cuenta[1]} · ${cuenta[2]} · ${cuenta[3]} · ${cuenta[4]} (acumulados: fácil ${cuenta[1]}, medio ${cuenta[1] + cuenta[2]}, difícil ${cuenta[1] + cuenta[2] + cuenta[3]}, extremo ${preguntas.length})`)
