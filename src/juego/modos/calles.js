import { distanciaALinea } from '../../nucleo/geografia.js'
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
} from '../../dominio/calles.js'
import { mostrarAyudas } from '../../mapa/ayudas.js'
import { COLORES, iconoDiv, dibujarTramosConNombre, dibujarCalle, etiquetaDeMapa } from '../../mapa/dibujo.js'
import { kmDeDedo, encuadrar, encuadrarCiudad, capa, mapa, fijarModoDeEtiquetas } from '../../mapa/mapa.js'
import { mostrarPanel } from '../../interfaz/panel.js'
import { htmlDeFoto } from '../../interfaz/fotos.js'
import { responder, encabezadoDePregunta } from '../engine.js'
import { mostrarOpciones } from '../options.js'
import { registrarModo } from '../registry.js'

registrarModo({
  id: 'st-name',
  noHint: true,
  aids: true,
  roomy: true,
  group: 'Calles',
  name: '¿Qué calle es?',
  desc: 'Te marco una avenida o autopista; eliges el nombre.',
  pool: () => callesDelJuego(),
  key: s => s.name,
  ask(s, q) {
    mostrarPanel(
      encabezadoDePregunta(q) + `<div class="q-prompt">${PREGUNTA_DE_CALLE[s.kind || 'calle']}</div>`,
    )
    mostrarAyudas({ borders: comunas.filter(esUrbana) })
    dibujarCalle(s, COLORES.street)
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
          `${extra}<p><b>${escaparHtml(s.name)}</b></p><p class="muted">${escaparHtml(s.hint)}</p>${htmlDeTramosConNombre(s)}${htmlDeCercanos}<p class="muted">Pasa por: ${s.comunas.map(escaparHtml).join(', ')}</p>${htmlDeFoto('s:' + s.name)}`,
        )
        // El encuadre va después de la respuesta: así cuenta con el tamaño final del panel.
        encuadrar(mostrado, 14)
      },
      { one: true },
    )
    // Y el primero, después de las alternativas, por la misma razón.
    encuadrar(L.latLngBounds(s.bb).pad(0.25), 14)
  },
})
// El margen de acierto son unos 14 píxeles de dedo: en metros, más estricto cuanto más se acerca el mapa (entre 80 y 250 m).
const TOQUE_MINIMO_KM = 0.08
const TOQUE_MAXIMO_KM = 0.25
// Si otra calle del juego queda más cerca del toque que la pedida por más de esto, se tocó esa otra.
const OTRA_MAS_CERCA_KM = 0.03

const toleranciaDeToqueKm = latlng => Math.min(TOQUE_MAXIMO_KM, Math.max(TOQUE_MINIMO_KM, kmDeDedo(latlng)))

registrarModo({
  id: 'st-find',
  noHint: true,
  aids: true,
  roomy: true,
  group: 'Calles',
  name: 'Encuentra la calle',
  desc: 'Toca sobre la calle que te pido.',
  pool: () => callesDelJuego(),
  key: s => s.name,
  ask(s, q) {
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
      const tolerancia = toleranciaDeToqueKm(e.latlng)
      const ok = d <= tolerancia && !(cerca !== s && nd < d - OTRA_MAS_CERCA_KM)
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
        `${ok ? '' : `<p>Quedaste a ${formatearKm(d)} de la calle.</p>`}${extra}<p class="muted">${escaparHtml(s.hint)}</p>${htmlDeTramosConNombre(s)}${htmlDeCercanos}${htmlDeFoto('s:' + s.name)}`,
      )
      if (!ok) encuadrar(L.latLngBounds(s.bb).extend(p).pad(0.15), 14)
    })
  },
})
