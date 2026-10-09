import { $ } from '../core/util.js'

// El panel flota sobre el mapa (preguntas, Explorar); la pantalla lo tapa entero (menú, ranking).
export const panel = $('#panel')
export const screenView = $('#screen')
export const hud = $('#hud')
export const title = $('#title')

export const APP_NAME = 'NoTengoCalle.com'

export function showPanel(html) {
  panel.innerHTML = html
  panel.classList.remove('hidden')
  panel.scrollTop = 0
}

export function hidePanel() {
  panel.classList.add('hidden')
}

export function showScreen(html) {
  screenView.innerHTML = html
  screenView.classList.remove('hidden')
  screenView.scrollTop = 0
}

export function hideScreen() {
  screenView.classList.add('hidden')
}

let toastTimer = null

export function toast(message) {
  let box = $('.toast')
  if (!box) {
    box = document.createElement('div')
    box.className = 'toast'
    document.body.appendChild(box)
  }
  box.textContent = message
  box.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => box.classList.remove('show'), 1600)
}
