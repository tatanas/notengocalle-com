import { distanciaKm, masCercanosSegun } from '../../nucleo/geografia.js'
import { escaparHtml, formatearKm, mezclar } from '../../nucleo/utilidades.js'
import { LINEAS_DE_METRO, comunasDelAlcance, estaciones } from '../../datos/datos.js'
import { textoDeComunas, conjuntoDeMetro, lineasElegidas, etiquetaDeEstacion } from '../../dominio/metro.js'
import { mostrarAyudas } from '../../mapa/ayudas.js'
import { iconoDiv, dibujarMetro } from '../../mapa/dibujo.js'
import { kmDeDedo, encuadrar, encuadrarCiudad, capa, mapa, fijarModoDeEtiquetas } from '../../mapa/mapa.js'
import { mostrarPanel } from '../../interfaz/panel.js'
import { responder, encabezadoDePregunta } from '../engine.js'
import { mostrarOpciones } from '../options.js'
import { registrarModo } from '../registry.js'

const pulso = estacion =>
  L.marker([estacion.lat, estacion.lon], { icon: iconoDiv('pulse', '', 22), pane: 'points' }).bindTooltip(
    escaparHtml(estacion.name),
    { permanent: true, direction: 'top', offset: [0, -12] },
  )

// Las estaciones son puntos que no se ven en el mapa: el margen es el ancho de un dedo, entre 300 y 500 m.
const TOQUE_MINIMO_KM = 0.3
const TOQUE_MAXIMO_KM = 0.5
// Si otra estación queda más cerca del toque que la pedida por más de esto, se tocó esa otra.
const OTRA_MAS_CERCA_KM = 0.05

registrarModo({
  id: 'mt-find',
  aids: true,
  group: 'Metro',
  name: 'Encuentra la estación',
  desc: 'Incluye todas las líneas',
  pool: conjuntoDeMetro,
  key: s => s.name,
  ask(s, q) {
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">Toca dónde está la estación <b>${escaparHtml(s.name)}</b></div>`,
    )
    mostrarAyudas({ borders: comunasDelAlcance() })
    if (q.i === 0) encuadrarCiudad()
    mapa.on('click', e => {
      if (q.answered) return
      const tu = [e.latlng.lat, e.latlng.lng]
      const d = distanciaKm(tu, [s.lat, s.lon])
      const masCercano = masCercanosSegun(
        estaciones,
        tu,
        x => [x.lat, x.lon],
        1,
        () => false,
      )[0]
      const tolerancia = Math.min(TOQUE_MAXIMO_KM, Math.max(TOQUE_MINIMO_KM, kmDeDedo(e.latlng)))
      const otraMasCerca =
        masCercano !== s && distanciaKm(tu, [masCercano.lat, masCercano.lon]) < d - OTRA_MAS_CERCA_KM
      const ok = d <= tolerancia && !otraMasCerca
      dibujarMetro(capa, { ids: s.lines })
      L.marker(tu, { icon: iconoDiv('pin you'), pane: 'points' }).addTo(capa)
      pulso(s).addTo(capa)
      L.polyline([tu, [s.lat, s.lon]], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(capa)
      fijarModoDeEtiquetas('labels')
      const extra =
        !ok && otraMasCerca
          ? `<p>Tocaste más cerca de la estación <b>${escaparHtml(masCercano.name)}</b>.</p>`
          : ''
      responder(
        ok,
        `<p>Quedaste a <b>${formatearKm(d)}</b>.</p>${extra}<p>${etiquetaDeEstacion(s)} — ${textoDeComunas(s)}.</p>`,
        { partial: !ok && d <= tolerancia * 2 },
      )
    })
  },
})

// Las alternativas que confunden: las vecinas de la misma línea y las estaciones más cercanas.
function estacionesParecidas(estacion) {
  const linea = LINEAS_DE_METRO[estacion.lines.find(id => lineasElegidas().includes(id)) || estacion.lines[0]]
  const posicion = linea.stations.indexOf(estacion.name)
  const mismaLinea = [posicion - 1, posicion + 1, posicion - 2, posicion + 2]
    .map(indice => linea.stations[indice])
    .filter(Boolean)
  const masCercano = masCercanosSegun(
    conjuntoDeMetro(),
    [estacion.lat, estacion.lon],
    x => [x.lat, x.lon],
    6,
    x => x === estacion,
  ).map(x => x.name)
  return [...new Set(mezclar(mismaLinea.slice(0, 3)).concat(masCercano))].filter(
    nombre => nombre !== estacion.name,
  )
}

registrarModo({
  id: 'mt-name',
  aids: true,
  group: 'Metro',
  name: '¿Cuál es esta estación?',
  desc: 'Incluye todas las líneas',
  pool: conjuntoDeMetro,
  key: s => s.name,
  ask(s, q) {
    mostrarPanel(encabezadoDePregunta(q) + `<div class="q-prompt">¿Qué estación está marcada?</div>`)
    mostrarAyudas({ borders: comunasDelAlcance() })
    L.marker([s.lat, s.lon], { icon: iconoDiv('pulse', '', 22), pane: 'points' }).addTo(capa)
    const opciones = mezclar([s.name, ...estacionesParecidas(s).slice(0, 3)]).map(nombre => ({
      label: escaparHtml(nombre),
      value: nombre,
    }))
    mostrarOpciones(opciones, s.name, elegida => {
      const porNombre = Object.fromEntries(estaciones.map(x => [x.name, x]))
      for (const opcion of opciones) {
        const estacion = porNombre[opcion.value]
        L.tooltip({
          permanent: true,
          direction: 'right',
          offset: [8, 0],
          className: 'lbl' + (estacion === s ? ' big' : ''),
        })
          .setLatLng([estacion.lat, estacion.lon])
          .setContent(escaparHtml(estacion.name))
          .addTo(capa)
      }
      responder(elegida === s.name, `<p>${etiquetaDeEstacion(s)} — ${textoDeComunas(s)}.</p>`)
      encuadrar(
        L.latLngBounds(
          opciones.map(opcion => [porNombre[opcion.value].lat, porNombre[opcion.value].lon]),
        ).pad(0.3),
        15,
      )
    })
    // El panel ya tiene las alternativas: el encuadre cuenta con su tamaño final.
    encuadrar(L.latLng(s.lat, s.lon).toBounds(3500), 14)
  },
})
