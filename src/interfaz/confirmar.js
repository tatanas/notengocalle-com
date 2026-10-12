import { $, escaparHtml } from '../nucleo/utilidades.js'

const dialogo = $('#confirmDialog')

// Pregunta con dos botones. Devuelve true si la persona confirma; Escape o "cancelar" devuelven false.
export function confirmarAccion({
  title: titulo,
  message: mensaje,
  confirmLabel: etiquetaDeConfirmar,
  cancelLabel: etiquetaDeCancelar,
}) {
  dialogo.returnValue = ''
  dialogo.innerHTML = `<h3>${escaparHtml(titulo)}</h3><p>${escaparHtml(mensaje)}</p>
    <div class="row end">
      <button type="button" class="btn sec" id="confirmCancel" value="cancel">${escaparHtml(etiquetaDeCancelar)}</button>
      <button type="button" class="btn" id="confirmOk" value="ok">${escaparHtml(etiquetaDeConfirmar)}</button>
    </div>`
  for (const boton of dialogo.querySelectorAll('button')) boton.onclick = () => dialogo.close(boton.value)
  dialogo.showModal()
  $('#confirmCancel').focus()
  return new Promise(resolver =>
    dialogo.addEventListener('close', () => resolver(dialogo.returnValue === 'ok'), { once: true }),
  )
}
