import { fechaDeHoyEnChile } from '../../../compartido/oficial.js'
import { callesDelJuego, comunasDelAlcance } from '../../datos/datos.js'
import { anotarQueSeEmpezo, elegirDelDia } from '../diarios.js'
import { modoPorId, registrarModo } from '../registry.js'
import { rutaDelDia } from './ruteoEnAuto.js'

// Desafíos diarios: los mismos para todos, desde la medianoche de Chile, y una sola vez por jugador. Cada uno es un juego que ya
// existe con las preguntas del día (elegidas por la fecha, en un orden fijo) y la fecha como categoría de su ranking. Solo tienen
// ronda oficial: la práctica está en sus juegos de siempre. Tienen que registrarse después de los juegos en que se basan.
const GRUPO_DE_LOS_DESAFIOS = 'Desafíos diarios'
const CALLES_DEL_DESAFIO = 10
const COMUNAS_DEL_DESAFIO = 10

const desafioBasadoEn = (idBase, propio) =>
  registrarModo({
    ...modoPorId(idBase),
    group: GRUPO_DE_LOS_DESAFIOS,
    diario: true,
    soloOficial: true,
    all: true,
    ordenFijo: true,
    desc: undefined,
    categoriaDeRonda: fechaDeHoyEnChile,
    setup() {
      anotarQueSeEmpezo(propio.id)
    },
    ...propio,
  })

// Orden por código de caracteres (no por idioma): así la selección del día sale igual en todos los navegadores.
const compararTextos = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const porNombre = (a, b) => compararTextos(a.name, b.name)

desafioBasadoEn('rs-sv-ruta', {
  id: 'dd-ruta',
  name: 'Ruteo en auto',
  pool: () => [rutaDelDia(fechaDeHoyEnChile())],
})

desafioBasadoEn('st-name', {
  id: 'dd-calles',
  name: 'Identifica 10 calles',
  pool: () => elegirDelDia([...callesDelJuego()].sort(porNombre), CALLES_DEL_DESAFIO, 'calles'),
})

// Las comunas de toda la Región Metropolitana (el juego base usa el alcance elegido; en el desafío se impone).
desafioBasadoEn('com-name', {
  id: 'dd-comunas',
  name: 'Identifica 10 comunas de la RM',
  reglas: { scope: 'all' },
  pool: () =>
    elegirDelDia(
      [...comunasDelAlcance()].sort((a, b) => compararTextos(a.properties.name, b.properties.name)),
      COMUNAS_DEL_DESAFIO,
      'comunas',
    ),
})
