import { escapeHtml, shuffle } from '../../core/util.js'
import { comunaByName, comunas, isUrban, labelPoint, quizStreets, streetByName } from '../../data/dataset.js'
import { canBeDescribed, streetClues } from '../../domain/streetClues.js'
import { noteConfusion, streetDistractors } from '../../domain/streets.js'
import { showAids } from '../../map/aids.js'
import { COLORS, drawNamedSegments, drawStreet, mapLabel } from '../../map/draw.js'
import { fit, fitCity, layer, setLabelMode } from '../../map/map.js'
import { showPanel } from '../../ui/panel.js'
import { answer, questionHeader } from '../engine.js'
import { renderOptions } from '../options.js'
import { registerMode } from '../registry.js'

const ALTERNATIVES = 3

// Una alternativa que la descripción ya nombra no puede ser la respuesta: se cambia por otra.
const alternativesWithoutClues = (street, mentioned) =>
  streetDistractors(street, ALTERNATIVES + mentioned.size)
    .filter(other => !mentioned.has(other.name))
    .slice(0, ALTERNATIVES)

registerMode({
  id: 'st-text',
  noHint: true,
  aids: true,
  group: 'Calles',
  name: 'Calle sin mapa',
  desc: 'Te describo una calle con palabras (comunas, cruces, cuáles son sus paralelas); adivinas cuál es sin verla.',
  pool: () => quizStreets().filter(canBeDescribed),
  key: street => street.name,
  ask(street, q) {
    const { clues, mentioned } = streetClues(street)
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Qué calle es?</div><ul class="blist">${clues.map(clue => `<li>${clue}</li>`).join('')}</ul>`,
    )
    showAids({ borders: comunas.filter(isUrban) })
    fitCity()
    const options = shuffle([street, ...alternativesWithoutClues(street, mentioned)]).map(other => ({
      label: escapeHtml(other.name),
      value: other.name,
    }))
    renderOptions(
      options,
      street.name,
      picked => {
        for (const name of street.comunas) {
          const comuna = comunaByName[name]
          if (comuna) mapLabel(labelPoint(comuna), name).addTo(layer)
        }
        setLabelMode('labels')
        noteConfusion(street.name, picked)
        let shown = L.latLngBounds(street.bb).pad(0.25)
        let extra = ''
        if (picked !== street.name) {
          const chosen = streetByName[picked]
          drawStreet(chosen, COLORS.bad, { labelText: chosen.name })
          shown = L.latLngBounds(street.bb).extend(L.latLngBounds(chosen.bb)).pad(0.1)
          extra = `<p>En <span style="color:${COLORS.bad};font-weight:700">rojo</span> la que elegiste (${escapeHtml(chosen.name)}); en <span style="color:${COLORS.ok};font-weight:700">verde</span> la correcta.</p>`
        }
        drawStreet(street, COLORS.ok, { labelText: street.name })
        drawNamedSegments(street)
        answer(
          picked === street.name,
          `${extra}<p><b>${escapeHtml(street.name)}</b></p><p class="muted">${escapeHtml(street.hint)}</p>`,
        )
        fit(shown, 14)
      },
      { one: true },
    )
  },
})
