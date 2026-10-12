import { $, escaparHtml } from '../nucleo/utilidades.js'
import { panel } from '../interfaz/panel.js'
import { partida } from './engine.js'

// Las alternativas son { label (HTML), value }.
export const opcion = (valor, etiqueta) => ({ label: etiqueta || escaparHtml(valor), value: valor })

function botonDeOpcion(eleccion, indice) {
  const boton = document.createElement('button')
  boton.className = 'opt'
  boton.innerHTML = `<span class="k">${indice + 1}</span> ${eleccion.label}`
  return boton
}

export function mostrarOpciones(alternativas, correctas, alElegir, { one: una = false } = {}) {
  const caja = document.createElement('div')
  caja.className = 'opts' + (una ? ' one' : '')
  const botones = alternativas.map(botonDeOpcion)
  botones.forEach((boton, indice) => {
    boton.onclick = () => {
      if (partida.answered) return
      botones.forEach((otro, j) => {
        otro.disabled = true
        if (alternativas[j].value === correctas) otro.classList.add('ok')
      })
      if (alternativas[indice].value !== correctas) boton.classList.add('bad')
      alElegir(alternativas[indice].value)
    }
    caja.appendChild(boton)
  })
  panel.appendChild(caja)
}

export function mostrarMultiple(alternativas, correctas, alTerminar) {
  const caja = document.createElement('div')
  caja.className = 'opts one'
  const elegidos = new Set()
  const botones = alternativas.map(botonDeOpcion)
  botones.forEach((boton, indice) => {
    const { value: valor } = alternativas[indice]
    boton.onclick = () => {
      if (partida.answered) return
      elegidos.has(valor) ? elegidos.delete(valor) : elegidos.add(valor)
      boton.classList.toggle('sel')
      $('#btnConfirm').disabled = !elegidos.size
    }
    caja.appendChild(boton)
  })
  panel.appendChild(caja)

  const filaDeConfirmar = document.createElement('div')
  filaDeConfirmar.className = 'row end'
  filaDeConfirmar.style.marginTop = '10px'
  filaDeConfirmar.innerHTML = `<span class="muted" style="font-size:12.5px;margin-right:auto">Puede haber una o varias correctas</span>
    <button class="btn" id="btnConfirm" disabled>Confirmar</button>`
  panel.appendChild(filaDeConfirmar)

  $('#btnConfirm').onclick = () => {
    if (partida.answered) return
    botones.forEach((boton, indice) => {
      const { value: valor } = alternativas[indice]
      const esCorrecta = correctas.includes(valor)
      boton.disabled = true
      boton.classList.remove('sel')
      if (esCorrecta && elegidos.has(valor)) boton.classList.add('ok')
      else if (esCorrecta) boton.classList.add('miss')
      else if (elegidos.has(valor)) boton.classList.add('bad')
    })
    filaDeConfirmar.remove()
    alTerminar([...elegidos])
  }
}
