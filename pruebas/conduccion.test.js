// Pruebas de la conducción libre sobre una ciudad chica (pruebas/ciudadDeConduccion.js): node --test pruebas/conduccion.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BANDERA,
  cargarGrafo,
  diferenciaDeRumbo,
  entrantesA,
  rumboDeLlegada,
  salientesDe,
} from '../compartido/grafoVial.js'
import { construirGrafo } from '../tools/grafo/construirGrafo.mjs'
import { camaraDeLaDecision, evaluarPanorama } from '../src/dominio/camaraDeConduccion.js'
import { aristaMasCercana, elegirOpcion, empezarEn, opcionQueSigue } from '../src/dominio/conduccion.js'
import {
  LIMITE_PARA_PERDER,
  TOLERANCIA_DEL_OPTIMO,
  analizarRecorrido,
  costosDeLasOpciones,
  prepararMision,
  puntajeDeLaRuta,
  rutaOptima,
} from '../src/dominio/mision.js'
import { accesosDelLugar, salidasDelLugar } from '../src/dominio/lugaresDeRuteo.js'
import { costosDelRecorrido } from '../src/dominio/tiempos.js'
import { cruceDespuesDe, nombreDeCalle } from '../src/dominio/cruces.js'
import { textosDelCruce } from '../src/dominio/instruccionesDeCruce.js'
import { puntoEnElTrazado } from '../src/dominio/trazado.js'
import {
  AREA_DE_PRUEBA,
  ciudadConCambioDeCalle,
  ciudadConRotonda,
  ciudadDeConduccion,
  enMetros,
} from './ciudadDeConduccion.js'

const grafoDe = elementos => cargarGrafo(construirGrafo(elementos, { area: AREA_DE_PRUEBA, extremos: [] }))
const grafo = grafoDe(ciudadDeConduccion())

const nodoEn = (elGrafo, [este, norte]) => {
  const [lat, lon] = enMetros(este, norte)
  let mejor = 0
  for (let nodo = 1; nodo < elGrafo.cantidadDeNodos; nodo++)
    if (
      Math.hypot(elGrafo.latitud[nodo] - lat, elGrafo.longitud[nodo] - lon) <
      Math.hypot(elGrafo.latitud[mejor] - lat, elGrafo.longitud[mejor] - lon)
    )
      mejor = nodo
  return mejor
}

// La arista con que se llega a un cruce, dado por sus coordenadas, viajando hacia `rumbo`: oriente 90, norte 0, poniente 270.
const llegandoA = (punto, rumbo) => {
  const cruce = nodoEn(grafo, punto)
  return [...entrantesA(grafo, cruce)].find(
    arista => diferenciaDeRumbo(rumboDeLlegada(grafo, arista), rumbo) < 25,
  )
}

const textosDe = decision => textosDelCruce(decision.opciones)

// Parte en el punto y elige salir hacia donde mira `hacia` ("oriente", "poniente"…).
function partirHacia(punto, hacia) {
  const estado = empezarEn(grafo, enMetros(...punto))
  elegirOpcion(estado, estado.decision.opciones.find(opcion => opcion.hacia === hacia).id)
  return estado
}

test('al partir se elige hacia qué lado de la calle se sale', () => {
  const estado = empezarEn(grafo, enMetros(100, 0))
  assert.equal(estado.decision.esPartida, true)
  assert.deepEqual(textosDe(estado.decision), [
    'Salir hacia el oriente por Av. Principal',
    'Salir hacia el poniente por Av. Principal',
  ])
})

test('en un cruce se ofrece seguir y doblar a cada lado', () => {
  const estado = partirHacia([100, 0], 'oriente')
  assert.deepEqual(textosDe(estado.decision), [
    'Seguir derecho por Av. Principal',
    'Doblar a la izquierda por Calle Uno',
    'Doblar a la derecha por Calle Uno',
  ])
})

test('las calles sin salida y los accesos no se ofrecen y el auto pasa de largo', () => {
  for (const cruceConCallejon of [
    [400, 0],
    [600, 0],
  ]) {
    const cruce = cruceDespuesDe(grafo, llegandoA(cruceConCallejon, 90))
    assert.equal(cruce.opciones.length, 1)
    assert.equal(cruce.sinSalida, 1)
  }
  const estado = partirHacia([100, 0], 'oriente')
  elegirOpcion(estado, 0)
  assert.ok(estado.metros > 899 && estado.metros < 901)
  assert.deepEqual(textosDe(estado.decision), [
    'Seguir derecho por Av. Principal',
    'Doblar a la izquierda por Calle Única',
  ])
})

test('un giro prohibido no se ofrece, en ninguno de los dos sentidos', () => {
  for (const rumbo of [90, 270]) {
    const cruce = cruceDespuesDe(grafo, llegandoA([800, 0], rumbo))
    assert.equal(cruce.opciones.length, 1)
    assert.ok(!textosDe(cruce).some(texto => texto.includes('Calle Ocho')))
  }
})

test('una calle de un solo sentido no se ofrece al entrar en contra', () => {
  const cruce = cruceDespuesDe(grafo, llegandoA([1000, 300], 90))
  assert.ok(!textosDe(cruce).some(texto => texto.includes('Calle Única')))
  const aFavor = cruceDespuesDe(grafo, llegandoA([1000, 0], 90))
  assert.ok(textosDe(aFavor).includes('Doblar a la izquierda por Calle Única'))
})

test('un giro a la izquierda que cruza el bandejón y la vuelta en U son una sola decisión', () => {
  const cruce = cruceDespuesDe(grafo, llegandoA([300, 600], 90))
  assert.deepEqual(textosDe(cruce), [
    'Seguir derecho por Av. Doble',
    'Doblar a la izquierda por Calle Cruce',
    'Doblar a la derecha por Calle Cruce',
    'Dar la vuelta en U por el retorno',
  ])
  const izquierda = cruce.opciones.find(opcion => opcion.camino.length > 1 && opcion.calle === 'Calle Cruce')
  assert.equal(izquierda.camino.length, 2)
})

test('dos calles que se abren casi de frente son una bifurcación', () => {
  const cruce = cruceDespuesDe(grafo, llegandoA([1400, 0], 90))
  assert.deepEqual(textosDe(cruce), [
    'Mantenerse a la izquierda por Rama Norte',
    'Mantenerse a la derecha por Rama Sur',
  ])
})

test('al entrar a una rotonda las opciones son sus salidas, en orden', () => {
  const grafoConRotonda = grafoDe(ciudadConRotonda())
  const llegada = [...Array(grafoConRotonda.cantidadDeAristas).keys()].find(
    arista =>
      nombreDeCalle(grafoConRotonda, arista) === 'Calle Sur' &&
      [...salientesDe(grafoConRotonda, grafoConRotonda.hasta[arista])].some(
        salida => grafoConRotonda.banderas[salida] & BANDERA.ROTONDA,
      ),
  )
  const cruce = cruceDespuesDe(grafoConRotonda, llegada)
  assert.deepEqual(
    textosDe(cruce).map(texto => texto.replace(/ \(hacia.*/, '')),
    [
      'Tomar la 1ª salida de la rotonda por Calle Este',
      'Tomar la 2ª salida de la rotonda por Calle Norte',
      'Tomar la 3ª salida de la rotonda por Calle Oeste',
      'Tomar la 4ª salida de la rotonda por Calle Sur',
    ],
  )
})

test('el auto avanza solo hasta el próximo cruce y lleva la cuenta de lo recorrido', () => {
  const estado = partirHacia([100, 0], 'oriente')
  assert.ok(estado.metros > 99 && estado.metros < 101)
  assert.deepEqual(estado.puntosRecorridos.at(0), estado.partida)
  elegirOpcion(estado, 0)
  assert.ok(estado.metros > 899 && estado.metros < 901)
  assert.ok(estado.segundos > 0)
})

test('en un solo sentido no hay que decidir hacia dónde se parte', () => {
  const estado = empezarEn(grafo, enMetros(1000, 150))
  assert.equal(estado.decision.esPartida, undefined)
  assert.equal(nombreDeCalle(grafo, estado.entrada), 'Calle Única')
})

test('la cámara queda antes del cruce y solo sirve un panorama sobre la calle por la que se viene', () => {
  const estado = partirHacia([100, 0], 'oriente')
  const camara = camaraDeLaDecision(estado)
  assert.equal(Math.round(camara.largo), 100)
  assert.equal(Math.round(camara.candidatas[0].rumbo), 90)
  assert.equal(Math.round(camara.candidatas[0].metrosAntesDelCruce), 45)

  const sobreLaCalle = evaluarPanorama(camara, puntoEnElTrazado(camara.trazado, 60).punto)
  assert.equal(sobreLaCalle.sirve, true)
  assert.equal(Math.round(sobreLaCalle.rumbo), 90)
  const enLaCalleDeAlLado = evaluarPanorama(camara, enMetros(160, 40))
  assert.equal(enLaCalleDeAlLado.sirve, false)
  const pasadoElCruce = evaluarPanorama(camara, enMetros(205, 1))
  assert.equal(pasadoElCruce.sirve, false)
  const antesDelComienzo = evaluarPanorama(camara, enMetros(101, 1))
  assert.equal(antesDelComienzo.sirve, false)
})

test('en la partida el panorama puede estar donde se partió', () => {
  const estado = empezarEn(grafo, enMetros(100, 0))
  const camara = camaraDeLaDecision(estado)
  assert.equal(evaluarPanorama(camara, enMetros(100, 3)).sirve, true)
  assert.equal(aristaMasCercana(grafo, enMetros(100, 3)).distanciaMetros < 4, true)
})

test('una maniobra obligada se muestra como decisión de una sola opción y seguir de frente sin más, no', () => {
  const alFinalDeLaCalle = partirHacia([1900, 0], 'oriente')
  assert.equal(alFinalDeLaCalle.decision.esObligada, true)
  assert.deepEqual(textosDe(alFinalDeLaCalle.decision), ['Dar la vuelta en U'])
  const sinNovedad = partirHacia([100, 0], 'oriente')
  assert.equal(sinNovedad.decision.esObligada, false)
})

// ----- misión: llegar de un punto a otro lo más cerca posible del óptimo

function jugarLaMision(estado, optima, { errorEnLaDecision = -1 } = {}) {
  let decisiones = 0
  while (estado.decision && !estado.llego && decisiones < 100) {
    const costos = costosDeLasOpciones(estado)
    const mejor = estado.decision.opciones[costos.indexOf(Math.min(...costos))]
    const hayQueEquivocarse = estado.decision.opciones.length > 1 && decisiones++ === errorEnLaDecision
    const elegida = hayQueEquivocarse
      ? estado.decision.opciones.find(opcion => opcion !== mejor && opcion.tipo !== 'vuelta')
      : (opcionQueSigue(estado, optima.aristas.slice(estado.recorrido.length)) ?? mejor)
    elegirOpcion(estado, elegida.id)
  }
  return estado
}

const lugarEn = (este, norte) => ({ lat: enMetros(este, norte)[0], lon: enMetros(este, norte)[1] })

function empezarLaMision() {
  const mision = prepararMision(grafo, accesosDelLugar(grafo, lugarEn(1600, 40), null))
  const estado = empezarEn(grafo, enMetros(100, 0), { mision })
  return { estado, optima: rutaOptima(grafo, mision, estado.opcionesDePartida) }
}

test('seguir la ruta óptima llega al destino con 100 puntos y los mismos minutos que el óptimo', () => {
  const { estado, optima } = empezarLaMision()
  jugarLaMision(estado, optima)
  assert.equal(estado.llego, true)
  const analisis = analizarRecorrido(estado, optima)
  assert.equal(analisis.puntaje, 100)
  assert.ok(Math.abs(analisis.jugador.segundos - optima.segundos) < 1)
  assert.ok(analisis.jugador.segundosEnPunta > analisis.jugador.segundos)
  assert.equal(analisis.errores.length, 0)
})

test('un desvío baja el puntaje y queda anotado dónde se perdió el tiempo', () => {
  const { estado, optima } = empezarLaMision()
  jugarLaMision(estado, optima, { errorEnLaDecision: 1 })
  assert.equal(estado.llego, true)
  const analisis = analizarRecorrido(estado, optima)
  assert.ok(analisis.razon > 1)
  assert.ok(analisis.puntaje < 100)
  assert.equal(analisis.errores.length, 1)
  assert.ok(analisis.errores[0].segundosPerdidos > 0)
  assert.notEqual(analisis.errores[0].elegida, analisis.errores[0].mejor)
})

test('el puntaje es 100 hasta un 3 % sobre el óptimo y 0 al pasar un 50 %', () => {
  assert.equal(puntajeDeLaRuta(1), 100)
  assert.equal(puntajeDeLaRuta(TOLERANCIA_DEL_OPTIMO), 100)
  assert.equal(puntajeDeLaRuta(LIMITE_PARA_PERDER), 0)
  assert.equal(puntajeDeLaRuta(2), 0)
  const intermedio = puntajeDeLaRuta(1.25)
  assert.ok(intermedio > 0 && intermedio < 100)
})

test('de la calle por la que se parte solo cuenta lo que queda adelante', () => {
  const arista = aristaMasCercana(grafo, enMetros(100, 0)).arista
  const entera = costosDelRecorrido(grafo, [arista])
  const mitad = costosDelRecorrido(grafo, [arista], grafo.metros[arista] / 2)
  assert.ok(Math.abs(mitad.metros * 2 - entera.metros) < 0.01)
  assert.ok(Math.abs(mitad.segundos * 2 - entera.segundos) < 0.01)
})

// ----- lugares con varias entradas y salidas: un recinto toca varias calles

// Un recinto entre Av. Principal (y=0) y Av. Norte (y=300), a la altura de x=350…450.
const HUELLA_DEL_RECINTO = [
  [350, -20],
  [450, -20],
  [450, 320],
  [350, 320],
].map(([este, norte]) => enMetros(este, norte))
const nombresDe = aristas => new Set([...aristas].map(arista => nombreDeCalle(grafo, arista)))

test('a un recinto se llega por cualquiera de las calles que tocan su huella', () => {
  const accesos = accesosDelLugar(grafo, lugarEn(400, 150), HUELLA_DEL_RECINTO)
  const calles = nombresDe(accesos)
  assert.ok(calles.has('Av. Principal'))
  assert.ok(calles.has('Av. Norte'))
  assert.ok(!calles.has('Calle Cruce'))
  const mision = prepararMision(grafo, accesos)
  for (const partida of [enMetros(100, 0), enMetros(1000, 300)]) {
    const estado = empezarEn(grafo, partida, { mision })
    const optima = rutaOptima(grafo, mision, estado.opcionesDePartida)
    jugarLaMision(estado, optima)
    assert.equal(estado.llego, true)
  }
})

test('de un recinto se sale por la calle que se elige, una por calle y sentido', () => {
  const accesos = accesosDelLugar(grafo, lugarEn(400, 150), HUELLA_DEL_RECINTO)
  const salidas = salidasDelLugar(grafo, accesos, enMetros(400, 150))
  const textos = textosDe(empezarEn(grafo, enMetros(400, 150), { salidas }).decision)
  assert.ok(textos.length >= 4)
  assert.ok(textos.some(texto => texto.includes('Av. Principal')))
  assert.ok(textos.some(texto => texto.includes('Av. Norte')))
  assert.equal(new Set(textos).size, textos.length)
})

test('un lugar sin huella usa las calles más cercanas y las autopistas no cuentan', () => {
  const accesos = accesosDelLugar(grafo, lugarEn(1000, 150), null)
  assert.deepEqual([...nombresDe(accesos)], ['Calle Única'])
})

test('un cambio de calle sin más no se avisa, pero unirse a una autopista sí', () => {
  const partirHaciaElOriente = grafoDeLaCalle => {
    const estado = empezarEn(grafoDeLaCalle, enMetros(250, 0))
    elegirOpcion(estado, estado.decision.opciones.find(opcion => opcion.hacia === 'oriente').id)
    return estado
  }
  const conAutopista = partirHaciaElOriente(grafoDe(ciudadConCambioDeCalle({ conAutopista: true })))
  assert.equal(conAutopista.decision.esObligada, true)
  assert.deepEqual(textosDe(conAutopista.decision), ['Seguir derecho: te unes a Autopista X'])

  const sinAutopista = partirHaciaElOriente(grafoDe(ciudadConCambioDeCalle({ conAutopista: false })))
  assert.ok(sinAutopista.metros > 749 && sinAutopista.metros < 751, 'siguió solo hasta el final de la calle')
  assert.deepEqual(textosDe(sinAutopista.decision), ['Dar la vuelta en U'])
})

test('si el destino está en una calle sin salida, esa calle sí se ofrece y se puede llegar', () => {
  const destinos = accesosDelLugar(grafo, lugarEn(400, -50), null)
  assert.deepEqual([...nombresDe(destinos)], ['Pasaje Ciego'])
  const mision = prepararMision(grafo, destinos)
  const estado = empezarEn(grafo, enMetros(100, 0), { mision })
  const optima = rutaOptima(grafo, mision, estado.opcionesDePartida)
  jugarLaMision(estado, optima)
  assert.equal(estado.llego, true)
  assert.equal(analizarRecorrido(estado, optima).puntaje, 100)
  prepararMision(grafo, accesosDelLugar(grafo, lugarEn(1600, 40), null))
})

test('de un lugar no se sale por una calle sin salida', () => {
  const lugar = lugarEn(400, -20)
  const accesos = accesosDelLugar(grafo, lugar, null)
  assert.ok(nombresDe(accesos).has('Pasaje Ciego') && nombresDe(accesos).has('Av. Principal'))
  const salidas = salidasDelLugar(grafo, accesos, enMetros(400, -20))
  assert.deepEqual([...nombresDe(salidas.map(salida => salida.arista))], ['Av. Principal'])
  assert.equal(salidas.length, 2)
})
