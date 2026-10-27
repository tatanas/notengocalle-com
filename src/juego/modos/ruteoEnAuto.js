import { lugarPorId } from '../../datos/datos.js'
import HUELLAS from '../../datos/huellasDeLugares.json'
import LUGARES_CON_CALLES from '../../datos/lugaresConCalles.json'
import { prepararRuta } from '../../dominio/lugaresDeRuteo.js'
import { nombreCortoDelLugar } from '../../dominio/misionesDeConduccion.js'
import { cargarElGrafo, conducir, dejarDeConducir } from '../../interfaz/conductor.js'
import { mostrarPanel } from '../../interfaz/panel.js'
import { htmlDelResultado } from '../../interfaz/resultadoDeConduccion.js'
import { iconoDiv } from '../../mapa/dibujo.js'
import { capa, encuadrar, fijarModoDeEtiquetas, mapa } from '../../mapa/mapa.js'
import { streetViewDisponible } from '../../mapa/streetView.js'
import { ajustes } from '../../nucleo/almacen.js'
import { distanciaKm } from '../../nucleo/geografia.js'
import { $, escaparHtml } from '../../nucleo/utilidades.js'
import { encabezadoDePregunta, partida, responder } from '../engine.js'
import { elegirDelDia } from '../diarios.js'
import { PUNTO_PROPIO, extremoDeRuta, lugarDeLaRuta } from '../pasos.js'
import { registrarModo } from '../registry.js'

// Ruteo en auto: el juego entrega una ruta de un lugar emblemático a otro y hay que hacerla decidiendo en cada cruce, mirando
// Street View. Una ronda es una sola ruta. La puntuación (0 a 100) compara el tiempo con el de la ruta más rápida
// (src/dominio/mision.js). La práctica va con el mapa a mano (y, si se fijó un punto propio, las rutas parten de él o llegan a
// él); la ronda real solo muestra el mapa al principio. El motor de manejo está en src/interfaz/conductor.js.
const KM_MINIMOS = 3
const KM_MAXIMOS_ENTRE_LUGARES = 14
const KM_MAXIMOS_DESDE_EL_PUNTO = 30
const ZOOM_AL_PARTIR = 17
const PUNTAJE_PARA_ACERTAR = 80
const PUNTAJE_PARA_ESTAR_CERCA = 40
// Omite las calles menores claramente peores (src/dominio/simplificarDecision.js): menos decisiones, la misma ruta óptima.
const SIMPLIFICAR_DECISIONES = true

const lugaresConCalles = () => LUGARES_CON_CALLES.map(id => lugarPorId[id])

let paresEntreLugares = null
function paresDeLugares() {
  paresEntreLugares ??= lugaresConCalles().flatMap(origen =>
    lugaresConCalles()
      .filter(destino => {
        const km = distanciaKm([origen.lat, origen.lon], [destino.lat, destino.lon])
        return destino.id !== origen.id && km >= KM_MINIMOS && km <= KM_MAXIMOS_ENTRE_LUGARES
      })
      .map(destino => ({ k: `${origen.id}>${destino.id}`, from: origen.id, to: destino.id })),
  )
  return paresEntreLugares
}

// La ruta del desafío diario: la misma para todos ese día, ni muy corta ni muy larga.
const KM_MINIMOS_DEL_DESAFIO = 5
const KM_MAXIMOS_DEL_DESAFIO = 12
export function rutaDelDia(fecha) {
  const candidatas = paresDeLugares().filter(({ from, to }) => {
    const km = distanciaKm(
      [lugarPorId[from].lat, lugarPorId[from].lon],
      [lugarPorId[to].lat, lugarPorId[to].lon],
    )
    return km >= KM_MINIMOS_DEL_DESAFIO && km <= KM_MAXIMOS_DEL_DESAFIO
  })
  return elegirDelDia(candidatas, 1, 'ruta', fecha)[0]
}

// Con un punto propio (solo en la práctica), todas las rutas parten de él o llegan a él.
function rutasDelPuntoPropio() {
  const { lat, lon, sentido } = ajustes.puntoDeRuteo
  const desde = sentido !== 'hacia'
  return lugaresConCalles()
    .filter(lugar => {
      const km = distanciaKm([lat, lon], [lugar.lat, lugar.lon])
      return km >= KM_MINIMOS && km <= KM_MAXIMOS_DESDE_EL_PUNTO
    })
    .map(lugar => {
      const [from, to] = desde ? [PUNTO_PROPIO, lugar.id] : [lugar.id, PUNTO_PROPIO]
      return { k: `${from}>${to}`, from, to }
    })
}

function rutasDelJuego() {
  // Para probar una ruta concreta al desarrollar: ?ruta=l49:l36 (ids de los lugares emblemáticos).
  const forzada = import.meta.env.DEV && new URLSearchParams(location.search).get('ruta')
  if (forzada) {
    const [from, to] = forzada.split(':')
    return [{ k: forzada, from, to }]
  }
  return ajustes.puntoDeRuteo ? rutasDelPuntoPropio() : paresDeLugares()
}

const pin = (lugar, letra) =>
  L.marker([lugar.lat, lugar.lon], {
    icon: iconoDiv(`pin ${letra.toLowerCase()}`, letra, 28),
    pane: 'points',
  }).addTo(capa)

function dibujarHuella(lugar) {
  if (HUELLAS[lugar.id])
    L.polygon(HUELLAS[lugar.id], {
      color: '#7c3aed',
      weight: 2,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(capa)
}

// Al terminar la ruta (llegar, rendirse o alejarse demasiado): el análisis y los puntos.
function terminarLaRuta(q, etiqueta, { motivo, analisis }) {
  if (partida !== q || q.answered) return
  const puntaje = motivo === 'llegada' ? analisis.puntaje : 0
  mostrarPanel(encabezadoDePregunta(q))
  responder(
    puntaje >= PUNTAJE_PARA_ACERTAR,
    htmlDelResultado({ motivo, etiqueta, analisis, conBotones: false }),
    {
      points: puntaje,
      partial: puntaje >= PUNTAJE_PARA_ESTAR_CERCA,
    },
  )
}

// Se ven A y B en el mapa; al apretar el botón se parte (en la ronda real, el mapa desaparece).
function planificar(q, origen, destino, preparada) {
  const etiqueta = `${nombreCortoDelLugar(origen.name)} → ${nombreCortoDelLugar(destino.name)}`
  fijarModoDeEtiquetas(q.ranked ? 'plain' : 'labels')
  dibujarHuella(origen)
  dibujarHuella(destino)
  pin(origen, 'A')
  pin(destino, 'B')
  encuadrar(
    L.latLngBounds([
      [origen.lat, origen.lon],
      [destino.lat, destino.lon],
    ]).pad(0.3),
    15,
  )
  mostrarPanel(`${encabezadoDePregunta(q)}
    <p><b>A</b> ${escaparHtml(nombreCortoDelLugar(origen.name))}<br><b>B</b> ${escaparHtml(nombreCortoDelLugar(destino.name))}</p>
    <p class="muted nota">${
      q.ranked
        ? 'Llega de A a B por la ruta más rápida. Mira bien el mapa: al empezar desaparece y solo verás la calle.'
        : 'Llega de A a B por la ruta más rápida, decidiendo en cada cruce. Tienes el mapa a la mano.'
    } Si el lugar tiene varias salidas, eliges por cuál salir; para llegar vale cualquier entrada.</p>
    <button class="btn" id="rutaEmpezar">${q.ranked ? 'Estoy listo' : 'Empezar'}</button>`)
  $('#rutaEmpezar').onclick = () => {
    preparada.estado.practica = !q.ranked
    if (!q.ranked) mapa.setView([origen.lat, origen.lon], ZOOM_AL_PARTIR)
    conducir({
      estado: preparada.estado,
      ruta: { etiqueta, mision: preparada.mision, optima: preparada.optima },
      ciego: q.ranked,
      encabezado: () => `${encabezadoDePregunta(q)}<div class="q-sub">${escaparHtml(etiqueta)}</div>`,
      alTerminar: resultado => terminarLaRuta(q, etiqueta, resultado),
    })
  }
}

registrarModo({
  id: 'rs-sv-ruta',
  group: 'Ruteo',
  name: 'Ruteo en auto',
  noHint: true,
  puntosPorPregunta: 100,
  disponible: streetViewDisponible,
  pool: rutasDelJuego,
  key: ruta => ruta.k,
  label: ruta => `${extremoDeRuta(ruta.from).name} → ${extremoDeRuta(ruta.to).name}`,
  balance: ruta => lugarDeLaRuta(ruta)?.comuna,
  limpiar: dejarDeConducir,
  async ask(ruta, q) {
    mostrarPanel(`${encabezadoDePregunta(q)}<p class="muted tight">Preparando la ruta…</p>`)
    let grafo
    try {
      grafo = await cargarElGrafo()
    } catch {
      return mostrarPanel(
        `${encabezadoDePregunta(q)}<p>No se pudieron cargar las calles. Revisa tu conexión.</p>`,
      )
    }
    if (partida !== q || q.answered) return
    const [origen, destino] = [extremoDeRuta(ruta.from), extremoDeRuta(ruta.to)]
    const preparada = prepararRuta(grafo, origen, destino, HUELLAS, { simplificar: SIMPLIFICAR_DECISIONES })
    if (!preparada)
      return mostrarPanel(
        `${encabezadoDePregunta(q)}<p>${
          ruta.from === PUNTO_PROPIO || ruta.to === PUNTO_PROPIO
            ? 'Tu punto fijo queda fuera de la zona con calles disponible: cámbialo en el menú.'
            : 'No hay un camino entre estos lugares en las calles disponibles.'
        }</p>`,
      )
    planificar(q, origen, destino, preparada)
  },
})
