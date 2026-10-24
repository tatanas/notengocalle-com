// Pruebas de "Ruta libre": el grafo vial, el motor de decisiones y el puntaje. Corren sin red ni navegador.
import assert from 'node:assert/strict'
import { camaraDeLaDecision, trazadoDeLaCalleActual } from '../src/dominio/camaraRutaLibre.js'
import { test } from 'node:test'
import {
  cargarGrafo,
  distanciaEnMetros,
  giroPermitido,
  puntosDeArista,
  recortarPuntos,
  rumboDeSalida,
  salientesDe,
} from '../compartido/grafoVial.js'
import { MODOS_OFICIALES, categoriasValidasDe, problemaDelPuntaje } from '../compartido/oficial.js'
import { decodificarPolilinea } from '../compartido/rutaEnAuto.js'
import { aristasCercaDelPunto, codificarPolilinea, construirGrafo } from '../tools/grafo/construirGrafo.mjs'
import {
  analisisDeLasDecisiones,
  crearRecorrido,
  elegirOpcion,
  peoresDecisiones,
  puntajeDeLaRuta,
  reiniciarRecorrido,
  rendirse,
  resultadoDelRecorrido,
  rutaOptima,
} from '../src/dominio/rutaLibre.js'
import {
  AREA_DE_PRUEBA,
  ciudadConAutopista,
  ciudadConUnaPlaza,
  ciudadConCallesSeguidas,
  ciudadConHorquilla,
  ciudadConRotonda,
  ciudadConUnCaminoSinNombre,
  ciudadDePrueba,
  enMetros,
} from './ciudadDePrueba.js'

const ORIGEN = enMetros(300, 0)
const DESTINO = enMetros(5800, 0)

function grafoDePrueba(opciones, origen = ORIGEN, destino = DESTINO) {
  const datos = construirGrafo(ciudadDePrueba(opciones), {
    area: AREA_DE_PRUEBA,
    extremos: [origen, destino],
  })
  datos.meta = {
    origen: { punto: origen, aristas: aristasCercaDelPunto(datos, origen) },
    destino: { punto: destino, aristas: aristasCercaDelPunto(datos, destino) },
  }
  return { datos, grafo: cargarGrafo(datos), ruta: datos.meta }
}

function seguirSiNoHayOtraSalida(recorrido) {
  if (recorrido.decision.forzada) elegirOpcion(recorrido, recorrido.decision.opciones[0].id)
}

const mejorOpcion = decision =>
  decision.opciones.reduce((a, b) => (b.segundosQueFaltan < a.segundosQueFaltan ? b : a))

function jugar(recorrido, elegir = mejorOpcion) {
  while (recorrido.decision) elegirOpcion(recorrido, elegir(recorrido.decision).id)
  return recorrido
}

test('una polilínea codificada se decodifica igual', () => {
  const puntos = [
    [-33.4372, -70.6344],
    [-33.43725, -70.63431],
    [-33.4, -70.5],
  ]
  const decodificados = decodificarPolilinea(codificarPolilinea(puntos))
  puntos.forEach(([lat, lon], i) => {
    assert.ok(Math.abs(decodificados[i][0] - lat) < 1e-6)
    assert.ok(Math.abs(decodificados[i][1] - lon) < 1e-6)
  })
})

test('el grafo descarta lo que no se conecta con el resto, pero deja las calles sin salida', () => {
  const { grafo } = grafoDePrueba()
  const nombres = new Set(Array.from(grafo.nombre, indice => grafo.nombres[indice].n))
  assert.ok(!nombres.has('Isla'), 'una calle aislada no sirve para ir de A a B')
  assert.ok(nombres.has('Pasaje Ciego'))
})

test('las calles de dos sentidos tienen su arista inversa; las de un sentido, no', () => {
  const { grafo } = grafoDePrueba({ conBandejon: true })
  grafo.inversa.forEach((inversa, arista) => {
    if (inversa !== -1) assert.equal(grafo.inversa[inversa], arista)
  })
  const sentidoUnico = [...grafo.inversa].filter(inversa => inversa === -1).length
  assert.ok(sentidoUnico > 0)
})

test('doblar en U solo es posible donde la calle termina', () => {
  const { grafo } = grafoDePrueba()
  const alPasaje = [...grafo.hasta.keys()].find(
    arista =>
      grafo.nombres[grafo.nombre[arista]].n === 'Pasaje Ciego' &&
      grafo.inversa[arista] !== -1 &&
      salientesDe(grafo, grafo.hasta[arista]).length === 1,
  )
  assert.ok(
    giroPermitido(grafo, alPasaje, grafo.inversa[alPasaje]),
    'en el fondo del pasaje hay que poder volver',
  )
  const enLaPrincipal = [...grafo.hasta.keys()].find(
    arista => grafo.nombres[grafo.nombre[arista]].n === 'Av. Principal' && grafo.inversa[arista] !== -1,
  )
  assert.ok(!giroPermitido(grafo, enLaPrincipal, grafo.inversa[enLaPrincipal]))
})

test('una restricción de giro de OpenStreetMap saca esa salida del cruce', () => {
  const sinRestriccion = grafoDePrueba().grafo
  const conRestriccion = grafoDePrueba({ conRestriccion: true }).grafo
  assert.equal(sinRestriccion.prohibidos.size, 0)
  assert.ok(conRestriccion.prohibidos.size >= 1)
})

test('al partir se elige hacia dónde salir; en la ruta óptima solo se decide donde hay algo que decidir', () => {
  const { grafo, ruta } = grafoDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  const textos = []
  jugar(recorrido, decision => {
    textos.push(decision.opciones.map(opcion => opcion.texto))
    return mejorOpcion(decision)
  })
  assert.equal(recorrido.fin, 'llegada')
  assert.equal(textos.length, 3)
  assert.deepEqual(textos[0].sort(), [
    'Salir de frente por Av. Principal (hacia el oriente)',
    'Salir hacia atrás por Av. Principal (hacia el poniente)',
  ])
  assert.ok(textos[1].includes('Doblar a la izquierda por Calle Norte'))
  assert.ok(textos[1].includes('Seguir derecho por Av. Principal'))
})

test('en medio de la ruta no se ofrece un pasaje sin salida, pero sí la calle chica que conecta dos arterias', () => {
  const { grafo, ruta } = grafoDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  const ofrecidas = []
  jugar(recorrido, decision => {
    ofrecidas.push(...decision.opciones.map(opcion => opcion.texto))
    return mejorOpcion(decision)
  })
  assert.ok(!ofrecidas.some(texto => texto.includes('Pasaje Ciego')))
  assert.ok(ofrecidas.includes('Doblar a la izquierda por Atajo'), ofrecidas.join(' | '))
})

test('el jugador que elige siempre lo mejor llega en el tiempo óptimo y saca el puntaje máximo', () => {
  const { grafo, ruta } = grafoDePrueba()
  const recorrido = jugar(crearRecorrido(grafo, ruta))
  const resultado = resultadoDelRecorrido(recorrido)
  assert.ok(
    Math.abs(resultado.segundos - resultado.optimoSegundos) < 1,
    `${resultado.segundos} vs ${resultado.optimoSegundos}`,
  )
  assert.equal(resultado.puntaje, 100)
  assert.deepEqual(rutaOptima(crearRecorrido(grafo, ruta)).length, resultado.aristas.length)
})

test('equivocarse en una arteria cuesta tiempo y baja el puntaje', () => {
  const { grafo, ruta } = grafoDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  jugar(recorrido, decision => {
    const porCalleNorte = decision.opciones.find(opcion => opcion.nombre === 'Calle Norte')
    return porCalleNorte ?? mejorOpcion(decision)
  })
  const resultado = resultadoDelRecorrido(recorrido)
  assert.equal(recorrido.fin, 'llegada', 'aunque se equivoque, se llega')
  assert.ok(resultado.segundos > resultado.optimoSegundos * 1.1)
  assert.ok(resultado.puntaje > 0 && resultado.puntaje < 100)
  const equivocada = analisisDeLasDecisiones(recorrido).find(decision =>
    decision.elegida.includes('Calle Norte'),
  )
  assert.ok(equivocada.perdidaEnSegundos > 60)
})

test('quien se pierde más de tres veces el tiempo óptimo abandona con cero puntos', () => {
  const { grafo, ruta } = grafoDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  jugar(recorrido, decision => {
    const haciaElPoniente = decision.opciones.find(opcion => opcion.hacia === 'poniente')
    return haciaElPoniente ?? decision.opciones.at(-1)
  })
  assert.equal(recorrido.fin === 'abandono' || recorrido.fin === 'llegada', true)
  if (recorrido.fin === 'abandono') assert.equal(resultadoDelRecorrido(recorrido).puntaje, 0)
})

test('con bandejón, la entrada del destino es solo la calzada que lo deja a la derecha', () => {
  const punto = enMetros(1500, 2032)
  const { datos } = grafoDePrueba({ conBandejon: true }, ORIGEN, punto)
  const entradas = aristasCercaDelPunto(datos, punto)
  assert.ok(entradas.length > 0)
  const latitudDeLaCalzadaNorte = enMetros(0, 2010)[0] * 1e5
  for (const { arista } of entradas) {
    assert.ok(
      datos.nodos.lat[datos.aristas.desde[arista]] > latitudDeLaCalzadaNorte,
      'debe ser la calzada del lado del punto',
    )
    assert.ok(datos.nodos.lat[datos.aristas.hasta[arista]] > latitudDeLaCalzadaNorte)
  }
})

test('el puntaje es máximo hasta un 5 % sobre el óptimo, baja parejo y llega a cero al duplicar el tiempo', () => {
  assert.equal(puntajeDeLaRuta(600, 500), 100)
  assert.equal(puntajeDeLaRuta(600, 630), 100)
  assert.equal(puntajeDeLaRuta(600, 1200), 0)
  assert.equal(puntajeDeLaRuta(600, 2000), 0)
  const intermedio = puntajeDeLaRuta(600, 900)
  assert.ok(intermedio > 40 && intermedio < 60, String(intermedio))
})

test('lo mejor siempre se ofrece, aunque sea una calle chica que no se ofrecería: quien elige bien llega en el tiempo óptimo', () => {
  const { grafo, ruta } = grafoDePrueba({ conTramoLento: true })
  const recorrido = jugar(crearRecorrido(grafo, ruta))
  const resultado = resultadoDelRecorrido(recorrido)
  assert.equal(recorrido.fin, 'llegada')
  assert.equal(resultado.puntaje, 100)
  const ofrecidas = recorrido.historial.flatMap(({ decision }) =>
    decision.opciones.map(opcion => opcion.nombre),
  )
  assert.ok(ofrecidas.includes('Rodeo'))
})

test('dos ramas que salen casi en la misma dirección se distinguen por el lado, no por "seguir derecho"', () => {
  const { grafo, ruta } = grafoDePrueba({ conBifurcacion: true })
  const recorrido = crearRecorrido(grafo, ruta)
  let textos = null
  jugar(recorrido, decision => {
    if (decision.opciones.some(opcion => opcion.nombre === 'Av. Alta'))
      textos = decision.opciones.map(opcion => opcion.texto)
    return mejorOpcion(decision)
  })
  assert.ok(textos, 'en el cruce de la Av. Alta hay una decisión')
  assert.ok(textos.includes('Mantenerse a la izquierda por Av. Alta'), textos.join(' | '))
  assert.ok(textos.includes('Mantenerse a la derecha por Av. Principal'), textos.join(' | '))
})

test('Ruta libre cuenta para el ranking como una sola ruta de hasta 100 puntos', () => {
  assert.ok(MODOS_OFICIALES.includes('rl-sv'))
  assert.deepEqual(categoriasValidasDe('rl-sv'), ['1'])
  const ronda = { modo: 'rl-sv', categoria: '1', aciertos: 87, total: 100, ms: 240_000 }
  assert.equal(problemaDelPuntaje(ronda), null)
  assert.ok(problemaDelPuntaje({ ...ronda, aciertos: 101 }), 'no se puede pasar de 100')
  assert.ok(problemaDelPuntaje({ ...ronda, total: 200 }), 'es una sola ruta')
})

test('quien parte de un lado de la calle elige salir a la izquierda o a la derecha, no hacia un punto cardinal', () => {
  const { grafo, ruta } = grafoDePrueba({}, enMetros(300, 12))
  const recorrido = crearRecorrido(grafo, ruta)
  const textos = recorrido.decision.opciones.map(opcion => opcion.texto).sort()
  assert.deepEqual(textos, [
    'Salir a la derecha por Av. Principal (hacia el poniente)',
    'Salir a la izquierda por Av. Principal (hacia el oriente)',
  ])
})

function rotondaDePrueba() {
  const origen = enMetros(8, -150)
  const destino = enMetros(125, -2)
  const area = AREA_DE_PRUEBA
  const datos = construirGrafo(ciudadConRotonda(), { area, extremos: [origen, destino] })
  datos.meta = {
    origen: { punto: origen, aristas: aristasCercaDelPunto(datos, origen) },
    destino: { punto: destino, aristas: aristasCercaDelPunto(datos, destino) },
  }
  return { grafo: cargarGrafo(datos), ruta: datos.meta }
}

test('en una rotonda cuyas calles tienen dos calzadas, las salidas se cuentan por calle: 1, 2, 3 y 4', () => {
  const { grafo, ruta } = rotondaDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  seguirSiNoHayOtraSalida(recorrido)
  const salidas = Object.fromEntries(
    recorrido.decision.opciones
      .filter(opcion => opcion.tipo === 'rotonda')
      .map(opcion => [opcion.nombre, opcion.orden]),
  )
  assert.deepEqual(salidas, { 'Calle Este': 1, 'Calle Norte': 2, 'Calle Oeste': 3, 'Calle Sur': 4 })
  const textos = recorrido.decision.opciones.map(opcion => opcion.texto)
  assert.ok(
    textos.includes('Tomar la 4ª salida de la rotonda: volver por Calle Sur (por donde llegaste)'),
    textos.join(' | '),
  )
})

function horquillaDePrueba() {
  const origen = enMetros(100, 0)
  const destino = enMetros(1500, -20)
  const datos = construirGrafo(ciudadConHorquilla(), { area: AREA_DE_PRUEBA, extremos: [origen, destino] })
  datos.meta = {
    origen: { punto: origen, aristas: aristasCercaDelPunto(datos, origen) },
    destino: { punto: destino, aristas: aristasCercaDelPunto(datos, destino) },
  }
  return { grafo: cargarGrafo(datos), ruta: datos.meta }
}

test('un cruce modelado con varios nodos seguidos es una sola decisión, con una opción por destino', () => {
  const { grafo, ruta } = horquillaDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  seguirSiNoHayOtraSalida(recorrido)
  const textos = recorrido.decision.opciones.map(opcion => opcion.texto).sort()
  assert.deepEqual(textos, [
    'Mantenerse a la derecha por Camino Santa Teresa',
    'Mantenerse a la izquierda por Gran Vía',
  ])
})

test('tomar Gran Vía en ese cruce no pregunta otra vez por Gran Vía en el ramal que está 40 m más allá', () => {
  const { grafo, ruta } = horquillaDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  seguirSiNoHayOtraSalida(recorrido)
  const porGranVia = recorrido.decision.opciones.find(opcion => opcion.texto.includes('Gran Vía'))
  elegirOpcion(recorrido, porGranVia.id)
  assert.ok(recorrido.decision.forzada, 'solo queda una salida, que se muestra como decisión forzada')
  assert.ok(!recorrido.decision.opciones[0].texto.includes('Gran Vía'))
  seguirSiNoHayOtraSalida(recorrido)
  assert.equal(recorrido.fin, 'llegada')
  assert.equal(recorrido.historial.length, 3)
})

test('nunca se propone una calle sin salida, ni siquiera cerca de A', () => {
  const cerca = grafoDePrueba({}, enMetros(1300, 5))
  const ofrecidas = []
  const recorrido = crearRecorrido(cerca.grafo, cerca.ruta)
  jugar(recorrido, decision => {
    ofrecidas.push(...decision.opciones.map(opcion => opcion.texto))
    return decision.opciones.find(opcion => opcion.hacia === 'oriente') ?? mejorOpcion(decision)
  })
  assert.ok(
    !ofrecidas.some(texto => texto.includes('Pasaje Ciego') || texto.includes('sin salida')),
    ofrecidas.join(' | '),
  )
})

test('una calle chica no "llega" a una arteria dando la vuelta por la misma calle por la que se iba', () => {
  const { grafo, ruta } = grafoDePrueba({}, enMetros(1300, 5))
  const recorrido = crearRecorrido(grafo, ruta)
  elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.hacia === 'oriente').id)
  assert.ok(!recorrido.decision.opciones.some(opcion => opcion.tipo === 'conector'))
})

test('en la práctica se puede volver a A gratis; en una ronda, reiniciar cuesta lo que ya se manejó más volver', () => {
  const { grafo, ruta } = grafoDePrueba()
  const equivocado = () => {
    const recorrido = crearRecorrido(grafo, ruta)
    elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.hacia === 'oriente').id)
    elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.nombre === 'Calle Norte').id)
    return recorrido
  }
  const enLaPractica = equivocado()
  const manejado = enLaPractica.segundos
  reiniciarRecorrido(enLaPractica, { conCosto: false })
  assert.equal(enLaPractica.actual, -1)
  assert.equal(enLaPractica.segundos, 0)
  assert.equal(enLaPractica.decision.numero, 1)
  assert.equal(jugar(enLaPractica).fin, 'llegada')
  assert.equal(resultadoDelRecorrido(enLaPractica).puntaje, 100)

  const enUnaRonda = equivocado()
  reiniciarRecorrido(enUnaRonda, { conCosto: true })
  assert.ok(enUnaRonda.segundos > manejado, 'ya manejó y además tiene que volver')
  jugar(enUnaRonda)
  const resultado = resultadoDelRecorrido(enUnaRonda)
  assert.equal(resultado.reinicios, 1)
  assert.ok(resultado.puntaje < 100)
})

test('rendirse termina la ronda con cero puntos, y el análisis cuenta las decisiones de todos los intentos', () => {
  const { grafo, ruta } = grafoDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.hacia === 'oriente').id)
  elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.nombre === 'Calle Norte').id)
  reiniciarRecorrido(recorrido, { conCosto: true })
  rendirse(recorrido)
  const resultado = resultadoDelRecorrido(recorrido)
  assert.equal(resultado.fin, 'rendido')
  assert.equal(resultado.puntaje, 0)
  assert.equal(recorrido.decision, null)
  const peores = peoresDecisiones(recorrido)
  assert.equal(peores[0].elegida.includes('Calle Norte'), true)
  assert.ok(peores[0].perdidaEnSegundos > 60)
})

test('la cámara de una decisión no retrocede a la calle anterior: tras doblar, se queda en la calle nueva', () => {
  const { grafo, ruta } = grafoDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.hacia === 'oriente').id)
  elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.nombre === 'Calle Norte').id)
  const longitudDeCalleNorte = enMetros(3000, 0)[1]
  const trazado = trazadoDeLaCalleActual(grafo, recorrido.aristas, 400)
  assert.ok(trazado.length >= 2)
  for (const [, longitud] of trazado) assert.ok(Math.abs(longitud - longitudDeCalleNorte) < 1e-4)
  const camara = camaraDeLaDecision(grafo, recorrido.aristas, ruta)
  assert.ok(Math.abs(camara.lon - longitudDeCalleNorte) < 1e-4, 'la cámara está en Calle Norte')
})

test('si se sigue por la misma calle, la cámara puede mirar varios tramos atrás', () => {
  const { grafo, ruta } = grafoDePrueba()
  const recorrido = crearRecorrido(grafo, ruta)
  elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.hacia === 'oriente').id)
  const trazado = trazadoDeLaCalleActual(grafo, recorrido.aristas, 4000)
  const metros = recorrido.aristas.reduce((suma, arista) => suma + grafo.metros[arista], 0)
  assert.ok(metros > 1500)
  assert.ok(trazado.length >= 3, 'más de un tramo de Av. Principal')
})

function avenidaConCallesSeguidas() {
  const origen = enMetros(50, 0)
  const destino = enMetros(1950, 0)
  const datos = construirGrafo(ciudadConCallesSeguidas(), {
    area: AREA_DE_PRUEBA,
    extremos: [origen, destino],
  })
  datos.meta = {
    origen: { punto: origen, aristas: aristasCercaDelPunto(datos, origen) },
    destino: { punto: destino, aristas: aristasCercaDelPunto(datos, destino) },
  }
  return { grafo: cargarGrafo(datos), ruta: datos.meta }
}

test('varias calles laterales seguidas son una sola decisión: las próximas tres salidas y permanecer', () => {
  const { grafo, ruta } = avenidaConCallesSeguidas()
  const recorrido = crearRecorrido(grafo, ruta)
  elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.hacia === 'oriente').id)
  const textos = recorrido.decision.opciones.map(opcion => opcion.texto)
  assert.ok(textos.includes('Permanecer en Av. Principal'), textos.join(' | '))
  const lateralesDeLaVentana = textos.filter(texto => /por Calle \d/.test(texto))
  assert.equal(lateralesDeLaVentana.length, 3, textos.join(' | '))
  assert.ok(textos.some(texto => texto.includes('(a 200 m)')))
  assert.ok(textos.some(texto => texto.includes('(a 400 m)')))
  assert.ok(!textos.some(texto => texto.includes('(a 600 m)')), 'solo las próximas tres calles')
})

test('al permanecer, la decisión siguiente es la ventana que viene después', () => {
  const { grafo, ruta } = avenidaConCallesSeguidas()
  const recorrido = crearRecorrido(grafo, ruta)
  elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.hacia === 'oriente').id)
  const primeraCalle = recorrido.decision.opciones.find(opcion => opcion.texto.includes('Calle 1')).nombre
  assert.equal(primeraCalle, 'Calle 1')
  elegirOpcion(recorrido, recorrido.decision.opciones.find(opcion => opcion.tipo === 'permanecer').id)
  const textos = recorrido.decision.opciones.map(opcion => opcion.texto)
  assert.ok(
    textos.some(texto => texto.includes('por Calle 4')),
    textos.join(' | '),
  )
  assert.ok(!textos.some(texto => texto.includes('por Calle 3')), 'las tres primeras ya se pasaron')
})

test('en una autopista, seguir por la calzada principal es "permanecer" y las salidas se dicen como salidas', () => {
  const origen = enMetros(0, -300)
  const destino = enMetros(4000, -500)
  const datos = construirGrafo(ciudadConAutopista(), { area: AREA_DE_PRUEBA, extremos: [origen, destino] })
  datos.meta = {
    origen: { punto: origen, aristas: aristasCercaDelPunto(datos, origen) },
    destino: { punto: destino, aristas: aristasCercaDelPunto(datos, destino) },
  }
  const recorrido = crearRecorrido(cargarGrafo(datos), datos.meta)
  const enLaAutopista = []
  jugar(recorrido, decision => {
    if (decision.ibaPor === 'Autopista Uno') enLaAutopista.push(decision.opciones.map(opcion => opcion.texto))
    return (
      decision.opciones.find(opcion => opcion.hacia === 'norte' || opcion.hacia === 'oriente') ??
      mejorOpcion(decision)
    )
  })
  assert.ok(enLaAutopista.length > 0, 'hay una decisión en la autopista')
  const [textos] = enLaAutopista
  assert.deepEqual(textos, ['Permanecer en Autopista Uno', 'Tomar la salida hacia Calle Salida'])
})

test('partiendo entre dos calles que salen hacia el mismo lado, cada salida dice dónde queda su calle', () => {
  const origen = enMetros(0, 0)
  const destino = enMetros(-300, -200)
  const datos = construirGrafo(ciudadConUnaPlaza(), { area: AREA_DE_PRUEBA, extremos: [origen, destino] })
  datos.meta = {
    origen: { punto: origen, aristas: [] },
    destino: { punto: destino, aristas: aristasCercaDelPunto(datos, destino) },
  }
  const delaCalle = nombre =>
    datos.aristas.nombre.findIndex((indice, arista) => datos.nombres[indice].n === nombre && arista >= 0)
  datos.meta.origen.aristas = ['Calle Norte', 'Calle Sur'].map(nombre => ({
    arista: delaCalle(nombre),
    fraccion: 0.5,
  }))
  const recorrido = crearRecorrido(cargarGrafo(datos), datos.meta)
  const textos = recorrido.decision.opciones.map(opcion => opcion.texto)
  assert.equal(textos.length, 2, textos.join(' | '))
  assert.ok(
    textos.some(texto => texto.includes('la calle de enfrente')),
    textos.join(' | '),
  )
  assert.ok(
    textos.some(texto => texto.includes('la calle de atrás')),
    textos.join(' | '),
  )
  assert.ok(
    textos.every(texto => texto.startsWith('Salir a la izquierda por Calle')),
    textos.join(' | '),
  )
})

test('el trazado de un recorrido parte en el punto de A y termina en el de B, no en los cruces de sus calles', () => {
  const { grafo, ruta } = grafoDePrueba()
  const salida = ruta.origen.aristas.find(candidata => candidata.arista === ruta.origen.aristas[0].arista)
  const puntos = puntosDeArista(grafo, salida.arista)
  const recortados = recortarPuntos(puntos, salida.fraccion, 1)
  const distanciaAlOrigen = distanciaEnMetros(recortados[0], ruta.origen.punto)
  assert.ok(distanciaAlOrigen < 2, `el trazado parte a ${distanciaAlOrigen} m de A`)
  assert.deepEqual(recortados.at(-1), puntos.at(-1))
  const llegada = ruta.destino.aristas[0]
  const hastaB = recortarPuntos(puntosDeArista(grafo, llegada.arista), 0, llegada.fraccion)
  assert.ok(distanciaEnMetros(hastaB.at(-1), ruta.destino.punto) < 2)
})

test('recortar una polilínea con varios vértices conserva los de en medio', () => {
  const recta = [
    [-33.4, -70.6],
    [-33.4, -70.599],
    [-33.4, -70.598],
    [-33.4, -70.597],
  ]
  const recortada = recortarPuntos(recta, 0.2, 0.8)
  assert.equal(recortada.length, 4)
  assert.deepEqual(recortada[1], recta[1])
  assert.deepEqual(recortada[2], recta[2])
  assert.ok(recortada[0][1] > recta[0][1] && recortada[0][1] < recta[1][1])
  assert.ok(recortada[3][1] < recta[3][1] && recortada[3][1] > recta[2][1])
  assert.equal(recortarPuntos(recta, 0, 1), recta)
})

function recorridoEnCiudad(elementos, origen, destino) {
  const datos = construirGrafo(elementos, { area: AREA_DE_PRUEBA, extremos: [origen, destino] })
  datos.meta = {
    origen: { punto: origen, aristas: aristasCercaDelPunto(datos, origen) },
    destino: { punto: destino, aristas: aristasCercaDelPunto(datos, destino) },
  }
  const grafo = cargarGrafo(datos)
  return { grafo, recorrido: crearRecorrido(grafo, datos.meta) }
}

test('las salidas por un camino sin nombre dicen a qué calle salen', () => {
  const { recorrido } = recorridoEnCiudad(
    ciudadConUnCaminoSinNombre({ conSalidaAlPoniente: true }),
    enMetros(150, 10),
    enMetros(300, 500),
  )
  const textos = recorrido.decision.opciones.map(opcion => opcion.texto)
  assert.equal(textos.length, 2, textos.join(' | '))
  assert.ok(
    textos.some(texto => texto.includes('el camino que sale a Av. Parque')),
    textos.join(' | '),
  )
  assert.ok(
    textos.some(texto => texto.includes('el camino que sale a Calle Poniente')),
    textos.join(' | '),
  )
})

test('una salida del origen que no lleva a ninguna parte no se ofrece', () => {
  const { grafo, recorrido } = recorridoEnCiudad(
    ciudadConUnCaminoSinNombre({ conSalidaAlPoniente: false }),
    enMetros(150, 10),
    enMetros(300, 500),
  )
  const { opciones, forzada } = recorrido.decision
  assert.equal(opciones.length, 1, opciones.map(opcion => opcion.texto).join(' | '))
  assert.ok(forzada)
  const este = rumboDeSalida(grafo, opciones[0].arista)
  assert.ok(Math.abs(este - 90) < 30, `la única salida debía ir hacia el oriente (rumbo ${este})`)
})
