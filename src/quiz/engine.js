import { OFFICIAL_RULES, RANKED_MODES, categoryOf } from '../../shared/ranked.js'
import { adaptiveWeight, bests, record, saveBest, weightedSample } from '../core/progress.js'
import { applyRoundRules, lengthFor, saveSettings, settings } from '../core/store.js'
import { $, escapeHtml, formatTime } from '../core/util.js'
import { clearAids, redrawAids } from '../map/aids.js'
import {
  clearLayer,
  forgetViewAdjustments,
  labelMode,
  map,
  setChile,
  setLabelMode,
  setRelief,
  setRoomyPanning,
  watchViewAdjustments,
} from '../map/map.js'
import { confirmAction } from '../ui/confirm.js'
import { guardLeaving, navigate } from '../ui/navigation.js'
import { showOfficialOutcome } from '../ui/officialOutcome.js'
import { hideScreen, hud, panel, showPanel, title, toast } from '../ui/panel.js'

/* Un modo define: id, group, name, desc, pool(), key(item) y ask(item, quiz).
   Opcionales: label(item), balance(item), setup(quiz), all, keepLayer, noHint, aids, relief, chile, roomy, tall, study.
   noHint: sin el botón "Ver nombres". aids: ofrece el modo fácil / difícil (bordes de comunas y metro). */

export let quiz = null
let hudTimer = null

const statKey = (mode, item) => mode.id + ':' + mode.key(item)

export const hasOfficialRound = mode => RANKED_MODES.includes(mode.id)

const COUNTDOWN_SECONDS = 3
let countdownTimer = null

// Las rondas oficiales empiezan con una cuenta regresiva en la que se puede mover el mapa; el reloj de la ronda
// parte después, con la primera pregunta.
function runCountdown(modeName, onDone) {
  const box = $('#countdown')
  let remaining = COUNTDOWN_SECONDS
  const render = () => {
    box.innerHTML = `<p class="countdown-label">🏆 Ronda oficial · ${escapeHtml(modeName)}</p>
      <p class="countdown-number">${remaining}</p>
      <p class="countdown-hint">¡Prepárate! Puedes mover el mapa para acomodarlo.</p>`
  }
  box.hidden = false
  render()
  countdownTimer = setInterval(() => {
    remaining--
    if (remaining > 0) return render()
    stopCountdown()
    onDone()
  }, 1000)
}

function stopCountdown() {
  clearInterval(countdownTimer)
  countdownTimer = null
  $('#countdown').hidden = true
}

const SHOW_NAMES = '👁 Ver nombres'
const HIDE_NAMES = '🙈 Ocultar nombres'

// Mostrar los nombres del mapa es una pista: esa respuesta deja de sumar.
const HintControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
    this.button = L.DomUtil.create('button', 'maptoggle')
    this.button.type = 'button'
    this.button.textContent = SHOW_NAMES
    L.DomEvent.disableClickPropagation(this.button)
    this.button.onclick = () => {
      if (!quiz) return
      const reveal = labelMode === 'plain'
      setLabelMode(reveal ? 'labels' : 'plain')
      this.button.textContent = reveal ? HIDE_NAMES : SHOW_NAMES
      if (reveal && !quiz.answered) quiz.hinted = true
    }
    return this.button
  },
  reset() {
    if (this.button) this.button.textContent = SHOW_NAMES
  },
})
const hintControl = new HintControl()

// Un solo botón para todas las ayudas de la práctica: fácil las dibuja, difícil no. En una ronda oficial no hay botón.
const AidsControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
    this.button = L.DomUtil.create('button', 'maptoggle')
    this.button.type = 'button'
    L.DomEvent.disableClickPropagation(this.button)
    this.button.onclick = () => {
      settings.easy = !settings.easy
      saveSettings()
      redrawAids()
      this.refresh()
    }
    this.refresh()
    return this.button
  },
  refresh() {
    if (!this.button) return
    this.button.textContent = settings.easy ? '🟢 Modo fácil' : '🔴 Modo difícil'
    this.button.title = settings.easy
      ? 'Fácil: se ven los bordes de las comunas y las líneas del metro. Toca para pasar a difícil.'
      : 'Difícil: sin bordes de comunas ni líneas del metro. Toca para pasar a fácil.'
  },
})
const aidsControl = new AidsControl()

const restartButton = $('#btnRestart')

function updateHud() {
  if (!quiz || quiz.mode.study) return
  const answered = quiz.i + (quiz.answered ? 1 : 0)
  const elapsed = quiz.ms + (quiz.t0 && !quiz.answered ? Date.now() - quiz.t0 : 0)
  hud.textContent = `${quiz.ok}/${answered} ✓ · ⏱ ${formatTime(elapsed)}`
}

// category: solo para empezar una ronda oficial de un largo concreto (desde el ranking); si no, se usa el largo
// que la persona tiene elegido en sus ajustes.
export function startQuiz(mode, { ranked = false, category = null } = {}) {
  stopQuiz()
  applyRoundRules(ranked ? OFFICIAL_RULES : null)
  const pool = mode.pool()
  const wanted = category ? (category === 'all' ? pool.length : +category) : lengthFor(mode.group)
  const size = mode.all ? pool.length : Math.min(wanted, pool.length)
  if (!pool.length) {
    applyRoundRules(null)
    toast('No hay elementos con estos filtros')
    return
  }
  quiz = {
    mode,
    ranked,
    category: ranked ? categoryOf(size, pool.length) : null,
    items: weightedSample(pool, size, {
      weightOf: ranked ? undefined : item => adaptiveWeight(statKey(mode, item)),
      groupOf: mode.balance,
    }),
    i: 0,
    ok: 0,
    pts: 0,
    ms: 0,
    t0: 0,
    misses: [],
    answered: false,
    hinted: false,
  }
  hideScreen()
  title.textContent = mode.name
  setLabelMode('plain')
  if (!ranked && mode.aids) aidsControl.addTo(map)
  aidsControl.refresh()
  if (!ranked && !mode.noHint && !mode.study) hintControl.addTo(map)
  hintControl.reset()
  setRelief(!!mode.relief)
  setChile(!!mode.chile)
  setRoomyPanning(!!mode.roomy)
  if (!ranked) {
    prepareRound()
    return beginRound()
  }
  quiz.starting = true
  clearLayer()
  clearAids()
  showPanel(`<div class="progress"><i style="width:0%"></i></div>
    <div class="q-sub" style="margin:0 0 6px">🏆 Ronda oficial</div><div class="q-prompt">Prepárate…</div>`)
  watchViewAdjustments(true)
  prepareRound()
  runCountdown(mode.name, () => {
    quiz.starting = false
    beginRound()
  })
}

// Lo que se dibuja antes de la primera pregunta (en las oficiales, durante la cuenta regresiva).
function prepareRound() {
  if (quiz.mode.setup) quiz.mode.setup(quiz)
}

function beginRound() {
  hudTimer = setInterval(updateHud, 500)
  restartButton.hidden = !quiz.ranked
  if (quiz.mode.study) {
    clearLayer()
    setLabelMode('streets')
    quiz.mode.ask(null, quiz)
    return
  }
  nextQuestion({ first: true })
}

export function stopQuiz() {
  quiz = null
  clearInterval(hudTimer)
  stopCountdown()
  applyRoundRules(null)
  map.removeControl(hintControl)
  map.removeControl(aidsControl)
  clearAids()
  forgetViewAdjustments()
  setRoomyPanning(false)
  restartButton.hidden = true
  panel.classList.remove('tall')
  hud.textContent = ''
}

// Para los modos que descubren tarde que un ítem no se puede preguntar (ej. una ruta sin datos).
export function skipQuestion() {
  quiz.items.splice(quiz.i, 1)
  nextQuestion({ first: true })
}

export function nextQuestion({ first = false } = {}) {
  if (!first) quiz.i++
  if (quiz.i >= quiz.items.length) return endQuiz()
  quiz.answered = false
  quiz.hinted = false
  setLabelMode('plain')
  hintControl.reset()
  panel.classList.toggle('tall', !!quiz.mode.tall)
  if (!quiz.mode.keepLayer) {
    clearLayer()
    clearAids()
  }
  quiz.t0 = Date.now()
  updateHud()
  quiz.mode.ask(quiz.items[quiz.i], quiz)
}

export function questionHeader(q) {
  const progress = ((q.i / q.items.length) * 100).toFixed(0)
  return `<div class="progress"><i style="width:${progress}%"></i></div>
    <div class="q-head"><span>Pregunta ${q.i + 1} de ${q.items.length}</span><span>${q.ranked ? '🏆 Ronda oficial' : q.mode.group}</span></div>`
}

function feedbackTitle(ok, partial, hinted) {
  if (ok) return hinted ? '✅ Correcto (con pista, no suma)' : '✅ ¡Correcto!'
  return partial ? '🟡 Cerca' : '❌ No'
}

// Solo corre el reloj mientras se piensa la pregunta: se detiene al responder.
export function answer(ok, feedbackHtml, { points = null, partial = false } = {}) {
  const q = quiz
  if (q.answered) return
  q.ms += Date.now() - q.t0
  q.answered = true
  const item = q.items[q.i]
  const counted = ok && !q.hinted
  record(statKey(q.mode, item), counted)
  if (counted) q.ok++
  else q.misses.push(q.mode.label ? q.mode.label(item) : q.mode.key(item))
  if (points != null) q.pts += points
  updateHud()

  const isLast = q.i + 1 >= q.items.length
  const feedback = document.createElement('div')
  feedback.className = 'fb ' + (ok ? 'ok' : partial ? 'info' : 'bad')
  feedback.innerHTML = `<h4>${feedbackTitle(ok, partial, q.hinted)}</h4>${feedbackHtml || ''}
    <button class="btn next" id="btnNext">${isLast ? 'Ver resultado' : 'Siguiente →'}</button>`
  panel.appendChild(feedback)
  $('#btnNext').onclick = () => nextQuestion()
  setTimeout(() => feedback.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30)
}

function verdict(percent) {
  if (percent >= 90) return '¡Te la sabes! 🏆'
  if (percent >= 70) return 'Muy bien 👏'
  if (percent >= 40) return 'Vas mejorando 💪'
  return 'A seguir practicando 🗺️'
}

function personalBestHtml(total, previous, isBest) {
  if (!isBest)
    return `<p class="muted tight">Tu récord en rondas de ${total}: ${previous.ok}/${total} en ${formatTime(previous.ms)}</p>`
  if (!previous) return `<p class="muted tight">Primera marca en rondas de ${total} preguntas.</p>`
  return `<p class="tight">🏅 <b>¡Nuevo récord!</b> <span class="muted">Antes: ${previous.ok}/${total} en ${formatTime(previous.ms)}</span></p>`
}

function endQuiz() {
  const { mode, ranked, category, ok, ms, pts, misses } = quiz
  const total = quiz.items.length
  stopQuiz()
  clearLayer()
  setLabelMode('plain')
  setRelief(false)

  const bestKey = mode.id + ':' + total
  const previous = bests[bestKey]
  const isBest = !previous || ok > previous.ok || (ok === previous.ok && ms < previous.ms)
  if (isBest) saveBest(bestKey, { ok, ms, d: Date.now() })

  const percent = Math.round((ok / total) * 100)
  const secondsPerQuestion = (ms / total / 1000).toFixed(1).replace('.', ',')
  const closingNote = ranked
    ? 'Las rondas oficiales usan las mismas reglas para todos: Gran Santiago, todas las categorías, sin tus calles propias y sin ayudas.'
    : 'Las preguntas que fallas aparecen más seguido en las próximas rondas.'
  showPanel(`<h3 class="tight">${verdict(percent)}</h3>
    <p class="result-score">${ok} / ${total} <span class="muted">(${percent}%)</span></p>
    <p class="tight">⏱ <b>${formatTime(ms)}</b> <span class="muted">· ${secondsPerQuestion} s por pregunta</span></p>
    ${personalBestHtml(total, previous, isBest)}
    ${pts ? `<p class="muted">Puntaje: ${Math.round(pts)}</p>` : ''}
    ${ranked ? '<div id="officialOutcome" class="outcome"></div>' : ''}
    ${misses.length ? `<p class="muted" style="margin-bottom:4px">Para repasar:</p><p style="margin-top:0">${misses.map(escapeHtml).join(' · ')}</p>` : ''}
    <div class="row" style="margin-top:12px">
      <button class="btn" id="again">Otra ronda</button>
      ${!ranked && hasOfficialRound(mode) ? '<button class="btn sec" id="goOfficial">🏆 Ronda oficial</button>' : ''}
      <button class="btn sec" id="menu">Menú</button>
    </div>
    <p class="muted" style="font-size:12px;margin-top:10px">${closingNote}</p>`)

  $('#again').onclick = () => startQuiz(mode, { ranked, category })
  $('#menu').onclick = () => navigate('home')
  if ($('#goOfficial')) $('#goOfficial').onclick = () => startQuiz(mode, { ranked: true })
  if (ranked) showOfficialOutcome({ mode: mode.id, category, correct: ok, total, ms }, $('#officialOutcome'))
}

// Reiniciar una ronda oficial a medias: otras preguntas, mismo juego y mismo largo, otra vez con cuenta regresiva.
restartButton.onclick = async () => {
  const current = quiz
  if (!current?.ranked || current.starting) return
  const untouched = current.i === 0 && !current.answered
  const confirmed =
    untouched ||
    (await confirmAction({
      title: '¿Reiniciar la ronda?',
      message: 'Empiezas de nuevo, con otras preguntas. Esta ronda no cuenta para el ranking.',
      confirmLabel: 'Reiniciar',
      cancelLabel: 'Seguir jugando',
    }))
  if (confirmed && quiz === current) startQuiz(current.mode, { ranked: true, category: current.category })
}

// Salir a media ronda pierde el avance (y, en una oficial, el puntaje): se pide confirmación.
guardLeaving(() =>
  quiz && !quiz.starting
    ? confirmAction({
        title: '¿Salir de la ronda?',
        message: quiz.ranked
          ? 'Es una ronda oficial: si sales ahora no cuenta para el ranking.'
          : 'Perderás el avance de esta ronda.',
        confirmLabel: 'Salir',
        cancelLabel: 'Seguir jugando',
      })
    : true,
)

window.addEventListener('beforeunload', event => {
  if (quiz && !quiz.starting) event.preventDefault()
})

document.addEventListener('keydown', event => {
  if (!quiz || event.target.tagName === 'INPUT') return
  if (/^[1-9]$/.test(event.key)) {
    const choice = panel.querySelectorAll('.opt')[+event.key - 1]
    if (choice && !choice.disabled) choice.click()
  }
  if (event.key === 'Enter') {
    const next = $('#btnNext') || $('#btnConfirm')
    if (!next || next.disabled) return
    event.preventDefault()
    next.click()
  }
})
