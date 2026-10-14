import { distanciaALinea, puntoMasCercanoEnLineas } from '../../nucleo/geografia.js'
import { escaparHtml, formatearKm, mezclar } from '../../nucleo/utilidades.js'
import {
  DATOS,
  comunaPorNombre,
  comunas,
  esUrbana,
  puntoDeEtiqueta,
  callesDelJuego,
  callePorNombre,
} from '../../datos/datos.js'
import { mostrarLugaresAlLargo } from '../../dominio/lugares.js'
import {
  PREGUNTA_DE_CALLE,
  htmlDeTramosConNombre,
  anotarConfusion,
  distractoresDeCalle,
  puntoParaPreguntar,
} from '../../dominio/calles.js'
import { mostrarAyudas } from '../../mapa/ayudas.js'
import { COLORES, iconoDiv, dibujarTramosConNombre, dibujarCalle, etiquetaDeMapa } from '../../mapa/dibujo.js'
import { kmDeDedo, encuadrar, encuadrarCiudad, capa, mapa, fijarModoDeEtiquetas } from '../../mapa/mapa.js'
import { mostrarPanel } from '../../interfaz/panel.js'
import { conectarRecorrerCalle, htmlDeRecorrerCalle } from '../../interfaz/recorrerCalle.js'
import { ocultarPanorama } from '../../mapa/streetView.js'
import { htmlDeFoto } from '../../interfaz/fotos.js'
import { responder, encabezadoDePregunta } from '../engine.js'
import { mostrarOpciones } from '../options.js'
import { registrarModo } from '../registry.js'

const PREGUNTA_DE_PUNTO = '¿Qué calle pasa por el punto marcado?'

// El punto marcado y, si queda cerca de un cruce, la franja de calle que se pregunta.
function marcarPuntoDeCalle({ punto, franja }) {
  if (franja)
    L.polyline(franja, { pane: 'routes', color: COLORES.street, weight: 7, opacity: 0.9 }).addTo(capa)
  L.marker(punto, { icon: iconoDiv('pin ans'), pane: 'points' }).addTo(capa)
}

// Dos juegos con las mismas alternativas: uno destaca la calle entera y el otro marca solo un punto (más difícil, porque
// no sirve reconocer la forma de la calle).
const registrarNombreDeCalle = ({ id, name, desc, soloPunto }) =>
  registrarModo({
    id,
    noHint: true,
    aids: true,
    roomy: true,
    group: 'Calles',
    name,
    desc,
    pool: () => callesDelJuego(),
    key: s => s.name,
    limpiar: ocultarPanorama,
    ask(s, q) {
      ocultarPanorama()
      const marcado = soloPunto ? puntoParaPreguntar(s) : null
      mostrarPanel(
        encabezadoDePregunta(q) +
          `<div class="q-prompt">${marcado ? PREGUNTA_DE_PUNTO : PREGUNTA_DE_CALLE[s.kind || 'calle']}</div>`,
      )
      mostrarAyudas({ borders: comunas.filter(esUrbana) })
      if (marcado) marcarPuntoDeCalle(marcado)
      else dibujarCalle(s, COLORES.street)
      const opciones = mezclar([s, ...distractoresDeCalle(s, 3)]).map(x => ({
        label: escaparHtml(x.name),
        value: x.name,
      }))
      mostrarOpciones(
        opciones,
        s.name,
        v => {
          for (const c of s.comunas) {
            const f = comunaPorNombre[c]
            if (f) etiquetaDeMapa(puntoDeEtiqueta(f), c).addTo(capa)
          }
          let extra = ''
          let mostrado = L.latLngBounds(s.bb).pad(0.25)
          fijarModoDeEtiquetas('labels')
          anotarConfusion(s.name, v)
          if (marcado && v === s.name) dibujarCalle(s, COLORES.ok, { labelText: s.name })
          if (v !== s.name) {
            const w = callePorNombre[v]
            dibujarCalle(w, COLORES.bad, { labelText: w.name })
            dibujarCalle(s, COLORES.ok, { labelText: s.name })
            mostrado = L.latLngBounds(s.bb).extend(L.latLngBounds(w.bb)).pad(0.1)
            extra = `<p>En <span style="color:${COLORES.bad};font-weight:700">rojo</span> la que elegiste (${escaparHtml(w.name)}); en <span style="color:${COLORES.ok};font-weight:700">verde</span> la correcta.</p>`
          }
          dibujarTramosConNombre(s)
          const htmlDeCercanos = mostrarLugaresAlLargo(s)
          responder(
            v === s.name,
            `${extra}<p><b>${escaparHtml(s.name)}</b></p><p class="muted">${escaparHtml(s.hint)}</p>${htmlDeTramosConNombre(s)}${htmlDeCercanos}<p class="muted">Pasa por: ${s.comunas.map(escaparHtml).join(', ')}</p>${htmlDeFoto('s:' + s.name)}${htmlDeRecorrerCalle()}`,
          )
          conectarRecorrerCalle(s, marcado?.punto)
          // El encuadre va después de la respuesta: así cuenta con el tamaño final del panel.
          encuadrar(mostrado, 14)
        },
        { one: true },
      )
      // Y el primero, después de las alternativas, por la misma razón.
      if (marcado) encuadrar(L.latLng(marcado.punto).toBounds(1500), 16)
      else encuadrar(L.latLngBounds(s.bb).pad(0.25), 14)
    },
  })
registrarNombreDeCalle({
  id: 'st-name',
  name: '¿Qué calle es esta?',
  desc: 'Destaca la calle completa',
  soloPunto: false,
})
registrarNombreDeCalle({
  id: 'st-punto',
  name: '¿Qué calle es esta? (difícil)',
  desc: 'Marca solo un punto',
  soloPunto: true,
})

// El margen de acierto son unos 14 píxeles de dedo: en metros, más estricto cuanto más se acerca el mapa (entre 80 y 250 m).
const TOQUE_MINIMO_KM = 0.08
const TOQUE_MAXIMO_KM = 0.25
// Si otra calle del juego queda más cerca del toque que la pedida por más de esto, se tocó esa otra.
const OTRA_MAS_CERCA_KM = 0.03

// Cerca de un cruce se perdona más: si la otra calle llega a la pedida a menos de esto del toque, no se puede saber a cuál apuntabas.
const CRUCE_CERCANO_KM = 0.12
const TOQUE_MINIMO_EN_CRUCE_KM = 0.12

const seCruzanCercaDe = (punto, calle, otra) =>
  distanciaALinea(puntoMasCercanoEnLineas(punto, otra.lines).point, calle.lines) <= CRUCE_CERCANO_KM

const toleranciaDeToqueKm = latlng => Math.min(TOQUE_MAXIMO_KM, Math.max(TOQUE_MINIMO_KM, kmDeDedo(latlng)))

registrarModo({
  id: 'st-find',
  noHint: true,
  aids: true,
  roomy: true,
  group: 'Calles',
  name: 'Encuentra la calle',
  pool: () => callesDelJuego(),
  key: s => s.name,
  limpiar: ocultarPanorama,
  ask(s, q) {
    ocultarPanorama()
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">Toca cualquier punto de: <b>${escaparHtml(s.name)}</b></div>`,
    )
    mostrarAyudas({ borders: comunas.filter(esUrbana) })
    if (q.i === 0) encuadrarCiudad()
    mapa.on('click', e => {
      if (q.answered) return
      const p = [e.latlng.lat, e.latlng.lng]
      const d = distanciaALinea(p, s.lines)
      let cerca = null,
        nd = Infinity
      for (const o of DATOS.streets) {
        const dd = distanciaALinea(p, o.lines)
        if (dd < nd) {
          nd = dd
          cerca = o
        }
      }
      const enCruce = cerca !== s && seCruzanCercaDe(p, s, cerca)
      const tolerancia = Math.max(toleranciaDeToqueKm(e.latlng), enCruce ? TOQUE_MINIMO_EN_CRUCE_KM : 0)
      const ok = d <= tolerancia && (enCruce || !(cerca !== s && nd < d - OTRA_MAS_CERCA_KM))
      L.marker(p, { icon: iconoDiv('pin you'), pane: 'points' }).addTo(capa)
      dibujarCalle(s, ok ? COLORES.ok : COLORES.street)
      fijarModoDeEtiquetas('labels')
      if (!ok && cerca && cerca !== s && nd <= tolerancia) anotarConfusion(s.name, cerca.name)
      const extra =
        !ok && cerca && cerca !== s && nd <= tolerancia
          ? `<p>Tocaste cerca de <b>${escaparHtml(cerca.name)}</b>.</p>`
          : ''
      dibujarTramosConNombre(s)
      const htmlDeCercanos = mostrarLugaresAlLargo(s)
      responder(
        ok,
        `${ok ? '' : `<p>Quedaste a ${formatearKm(d)} de la calle.</p>`}${extra}<p class="muted">${escaparHtml(s.hint)}</p>${htmlDeTramosConNombre(s)}${htmlDeCercanos}${htmlDeFoto('s:' + s.name)}${htmlDeRecorrerCalle()}`,
      )
      conectarRecorrerCalle(s, puntoMasCercanoEnLineas(p, s.lines).point)
      if (!ok) encuadrar(L.latLngBounds(s.bb).extend(p).pad(0.15), 14)
    })
  },
})
