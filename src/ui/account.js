import {
  accountsAvailable,
  logIn,
  logOut,
  onSessionChange,
  recoverAccount,
  register,
  user,
} from '../account/session.js'
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
    <p class="muted">¿No tienes cuenta? ${switchTo('register', 'Crea una')} · ${switchTo('recover', 'Olvidé mi clave')}</p>`,

  register: () => `<h3>Crear cuenta</h3>
    <p class="muted">Solo un nombre y una clave. Sin correo.</p>
    <form>${nameField}${passwordField(`Clave (mínimo ${PASSWORD_MIN_LENGTH} caracteres)`, 'new-password')}
      <p class="muted hint">${USERNAME_RULES} Es el nombre que se verá en el ranking.</p>
      <p class="error" role="alert"></p>
      <button class="btn wide">Crear cuenta</button></form>
    <p class="muted">¿Ya tienes cuenta? ${switchTo('login', 'Entra')}</p>`,

  recover: () => `<h3>Recuperar cuenta</h3>
    <p class="muted">Usa el código de recuperación que se te mostró al crear la cuenta.</p>
    <form>${nameField}
      ${field('recoveryCode', 'Código de recuperación', 'autocomplete="off" autocapitalize="characters" spellcheck="false"')}
      ${passwordField('Clave nueva', 'new-password')}
      <p class="error" role="alert"></p>
      <button class="btn wide">Cambiar clave y entrar</button></form>
    <p class="muted">${switchTo('login', 'Volver')}</p>`,

  code: recoveryCode => `<h3>Guarda tu código de recuperación</h3>
    <p>Como no pedimos correo, este código es la única forma de recuperar tu cuenta si olvidas la clave. Se muestra una sola vez.</p>
    <p class="recovery-code">${escapeHtml(recoveryCode)}</p>
    <div class="row"><button type="button" class="btn sec" id="copyCode">Copiar</button><button type="button" class="btn" data-close>Ya lo guardé</button></div>`,

  profile: () => `<h3>👤 ${escapeHtml(user.name)}</h3>
    <p class="muted">Tus rondas oficiales 🏆 se guardan en el ranking con este nombre.</p>
    <div class="row"><button type="button" class="btn" id="profileRanking">Ver ranking</button><button type="button" class="btn sec" id="logOut">Cerrar sesión</button></div>`,
}

const SUBMIT = {
  login: ({ name, password }) => logIn(name, password),
  register: ({ name, password }) => register(name, password),
  recover: ({ name, recoveryCode, password }) => recoverAccount(name, recoveryCode, password),
}

function show(view, payload) {
  dialog.innerHTML = `<button type="button" class="dialog-close" data-close aria-label="Cerrar">✕</button>${VIEWS[view](payload)}`
  for (const link of dialog.querySelectorAll('[data-view]')) link.onclick = () => show(link.dataset.view)
  for (const close of dialog.querySelectorAll('[data-close]')) close.onclick = () => dialog.close()

  const form = $('form', dialog)
  if (form) form.onsubmit = event => submit(event, view)
  if (view === 'code') $('#copyCode').onclick = () => navigator.clipboard?.writeText(payload)
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
    const result = await SUBMIT[view](Object.fromEntries(new FormData(form)))
    if (result?.recoveryCode) show('code', result.recoveryCode)
    else dialog.close()
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
