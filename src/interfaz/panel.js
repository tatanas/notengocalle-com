import { $ } from '../nucleo/utilidades.js'

// El panel flota sobre el mapa (preguntas, Explorar); la pantalla lo tapa entero (menú, ranking).
export const panel = $('#panel')
export const vistaDePantalla = $('#screen')
export const indicador = $('#hud')

export function mostrarPanel(html) {
  panel.innerHTML = html
  panel.classList.remove('hidden')
  panel.scrollTop = 0
}

export function ocultarPanel() {
  panel.classList.add('hidden')
}

export function mostrarPantalla(html) {
  vistaDePantalla.innerHTML = html
  vistaDePantalla.classList.remove('hidden')
  vistaDePantalla.scrollTop = 0
}

export function ocultarPantalla() {
  vistaDePantalla.classList.add('hidden')
}

let temporizadorDeAviso = null

export function aviso(mensaje) {
  let caja = $('.toast')
  if (!caja) {
    caja = document.createElement('div')
    caja.className = 'toast'
    document.body.appendChild(caja)
  }
  caja.textContent = mensaje
  caja.classList.add('show')
  clearTimeout(temporizadorDeAviso)
  temporizadorDeAviso = setTimeout(() => caja.classList.remove('show'), 1600)
}
