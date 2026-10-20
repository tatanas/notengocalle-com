import { elegir, escaparHtml, mezclar } from '../nucleo/utilidades.js'
import { esLaMismaCalle } from '../../compartido/rutaEnAuto.js'
import { cruceDeLaRuta, otrasCalles, seguirDerechoEs } from './cruceDeRuta.js'
import {
  GRADOS_DE_SEGUIR_DERECHO,
  GRADOS_DE_VUELTA_EN_U,
  giro,
  ladoDelGiro,
  puntoAntesDelFinal,
  puntoCardinal,
  puntoDesdeElInicio,
  rumbo,
  textoDeManiobra,
} from './maniobras.js'
import {
  largoDelTrazado,
  salidaPorLaQueSeSale,
  secuenciaDeSalidas,
  trozoDelTrazado,
  ventanasDeSalidas,
} from './salidas.js'

// Las decisiones del ruteo en auto con Street View (src/juego/modos/rutasStreetView.js): qué se ve, qué se pregunta y qué
// se puede responder en cada cruce de la ruta.
//
// Las alternativas son solo cosas que se pueden hacer en ese cruce, con las calles que salen de él según Valhalla (ver
// cruceDeRuta.js): cada una con el lado por el que sale de verdad, y seguir derecho si la calle continúa. El lado solo se dice
// cuando la calle sale hacia los dos (en una salida o entrada de autopista hay una sola rampa). Si no hay ninguna alternativa
// no hay pregunta (`incorrectas` vacío): se pasa de largo, y nunca queda una pregunta con una sola opción.
//
// Al ir por una autopista con salidas numeradas la cámara se pone en la autopista y se pregunta por las salidas, de a tres en
// orden, más "Sigue derecho": puede que ninguna de las tres sirva y lo correcto sea seguir. Se sigue de ventana en ventana hasta
// la salida de la ruta.
//
// Cada decisión: { tipo, pregunta (html), camara, rumbo, correcta, incorrectas, hecha (cómo se cuenta al final), km,
// alResponder: [trazado] (lo que se dibuja al responder), opciones? (en este orden; si no, se mezclan), pines?, salidaElegida? }.
const KM_ANTES_DE_DECIDIR = 0.05
const KM_ANTES_DE_LLEGAR_A_LA_CALLE = 0.03
const KM_PARA_MEDIR_EL_RUMBO = 0.06
const OPCIONES = 4
// Más calles chicas que esto entre dos principales se resumen ("por X y otras calles chicas").
const CONECTORES_NOMBRADOS = 2

const formatearKm = km => String(km).replace('.', ',')
const conMinuscula = texto => texto[0].toLowerCase() + texto.slice(1)
const seguirDerechoPor = calle => `Sigue derecho por ${calle}`

function textoDelDesvio(grados, conectores, { desdeAutopista, numeroDeSalida }) {
  const verbo = desdeAutopista
    ? `saliste${numeroDeSalida ? ` (salida ${numeroDeSalida})` : ''}`
    : Math.abs(grados) < GRADOS_DE_SEGUIR_DERECHO
      ? 'seguiste'
      : `doblaste a la ${ladoDelGiro(grados)}`
  const nombrar = nombre => (/^Rotonda/.test(nombre) ? `la ${nombre}` : nombre)
  const calles =
    conectores.length > CONECTORES_NOMBRADOS
      ? `${nombrar(conectores[0])} y otras calles chicas`
      : conectores.map(nombrar).join(' y luego por ')
  return { verbo, calles }
}

function decisionDePartida(paso, { salidasConocidas = [] }, esDeLaRuta) {
  const salida = paso.x ?? paso.g[0]
  const rumboDeSalida = rumbo(salida, puntoDesdeElInicio(paso.g, KM_PARA_MEDIR_EL_RUMBO))
  const delPrimerCruce = [...(paso.ent ?? [])].sort((a, b) => a.k - b.k).map(calle => calle.n)
  const incorrectas = [...new Set([...salidasConocidas, ...delPrimerCruce])].filter(
    nombre => !esDeLaRuta(nombre),
  )
  return {
    tipo: 'partida',
    paso,
    pregunta: `Estás en la salida, mirando hacia el ${puntoCardinal(rumboDeSalida)}. <b>¿Por qué calle partes?</b>`,
    camara: salida,
    rumbo: rumboDeSalida,
    correcta: paso.n,
    incorrectas: incorrectas.slice(0, OPCIONES - 1),
    hecha: `Parte por ${paso.n}`,
    km: paso.km,
  }
}

function decisionDeCruce(anterior, paso, { esAutopista, salidas }, esDeLaRuta) {
  const maniobra = (grados, calle, opciones = {}) =>
    textoDeManiobra(grados, calle, { haciaAutopista: esAutopista(calle), ...opciones })
  const cruce = cruceDeLaRuta(anterior, paso)
  const desdeAutopista = esAutopista(anterior.n)
  const numeroDeSalida = (desdeAutopista && salidaPorLaQueSeSale(anterior, salidas)?.r) || null
  const mismaCalle = !cruce.conConectores && esLaMismaCalle(anterior.n, paso.n)
  // La calle a la que se va, por el otro lado, si sale hacia los dos: ahí sí importa decir el lado.
  const otroLado = cruce.calles.find(
    calle =>
      esLaMismaCalle(calle.n, paso.n) &&
      Math.sign(calle.grados) === -Math.sign(cruce.grados) &&
      Math.abs(calle.grados) >= GRADOS_DE_SEGUIR_DERECHO &&
      Math.abs(calle.grados) <= GRADOS_DE_VUELTA_EN_U,
  )
  const desdeLaCalleActual = !cruce.conConectores && desdeAutopista
  const correcta = maniobra(cruce.grados, paso.n, {
    desdeAutopista: desdeLaCalleActual,
    numeroDeSalida,
    conLado: mismaCalle || !!otroLado,
  })

  const candidatas = []
  // Seguir derecho por la calle actual, si continúa. Si lo correcto ya es seguir derecho (la calle solo cambia de nombre), no hay
  // otra calle por la que seguir.
  if (!mismaCalle && seguirDerechoEs(cruce, cruce.calleActual))
    candidatas.push(seguirDerechoPor(cruce.calleActual))
  const esRampa = desdeLaCalleActual || esAutopista(paso.n)
  if (otroLado && !esRampa) candidatas.push(maniobra(otroLado.grados, paso.n))
  for (const calle of otrasCalles(cruce, esDeLaRuta)) {
    const direcciones = cruce.calles.filter(
      otra => esLaMismaCalle(otra.n, calle.n) && Math.abs(otra.grados) <= GRADOS_DE_VUELTA_EN_U,
    )
    if (direcciones.length)
      candidatas.push(
        maniobra(elegir(direcciones).grados, calle.n, {
          desdeAutopista: desdeLaCalleActual,
          conLado: direcciones.length > 1,
        }),
      )
  }
  const incorrectas = mezclar([...new Set(candidatas)].filter(texto => texto !== correcta)).slice(
    0,
    OPCIONES - 1,
  )

  if (!cruce.conConectores)
    return {
      tipo: 'cruce',
      paso,
      pregunta: `Vas hacia el ${puntoCardinal(cruce.rumboEnElFin)} por <b>${escaparHtml(anterior.n)}</b> (${formatearKm(anterior.km)} km). <b>¿Qué haces en el cruce que viene?</b>`,
      camara: puntoAntesDelFinal(cruce.propio, KM_ANTES_DE_DECIDIR),
      rumbo: cruce.rumboEnElFin,
      correcta,
      incorrectas,
      hecha: correcta,
      km: paso.km,
    }
  // Por calles chicas hasta la siguiente: se cuenta el primer giro y se pregunta al llegar a la calle nueva.
  const giroEnElFin = giro(cruce.rumboEnElFin, rumbo(cruce.fin, puntoDesdeElInicio(cruce.conector, 0.15)))
  const conectores = anterior.c
  const { verbo, calles } = textoDelDesvio(giroEnElFin, conectores, { desdeAutopista, numeroDeSalida })
  return {
    tipo: 'cruce',
    paso,
    pregunta: `Ibas hacia el ${puntoCardinal(cruce.rumboEnElFin)} por <b>${escaparHtml(anterior.n)}</b> y ${verbo} por <b>${escaparHtml(calles)}</b>. Ahora vas hacia el ${puntoCardinal(cruce.rumbo)} y llegas a <b>${escaparHtml(paso.n)}</b>: <b>¿qué haces?</b>`,
    camara: puntoAntesDelFinal(cruce.conector, KM_ANTES_DE_LLEGAR_A_LA_CALLE),
    rumbo: cruce.rumbo,
    correcta,
    incorrectas,
    hecha: `${maniobra(giroEnElFin, conectores[0], { desdeAutopista, numeroDeSalida })} y luego ${conMinuscula(correcta)}`,
    km: paso.km,
  }
}

// Las preguntas por las salidas de una autopista (y lo que se recorre antes de la primera), o null si no se reconoce la salida
// por la que la ruta la deja.
function decisionesDeSalidas(indice, pasos, contexto, { dibujaElDestino }) {
  const autopista = pasos[indice]
  const destino = pasos[indice + 1]
  if (!destino || !contexto.esAutopista(autopista.n)) return null
  const secuencia = secuenciaDeSalidas(autopista, null, contexto.salidas)
  if (!secuencia) return null
  const seguir = seguirDerechoPor(autopista.n)
  const ventanas = ventanasDeSalidas(secuencia, largoDelTrazado(autopista.g))
  // Lo que se recorre antes de la primera pregunta se dibuja con la respuesta anterior.
  const previo = ventanas[0].desdeKm > 0 ? [trozoDelTrazado(autopista.g, 0, ventanas[0].desdeKm)] : []
  const preguntas = ventanas.map((ventana, orden) => {
    const tomar = ({ salida, destino: adonde }) =>
      `Toma la salida ${salida.r}${adonde ? ` hacia ${adonde}` : ''}`
    const textos = ventana.salidas.map(tomar)
    const esLaUltima = ventana.indiceDeLaCorrecta >= 0
    const correcta = esLaUltima ? textos[ventana.indiceDeLaCorrecta] : seguir
    const camara = puntoDesdeElInicio(autopista.g, ventana.camaraKm)
    const rumboDeLaCamara = rumbo(
      camara,
      puntoDesdeElInicio(autopista.g, ventana.camaraKm + KM_PARA_MEDIR_EL_RUMBO),
    )
    const numeros = ventana.salidas.map(({ salida }) => salida.r)
    const lista = numeros.length > 1 ? `${numeros.slice(0, -1).join(', ')} y ${numeros.at(-1)}` : numeros[0]
    const detalle = ventana.salidas
      .map(
        ({ salida, destino: adonde }) =>
          `<b>${escaparHtml(salida.r)}</b>${adonde ? ` (${escaparHtml(adonde)})` : ''}`,
      )
      .join(', ')
    return {
      tipo: 'salidas',
      paso: autopista,
      pregunta: `Vas hacia el ${puntoCardinal(rumboDeLaCamara)} por <b>${escaparHtml(autopista.n)}</b>${orden === 0 ? ` (${formatearKm(autopista.km)} km)` : ''}. Vienen las salidas ${detalle}. <b>¿Qué haces?</b>`,
      camara,
      rumbo: rumboDeLaCamara,
      correcta,
      opciones: [...textos, seguir],
      incorrectas: [...textos, seguir].filter(texto => texto !== correcta),
      hecha: esLaUltima ? correcta : `Sigues por ${autopista.n}, sin tomar las salidas ${lista}`,
      km: +(ventana.hastaKm - ventana.desdeKm).toFixed(1),
      alResponder: [
        trozoDelTrazado(autopista.g, ventana.desdeKm, ventana.hastaKm),
        ...(esLaUltima && dibujaElDestino ? [destino.g] : []),
      ],
      pines: ventana.salidas.map(({ salida }) => ({ p: salida.p, texto: `Salida ${salida.r}` })),
      ...(esLaUltima && {
        salidaElegida: {
          texto: `Salida ${ventana.salidas[ventana.indiceDeLaCorrecta].salida.r}`,
          paso: indice,
        },
      }),
    }
  })
  return { previo, preguntas }
}

// pasos: los de la ruta (compartido/rutaEnAuto.js). contexto: { esAutopista(nombre), salidas, salidasConocidas? }.
export function decisionesConStreetView(pasos, contexto) {
  const esDeLaRuta = nombre => pasos.some(paso => esLaMismaCalle(paso.n, nombre))
  const conSalidas = pasos.map((paso, indice) => decisionesDeSalidas(indice, pasos, contexto, {}))
  const decisiones = []
  pasos.forEach((paso, indice) => {
    // Si el paso se eligió al salir de una autopista, esa respuesta ya lo contó.
    const seEligioPorUnaSalida = indice > 0 && conSalidas[indice - 1]
    if (!seEligioPorUnaSalida) {
      const decision =
        indice === 0
          ? decisionDePartida(paso, contexto, esDeLaRuta)
          : decisionDeCruce(pasos[indice - 1], paso, contexto, esDeLaRuta)
      // Una autopista con salidas se dibuja de a poco, en sus propias preguntas.
      decisiones.push({ ...decision, alResponder: conSalidas[indice] ? conSalidas[indice].previo : [paso.g] })
    }
    if (conSalidas[indice])
      decisiones.push(
        ...decisionesDeSalidas(indice, pasos, contexto, { dibujaElDestino: !conSalidas[indice + 1] })
          .preguntas,
      )
  })
  return decisiones
}
