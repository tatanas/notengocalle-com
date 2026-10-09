import { accountsAvailable, logIn, logOut, onSessionChange, register, user } from '../account/session.js'
import { $, escapeHtml } from '../core/util.js'
import { PASSWORD_MIN_LENGTH, USERNAME_RULES } from '../../shared/accounts.js'
import { navigate } from './navigation.js'

const dialog = $('#accountDialog')
const button = $('#btnAccount')

const field = (name, label, attributes) =>
  `<label>${label}<input name="${name}" required ${attributes}></label>`
const nameField = field(
  'name',
  'Nombre de usuario',
  'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20"',
)
const passwordField = (label, autocomplete) =>
  field(
    'password',
    label,
    `type="password" autocomplete="${autocomplete}" minlength="${PASSWORD_MIN_LENGTH}"`,
  )
const switchTo = (view, text) => `<button type="button" class="linklike" data-view="${view}">${text}</button>`

const VIEWS = {
  login: () => `<h3>Entrar</h3>
    <form>${nameField}${passwordField('Clave', 'current-password')}
      <p class="error" role="alert"></p>
      <button class="btn wide">Entrar</button></form>
    <p class="muted">¿No tienes cuenta? ${switchTo('register', 'Crea una')} · <button type="button" class="linklike" data-forgot>Olvidé mi clave</button></p>`,

  register: () => `<h3>Crear cuenta</h3>
    <p class="muted">Solo un nombre y una clave. Sin correo.</p>
    <form>${nameField}${passwordField(`Clave (mínimo ${PASSWORD_MIN_LENGTH} caracteres)`, 'new-password')}
      <p class="muted hint">${USERNAME_RULES} Es el nombre que se verá en el ranking. Usa una clave que no tengas en otros sitios.</p>
      <p class="error" role="alert"></p>
      <button class="btn wide">Crear cuenta</button></form>
    <p class="muted">¿Ya tienes cuenta? ${switchTo('login', 'Entra')}</p>`,

  profile: () => `<h3>👤 ${escapeHtml(user.name)}</h3>
    <p class="muted">Tus rondas oficiales 🏆 se guardan en el ranking con este nombre.</p>
    <div class="row"><button type="button" class="btn" id="profileRanking">Ver ranking</button><button type="button" class="btn sec" id="logOut">Cerrar sesión</button></div>`,
}

const SUBMIT = {
  login: ({ name, password }) => logIn(name, password),
  register: ({ name, password }) => register(name, password),
}

function show(view) {
  dialog.innerHTML = `<button type="button" class="dialog-close" data-close aria-label="Cerrar">✕</button>${VIEWS[view]()}`
  for (const link of dialog.querySelectorAll('[data-view]')) link.onclick = () => show(link.dataset.view)
  for (const close of dialog.querySelectorAll('[data-close]')) close.onclick = () => dialog.close()
  const forgot = $('[data-forgot]', dialog)
  if (forgot) forgot.onclick = () => alert('pucha :(')

  const form = $('form', dialog)
  if (form) form.onsubmit = event => submit(event, view)
  if (view === 'profile') {
    $('#logOut').onclick = () => logOut().then(() => dialog.close())
    $('#profileRanking').onclick = () => {
      dialog.close()
      navigate('ranking')
    }
  }
}

async function submit(event, view) {
  event.preventDefault()
  const form = event.target
  const error = $('.error', form)
  const submitButton = $('button.btn', form)
  error.textContent = ''
  submitButton.disabled = true
  try {
    await SUBMIT[view](Object.fromEntries(new FormData(form)))
    dialog.close()
  } catch (failure) {
    error.textContent = failure.message
    submitButton.disabled = false
  }
}

// Se resuelve al cerrar el diálogo: con el usuario si quedó con sesión, o null.
export function openAccountDialog() {
  show(user ? 'profile' : 'login')
  dialog.showModal()
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(user), { once: true }))
}

button.onclick = openAccountDialog

onSessionChange(() => {
  button.hidden = !accountsAvailable
  button.textContent = user ? `👤 ${user.name}` : 'Entrar'
})
