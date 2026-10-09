// Pruebas de la lógica pura que comparten navegador y servidor: node --test tests/unit.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { usernameKey, USERNAME_PATTERN } from '../shared/accounts.js'
import { OFFICIAL_ROUNDS, isBetterScore, scoreProblem } from '../shared/ranked.js'
import {
  distanceKm,
  distanceKmAnyLatitude,
  distanceToPolyline,
  nearestBy,
  pointInFeature,
  pointInPolygon,
} from '../src/core/geo.js'
import { adaptiveWeight, record, weightedSample } from '../src/core/progress.js'

const PLAZA_ITALIA = [-33.4372, -70.6344]
const closeTo = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} no está a ±${tolerance} de ${expected}`)

test('distancias en Santiago', () => {
  const escuelaMilitar = [-33.4136, -70.5826]
  closeTo(distanceKm(PLAZA_ITALIA, escuelaMilitar), 5.5, 0.2)
  assert.equal(distanceKm(PLAZA_ITALIA, PLAZA_ITALIA), 0)
})

test('distancias a escala de país corrigen la longitud según la latitud', () => {
  const santiago = [-33.45, -70.66]
  const puntaArenas = [-53.16, -70.91]
  closeTo(distanceKmAnyLatitude(santiago, puntaArenas), 2192, 15)
  const mismoParalelo = distanceKmAnyLatitude([-53, -70], [-53, -71])
  closeTo(mismoParalelo, 111.2 * Math.cos((53 * Math.PI) / 180), 0.5)
})

test('distancia a una línea: al tramo más cercano, no solo a sus vértices', () => {
  const avenida = [
    [
      [-33.44, -70.66],
      [-33.44, -70.62],
    ],
  ]
  closeTo(distanceToPolyline([-33.43, -70.64], avenida), 1.112, 0.01)
  closeTo(distanceToPolyline([-33.44, -70.61], avenida), 0.929, 0.01)
  assert.equal(distanceToPolyline([-33.44, -70.64], avenida), 0)
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
  assert.equal(pointInPolygon([0.5, 1.5], formaDeL), true)
  assert.equal(pointInPolygon([1.5, 0.5], formaDeL), true)
  assert.equal(pointInPolygon([1.5, 1.5], formaDeL), false)
  assert.equal(pointInPolygon([3, 3], formaDeL), false)
})

test('punto dentro de una comuna GeoJSON [lon, lat], con una o varias partes', () => {
  const square = (lon, lat) => [
    [
      [lon, lat],
      [lon + 1, lat],
      [lon + 1, lat + 1],
      [lon, lat + 1],
      [lon, lat],
    ],
  ]
  const simple = { geometry: { type: 'Polygon', coordinates: square(-71, -34) } }
  const islands = { geometry: { type: 'MultiPolygon', coordinates: [square(-71, -34), square(-60, -20)] } }
  assert.equal(pointInFeature(-33.5, -70.5, simple), true)
  assert.equal(pointInFeature(-33.5, -69.5, simple), false)
  assert.equal(pointInFeature(-19.5, -59.5, islands), true)
  assert.equal(pointInFeature(-25, -65, islands), false)
})

test('nearestBy ordena por cercanía y respeta la exclusión', () => {
  const places = [
    { name: 'lejos', at: [-33.6, -70.6] },
    { name: 'cerca', at: [-33.44, -70.63] },
    { name: 'medio', at: [-33.5, -70.6] },
    { name: 'origen', at: PLAZA_ITALIA },
  ]
  const nearest = nearestBy(
    places,
    PLAZA_ITALIA,
    place => place.at,
    2,
    place => place.name === 'origen',
  )
  assert.deepEqual(
    nearest.map(place => place.name),
    ['cerca', 'medio'],
  )
})

test('el sorteo entrega la cantidad pedida, sin repetir', () => {
  const items = Array.from({ length: 50 }, (_, i) => i)
  const sample = weightedSample(items, 15)
  assert.equal(sample.length, 15)
  assert.equal(new Set(sample).size, 15)
  assert.equal(weightedSample(items, 80).length, 50)
})

test('el sorteo favorece lo que más pesa', () => {
  const items = Array.from({ length: 40 }, (_, i) => i)
  let heavyPicked = 0
  for (let round = 0; round < 300; round++)
    heavyPicked += weightedSample(items, 10, { weightOf: i => (i < 10 ? 8 : 1) }).filter(i => i < 10).length
  assert.ok(heavyPicked / 300 > 5, `en promedio salieron ${heavyPicked / 300} de los 10 pesados`)
})

test('el sorteo evita que un grupo muy numeroso domine la ronda', () => {
  const items = [
    ...Array.from({ length: 150 }, (_, i) => ({ comuna: 'Santiago', i })),
    ...Array.from({ length: 30 }, (_, i) => ({ comuna: 'Otra ' + (i % 15), i })),
  ]
  let fromBigGroup = 0
  for (let round = 0; round < 200; round++)
    fromBigGroup += weightedSample(items, 15, { groupOf: item => item.comuna }).filter(
      item => item.comuna === 'Santiago',
    ).length
  assert.ok(fromBigGroup / 200 < 8, `Santiago ocupó en promedio ${fromBigGroup / 200} de 15 cupos`)
})

test('lo fallado pesa más que lo nuevo, y lo dominado pesa menos', () => {
  record('modo:fallado', false)
  record('modo:fallado', false)
  for (let i = 0; i < 4; i++) record('modo:dominado', true)
  const [failed, unseen, mastered] = ['modo:fallado', 'modo:nunca-visto', 'modo:dominado'].map(adaptiveWeight)
  assert.ok(failed > unseen && unseen > mastered, `${failed} > ${unseen} > ${mastered}`)
})

test('un puntaje es mejor con más aciertos o, a igual número, con menos tiempo', () => {
  assert.equal(isBetterScore({ correct: 12, ms: 90000 }, { correct: 11, ms: 30000 }), true)
  assert.equal(isBetterScore({ correct: 12, ms: 30000 }, { correct: 12, ms: 40000 }), true)
  assert.equal(isBetterScore({ correct: 12, ms: 40000 }, { correct: 12, ms: 40000 }), false)
  assert.equal(isBetterScore({ correct: 10, ms: 10000 }, { correct: 12, ms: 40000 }), false)
})

test('solo pasan los puntajes con forma de ronda oficial', () => {
  const round = { mode: 'com-name', correct: 10, total: OFFICIAL_ROUNDS['com-name'], ms: 60000 }
  assert.equal(scoreProblem(round), null)
  assert.ok(scoreProblem({ ...round, mode: 'otro' }))
  assert.ok(scoreProblem({ ...round, total: 10 }))
  assert.ok(scoreProblem({ ...round, correct: 16 }))
  assert.ok(scoreProblem({ ...round, ms: 1000 }))
  assert.ok(scoreProblem({ ...round, ms: 7 * 60 * 60 * 1000 }))
})

test('nombres de usuario: qué se acepta y cuándo dos son el mismo', () => {
  for (const name of ['seba', 'Ñandú_99', 'a.b-c']) assert.ok(USERNAME_PATTERN.test(name), name)
  for (const name of ['ab', 'con espacio', 'a@b', 'x'.repeat(21)])
    assert.ok(!USERNAME_PATTERN.test(name), name)
  assert.equal(usernameKey('Ñandú'), usernameKey('NANDU'))
  assert.notEqual(usernameKey('seba'), usernameKey('seba2'))
})
