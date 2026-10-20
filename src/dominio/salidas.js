import { KM_POR_GRADO_LATITUD, KM_POR_GRADO_LONGITUD } from '../nucleo/geografia.js'
import { esLaMismaCalle, nombreDeRuteo, nombreDeRuteoDeCalle } from '../../compartido/rutaEnAuto.js'
import { puntoAntesDelFinal, rumbo } from './maniobras.js'

// Las salidas numeradas de las autopistas (tools/salidas.js): { r: "8", d?: "N" | "S", p: [lat, lon], v: [autopistas],
// a: [a dónde lleva, como en los carteles], c: [[calle del juego cercana, metros]], m: comuna }. Sirven para decir
// "salida 8 · Vespucio" y para ofrecer como alternativas las salidas que de verdad vienen en el camino.

const AUTOPISTA_CON_SENTIDOS = 'Autopista Central'
// Una salida está en la calzada por la que se va si queda a menos de esto del trazado.
const KM_DE_SALIDA_EN_EL_TRAZADO = 0.04
// La ruta deja la autopista donde termina su paso (fin); la salida está justo ahí, algo antes por cómo se marca en OpenStreetMap.
const KM_DE_SALIDA_ANTES_DEL_FIN = 0.6
const KM_DE_SALIDA_DESPUES_DEL_FIN = 0.15
// Con el número de salida que dice Valhalla se acepta una salida más lejos del fin.
const KM_DE_SALIDA_CONOCIDA_ANTES_DEL_FIN = 1.5
// Salidas que se pasaron antes de la correcta y salidas que vienen después de ella.
const KM_ENTRE_SALIDAS_DE_LA_SECUENCIA = 0.3
const KM_MINIMOS_ADELANTE = 0.4
const KM_MAXIMOS_ADELANTE = 4
const KM_MAXIMOS_DE_COSTADO = 1
const SALIDAS_DESPUES_DE_LA_CORRECTA = 3
// Cuántas salidas se muestran juntas en cada pregunta (más "seguir derecho").
export const SALIDAS_POR_VENTANA = 3
const MAXIMO_DE_PREGUNTAS_POR_AUTOPISTA = 3
const METROS_PARA_NOMBRAR_UNA_SALIDA = 300
const DESTINOS_EN_EL_TEXTO = 2
// Dónde se pone al jugador en cada pregunta, respecto de la primera salida que viene.
const KM_ANTES_DE_LA_PRIMERA_SALIDA = 0.35
const KM_DESPUES_DE_LA_ULTIMA_SALIDA = 0.1

// Las salidas de Autopista Central vienen por calzada ("5b-N", "5b-S"): solo valen las del sentido en que se va.
const sentidoDelRumbo = grados => (Math.cos((grados * Math.PI) / 180) >= 0 ? 'N' : 'S')

const perteneceALaAutopista = (salida, autopista, sentido) =>
  salida.v.some(nombre => nombreDeRuteoDeCalle(nombre) === autopista) &&
  (salida.d ? autopista === AUTOPISTA_CON_SENTIDOS && salida.d === sentido : true)

const numeroDeSalida = salida => parseInt(salida.r, 10)
const aPlano = punto => [punto[1] * KM_POR_GRADO_LONGITUD, punto[0] * KM_POR_GRADO_LATITUD]

// Cuánto se avanza por un trazado hasta el punto que queda más cerca de `punto`, y a cuántos km de él queda.
function proyeccionEnElTrazado(punto, trazado) {
  const [px, py] = aPlano(punto)
  let recorrido = 0
  let mejor = { km: Infinity, avance: 0 }
  for (let i = 0; i < trazado.length - 1; i++) {
    const [ax, ay] = aPlano(trazado[i])
    const [bx, by] = aPlano(trazado[i + 1])
    const dx = bx - ax
    const dy = by - ay
    const largoCuadrado = dx * dx + dy * dy
    const t = largoCuadrado ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largoCuadrado)) : 0
    const km = Math.hypot(ax + t * dx - px, ay + t * dy - py)
    if (km < mejor.km) mejor = { km, avance: recorrido + t * Math.sqrt(largoCuadrado) }
    recorrido += Math.sqrt(largoCuadrado)
  }
  return mejor
}

export function largoDelTrazado(trazado) {
  let largo = 0
  for (let i = 0; i < trazado.length - 1; i++)
    largo += Math.hypot(
      (trazado[i + 1][1] - trazado[i][1]) * KM_POR_GRADO_LONGITUD,
      (trazado[i + 1][0] - trazado[i][0]) * KM_POR_GRADO_LATITUD,
    )
  return largo
}

const rumboAlFinal = paso => rumbo(puntoAntesDelFinal(paso.g, 0.2), paso.g.at(-1))

// Las salidas de la autopista que están en la calzada de este paso, en el orden en que se pasa por ellas.
function salidasEnElPaso(paso, salidas) {
  const sentido = sentidoDelRumbo(rumboAlFinal(paso))
  return salidas
    .filter(salida => perteneceALaAutopista(salida, paso.n, sentido))
    .map(salida => ({ ...salida, ...proyeccionEnElTrazado(salida.p, paso.g) }))
    .filter(salida => salida.km <= KM_DE_SALIDA_EN_EL_TRAZADO)
    .sort((a, b) => a.avance - b.avance)
}

const finDelPaso = paso => paso.fin ?? paso.g.at(-1)

// La salida por la que la ruta deja la autopista de este paso, o null si no se la reconoce (salida sin número, enlace entre
// autopistas…). Trae `avance`: cuántos km se lleva recorridos de la autopista al llegar a ella.
export function salidaPorLaQueSeSale(paso, salidas) {
  const avanceDelFin = proyeccionEnElTrazado(finDelPaso(paso), paso.g).avance
  const delPaso = salidasEnElPaso(paso, salidas)
  const distanciaAlFin = salida => Math.abs(salida.avance - avanceDelFin)
  const numeroDelCartel = parseInt(paso.salida?.r, 10)
  const conElNumeroDelCartel = delPaso.filter(
    salida =>
      numeroDeSalida(salida) === numeroDelCartel &&
      salida.avance >= avanceDelFin - KM_DE_SALIDA_CONOCIDA_ANTES_DEL_FIN &&
      salida.avance <= avanceDelFin + KM_DE_SALIDA_DESPUES_DEL_FIN,
  )
  const cercanas = delPaso.filter(
    salida =>
      salida.avance >= avanceDelFin - KM_DE_SALIDA_ANTES_DEL_FIN &&
      salida.avance <= avanceDelFin + KM_DE_SALIDA_DESPUES_DEL_FIN,
  )
  const candidatas = conElNumeroDelCartel.length ? conElNumeroDelCartel : cercanas
  return candidatas.sort((a, b) => distanciaAlFin(a) - distanciaAlFin(b))[0] ?? null
}

// A dónde lleva una salida, como lo dirían los carteles: sus destinos (como máximo dos); si no se sabe, la calle del juego
// que queda al lado y, a falta de todo, la comuna. La autopista misma no cuenta como destino.
export function destinoDeLaSalida(salida, autopista) {
  const carteles = (salida.a ?? []).map(nombreDeRuteo).filter(destino => !esLaMismaCalle(destino, autopista))
  if (carteles.length) return [...new Set(carteles)].slice(0, DESTINOS_EN_EL_TEXTO).join(' / ')
  const cercana = salida.c.find(
    ([nombre, metros]) =>
      metros <= METROS_PARA_NOMBRAR_UNA_SALIDA && !esLaMismaCalle(nombreDeRuteoDeCalle(nombre), autopista),
  )
  return cercana ? nombreDeRuteoDeCalle(cercana[0]) : salida.m
}

export const textoDeSalida = (salida, destino) => `Salida ${salida.r}${destino ? ` · ${destino}` : ''}`

// Una salida por número (un mismo número puede tener varios ramales y una por calzada), la primera de la lista primero.
function unaPorNumero(salidas, yaVistos = new Set()) {
  return salidas.filter(
    salida => !yaVistos.has(numeroDeSalida(salida)) && yaVistos.add(numeroDeSalida(salida)),
  )
}

// Las salidas de la autopista de este paso, en el orden en que se las encuentra: las que se pasan antes de la salida correcta,
// la correcta y unas cuantas que vienen después. { salidas: [{ salida, destino, avance }], indiceDeLaCorrecta }, o null si no se
// reconoce la salida por la que se deja la autopista. `destinoDeLaCorrecta` es a dónde lleva la calle que sigue en la ruta.
export function secuenciaDeSalidas(paso, destinoDeLaCorrecta, salidas) {
  const correcta = salidaPorLaQueSeSale(paso, salidas)
  if (!correcta) return null
  const fin = finDelPaso(paso)
  const rumboDelFin = rumboAlFinal(paso)
  const radianes = (rumboDelFin * Math.PI) / 180
  const [haciaX, haciaY] = [Math.sin(radianes), Math.cos(radianes)]
  const [fx, fy] = aPlano(fin)
  const sentido = sentidoDelRumbo(rumboDelFin)

  const vistos = new Set([numeroDeSalida(correcta)])
  const yaPasadas = unaPorNumero(
    salidasEnElPaso(paso, salidas).filter(
      salida => salida.avance < correcta.avance - KM_ENTRE_SALIDAS_DE_LA_SECUENCIA,
    ),
    vistos,
  )
  const porVenir = unaPorNumero(
    salidas
      .filter(salida => perteneceALaAutopista(salida, paso.n, sentido))
      .map(salida => {
        const [x, y] = aPlano(salida.p)
        return {
          ...salida,
          avance: correcta.avance + (x - fx) * haciaX + (y - fy) * haciaY,
          adelante: (x - fx) * haciaX + (y - fy) * haciaY,
          costado: Math.abs((x - fx) * haciaY - (y - fy) * haciaX),
        }
      })
      .filter(
        salida =>
          salida.adelante >= KM_MINIMOS_ADELANTE &&
          salida.adelante <= KM_MAXIMOS_ADELANTE &&
          salida.costado <= KM_MAXIMOS_DE_COSTADO,
      )
      .sort((a, b) => a.adelante - b.adelante),
    vistos,
  ).slice(0, SALIDAS_DESPUES_DE_LA_CORRECTA)

  const entrada = (salida, destino = destinoDeLaSalida(salida, paso.n)) => ({
    salida,
    destino,
    avance: salida.avance,
  })
  return {
    salidas: [
      ...yaPasadas.map(salida => entrada(salida)),
      entrada(correcta, destinoDeLaCorrecta ?? destinoDeLaSalida(correcta, paso.n)),
      ...porVenir.map(salida => entrada(salida)),
    ],
    indiceDeLaCorrecta: yaPasadas.length,
  }
}

// Las preguntas que se hacen al ir por la autopista: de a SALIDAS_POR_VENTANA salidas, en orden. En cada una se puede tomar
// alguna de ellas o seguir derecho; la correcta es la salida de la ruta si está entre ellas, y si no, seguir derecho (ninguna
// de esas salidas era la buena). Se sigue hasta la ventana que trae la correcta.
// [{ salidas, indiceDeLaCorrecta (en la ventana, o -1), desdeKm, camaraKm, hastaKm }]; los km son sobre el trazado del paso.
export function ventanasDeSalidas(secuencia, largoDelPasoKm) {
  const { salidas, indiceDeLaCorrecta } = secuencia
  const ventanas = []
  let desdeKm = 0
  for (let inicio = 0; inicio <= indiceDeLaCorrecta; inicio += SALIDAS_POR_VENTANA) {
    const enLaVentana = salidas.slice(inicio, inicio + SALIDAS_POR_VENTANA)
    const contieneLaCorrecta = indiceDeLaCorrecta < inicio + SALIDAS_POR_VENTANA
    const primera = enLaVentana[0].avance
    const ultimaEnElTrazado = contieneLaCorrecta ? salidas[indiceDeLaCorrecta] : enLaVentana.at(-1)
    ventanas.push({
      salidas: enLaVentana,
      indiceDeLaCorrecta: contieneLaCorrecta ? indiceDeLaCorrecta - inicio : -1,
      desdeKm,
      camaraKm: Math.max(desdeKm, Math.min(primera - KM_ANTES_DE_LA_PRIMERA_SALIDA, largoDelPasoKm)),
      hastaKm: Math.min(ultimaEnElTrazado.avance, largoDelPasoKm),
    })
    desdeKm = ultimaEnElTrazado.avance + KM_DESPUES_DE_LA_ULTIMA_SALIDA
  }
  // En una autopista larga, lo de más atrás se recorre sin preguntar: solo se pregunta cerca de la salida.
  return ventanas.slice(-MAXIMO_DE_PREGUNTAS_POR_AUTOPISTA)
}

// El tramo de un trazado entre dos distancias medidas desde su comienzo.
export function trozoDelTrazado(trazado, desdeKm, hastaKm) {
  const [dx, dy] = [KM_POR_GRADO_LONGITUD, KM_POR_GRADO_LATITUD]
  const trozo = []
  let recorrido = 0
  for (let i = 0; i < trazado.length - 1; i++) {
    const largo = Math.hypot(
      (trazado[i + 1][1] - trazado[i][1]) * dx,
      (trazado[i + 1][0] - trazado[i][0]) * dy,
    )
    const punto = t => [
      trazado[i][0] + t * (trazado[i + 1][0] - trazado[i][0]),
      trazado[i][1] + t * (trazado[i + 1][1] - trazado[i][1]),
    ]
    if (recorrido + largo >= desdeKm && recorrido <= hastaKm && largo) {
      const desde = Math.max(0, (desdeKm - recorrido) / largo)
      const hasta = Math.min(1, (hastaKm - recorrido) / largo)
      if (!trozo.length) trozo.push(punto(desde))
      trozo.push(punto(hasta))
    }
    recorrido += largo
  }
  return trozo.length > 1 ? trozo : trazado.slice(-2)
}
