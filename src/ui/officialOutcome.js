import { deliveryOf, flushOutbox, submitOfficialRound } from '../account/scores.js'
import { $, formatTime } from '../core/util.js'
import { openAccountDialog } from './account.js'
import { navigate } from './navigation.js'

const categoryText = category => (category === 'all' ? 'todas las preguntas' : `${category} preguntas`)

function savedHtml({ category, rank, players, improved, best }) {
  const standing = `🏆 <b>Puesto ${rank}</b> de ${players} en el ranking de este juego con ${categoryText(category)}.`
  const personal = improved
    ? 'Es tu mejor ronda oficial de este largo.'
    : `Tu mejor ronda oficial de este largo sigue siendo ${best.correct}/${best.total} en ${formatTime(best.ms)}.`
  return `<p class="tight">${standing}</p><p class="muted tight">${personal}</p>
    <button class="btn sec small" id="outcomeRanking" style="margin-top:6px">Ver ranking</button>`
}

const GUEST_HTML = `<p class="tight">Jugaste sin cuenta, así que este puntaje todavía no está en el ranking.</p>
  <button class="btn small" id="outcomeLogin" style="margin-top:6px">Entrar o crear cuenta</button>`

const MESSAGES = {
  offline:
    'Sin conexión: el puntaje quedó guardado en este dispositivo y se sube solo cuando vuelvas a abrir el juego con internet.',
  unavailable: 'El ranking no está disponible en este momento.',
}

// Muestra, al terminar una ronda oficial, en qué quedó ese puntaje en el ranking.
export async function showOfficialOutcome(result, box) {
  box.innerHTML = '<p class="muted tight">Guardando en el ranking…</p>'
  render(result, box, await submitOfficialRound(result))
}

function render(result, box, outcome) {
  if (!box.isConnected) return
  if (outcome.status === 'saved') {
    box.innerHTML = savedHtml(outcome)
    $('#outcomeRanking').onclick = () => navigate('ranking', result.mode, outcome.category)
  } else if (outcome.status === 'guest') {
    box.innerHTML = GUEST_HTML
    $('#outcomeLogin').onclick = async () => {
      if (!(await openAccountDialog())) return
      await flushOutbox()
      const saved = deliveryOf(result)
      if (saved) render(result, box, { status: 'saved', ...saved })
    }
  } else {
    box.innerHTML = `<p class="muted tight">${outcome.message || MESSAGES[outcome.status]}</p>`
  }
}
