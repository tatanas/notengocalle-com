// Pruebas de la lógica pura que comparten navegador y servidor: node --test tests/unit.test.js
import { esAciertoDeStreetView, puntajeDeStreetView } from '../src/dominio/streetView.js'
import { elegirConSemilla } from '../src/nucleo/semilla.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { llaveDeUsuario, PATRON_DE_USUARIO } from '../compartido/cuentas.js'
import { textoParaCompartir, tiempoEnPalabras } from '../src/dominio/compartir.js'
import {
  completarAlternativas,
  crucesPorNombrar,
  nombreDeLaCalle,
  rutaDelJuego,
} from '../compartido/rutaEnAuto.js'
import { destinoDeLaSalida, secuenciaDeSalidas, ventanasDeSalidas } from '../src/dominio/salidas.js'
import { decisionesConStreetView } from '../src/dominio/decisionesConStreetView.js'
import { decisionesEnAuto, nombresDeLaRuta } from '../src/dominio/decisionesEnAuto.js'
import { textoDeManiobra } from '../src/dominio/maniobras.js'
import {
  COMUNAS_POR_ALCANCE,
  categoriaDe,
  categoriaEnElResumen,
  categoriasDelResumen,
  categoriasValidasDe,
  esMejorPuntaje,
  esCategoriaDiaria,
  fechaDeAyerEnChile,
  fechaDeHoyEnChile,
  segundosHastaLaMedianocheDeChile,
  categoriaHeredada,
  largoDeRondaDe,
  largoNormalDe,
  problemaDelPuntaje,
} from '../compartido/oficial.js'
import {
  distanciaKm,
  distanciaKmCualquierLatitud,
  distanciaALinea,
  masCercanosSegun,
  puntoEnRasgo,
  puntoEnPoligono,
} from '../src/nucleo/geografia.js'
import { anguloEntre, pesoDeParecido, formaDeCalle } from '../src/nucleo/parecido.js'
import { pesoAdaptativo, registrar, muestraPonderada } from '../src/nucleo/progreso.js'

const PLAZA_ITALIA = [-33.4372, -70.6344]
const cercaDe = (obtenido, esperado, tolerancia) =>
  assert.ok(
    Math.abs(obtenido - esperado) <= tolerancia,
    `${obtenido} no está a ±${tolerancia} de ${esperado}`,
  )

test('distancias en Santiago', () => {
  const escuelaMilitar = [-33.4136, -70.5826]
  cercaDe(distanciaKm(PLAZA_ITALIA, escuelaMilitar), 5.5, 0.2)
  assert.equal(distanciaKm(PLAZA_ITALIA, PLAZA_ITALIA), 0)
})

test('distancias a escala de país corrigen la longitud según la latitud', () => {
  const santiago = [-33.45, -70.66]
  const puntaArenas = [-53.16, -70.91]
  cercaDe(distanciaKmCualquierLatitud(santiago, puntaArenas), 2192, 15)
  const mismoParalelo = distanciaKmCualquierLatitud([-53, -70], [-53, -71])
  cercaDe(mismoParalelo, 111.2 * Math.cos((53 * Math.PI) / 180), 0.5)
})

test('distancia a una línea: al tramo más cercano, no solo a sus vértices', () => {
  const avenida = [
    [
      [-33.44, -70.66],
      [-33.44, -70.62],
    ],
  ]
  cercaDe(distanciaALinea([-33.43, -70.64], avenida), 1.112, 0.01)
  cercaDe(distanciaALinea([-33.44, -70.61], avenida), 0.929, 0.01)
  assert.equal(distanciaALinea([-33.44, -70.64], avenida), 0)
})

test('punto dentro de un polígono [lat, lon], incluso cóncavo', () => {
  const formaDeL = [
    [0, 0],
    [0, 2],
    [1, 2],
    [1, 1],
    [2, 1],
    [2, 0],
  ]
  assert.equal(puntoEnPoligono([0.5, 1.5], formaDeL), true)
  assert.equal(puntoEnPoligono([1.5, 0.5], formaDeL), true)
  assert.equal(puntoEnPoligono([1.5, 1.5], formaDeL), false)
  assert.equal(puntoEnPoligono([3, 3], formaDeL), false)
})

test('punto dentro de una comuna GeoJSON [lon, lat], con una o varias partes', () => {
  const cuadrado = (lon, lat) => [
    [
      [lon, lat],
      [lon + 1, lat],
      [lon + 1, lat + 1],
      [lon, lat + 1],
      [lon, lat],
    ],
  ]
  const simple = { geometry: { type: 'Polygon', coordinates: cuadrado(-71, -34) } }
  const islas = { geometry: { type: 'MultiPolygon', coordinates: [cuadrado(-71, -34), cuadrado(-60, -20)] } }
  assert.equal(puntoEnRasgo(-33.5, -70.5, simple), true)
  assert.equal(puntoEnRasgo(-33.5, -69.5, simple), false)
  assert.equal(puntoEnRasgo(-19.5, -59.5, islas), true)
  assert.equal(puntoEnRasgo(-25, -65, islas), false)
})

test('nearestBy ordena por cercanía y respeta la exclusión', () => {
  const sitios = [
    { name: 'lejos', at: [-33.6, -70.6] },
    { name: 'cerca', at: [-33.44, -70.63] },
    { name: 'medio', at: [-33.5, -70.6] },
    { name: 'origen', at: PLAZA_ITALIA },
  ]
  const masCercano = masCercanosSegun(
    sitios,
    PLAZA_ITALIA,
    sitio => sitio.at,
    2,
    sitio => sitio.name === 'origen',
  )
  assert.deepEqual(
    masCercano.map(sitio => sitio.name),
    ['cerca', 'medio'],
  )
})

test('el sorteo entrega la cantidad pedida, sin repetir', () => {
  const elementos = Array.from({ length: 50 }, (_, i) => i)
  const muestra = muestraPonderada(elementos, 15)
  assert.equal(muestra.length, 15)
  assert.equal(new Set(muestra).size, 15)
  assert.equal(muestraPonderada(elementos, 80).length, 50)
})

test('el sorteo favorece lo que más pesa', () => {
  const elementos = Array.from({ length: 40 }, (_, i) => i)
  let pesadasElegidas = 0
  for (let ronda = 0; ronda < 300; ronda++)
    pesadasElegidas += muestraPonderada(elementos, 10, { weightOf: i => (i < 10 ? 8 : 1) }).filter(
      i => i < 10,
    ).length
  assert.ok(pesadasElegidas / 300 > 5, `en promedio salieron ${pesadasElegidas / 300} de los 10 pesados`)
})

test('el sorteo evita que un grupo muy numeroso domine la ronda', () => {
  const elementos = [
    ...Array.from({ length: 150 }, (_, i) => ({ comuna: 'Santiago', i })),
    ...Array.from({ length: 30 }, (_, i) => ({ comuna: 'Otra ' + (i % 15), i })),
  ]
  let deGrupoGrande = 0
  for (let ronda = 0; ronda < 200; ronda++)
    deGrupoGrande += muestraPonderada(elementos, 15, { groupOf: elemento => elemento.comuna }).filter(
      elemento => elemento.comuna === 'Santiago',
    ).length
  assert.ok(deGrupoGrande / 200 < 8, `Santiago ocupó en promedio ${deGrupoGrande / 200} de 15 cupos`)
})

test('lo fallado pesa más que lo nuevo, y lo dominado pesa menos', () => {
  registrar('modo:fallado', false)
  registrar('modo:fallado', false)
  for (let i = 0; i < 4; i++) registrar('modo:dominado', true)
  const [fallidos, noVistas, dominados] = ['modo:fallado', 'modo:nunca-visto', 'modo:dominado'].map(
    pesoAdaptativo,
  )
  assert.ok(fallidos > noVistas && noVistas > dominados, `${fallidos} > ${noVistas} > ${dominados}`)
})

test('un puntaje es mejor con más aciertos o, a igual número, con menos tiempo', () => {
  assert.equal(esMejorPuntaje({ aciertos: 12, ms: 90000 }, { aciertos: 11, ms: 30000 }), true)
  assert.equal(esMejorPuntaje({ aciertos: 12, ms: 30000 }, { aciertos: 12, ms: 40000 }), true)
  assert.equal(esMejorPuntaje({ aciertos: 12, ms: 40000 }, { aciertos: 12, ms: 40000 }), false)
  assert.equal(esMejorPuntaje({ aciertos: 10, ms: 10000 }, { aciertos: 12, ms: 40000 }), false)
})

test('solo pasan los puntajes con forma de ronda oficial', () => {
  const ronda = { modo: 'ch-city', categoria: '20', aciertos: 10, total: 20, ms: 60000 }
  assert.equal(problemaDelPuntaje(ronda), null)
  assert.ok(problemaDelPuntaje({ ...ronda, categoria: '30', total: 30 }), 'ya no hay rondas de 30')
  assert.equal(
    problemaDelPuntaje({ ...ronda, categoria: 'todas', total: 179, aciertos: 100, ms: 600000 }),
    null,
  )
  assert.ok(problemaDelPuntaje({ ...ronda, modo: 'otro' }))
  assert.ok(problemaDelPuntaje({ ...ronda, categoria: '12' }))
  assert.ok(problemaDelPuntaje({ ...ronda, total: 10 }), 'el largo no coincide con la categoría')
  assert.ok(problemaDelPuntaje({ ...ronda, categoria: 'todas', total: 3 }))
  assert.ok(problemaDelPuntaje({ ...ronda, aciertos: 21 }))
  assert.ok(problemaDelPuntaje({ ...ronda, ms: 1000 }))
  assert.ok(problemaDelPuntaje({ ...ronda, ms: 7 * 60 * 60 * 1000 }))
})

test('nombres de usuario: qué se acepta y cuándo dos son el mismo', () => {
  for (const nombre of ['seba', 'Ñandú_99', 'a.b-c']) assert.ok(PATRON_DE_USUARIO.test(nombre), nombre)
  for (const nombre of ['ab', 'con espacio', 'a@b', 'x'.repeat(21)])
    assert.ok(!PATRON_DE_USUARIO.test(nombre), nombre)
  assert.equal(llaveDeUsuario('Ñandú'), llaveDeUsuario('NANDU'))
  assert.notEqual(llaveDeUsuario('seba'), llaveDeUsuario('seba2'))
})

test('el largo de la ronda decide su categoría de ranking', () => {
  assert.equal(categoriaDe(15, 34), '15')
  assert.equal(categoriaDe(34, 34), 'todas')
  assert.equal(categoriaDe(179, 179), 'todas')
  assert.equal(
    categoriaDe(30, 20),
    'todas',
    'si el juego tiene menos preguntas que el largo pedido, se recorre todo',
  )
  assert.equal(categoriaHeredada({ modo: 'com-name', total: 15 }), '15')
  assert.equal(categoriaHeredada({ modo: 'ch-all', total: 16 }), 'todas')
  assert.equal(categoriaHeredada({ modo: 'st-name', total: 179 }), 'todas')
})

// una calle como [[lat, lon], ...]; en Santiago 1° de latitud son más km que 1° de longitud
const linea = (...puntos) => [puntos]

test('la orientación de una calle sale de su trazado, sin importar cuántos puntos tenga', () => {
  const orientePoniente = formaDeCalle(linea([-33.45, -70.7], [-33.45, -70.6]))
  const norteSur = formaDeCalle(linea([-33.5, -70.65], [-33.4, -70.65]))
  assert.ok(anguloEntre(orientePoniente.angle, 0) < 1, `oriente-poniente ≈ 0° (${orientePoniente.angle})`)
  assert.ok(anguloEntre(norteSur.angle, 90) < 1, `norte-sur ≈ 90° (${norteSur.angle})`)
  assert.ok(orientePoniente.straightness > 0.99)
  const esparcida = formaDeCalle(linea([-33.5, -70.65], [-33.4, -70.65]))
  const densa = formaDeCalle(linea([-33.5, -70.65], [-33.499, -70.65], [-33.498, -70.65], [-33.4, -70.65]))
  assert.ok(anguloEntre(esparcida.angle, densa.angle) < 0.5, 'puntos de más no cambian la orientación')
})

test('un anillo no tiene una orientación que comparar', () => {
  const anillo = Array.from({ length: 60 }, (_, i) => [
    -33.45 + 0.1 * Math.sin((i / 60) * 2 * Math.PI),
    -70.65 + 0.12 * Math.cos((i / 60) * 2 * Math.PI),
  ])
  assert.ok(formaDeCalle([anillo]).straightness < 0.2)
})

test('la diferencia entre orientaciones da la vuelta: 5° y 175° son casi paralelas', () => {
  assert.equal(anguloEntre(5, 175), 10)
  assert.equal(anguloEntre(0, 90), 90)
  assert.equal(anguloEntre(30, 30), 0)
})

test('las alternativas que más se parecen pesan más', () => {
  const base = {
    distanceKm: 0.5,
    angleDiff: 0,
    straightness: 1,
    sameKind: true,
    overlaps: false,
    confusions: 0,
  }
  const peso = cambios => pesoDeParecido({ ...base, ...cambios })
  assert.ok(peso({}) > peso({ distanceKm: 3 }), 'más cerca pesa más')
  assert.ok(peso({}) > peso({ angleDiff: 90 }), 'la misma orientación pesa más que la perpendicular')
  assert.ok(peso({ angleDiff: 90 }) > 0, 'la perpendicular cercana no queda descartada del todo')
  assert.ok(peso({ overlaps: true }) > peso({}) * 3, 'una que corre pegada a la otra pesa mucho más')
  assert.ok(peso({}) > peso({ sameKind: false }), 'una autopista no es alternativa natural de una calle')
  assert.ok(peso({ confusions: 1 }) > peso({}) + 2, 'una confusión anterior sube el peso')
  assert.ok(peso({ confusions: 99 }) <= peso({ confusions: 3 }), 'el efecto de las confusiones tiene tope')
  assert.ok(
    peso({ distanceKm: 8, angleDiff: 90, confusions: 2 }) > peso({ distanceKm: 1, angleDiff: 60 }),
    'lo confundido sale aunque quede lejos y mire para otro lado',
  )
  assert.equal(
    peso({ straightness: 0, angleDiff: 90 }),
    peso({ straightness: 0, angleDiff: 0 }),
    'con calles curvas la orientación no pesa',
  )
})

test('"¿Dónde estás?": de 0 a 5 puntos según la distancia, y 3 o más cuenta como acierto', () => {
  const puntosA = metros => puntajeDeStreetView(metros / 1000)
  assert.deepEqual(
    [0, 100, 101, 500, 501, 1000, 1001, 1500, 1501, 2000, 2001, 9000].map(puntosA),
    [5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0],
  )
  assert.equal(esAciertoDeStreetView(1), true)
  assert.equal(esAciertoDeStreetView(1.001), false)
})

test('en Street View el ranking suma puntos: 10 preguntas de hasta 5 puntos, por nivel', () => {
  const ronda = { modo: 'sv-ubicar', categoria: 'extremo', aciertos: 31, total: 50, ms: 90000 }
  assert.equal(problemaDelPuntaje(ronda), null)
  assert.ok(problemaDelPuntaje({ ...ronda, aciertos: 51 }), 'más puntos que el máximo')
  assert.ok(problemaDelPuntaje({ ...ronda, total: 10 }), 'el máximo de 10 preguntas es 50, no 10')
  assert.ok(
    problemaDelPuntaje({ ...ronda, categoria: '20', total: 100 }),
    'Street View no tiene rondas de 20',
  )
  assert.ok(problemaDelPuntaje({ ...ronda, categoria: '10' }), 'ya no hay categoría 10: se separa por nivel')
  for (const nivel of ['facil', 'medio', 'dificil'])
    assert.equal(problemaDelPuntaje({ ...ronda, categoria: nivel }), null)
  assert.ok(
    problemaDelPuntaje({ ...ronda, categoria: 'facil', total: 100 }),
    'un nivel siempre son 10 preguntas',
  )
  assert.ok(problemaDelPuntaje({ ...ronda, ms: 1000 }), 'imposible de rápido')
  assert.ok(
    problemaDelPuntaje({ ...ronda, categoria: 'todas', total: 1345, aciertos: 900, ms: 900000 }),
    'Street View no tiene ronda de todas',
  )
})

test('cada juego tiene su largo normal de ronda', () => {
  assert.equal(largoNormalDe('sv-ubicar'), 10)
  assert.equal(largoNormalDe('st-name'), 20)
  assert.deepEqual(categoriasValidasDe('sv-ubicar'), ['facil', 'medio', 'dificil', 'extremo'])
  assert.deepEqual(categoriasValidasDe('rs-any-car'), ['10'])
  assert.deepEqual(categoriasValidasDe('rs-any-tp'), ['10'])
  assert.deepEqual(
    categoriasValidasDe('rs-sv-car'),
    ['10'],
    'las rutas con Street View también tienen ranking',
  )
  assert.equal(largoNormalDe('rs-sv-car'), 10)
  assert.deepEqual(categoriasValidasDe('st-name'), ['10', '20', 'todas'])
})

test('los juegos de comunas se separan por alcance, con su cantidad de comunas', () => {
  assert.deepEqual(categoriasValidasDe('com-name'), ['core', 'peri', 'all'])
  const ronda = { modo: 'com-name', categoria: 'peri', aciertos: 30, total: 42, ms: 90000 }
  assert.equal(problemaDelPuntaje(ronda), null)
  assert.ok(problemaDelPuntaje({ ...ronda, total: 34 }), 'con periferia son 42 comunas, no 34')
  assert.ok(
    problemaDelPuntaje({ ...ronda, categoria: 'todas' }),
    'ya no existe la categoría todas en comunas',
  )
  assert.equal(problemaDelPuntaje({ ...ronda, categoria: 'core', total: 34 }), null)
})

test('las comunas por alcance coinciden con los datos del juego', () => {
  const ventana = {}
  new Function('window', readFileSync('public/data/data.js', 'utf8'))(ventana)
  const grupos = ventana.DATA.comunas.features.map(rasgo => rasgo.properties.group)
  const contar = (...admitidos) => grupos.filter(grupo => admitidos.includes(grupo)).length
  assert.equal(contar('core'), COMUNAS_POR_ALCANCE.core)
  assert.equal(contar('core', 'peri'), COMUNAS_POR_ALCANCE.peri)
  assert.equal(contar('core', 'peri', 'rural'), COMUNAS_POR_ALCANCE.all)
})

test('el tiempo para compartir se escribe en palabras', () => {
  assert.equal(tiempoEnPalabras(28_400), '28 segundos')
  assert.equal(tiempoEnPalabras(1_000), '1 segundo')
  assert.equal(tiempoEnPalabras(60_000), '1 minuto')
  assert.equal(tiempoEnPalabras(72_499), '1 minuto y 12 segundos')
  assert.equal(tiempoEnPalabras(185_000), '3 minutos y 5 segundos')
})

test('el texto para compartir parte por el récord y termina con el sitio', () => {
  const ronda = {
    idDeModo: 'com-all',
    nombreDelJuego: 'Completa el mapa',
    aciertos: 30,
    maximo: 34,
    ms: 28_000,
  }
  assert.equal(
    textoParaCompartir(ronda),
    'Le achunté a 30 de 34 comunas de Santiago en 28 segundos. ¿Teni calle? notengocalle.com',
  )
  assert.equal(
    textoParaCompartir({ ...ronda, nuevoRecord: true, puesto: 3, jugadores: 41 }),
    '¡Saqué nuevo récord en "Completa el mapa"! Le achunté a 30 de 34 comunas de Santiago en 28 segundos, y voy 3.º de 41 en el ranking 🏆. ¿Teni calle? notengocalle.com',
  )
  assert.match(
    textoParaCompartir({
      ...ronda,
      idDeModo: 'sv-ubicar',
      nombreDelJuego: '¿Dónde estás?',
      maximo: 50,
      nivel: 'Difícil',
    }),
    /^Saqué 30 de 50 puntos .*\(nivel Difícil\) en 28 segundos\./,
  )
  assert.match(
    textoParaCompartir({ ...ronda, idDeModo: 'rs-any-car', nombreDelJuego: 'En auto' }),
    /"En auto"/,
  )
})

// ----- ruteo en auto: pasos desde la traza de Valhalla y solo alternativas que existen en el cruce
// Un barrio de juguete en kilómetros (x al oriente, y al norte) pasado a [lat, lon].
const aPunto = (x, y) => [-33.45 + y / 111.2, -70.65 + x / 92.9]
const trazado = (...puntos) => puntos.map(([x, y]) => aPunto(x, y))

// Polilínea de 6 decimales como la que entrega Valhalla.
function codificarPolilinea(puntos) {
  const valor = numero => {
    let resto = numero < 0 ? ~(numero << 1) : numero << 1
    let texto = ''
    while (resto >= 0x20) {
      texto += String.fromCharCode((0x20 | (resto & 0x1f)) + 63)
      resto >>= 5
    }
    return texto + String.fromCharCode(resto + 63)
  }
  let anterior = [0, 0]
  return puntos
    .map(([lat, lon]) => {
      const actual = [Math.round(lat * 1e6), Math.round(lon * 1e6)]
      const texto = valor(actual[0] - anterior[0]) + valor(actual[1] - anterior[1])
      anterior = actual
      return texto
    })
    .join('')
}

const NOMBRES_DE_LA_RUTA = ['G-99', 'Villa Norte - Av. Central - Cerro Alto']
// Una traza de juguete: aristas [nombres, km, clase, rumboFinal, cruces] sobre los puntos de la ruta.
function viajeYTraza(puntos, aristas) {
  const viaje = {
    summary: { length: 3, time: 300 },
    legs: [{ shape: codificarPolilinea(trazado(...puntos)) }],
  }
  const traza = {
    edges: aristas.map(([names, length, road_class, end_heading, cruces = []], indice) => ({
      names,
      length,
      road_class,
      end_heading,
      begin_shape_index: indice,
      end_shape_index: indice + 1,
      end_node: {
        intersecting_edges: cruces.map(([begin_heading, clase, driveability = 'both']) => ({
          begin_heading,
          road_class: clase,
          use: 'road',
          driveability,
        })),
      },
    })),
  }
  return { viaje, traza }
}
const sinLineas = { lineasPorNombre: new Map() }

test('los pasos llevan el nombre de cada calle, no el de la ruta que comparten', () => {
  const { viaje, traza } = viajeYTraza(
    [
      [-1.5, 0],
      [0, 0],
      [0, 1.2],
    ],
    [
      [['Avenida Uno', ...NOMBRES_DE_LA_RUTA], 1.5, 'secondary', 90],
      [['Avenida Dos', ...NOMBRES_DE_LA_RUTA], 1.2, 'secondary', 0],
    ],
  )
  const ruta = rutaDelJuego(viaje, traza, sinLineas)
  assert.deepEqual(
    ruta.steps.map(paso => paso.n),
    ['Av. Uno', 'Av. Dos'],
  )
})

test('una calle sin nombre propio queda con el número de su ruta, nunca con el nombre del recorrido', () => {
  assert.equal(nombreDeLaCalle(NOMBRES_DE_LA_RUTA), 'Ruta G-99')
  assert.equal(nombreDeLaCalle(['Avenida Uno', ...NOMBRES_DE_LA_RUTA]), 'Av. Uno')
  const delJuego = nombre => nombre === 'Av. Dos'
  assert.equal(
    nombreDeLaCalle(['Avenida Uno', 'Avenida Dos'], delJuego),
    'Av. Dos',
    'se prefiere una calle del juego',
  )
})

test('el cruce de un paso es donde se deja la calle anterior, antes de la rampa sin nombre', () => {
  const { viaje, traza } = viajeYTraza(
    [
      [-2, 0],
      [0, 0],
      [0.3, -0.3],
      [3, -0.3],
    ],
    [
      [['Avenida Uno'], 2, 'primary', 90, [[100, 'primary', 'forward']]],
      [undefined, 0.4, 'primary', 135],
      [['Avenida Dos'], 2.7, 'primary', 90],
    ],
  )
  const [uno, dos] = rutaDelJuego(viaje, traza, sinLineas).steps
  assert.deepEqual([uno.n, dos.n], ['Av. Uno', 'Av. Dos'])
  assert.deepEqual(dos.ent, [{ h: 100, k: 2 }])
  assert.deepEqual(
    dos.x,
    aPunto(0, 0).map(numero => +numero.toFixed(5)),
  )
})

const respuestaDeCruces = (...calles) => [
  {
    edges: calles.map(([heading, names]) => ({
      percent_along: 0,
      heading,
      edge_info: { names },
      edge: { classification: { use: 'road' } },
    })),
  },
]
const contextoDeNombres = {
  lineasPorNombre: new Map(),
  nombresDeAutopistas: new Set(),
  esAutopista: () => false,
}

test('las calles que salen de un cruce se nombran con lo que responde Valhalla; las que no se pueden nombrar se descartan', () => {
  const { viaje, traza } = viajeYTraza(
    [
      [-1.5, 0],
      [0, 0],
      [0, 1.2],
    ],
    [
      [
        ['Avenida Uno'],
        1.5,
        'secondary',
        90,
        [
          [180, 'secondary'],
          [270, 'tertiary'],
        ],
      ],
      [['Avenida Dos'], 1.2, 'secondary', 0],
    ],
  )
  const ruta = rutaDelJuego(viaje, traza, sinLineas)
  const cruces = crucesPorNombrar(ruta)
  assert.deepEqual(cruces.indices, [1])
  completarAlternativas(
    ruta,
    cruces,
    respuestaDeCruces([180, ['Avenida Tres']], [0, ['Avenida Dos']]),
    contextoDeNombres,
  )
  assert.deepEqual(ruta.steps[1].ent, [{ h: 180, k: 3, n: 'Av. Tres' }])
})

// Tres tramos de la misma calle con una bifurcación (otra calle igual de importante que sale casi derecho) en el medio.
const conBifurcacion = (clase = 'primary') =>
  viajeYTraza(
    [
      [-1.5, 0],
      [-0.5, 0],
      [0.5, 0],
      [0.5, 1.2],
    ],
    [
      [['Avenida Uno'], 1, clase, 90, [[100, clase, 'forward']]],
      [['Avenida Uno'], 1, clase, 90],
      [['Avenida Dos'], 1.2, clase, 0],
    ],
  )

test('una bifurcación parte la calle en dos pasos si lleva a otra calle con nombre; si no, no es una decisión', () => {
  const { viaje, traza } = conBifurcacion()
  const ruta = rutaDelJuego(viaje, traza, sinLineas)
  assert.deepEqual(
    ruta.steps.map(paso => paso.n),
    ['Av. Uno', 'Av. Uno', 'Av. Dos'],
  )
  const cruces = crucesPorNombrar(ruta)
  completarAlternativas(ruta, cruces, respuestaDeCruces([100, ['Avenida Tres']]), contextoDeNombres)
  assert.deepEqual(
    ruta.steps.map(paso => paso.n),
    ['Av. Uno', 'Av. Uno', 'Av. Dos'],
  )

  const otra = conBifurcacion()
  const rutaSinNombres = rutaDelJuego(otra.viaje, otra.traza, sinLineas)
  completarAlternativas(
    rutaSinNombres,
    crucesPorNombrar(rutaSinNombres),
    respuestaDeCruces([100, []]),
    contextoDeNombres,
  )
  assert.deepEqual(
    rutaSinNombres.steps.map(paso => paso.n),
    ['Av. Uno', 'Av. Dos'],
    'sin saber a dónde lleva, se vuelve a una sola calle',
  )
})

test('en una autopista no se parte la calle en cada bifurcación: las salidas son su propia pregunta', () => {
  const { viaje, traza } = conBifurcacion('motorway')
  assert.deepEqual(
    rutaDelJuego(viaje, traza, sinLineas).steps.map(paso => paso.n),
    ['Av. Uno', 'Av. Dos'],
  )
})

test('el lado de una maniobra solo se dice donde hay dos lados posibles', () => {
  assert.equal(textoDeManiobra(-90, 'Av. Grecia'), 'Dobla a la izquierda en Av. Grecia')
  assert.equal(textoDeManiobra(-90, 'Av. Grecia', { conLado: false }), 'Dobla en Av. Grecia')
  assert.equal(textoDeManiobra(40, 'Av. Grecia'), 'Mantente a la derecha hacia Av. Grecia')
  assert.equal(textoDeManiobra(5, 'Av. Grecia'), 'Sigue derecho por Av. Grecia')
  assert.equal(textoDeManiobra(-70, 'Vespucio', { haciaAutopista: true }), 'Toma la entrada a Vespucio')
  assert.equal(textoDeManiobra(5, 'Vespucio', { haciaAutopista: true }), 'Toma la entrada a Vespucio')
  assert.equal(
    textoDeManiobra(70, 'Av. Kennedy', { desdeAutopista: true }),
    'Toma la salida hacia Av. Kennedy',
  )
  assert.equal(
    textoDeManiobra(2, 'Av. Kennedy', { desdeAutopista: true }),
    'Toma la salida hacia Av. Kennedy',
    'al dejar una autopista nunca es "sigue derecho", aunque la salida salga derecho',
  )
  assert.equal(
    textoDeManiobra(70, 'Av. Kennedy', { desdeAutopista: true, numeroDeSalida: '11' }),
    'Toma la salida 11 hacia Av. Kennedy',
  )
  assert.equal(
    textoDeManiobra(3, 'Ruta 5', { desdeAutopista: true, haciaAutopista: true }),
    'Sigue derecho por Ruta 5',
    'una autopista que solo cambia de nombre sigue derecho',
  )
})

const esAutopistaDeJuguete = nombre => nombre === 'Autopista X'
const contextoDeJuguete = (salidas = []) => ({ esAutopista: esAutopistaDeJuguete, salidas })
const calle = (n, h, k = 3, extra = {}) => ({ n, h, k, ...extra })
// Un paso de juguete que termina donde empieza el siguiente. `ent`: las calles que salen del cruce donde se entra a él.
const paso = (n, puntos, ent = []) => ({
  n,
  km: 1,
  g: trazado(...puntos),
  fin: aPunto(...puntos.at(-1)),
  x: aPunto(...puntos[0]),
  ent,
})

test('Street View: el lado se dice solo si la calle sale hacia los dos lados, y se ofrece lo que existe en el cruce', () => {
  // Viniendo hacia el oriente por Av. Norte, la ruta dobla al norte por Av. Cruce, que también sale hacia el sur.
  const pasos = [
    paso('Av. Norte', [
      [-1, 0],
      [0.5, 0],
    ]),
    paso(
      'Av. Cruce',
      [
        [0.5, 0],
        [0.5, 1],
      ],
      [calle('Av. Cruce', 180), calle('Av. Norte', 90), calle('Calle Lateral', 135, 5)],
    ),
  ]
  const decision = decisionesConStreetView(pasos, contextoDeJuguete())[1]
  assert.equal(decision.correcta, 'Dobla a la izquierda en Av. Cruce')
  assert.deepEqual(
    [...decision.incorrectas].sort(),
    [
      'Dobla a la derecha en Av. Cruce',
      'Mantente a la izquierda hacia Av. Norte',
      'Mantente a la derecha hacia Calle Lateral',
    ].sort(),
  )
})

test('Street View: si la calle a la que se va sale hacia un solo lado, no se dice el lado ni se ofrece el contrario', () => {
  const pasos = [
    paso('Av. Norte', [
      [-1, 0],
      [0.5, 0],
    ]),
    paso(
      'Av. Cruce',
      [
        [0.5, 0],
        [0.5, 1],
      ],
      [calle('Av. Norte', 90)],
    ),
  ]
  const decision = decisionesConStreetView(pasos, contextoDeJuguete())[1]
  assert.equal(decision.correcta, 'Dobla en Av. Cruce')
  assert.deepEqual(decision.incorrectas, ['Sigue derecho por Av. Norte'])
})

test('Street View: si en el cruce no hay otra cosa que hacer, no hay alternativas', () => {
  const pasos = [
    paso('Av. Norte', [
      [-1, 0],
      [0.5, 0],
    ]),
    paso('Calle Sola', [
      [0.5, 0],
      [0.5, 1],
    ]),
  ]
  assert.deepEqual(decisionesConStreetView(pasos, contextoDeJuguete())[1].incorrectas, [])
})

test('Street View: la salida de una autopista dice su número y a dónde lleva, sin lado, y se puede seguir derecho', () => {
  const pasos = [
    paso('Autopista X', [
      [-3, 0],
      [1, 0],
    ]),
    paso(
      'Av. Salida',
      [
        [1, 0],
        [1.3, -0.3],
        [1.3, -1],
      ],
      [calle('Autopista X', 90, 0)],
    ),
  ]
  const salidas = [
    { r: '8', p: aPunto(0.95, 0.005), v: ['Autopista X'], a: ['Vespucio'], c: [], m: 'Providencia' },
  ]
  const decision = decisionesConStreetView(pasos, contextoDeJuguete(salidas))[1]
  assert.equal(decision.correcta, 'Toma la salida 8 hacia Américo Vespucio')
  assert.deepEqual(decision.incorrectas, ['Sigue derecho por Autopista X'])
})

test('Street View: tras una salida que sale casi derecho tampoco se dice "sigue derecho"', () => {
  const pasos = [
    paso('Autopista X', [
      [-3, 0],
      [1, 0],
    ]),
    paso(
      'Av. Salida',
      [
        [1, 0],
        [1.5, 0.02],
        [3, 0.1],
      ],
      [calle('Autopista X', 90, 0)],
    ),
  ]
  const decision = decisionesConStreetView(pasos, contextoDeJuguete())[1]
  assert.equal(decision.correcta, 'Toma la salida hacia Av. Salida')
})

// Una autopista de 10 km con salidas cada kilómetro: la ruta la deja por la `correcta`.
function autopistaConSalidas({ pasadas, correcta, despues }) {
  const salida = (r, x, a) => ({
    r: String(r),
    p: aPunto(x, 0.005),
    v: ['Autopista X'],
    a: [a],
    c: [],
    m: 'Comuna',
  })
  const kmDeLaCorrecta = pasadas + 1
  const salidas = [
    ...Array.from({ length: pasadas }, (_, i) => salida(i + 1, 1 + i, `Destino ${i + 1}`)),
    salida(correcta, kmDeLaCorrecta, `Destino ${correcta}`),
    ...Array.from({ length: despues }, (_, i) =>
      salida(correcta + 1 + i, kmDeLaCorrecta + 1 + i, `Destino ${correcta + 1 + i}`),
    ),
  ]
  const pasos = [
    paso('Av. Acceso', [
      [-1, 1],
      [0, 0],
    ]),
    {
      ...paso(
        'Autopista X',
        [
          [0, 0],
          [kmDeLaCorrecta, 0],
        ],
        [calle('Av. Acceso', 270)],
      ),
      km: kmDeLaCorrecta,
    },
    paso(
      'Av. Salida',
      [
        [kmDeLaCorrecta, 0],
        [kmDeLaCorrecta + 0.3, -1],
      ],
      [calle('Autopista X', 90, 0)],
    ),
  ]
  return { pasos, salidas }
}

test('en el mapa, al ir por una autopista se pregunta por las salidas de a tres en orden, con "seguir derecho"', () => {
  const { pasos, salidas } = autopistaConSalidas({ pasadas: 5, correcta: 6, despues: 3 })
  const { decisiones, antes } = decisionesEnAuto(pasos, contextoDeJuguete(salidas))
  assert.deepEqual(
    decisiones.map(decision => decision.tipo),
    ['salidas', 'salidas'],
  )
  assert.equal(
    antes.length,
    1,
    'solo la calle de acceso se dibuja de entrada: la autopista se dibuja de a poco',
  )
  const [primera, segunda] = decisiones
  assert.deepEqual(primera.opciones, [
    'Salida 1 · Destino 1',
    'Salida 2 · Destino 2',
    'Salida 3 · Destino 3',
    'Seguir derecho por Autopista X',
  ])
  assert.equal(primera.correcta, 'Seguir derecho por Autopista X', 'ninguna de las tres era la buena')
  assert.deepEqual(segunda.opciones, [
    'Salida 4 · Destino 4',
    'Salida 5 · Destino 5',
    'Salida 6 · Destino 6',
    'Seguir derecho por Autopista X',
  ])
  assert.equal(segunda.correcta, 'Salida 6 · Destino 6')
  assert.deepEqual(segunda.salidaElegida, { texto: 'Salida 6', paso: 1 })
  assert.equal(segunda.trazos.length, 2, 'al acertar la salida se dibuja también la calle a la que se llega')
  assert.equal(nombresDeLaRuta(pasos, decisiones)[1], 'Autopista X (salida 6)')
})

test('en el mapa, la salida correcta no es siempre la última de las que se muestran', () => {
  const { pasos, salidas } = autopistaConSalidas({ pasadas: 4, correcta: 5, despues: 3 })
  const decisiones = decisionesEnAuto(pasos, contextoDeJuguete(salidas)).decisiones
  assert.deepEqual(decisiones.at(-1).opciones, [
    'Salida 4 · Destino 4',
    'Salida 5 · Destino 5',
    'Salida 6 · Destino 6',
    'Seguir derecho por Autopista X',
  ])
  assert.equal(decisiones.at(-1).correcta, 'Salida 5 · Destino 5')
})

test('en el mapa, nunca hay una pregunta con una sola opción: sin alternativas la calle se dibuja con la respuesta anterior', () => {
  const pasos = [
    paso(
      'Av. Norte',
      [
        [-1, 0],
        [0.5, 0],
      ],
      [calle('Av. Otra', 0)],
    ),
    paso(
      'Av. Cruce',
      [
        [0.5, 0],
        [0.5, 1],
      ],
      [calle('Av. Norte', 90), calle('Av. Lateral', 180)],
    ),
    paso('Calle Sola', [
      [0.5, 1],
      [2, 1],
    ]),
  ]
  const { decisiones, antes } = decisionesEnAuto(pasos, contextoDeJuguete())
  assert.ok(decisiones.every(decision => decision.opciones.length > 1))
  assert.equal(decisiones.length, 2, 'Calle Sola no tiene alternativas: no es pregunta')
  assert.equal(antes.length, 0)
  assert.equal(decisiones[1].trazos.length, 2, 'y se dibuja junto con la respuesta anterior')
})

test('en el mapa, las alternativas son las calles que salen del cruce y seguir derecho; nada de otras partes de la ciudad', () => {
  const pasos = [
    paso('Av. Norte', [
      [-1, 0],
      [0.5, 0],
    ]),
    paso(
      'Av. Cruce',
      [
        [0.5, 0],
        [0.5, 1],
      ],
      [calle('Av. Norte', 90), calle('Calle Lateral', 180, 5)],
    ),
  ]
  const decision = decisionesEnAuto(pasos, contextoDeJuguete()).decisiones.find(d => d.tipo === 'calle')
  assert.equal(decision.correcta, 'Av. Cruce')
  assert.deepEqual(
    [...decision.opciones].sort(),
    ['Av. Cruce', 'Calle Lateral', 'Seguir derecho por Av. Norte'].sort(),
  )
})

test('en el mapa, si la calle sigue con el mismo nombre pero hay que elegir, lo correcto es seguir derecho', () => {
  const pasos = [
    paso('Av. Uno', [
      [-1.5, 0],
      [-0.5, 0],
    ]),
    paso(
      'Av. Uno',
      [
        [-0.5, 0],
        [0.5, 0],
      ],
      [calle('Av. Tres', 100, 2)],
    ),
    paso(
      'Av. Dos',
      [
        [0.5, 0],
        [0.5, 1],
      ],
      [calle('Av. Cuatro', 180)],
    ),
  ]
  const decision = decisionesEnAuto(pasos, contextoDeJuguete()).decisiones[0]
  assert.equal(decision.correcta, 'Seguir derecho por Av. Uno')
  assert.deepEqual([...decision.opciones].sort(), ['Av. Tres', 'Seguir derecho por Av. Uno'].sort())
})

test('el destino de una salida es lo que dicen los carteles; a falta de eso, la calle de al lado y, al final, la comuna', () => {
  const base = { r: '3', p: aPunto(0, 0), v: ['Autopista X'], c: [], m: 'Peñalolén' }
  assert.equal(
    destinoDeLaSalida({ ...base, a: ['Av. Tabancura', 'Vitacura', 'Las Condes'] }, 'Autopista X'),
    'Av. Tabancura / Vitacura',
  )
  assert.equal(
    destinoDeLaSalida({ ...base, a: ['Autopista X'], c: [['Av. Vitacura', 120]] }, 'Autopista X'),
    'Av. Vitacura',
  )
  assert.equal(destinoDeLaSalida({ ...base, c: [['Av. Lejana', 900]] }, 'Autopista X'), 'Peñalolén')
})

test('las preguntas por las salidas siguen hasta la que trae la correcta', () => {
  const { pasos, salidas } = autopistaConSalidas({ pasadas: 8, correcta: 9, despues: 3 })
  const secuencia = secuenciaDeSalidas(pasos[1], null, salidas)
  const ventanas = ventanasDeSalidas(secuencia, 9)
  assert.equal(ventanas.length, 3)
  assert.deepEqual(
    ventanas.map(ventana => ventana.indiceDeLaCorrecta),
    [-1, -1, 2],
  )
  assert.ok(
    ventanas[1].desdeKm > ventanas[0].hastaKm,
    'cada pregunta parte después de las salidas de la anterior',
  )
})

test('en una autopista larga solo se pregunta cerca de la salida: lo de más atrás se recorre sin preguntar', () => {
  const { pasos, salidas } = autopistaConSalidas({ pasadas: 14, correcta: 15, despues: 3 })
  const { decisiones, antes } = decisionesEnAuto(pasos, contextoDeJuguete(salidas))
  assert.equal(decisiones.length, 3)
  assert.equal(decisiones.at(-1).correcta, 'Salida 15 · Destino 15')
  assert.equal(antes.length, 2, 'la calle de acceso y el tramo de autopista sin preguntas')
  assert.ok(antes[1].g.length >= 2 && antes[1].rotulo === 'Autopista X')
})

test('Street View: en una bifurcación las opciones se dicen por el lado, no todas "sigue derecho"', () => {
  // Viniendo por Av. Uno hacia el oriente, sale casi derecho Gran Vía (a la izquierda, 10°) y Santa Teresa (a la derecha, 25°).
  const pasos = [
    paso('Av. Uno', [
      [-2, 0],
      [0, 0],
    ]),
    paso(
      'Gran Vía',
      [
        [0, 0],
        [2, 0.1],
      ],
      [calle('Santa Teresa', 115, 2)],
    ),
  ]
  const decision = decisionesConStreetView(pasos, contextoDeJuguete())[1]
  assert.equal(decision.correcta, 'Mantente a la izquierda hacia Gran Vía')
  assert.deepEqual(decision.incorrectas, ['Mantente a la derecha hacia Santa Teresa'])
})

test('las salidas de la calzada contraria no se ofrecen: el rumbo de la autopista en la salida tiene que ir con el de la ruta', () => {
  const { pasos, salidas } = autopistaConSalidas({ pasadas: 4, correcta: 5, despues: 3 })
  // Las salidas 2 y 7 existen, pero en la calzada que va hacia el poniente (270°): la ruta va hacia el oriente.
  const conCalzadas = salidas.map(salida => ({
    ...salida,
    o: ['2', '7'].includes(salida.r) ? 270 : 90,
  }))
  const secuencia = secuenciaDeSalidas(pasos[1], null, conCalzadas)
  assert.deepEqual(
    secuencia.salidas.map(({ salida }) => salida.r),
    ['1', '3', '4', '5', '6', '8'],
  )
})

test('el largo de la ronda: 10, 20 o todas, salvo en los juegos de largo fijo o sin ronda de todas', () => {
  assert.equal(largoDeRondaDe('st-name', 10), 10)
  assert.equal(largoDeRondaDe('st-name', 20), 20)
  assert.equal(largoDeRondaDe('st-name', 999), 999)
  assert.equal(largoDeRondaDe('rs-any-car', 20), 10, 'las rutas siempre son de 10')
  assert.equal(largoDeRondaDe('rs-any-tp', 999), 10, 'y no tienen ronda de todas')
  assert.equal(largoDeRondaDe('rs-sv-car', 20), 10)
  assert.equal(largoDeRondaDe('sv-ubicar', 20), 10, 'Street View siempre son 10')
  assert.deepEqual(categoriasValidasDe('cc-name'), ['10', '20', 'todas'])
  assert.deepEqual(categoriasValidasDe('cc-find'), ['10', '20', 'todas'])
  assert.deepEqual(categoriasValidasDe('cc-hard'), ['10', '20', 'todas'])
})

test('una ronda de 10 preguntas es válida en su ranking y una de otro largo no', () => {
  const ronda = { modo: 'st-name', categoria: '10', aciertos: 8, total: 10, ms: 40_000 }
  assert.equal(problemaDelPuntaje(ronda), null)
  assert.ok(problemaDelPuntaje({ ...ronda, total: 20 }))
})

test('cada juego figura solo en las pestañas del ranking que existen para él', () => {
  // No hay "completa el mapa" de comunas ni de regiones de 10 ni de 20 preguntas.
  for (const pestana of ['10', '20']) {
    assert.equal(categoriaEnElResumen('com-all', pestana) === 'core', pestana === 'todas')
    assert.equal(categoriaEnElResumen('ch-all', pestana), null)
    assert.equal(categoriaEnElResumen('ch-find', pestana), null)
  }
  assert.equal(categoriaEnElResumen('ch-all', 'todas'), 'todas')
  assert.equal(categoriaEnElResumen('com-all', 'todas'), 'core')
  assert.equal(categoriaEnElResumen('com-all', '10'), null)
  assert.equal(categoriaEnElResumen('com-name', '20'), null)
  assert.equal(categoriaEnElResumen('sv-ubicar', '20'), 'extremo')
  assert.equal(categoriaEnElResumen('sv-ubicar', '10'), null)
  assert.equal(categoriaEnElResumen('st-name', '10'), '10')
  assert.equal(categoriaEnElResumen('st-name', 'todas'), 'todas')
  assert.equal(categoriaEnElResumen('rs-any-car', 'todas'), null, 'el ruteo no tiene ronda de todas')
  assert.equal(categoriaEnElResumen('rs-any-car', '20'), null)
  assert.equal(categoriaEnElResumen('rs-sv-car', '10'), '10')
  assert.deepEqual(categoriasValidasDe('ch-find'), ['todas'])
  assert.deepEqual(categoriasDelResumen('20'), ['20', 'extremo'])
  assert.deepEqual(categoriasDelResumen('10'), ['10', '10'])
})

test('si la calle a la que se entra sale del cruce en los dos sentidos sin lado que decir, se pregunta por hacia dónde va', () => {
  const pasos = [
    paso('Av. Norte', [
      [-1, 0],
      [0.5, 0],
    ]),
    paso(
      'Av. Cruce',
      [
        [0.5, 0],
        [0.5, 1],
      ],
      [calle('Av. Cruce', 90)],
    ),
  ]
  const conStreetView = decisionesConStreetView(pasos, contextoDeJuguete())[1]
  assert.equal(conStreetView.correcta, 'Toma Av. Cruce hacia el norte')
  assert.ok(conStreetView.incorrectas.includes('Toma Av. Cruce hacia el sur'))
  const enElMapa = decisionesEnAuto(pasos, contextoDeJuguete()).decisiones.find(d => d.tipo === 'calle')
  assert.equal(enElMapa.correcta, 'Av. Cruce hacia el norte')
  assert.ok(enElMapa.opciones.includes('Av. Cruce hacia el sur'))
})

// ----- desafíos diarios

test('la selección del día es la misma para todos, cambia con la fecha y no depende de quién la pide', () => {
  const lista = Array.from({ length: 164 }, (_, i) => `calle ${i}`)
  const delLunes = elegirConSemilla(lista, 10, '2026-10-26:calles')
  assert.deepEqual(delLunes, elegirConSemilla(lista, 10, '2026-10-26:calles'))
  assert.equal(new Set(delLunes).size, 10)
  assert.notDeepEqual(delLunes, elegirConSemilla(lista, 10, '2026-10-27:calles'))
  assert.notDeepEqual(delLunes, elegirConSemilla(lista, 10, '2026-10-26:comunas'))
  assert.equal(lista[0], 'calle 0', 'no desordena la lista que recibe')
})

test('el día de los desafíos cambia a la medianoche de Chile (con su cambio de hora)', () => {
  // En octubre Chile está en horario de verano (UTC-3); en invierno, UTC-4.
  assert.equal(fechaDeHoyEnChile(new Date('2026-10-25T02:59:00Z')), '2026-10-24')
  assert.equal(fechaDeHoyEnChile(new Date('2026-10-25T03:00:00Z')), '2026-10-25')
  assert.equal(fechaDeHoyEnChile(new Date('2026-07-01T03:59:00Z')), '2026-06-30')
  assert.equal(fechaDeHoyEnChile(new Date('2026-07-01T04:00:00Z')), '2026-07-01')
  assert.equal(fechaDeAyerEnChile(new Date('2026-03-01T12:00:00Z')), '2026-02-28')
  assert.equal(segundosHastaLaMedianocheDeChile(new Date('2026-10-25T02:59:00Z')), 60)
  assert.ok(esCategoriaDiaria('2026-10-24') && !esCategoriaDiaria('20') && !esCategoriaDiaria('todas'))
})
