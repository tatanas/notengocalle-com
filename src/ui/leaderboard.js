import { fetchLeaderboard, fetchLeaders } from '../account/scores.js'
import { accountsAvailable, user } from '../account/session.js'
import { store } from '../core/store.js'
import { $, escapeHtml, formatTime } from '../core/util.js'
import { clearLayer } from '../map/map.js'
import { hasOfficialRound, startQuiz, stopQuiz } from '../quiz/engine.js'
import { MODES, modeById } from '../quiz/registry.js'
import { openAccountDialog } from './account.js'
import { defineScreen, navigate } from './navigation.js'
import { hidePanel, showScreen, title } from './panel.js'

const PERIOD_LABELS = { all: 'Histórico', week: 'Últimos 7 días' }
const ALL_GAMES = ''

// Qué tabla se está mirando: un juego o el resumen de líderes.
const view = { mode: ALL_GAMES, period: 'all', ...store.get('ranking', {}) }

const rankedModes = () => MODES.filter(hasOfficialRound)
const groupsOf = modes => [...new Set(modes.map(mode => mode.group))]
const score = entry => `${entry.correct}/${entry.total}`
const shortDate = iso => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
const isMe = entry => !!user && entry.name === user.name

function modeSelectHtml() {
  const modes = rankedModes()
  const groups = groupsOf(modes).map(group => {
    const options = modes
      .filter(mode => mode.group === group)
      .map(
        mode =>
          `<option value="${mode.id}" ${mode.id === view.mode ? 'selected' : ''}>${escapeHtml(mode.name)}</option>`,
      )
    return `<optgroup label="${escapeHtml(group)}">${options.join('')}</optgroup>`
  })
  return `<select id="rankMode" aria-label="Juego"><option value="${ALL_GAMES}">Líderes de cada juego</option>${groups.join('')}</select>`
}

const periodChipsHtml = () =>
  Object.entries(PERIOD_LABELS)
    .map(
      ([period, label]) =>
        `<button class="chip ${period === view.period ? 'on' : ''}" data-period="${period}">${label}</button>`,
    )
    .join('')

const boardRow = entry =>
  `<tr class="${isMe(entry) ? 'me' : ''}"><td>${entry.rank}</td><td>${escapeHtml(entry.name)}</td><td>${score(entry)}</td><td>${formatTime(entry.ms)}</td><td class="muted">${shortDate(entry.at)}</td></tr>`

function boardHtml({ rows, players, me }) {
  if (!rows.length)
    return '<p class="muted">Nadie ha jugado esta ronda oficial en este período. ¡Puedes ser el primero!</p>'
  const outsideTop =
    me && !rows.some(isMe)
      ? `<tr><td colspan="5" class="muted">…</td></tr>${boardRow({ ...me, name: user.name })}`
      : ''
  return `<table class="stats board"><tr><th>#</th><th>Jugador</th><th>Aciertos</th><th>Tiempo</th><th>Fecha</th></tr>
    ${rows.map(boardRow).join('')}${outsideTop}</table>
    <p class="muted" style="font-size:12.5px">${players} ${players === 1 ? 'jugador' : 'jugadores'}. Cuenta la mejor ronda de cada uno.</p>`
}

function leadersHtml({ modes }) {
  const rows = rankedModes().map(mode => {
    const entry = modes[mode.id]
    const leader = entry
      ? `<td>${escapeHtml(entry.leader.name)}</td><td>${score(entry.leader)} · ${formatTime(entry.leader.ms)}</td>`
      : '<td class="muted" colspan="2">sin marcas todavía</td>'
    const mine = entry?.me ? `${entry.me.rank}.º de ${entry.players}` : '—'
    return `<tr data-open="${mode.id}"><td><b>${escapeHtml(mode.name)}</b><br><small class="muted">${escapeHtml(mode.group)}</small></td>${leader}<td>${mine}</td></tr>`
  })
  return `<table class="stats board clickable"><tr><th>Juego</th><th>Líder</th><th>Marca</th><th>Tu puesto</th></tr>${rows.join('')}</table>`
}

function footerHtml() {
  const play = view.mode ? '<button class="btn" id="rankPlay">🏆 Jugar la ronda oficial</button>' : ''
  const signIn = user ? '' : '<button class="btn sec" id="rankSignIn">Entrar o crear cuenta</button>'
  const guestNote = user
    ? ''
    : '<p class="muted" style="font-size:12.5px">Puedes jugar sin cuenta, pero solo los puntajes con cuenta aparecen aquí.</p>'
  return `<div class="row" style="margin-top:12px">${play}${signIn}</div>${guestNote}`
}

async function loadBoard() {
  const body = $('#rankBody')
  const requested = { ...view }
  body.innerHTML = '<p class="muted">Cargando…</p>'
  let html
  try {
    html = view.mode
      ? boardHtml(await fetchLeaderboard(view.mode, view.period))
      : leadersHtml(await fetchLeaders(view.period))
  } catch (error) {
    html = `<p class="muted">No se pudo cargar el ranking: ${escapeHtml(error.message)}.</p>`
  }
  const stillCurrent = body.isConnected && requested.mode === view.mode && requested.period === view.period
  if (!stillCurrent) return
  body.innerHTML = html + footerHtml()

  for (const row of body.querySelectorAll('[data-open]'))
    row.onclick = () => select({ mode: row.dataset.open })
  if ($('#rankPlay')) $('#rankPlay').onclick = () => startQuiz(modeById(view.mode), { ranked: true })
  if ($('#rankSignIn')) $('#rankSignIn').onclick = () => openAccountDialog().then(loadBoard)
}

function select(change) {
  Object.assign(view, change)
  store.set('ranking', view)
  render()
}

function render() {
  showScreen(`<div class="wrap narrow">
    <button class="btn sec small" id="rankBack">← Menú</button>
    <div class="hero"><h2>🏆 Ranking</h2>
      <p>Solo cuentan las rondas oficiales. Gana quien acierta más; si hay empate, quien pensó menos tiempo.</p></div>
    <div class="card">
      <div class="row">${modeSelectHtml()}<div class="chips">${periodChipsHtml()}</div></div>
      <div id="rankBody" style="margin-top:12px"></div>
    </div>
  </div>`)
  $('#rankBack').onclick = () => navigate('home')
  $('#rankMode').onchange = event => select({ mode: event.target.value })
  for (const chip of document.querySelectorAll('[data-period]'))
    chip.onclick = () => select({ period: chip.dataset.period })

  if (accountsAvailable) loadBoard()
  else $('#rankBody').innerHTML = '<p class="muted">El ranking no está disponible en este momento.</p>'
}

function openRanking(modeId) {
  stopQuiz()
  clearLayer()
  hidePanel()
  title.textContent = 'Ranking'
  if (modeId !== undefined) view.mode = modeId
  if (view.mode && !rankedModes().some(mode => mode.id === view.mode)) view.mode = ALL_GAMES
  render()
}

defineScreen('ranking', openRanking)
