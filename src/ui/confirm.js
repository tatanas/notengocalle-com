import { $, escapeHtml } from '../core/util.js'

const dialog = $('#confirmDialog')

// Pregunta con dos botones. Devuelve true si la persona confirma; Escape o "cancelar" devuelven false.
export function confirmAction({ title, message, confirmLabel, cancelLabel }) {
  dialog.returnValue = ''
  dialog.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>
    <div class="row end">
      <button type="button" class="btn sec" id="confirmCancel" value="cancel">${escapeHtml(cancelLabel)}</button>
      <button type="button" class="btn" id="confirmOk" value="ok">${escapeHtml(confirmLabel)}</button>
    </div>`
  for (const button of dialog.querySelectorAll('button')) button.onclick = () => dialog.close(button.value)
  dialog.showModal()
  $('#confirmCancel').focus()
  return new Promise(resolve =>
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }),
  )
}
