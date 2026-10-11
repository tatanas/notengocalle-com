import { distanceKm, nearestBy } from '../../core/geo.js'
import { escapeHtml, formatKm, shuffle } from '../../core/util.js'
import { METRO_LINES, scopeComunas, stations } from '../../data/dataset.js'
import { comunasText, metroPool, selectedLines, stationLabel } from '../../domain/metro.js'
import { showAids } from '../../map/aids.js'
import { divIcon, drawMetro } from '../../map/draw.js'
import { fingertipKm, fit, fitCity, layer, map, setLabelMode } from '../../map/map.js'
import { showPanel } from '../../ui/panel.js'
import { answer, questionHeader } from '../engine.js'
import { renderOptions } from '../options.js'
import { registerMode } from '../registry.js'

const pulse = station =>
  L.marker([station.lat, station.lon], { icon: divIcon('pulse', '', 22), pane: 'points' }).bindTooltip(
    escapeHtml(station.name),
    { permanent: true, direction: 'top', offset: [0, -12] },
  )

// Las estaciones son puntos que no se ven en el mapa: el margen es el ancho de un dedo, entre 300 y 500 m.
const MIN_TAP_KM = 0.3
const MAX_TAP_KM = 0.5
// Si otra estación queda más cerca del toque que la pedida por más de esto, se tocó esa otra.
const CLOSER_OTHER_KM = 0.05

registerMode({
  id: 'mt-find',
  aids: true,
  group: 'Metro',
  name: 'Encuentra la estación',
  desc: 'Toca dónde está la estación que te pido. No se dibujan las estaciones, y en las rondas oficiales tampoco las líneas.',
  pool: metroPool,
  key: s => s.name,
  ask(s, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">Toca dónde está la estación <b>${escapeHtml(s.name)}</b></div>`,
    )
    showAids({ borders: scopeComunas() })
    if (q.i === 0) fitCity()
    map.on('click', e => {
      if (q.answered) return
      const you = [e.latlng.lat, e.latlng.lng]
      const d = distanceKm(you, [s.lat, s.lon])
      const nearest = nearestBy(
        stations,
        you,
        x => [x.lat, x.lon],
        1,
        () => false,
      )[0]
      const tolerance = Math.min(MAX_TAP_KM, Math.max(MIN_TAP_KM, fingertipKm(e.latlng)))
      const closerOther = nearest !== s && distanceKm(you, [nearest.lat, nearest.lon]) < d - CLOSER_OTHER_KM
      const ok = d <= tolerance && !closerOther
      drawMetro(layer, { ids: s.lines })
      L.marker(you, { icon: divIcon('pin you'), pane: 'points' }).addTo(layer)
      pulse(s).addTo(layer)
      L.polyline([you, [s.lat, s.lon]], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(layer)
      setLabelMode('labels')
      const extra =
        !ok && closerOther
          ? `<p>Tocaste más cerca de la estación <b>${escapeHtml(nearest.name)}</b>.</p>`
          : ''
      answer(
        ok,
        `<p>Quedaste a <b>${formatKm(d)}</b>.</p>${extra}<p>${stationLabel(s)} — ${comunasText(s)}.</p>`,
        { partial: !ok && d <= tolerance * 2 },
      )
    })
  },
})

// Las alternativas que confunden: las vecinas de la misma línea y las estaciones más cercanas.
function lookalikeStations(station) {
  const line = METRO_LINES[station.lines.find(id => selectedLines().includes(id)) || station.lines[0]]
  const position = line.stations.indexOf(station.name)
  const sameLine = [position - 1, position + 1, position - 2, position + 2]
    .map(index => line.stations[index])
    .filter(Boolean)
  const nearest = nearestBy(
    metroPool(),
    [station.lat, station.lon],
    x => [x.lat, x.lon],
    6,
    x => x === station,
  ).map(x => x.name)
  return [...new Set(shuffle(sameLine.slice(0, 3)).concat(nearest))].filter(name => name !== station.name)
}

registerMode({
  id: 'mt-name',
  aids: true,
  group: 'Metro',
  name: '¿Cuál es esta estación?',
  desc: 'Te marco una estación en el mapa; eliges cuál es entre las alternativas.',
  pool: metroPool,
  key: s => s.name,
  ask(s, q) {
    showPanel(questionHeader(q) + `<div class="q-prompt">¿Qué estación está marcada?</div>`)
    showAids({ borders: scopeComunas() })
    L.marker([s.lat, s.lon], { icon: divIcon('pulse', '', 22), pane: 'points' }).addTo(layer)
    const options = shuffle([s.name, ...lookalikeStations(s).slice(0, 3)]).map(name => ({
      label: escapeHtml(name),
      value: name,
    }))
    renderOptions(options, s.name, picked => {
      const byName = Object.fromEntries(stations.map(x => [x.name, x]))
      for (const option of options) {
        const station = byName[option.value]
        L.tooltip({
          permanent: true,
          direction: 'right',
          offset: [8, 0],
          className: 'lbl' + (station === s ? ' big' : ''),
        })
          .setLatLng([station.lat, station.lon])
          .setContent(escapeHtml(station.name))
          .addTo(layer)
      }
      answer(picked === s.name, `<p>${stationLabel(s)} — ${comunasText(s)}.</p>`)
      fit(
        L.latLngBounds(options.map(option => [byName[option.value].lat, byName[option.value].lon])).pad(0.3),
        15,
      )
    })
    // El panel ya tiene las alternativas: el encuadre cuenta con su tamaño final.
    fit(L.latLng(s.lat, s.lon).toBounds(3500), 14)
  },
})
