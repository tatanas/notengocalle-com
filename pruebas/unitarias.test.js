// Pruebas de la lógica pura que comparten navegador y servidor: node --test tests/unit.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { llaveDeUsuario, PATRON_DE_USUARIO } from '../compartido/cuentas.js'
import { categoriaDe, esMejorPuntaje, categoriaHeredada, problemaDelPuntaje } from '../compartido/oficial.js'
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
  const ronda = { modo: 'com-name', categoria: '20', aciertos: 10, total: 20, ms: 60000 }
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
