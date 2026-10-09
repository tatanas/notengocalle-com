import { $, escapeHtml } from '../core/util.js'
import { refit } from '../map/map.js'
import { panel } from '../ui/panel.js'
import { quiz } from './engine.js'

// Las alternativas son { label (HTML), value }.
export const option = (value, label) => ({ label: label || escapeHtml(value), value })

function optionButton(choice, index) {
  const button = document.createElement('button')
  button.className = 'opt'
  button.innerHTML = `<span class="k">${index + 1}</span> ${choice.label}`
  return button
}

export function renderOptions(choices, correct, onPick, { one = false } = {}) {
  const box = document.createElement('div')
  box.className = 'opts' + (one ? ' one' : '')
  const buttons = choices.map(optionButton)
  buttons.forEach((button, index) => {
    button.onclick = () => {
      if (quiz.answered) return
      buttons.forEach((other, j) => {
        other.disabled = true
        if (choices[j].value === correct) other.classList.add('ok')
      })
      if (choices[index].value !== correct) button.classList.add('bad')
      onPick(choices[index].value)
    }
    box.appendChild(button)
  })
  panel.appendChild(box)
  refit()
}

export function renderMulti(choices, correct, onDone) {
  const box = document.createElement('div')
  box.className = 'opts one'
  const selected = new Set()
  const buttons = choices.map(optionButton)
  buttons.forEach((button, index) => {
    const { value } = choices[index]
    button.onclick = () => {
      if (quiz.answered) return
      selected.has(value) ? selected.delete(value) : selected.add(value)
      button.classList.toggle('sel')
      $('#btnConfirm').disabled = !selected.size
    }
    box.appendChild(button)
  })
  panel.appendChild(box)

  const confirmRow = document.createElement('div')
  confirmRow.className = 'row end'
  confirmRow.style.marginTop = '10px'
  confirmRow.innerHTML = `<span class="muted" style="font-size:12.5px;margin-right:auto">Puede haber una o varias correctas</span>
    <button class="btn" id="btnConfirm" disabled>Confirmar</button>`
  panel.appendChild(confirmRow)
  refit()

  $('#btnConfirm').onclick = () => {
    if (quiz.answered) return
    buttons.forEach((button, index) => {
      const { value } = choices[index]
      const isCorrect = correct.includes(value)
      button.disabled = true
      button.classList.remove('sel')
      if (isCorrect && selected.has(value)) button.classList.add('ok')
      else if (isCorrect) button.classList.add('miss')
      else if (selected.has(value)) button.classList.add('bad')
    })
    confirmRow.remove()
    onDone([...selected])
  }
}
