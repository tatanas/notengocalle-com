import { escaparHtml } from '../nucleo/utilidades.js'
import { esLaMismaCalle } from '../../compartido/rutaEnAuto.js'
import { cruceDeLaRuta, otrasCalles, seguirDerechoEs, sentidosDeLaMismaCalle } from './cruceDeRuta.js'
import { puntoDesdeElInicio } from './maniobras.js'
import {
  largoDelTrazado,
  secuenciaDeSalidas,
  textoDeSalida,
  trozoDelTrazado,
  ventanasDeSalidas,
} from './salidas.js'

// Las preguntas del ruteo en auto sobre el mapa ("¿a qué calle sigues?"), una por decisión de la ruta. Las alternativas son
// siempre cosas que de verdad se pueden hacer ahí: las calles que salen del cruce (de Valhalla, ver cruceDeRuta.js) y seguir
// derecho por la calle actual si continúa. Una decisión sin ninguna alternativa no es pregunta: la calle se dibuja junto con la
// respuesta anterior. Nunca hay una pregunta con una sola opción.
//
// Al ir por una autopista con salidas numeradas se pregunta por las salidas, de a tres en orden, más "Seguir derecho": puede que
// ninguna de las tres sirva y lo correcto sea seguir. Se sigue de ventana en ventana hasta la salida de la ruta.
//
// Cada decisión: { tipo: 'partida' | 'calle' | 'salidas', pregunta (html), opciones, correcta, marcador (dónde se está),
// trazos: [{ g, rotulo }] (lo que se dibuja al responder), pines?: [{ p, texto }], ordenadas?, salidaElegida? }.

const ALTERNATIVAS = 3
// Al partir no hay cruce: valen las salidas que ya se conocen del lugar de partida y las calles que salen del primer cruce.
const seguirDerechoPor = calle => `Seguir derecho por ${calle}`
const haciaDonde = (calle, cardinal) => `${calle} hacia el ${cardinal}`
const formatearKm = km => String(km).replace('.', ',')
const trazoDelPaso = paso => ({ g: paso.g, rotulo: paso.n })

function decisionDePartida(paso, { salidasConocidas = [] }, esDeLaRuta) {
  const delPrimerCruce = [...(paso.ent ?? [])].sort((a, b) => a.k - b.k).map(calle => calle.n)
  const alternativas = [...new Set([...salidasConocidas, ...delPrimerCruce])].filter(
    nombre => !esDeLaRuta(nombre),
  )
  return {
    tipo: 'partida',
    pregunta: '¿por qué calle partes?',
    opciones: [paso.n, ...alternativas.slice(0, ALTERNATIVAS)],
    correcta: paso.n,
    marcador: paso.x ?? paso.g[0],
  }
}

function decisionDeCalle(anterior, paso, esDeLaRuta) {
  const cruce = cruceDeLaRuta(anterior, paso)
  const mismaCalle = !cruce.conConectores && esLaMismaCalle(anterior.n, paso.n)
  const puedeSeguir = !mismaCalle && !cruce.conConectores && seguirDerechoEs(cruce, anterior.n)
  const sentidos = mismaCalle ? null : sentidosDeLaMismaCalle(cruce, paso)
  const correcta = mismaCalle
    ? seguirDerechoPor(paso.n)
    : sentidos
      ? haciaDonde(paso.n, sentidos.correcto)
      : paso.n
  const alternativas = [
    ...(sentidos ? [haciaDonde(paso.n, sentidos.opuesto)] : []),
    ...(puedeSeguir ? [seguirDerechoPor(anterior.n)] : []),
    ...otrasCalles(cruce, esDeLaRuta).map(calle => calle.n),
  ]
  return {
    tipo: 'calle',
    pregunta: '¿a qué calle sigues?',
    opciones: [correcta, ...alternativas.slice(0, ALTERNATIVAS)],
    correcta,
    marcador: cruce.cruce,
  }
}

function textoDeLasSalidas(ventana) {
  const nombres = ventana.salidas.map(({ salida }) => `<b>${escaparHtml(salida.r)}</b>`)
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0]
}

// Las preguntas por las salidas de una autopista (y lo que se recorre antes de la primera), o null si no se reconoce la salida
// por la que la ruta la deja.
function decisionesDeSalidas(indice, pasos, contexto, { dibujaElDestino }) {
  const autopista = pasos[indice]
  const destino = pasos[indice + 1]
  if (!contexto.esAutopista(autopista.n)) return null
  const secuencia = secuenciaDeSalidas(autopista, null, contexto.salidas)
  if (!secuencia) return null
  const seguir = seguirDerechoPor(autopista.n)
  const ventanas = ventanasDeSalidas(secuencia, largoDelTrazado(autopista.g))
  // Lo que se recorre antes de la primera pregunta se dibuja con la respuesta anterior.
  const previo =
    ventanas[0].desdeKm > 0
      ? [{ g: trozoDelTrazado(autopista.g, 0, ventanas[0].desdeKm), rotulo: autopista.n }]
      : []
  const preguntas = ventanas.map((ventana, orden) => {
    const textos = ventana.salidas.map(({ salida, destino: adonde }) => textoDeSalida(salida, adonde))
    const esLaUltima = ventana.indiceDeLaCorrecta >= 0
    const correcta = esLaUltima ? textos[ventana.indiceDeLaCorrecta] : seguir
    const salidaElegida = esLaUltima && ventana.salidas[ventana.indiceDeLaCorrecta].salida
    return {
      tipo: 'salidas',
      pregunta: `${
        orden === 0
          ? `Vas por <b>${escaparHtml(autopista.n)}</b> (${formatearKm(autopista.km)} km)`
          : `Sigues por <b>${escaparHtml(autopista.n)}</b>`
      }. Vienen las salidas ${textoDeLasSalidas(ventana)}: ¿qué haces?`,
      opciones: [...textos, seguir],
      ordenadas: true,
      correcta,
      marcador: puntoDesdeElInicio(autopista.g, ventana.camaraKm),
      pines: ventana.salidas.map(({ salida }) => ({ p: salida.p, texto: `Salida ${salida.r}` })),
      trazos: [
        {
          g: trozoDelTrazado(autopista.g, ventana.desdeKm, ventana.hastaKm),
          rotulo: orden === 0 && !previo.length ? autopista.n : '',
        },
        ...(esLaUltima && dibujaElDestino
          ? [
              destino
                ? trazoDelPaso(destino)
                : {
                    g: trozoDelTrazado(autopista.g, ventana.hastaKm, largoDelTrazado(autopista.g)),
                    rotulo: '',
                  },
            ]
          : []),
      ],
      ...(salidaElegida && { salidaElegida: { texto: `Salida ${salidaElegida.r}`, paso: indice } }),
    }
  })
  return { previo, preguntas }
}

// pasos: los de la ruta (compartido/rutaEnAuto.js). contexto: { esAutopista(nombre), salidas, salidasConocidas? }.
// { decisiones, antes }: antes son los tramos que se dibujan antes de la primera pregunta.
export function decisionesEnAuto(pasos, contexto) {
  const esDeLaRuta = nombre => pasos.some(paso => esLaMismaCalle(paso.n, nombre))
  const conSalidas = pasos.map((paso, indice) => decisionesDeSalidas(indice, pasos, contexto, {}))
  const todas = []
  pasos.forEach((paso, indice) => {
    // Si el paso se eligió al salir de una autopista, esa respuesta ya lo contó.
    const seEligioPorUnaSalida = indice > 0 && conSalidas[indice - 1]
    if (!seEligioPorUnaSalida) {
      const decision =
        indice === 0
          ? decisionDePartida(paso, contexto, esDeLaRuta)
          : decisionDeCalle(pasos[indice - 1], paso, esDeLaRuta)
      // Una autopista con salidas se dibuja de a poco, en sus propias preguntas.
      todas.push({
        ...decision,
        trazos: conSalidas[indice] ? conSalidas[indice].previo : [trazoDelPaso(paso)],
      })
    }
    if (conSalidas[indice])
      todas.push(
        ...decisionesDeSalidas(indice, pasos, contexto, { dibujaElDestino: !conSalidas[indice + 1] })
          .preguntas,
      )
  })
  const decisiones = []
  const antes = []
  for (const decision of todas) {
    if (decision.opciones.length > 1) decisiones.push(decision)
    else (decisiones.at(-1)?.trazos ?? antes).push(...decision.trazos)
  }
  return { decisiones, antes }
}

// Los nombres de la ruta para el resumen del final, con la salida por la que se deja cada autopista.
export function nombresDeLaRuta(pasos, decisiones) {
  const salidaDelPaso = new Map(
    decisiones
      .filter(decision => decision.salidaElegida)
      .map(decision => [decision.salidaElegida.paso, decision.salidaElegida.texto]),
  )
  return pasos.map((paso, indice) =>
    salidaDelPaso.has(indice) ? `${paso.n} (${salidaDelPaso.get(indice).toLowerCase()})` : paso.n,
  )
}
