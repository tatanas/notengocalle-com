import { bests, resetProgress, stats } from '../core/progress.js'
import { saveSettings, settings } from '../core/store.js'
import { $, escapeHtml, formatTime } from '../core/util.js'
import { CATEGORIES, CHILE, DATA, LINE_IDS, METRO_LINES, PARKS, quizStreets } from '../data/dataset.js'
import { selectedLines } from '../domain/metro.js'
import { clearLayer, setChile, setRelief } from '../map/map.js'
import { hasOfficialRound, startQuiz, stopQuiz } from '../quiz/engine.js'
import { MODES, modeById } from '../quiz/registry.js'
import { renderMyStreets } from './myStreets.js'
import { defineScreen, navigate } from './navigation.js'
import { APP_NAME, hidePanel, screenView, showScreen, title } from './panel.js'

const GROUPS = [
  {
    name: 'Comunas',
    emoji: '🗺️',
    blurb: 'Ubica las comunas del Gran Santiago y aprende con cuáles limita cada una.',
  },
  {
    name: 'Landmarks',
    emoji: '📍',
    blurb: `${DATA.landmarks.length} lugares: estadios, parques, malls, universidades, colegios, barrios, restaurantes y las estaciones de metro.`,
  },
  {
    name: 'Calles',
    emoji: '🛣️',
    blurb: `${quizStreets().length} avenidas, autopistas y carreteras, más ríos y canales. Las que cambian de nombre muestran sus tramos.`,
  },
  {
    name: 'Ruteo',
    emoji: '🧭',
    blurb: `Arma rutas paso a paso: ${(DATA.steps || []).length} en auto entre dos puntos cualquiera y ${(DATA.transit || []).length} en micro y metro. En Explorar puedes ver los recorridos de micro más importantes.`,
  },
  {
    name: 'Chile',
    emoji: '🇨🇱',
    blurb: `Las 16 regiones y ${CHILE.cities.length} ciudades (con su población).`,
  },
  {
    name: 'Parques nacionales',
    emoji: '🌲',
    blurb: `Los ${PARKS.length} parques nacionales: en qué región están y cómo se ven.`,
  },
  {
    name: 'Conexiones',
    emoji: '🔗',
    blurb:
      'Relaciona todo: cruces, calles de cada comuna, metro más cercano, comunas vecinas, puntos cardinales…',
  },
]

// Con ?retirados aparecen grupos que el menú normal no conoce.
const retiredGroups = () =>
  [...new Set(MODES.map(mode => mode.group))]
    .filter(name => !GROUPS.some(group => group.name === name))
    .map(name => ({ name, emoji: '🗄️', blurb: 'Juegos retirados del menú.' }))

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`

const chip = (label, checked, attributes, style = '') =>
  `<label class="chip ${checked ? 'on' : ''}" style="${style}"><input type="checkbox" ${attributes} ${checked ? 'checked' : ''}>${label}</label>`

// "Dominado" = acertado al menos dos veces seguidas.
function mastery(mode) {
  if (mode.study) return ''
  const items = mode.pool()
  if (!items.length) return ''
  const seen = items.map(item => stats[mode.id + ':' + mode.key(item)]).filter(Boolean)
  if (!seen.length) return 'nuevo'
  const mastered = seen.filter(entry => entry.streak >= 2).length
  return `${Math.round((mastered / items.length) * 100)}% dominado`
}

function modeRow(mode) {
  const official = hasOfficialRound(mode)
    ? `<button class="official" data-official="${mode.id}" title="Ronda oficial: cuenta para el ranking" aria-label="Ronda oficial de ${escapeHtml(mode.name)}">🏆</button>`
    : ''
  return `<div class="mode-row">
    <button class="mode" data-mode="${mode.id}">
      <span><b>${escapeHtml(mode.name)}</b><br><small>${escapeHtml(mode.desc)}</small></span>
      <span class="mastery">${mastery(mode)}</span>
    </button>${official}
  </div>`
}

function metroLineChips() {
  const chips = LINE_IDS.map(id => {
    const on = selectedLines().includes(id)
    const color = METRO_LINES[id].color
    return chip(id, on, `data-line="${id}"`, on ? `background:${color};border-color:${color};color:#fff` : '')
  })
  return `<div class="chips" id="setLines" style="margin-bottom:10px">${chips.join('')}
    <span class="muted" style="font-size:12px;align-self:center">← líneas de metro incluidas (categoría Metro)</span></div>`
}

// Los juegos paso a paso van primero dentro de su grupo.
const stepsFirst = (a, b) => (b.id.startsWith('rs-') ? 1 : 0) - (a.id.startsWith('rs-') ? 1 : 0)

function groupCard(group) {
  const modes = MODES.filter(mode => mode.group === group.name).sort(stepsFirst)
  return `<div class="card">
    <h3><span class="em">${group.emoji}</span>${group.name}</h3><p>${group.blurb}</p>
    ${group.name === 'Landmarks' ? metroLineChips() : ''}
    <div class="modes">${modes.map(modeRow).join('')}</div>
  </div>`
}

function settingsCard() {
  const selected = settings.cats || CATEGORIES
  const categoryChips = CATEGORIES.map(category =>
    chip(escapeHtml(category), selected.includes(category), `data-cat="${escapeHtml(category)}"`),
  )
  return `<div class="card"><h3><span class="em">⚙️</span>Ajustes</h3>
    <label for="setScope">Comunas incluidas</label>
    <select id="setScope">
      <option value="core">Gran Santiago (34 comunas)</option>
      <option value="peri">Gran Santiago + periferia (Colina, Lampa, Padre Hurtado, Pirque, Buin…)</option>
      <option value="all">Toda la Región Metropolitana (52)</option>
    </select>
    <label for="setLen">Preguntas por ronda</label>
    <select id="setLen"><option>10</option><option>15</option><option>20</option><option>30</option><option value="999">Todas</option></select>
    <label>Categorías de landmarks</label>
    <div class="chips" id="setCats">${categoryChips.join('')}</div>
    <div style="margin-top:10px">${chip('Modo estricto en landmarks (800 m en vez de 1,5 km)', settings.strict, 'id="setStrict"')}</div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">Los ajustes valen para las rondas de práctica; las rondas oficiales 🏆 usan reglas fijas.</p>
  </div>`
}

function bestRound(modeId) {
  const keys = Object.keys(bests).filter(key => key.startsWith(modeId + ':'))
  if (!keys.length) return '—'
  const latest = keys.sort((a, b) => bests[b].d - bests[a].d)[0]
  const total = latest.split(':').pop()
  return `${bests[latest].ok}/${total} · ${formatTime(bests[latest].ms)}`
}

function progressHtml() {
  const rows = MODES.map(mode => {
    const entries = Object.keys(stats)
      .filter(key => key.startsWith(mode.id + ':'))
      .map(key => stats[key])
    return {
      mode,
      answers: entries.reduce((sum, entry) => sum + entry.n, 0),
      correct: entries.reduce((sum, entry) => sum + entry.ok, 0),
    }
  }).filter(row => row.answers)
  if (!rows.length) return '<p class="muted">Todavía no juegas. ¡Parte por “¿Qué comuna es?”!</p>'

  const weakest = Object.entries(stats)
    .filter(([, entry]) => entry.n >= 2 && entry.ok / entry.n < 0.6)
    .sort(([, a], [, b]) => a.ok / a.n - b.ok / b.n)
    .slice(0, 10)
    .map(([key]) => escapeHtml(key.split(':').slice(1).join(':')))
  const tableRows = rows.map(
    ({ mode, answers, correct }) =>
      `<tr><td>${escapeHtml(mode.name)}</td><td>${answers}</td><td>${Math.round((correct / answers) * 100)}%</td><td>${bestRound(mode.id)}</td></tr>`,
  )
  return `<table class="stats"><tr><th>Modo</th><th>Respuestas</th><th>Acierto</th><th>Mejor ronda</th></tr>${tableRows.join('')}</table>
    ${weakest.length ? `<p class="muted" style="margin:10px 0 4px">Tus puntos débiles:</p><p style="margin:0;font-size:13.5px">${weakest.join(' · ')}</p>` : ''}`
}

const creditsHtml = () =>
  `<p class="foot">Mapas y datos: © ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')} (ODbL),
    mapa base © ${link('https://openfreemap.org', 'OpenFreeMap')} / OpenMapTiles, rutas: ${link('https://project-osrm.org', 'OSRM')},
    recorridos: Red (DTPM), relieve: AWS Terrain Tiles, fotos: autores indicados en cada foto vía
    ${link('https://commons.wikimedia.org', 'Wikimedia Commons')} y ${link('https://panoramax.fr', 'Panoramax')}.
    Datos generados el ${escapeHtml(DATA.built)}.</p>`

const homeHtml = () => `<div class="wrap">
  <div class="hero"><h2>¿Dónde queda eso? 🏔️</h2>
    <p>Practica comunas, lugares, calles, rutas y metro de Santiago. Lo que fallas te lo pregunta más seguido.</p></div>
  <div class="grid">
    <div class="card"><h3><span class="em">🔎</span>Explorar</h3>
      <p>Mapa interactivo con comunas, metro, calles y lugares. Para estudiar antes de jugar.</p>
      <button class="btn wide" id="goExplore">Abrir mapa</button></div>
    <div class="card"><h3><span class="em">🏆</span>Ranking</h3>
      <p>Cada juego tiene una ronda oficial (el botón 🏆) con las mismas reglas para todos. Compara tus aciertos y tu tiempo con el resto.</p>
      <button class="btn wide" id="goRanking">Ver ranking</button></div>
    ${[...GROUPS, ...retiredGroups()].map(groupCard).join('')}
  </div>
  <div class="grid settings">
    ${settingsCard()}
    <div class="card"><h3><span class="em">➕</span>Mis calles</h3>
      <p>Agrega calles que te importan a ti (la de tu casa, la de un amigo). Aparecen en los juegos de calles y se guardan solo en este navegador.</p>
      <div id="myst"></div></div>
    <div class="card"><h3><span class="em">📊</span>Tu progreso</h3>${progressHtml()}
      <div class="row" style="margin-top:10px"><button class="btn sec small" id="resetStats">Borrar progreso</button></div></div>
  </div>
  ${creditsHtml()}
</div>`

const checkedValues = (container, attribute) =>
  [...container.querySelectorAll('input:checked')].map(input => input.dataset[attribute])

function wireSettings() {
  const lines = $('#setLines')
  for (const input of lines.querySelectorAll('input'))
    input.onchange = () => {
      const selected = checkedValues(lines, 'line')
      settings.lines = !selected.length || selected.length === LINE_IDS.length ? null : selected
      saveSettings()
      openHome()
    }

  const scope = $('#setScope')
  scope.value = settings.scope
  scope.onchange = () => {
    settings.scope = scope.value
    saveSettings()
    openHome()
  }

  const length = $('#setLen')
  length.value = String(settings.len)
  length.onchange = () => {
    settings.len = +length.value
    saveSettings()
  }

  const categories = $('#setCats')
  for (const input of categories.querySelectorAll('input'))
    input.onchange = () => {
      input.parentElement.classList.toggle('on', input.checked)
      const selected = checkedValues(categories, 'cat')
      settings.cats = selected.length === CATEGORIES.length ? null : selected
      saveSettings()
    }

  $('#setStrict').onchange = event => {
    settings.strict = event.target.checked
    event.target.parentElement.classList.toggle('on', event.target.checked)
    saveSettings()
  }

  $('#resetStats').onclick = () => {
    if (!confirm('¿Borrar todo tu progreso?')) return
    resetProgress()
    openHome()
  }
}

function openHome() {
  stopQuiz()
  clearLayer()
  hidePanel()
  setRelief(false)
  setChile(false)
  title.textContent = APP_NAME
  showScreen(homeHtml())

  $('#goExplore').onclick = () => navigate('explore')
  $('#goRanking').onclick = () => navigate('ranking')
  for (const button of screenView.querySelectorAll('[data-mode]'))
    button.onclick = () => startQuiz(modeById(button.dataset.mode))
  for (const button of screenView.querySelectorAll('[data-official]'))
    button.onclick = () => startQuiz(modeById(button.dataset.official), { ranked: true })
  renderMyStreets($('#myst'))
  wireSettings()
}

defineScreen('home', openHome)
