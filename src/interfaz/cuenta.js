import {
  cuentasDisponibles,
  entrar,
  entrarConGoogle,
  salir,
  vincularGoogle,
  alCambiarLaSesion,
  registrarse,
  usuario,
} from '../cuenta/sesion.js'
import { $, escaparHtml } from '../nucleo/utilidades.js'
import { LARGO_MINIMO_DE_CLAVE, REGLAS_DE_USUARIO } from '../../compartido/cuentas.js'
import { mostrarBotonDeGoogle } from '../cuenta/google.js'
import { navegar } from './navegacion.js'

const dialogo = $('#accountDialog')
const boton = $('#btnAccount')

const campoDelFormulario = (nombre, etiqueta, atributos) =>
  `<label>${etiqueta}<input name="${nombre}" required ${atributos}></label>`
const campoDeNombre = campoDelFormulario(
  'nombre',
  'Nombre de usuario',
  'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20"',
)
const campoDeClave = (etiqueta, autocompletar) =>
  campoDelFormulario(
    'clave',
    etiqueta,
    `type="password" autocomplete="${autocompletar}" minlength="${LARGO_MINIMO_DE_CLAVE}"`,
  )
const cambiarA = (vista, texto) =>
  `<button type="button" class="linklike" data-view="${vista}">${texto}</button>`

const botonDeGoogle = `<div class="boton-de-google" id="googleButton"></div>
    <p class="error" id="googleError" role="alert"></p>`
const conGoogle = `${botonDeGoogle}<p class="muted o-bien">o con nombre y clave</p>`

// El token de Google de quien entra por primera vez, mientras elige su nombre de usuario.
let credencialPorCompletar = null

const VISTAS = {
  login: () => `<h3>Entrar</h3>${conGoogle}
    <form>${campoDeNombre}${campoDeClave('Clave', 'current-password')}
      <p class="error" role="alert"></p>
      <button class="btn wide">Entrar</button></form>
    <p class="muted">¿No tienes cuenta? ${cambiarA('register', 'Crea una')} · <button type="button" class="linklike" data-forgot>Olvidé mi clave</button></p>`,

  register: () => `<h3>Crear cuenta</h3>${conGoogle}
    <p class="muted">Solo un nombre y una clave. Sin correo.</p>
    <form>${campoDeNombre}${campoDeClave(`Clave (mínimo ${LARGO_MINIMO_DE_CLAVE} caracteres)`, 'new-password')}
      <p class="muted hint">${REGLAS_DE_USUARIO} Es el nombre que se verá en el ranking. Usa una clave que no tengas en otros sitios.</p>
      <p class="error" role="alert"></p>
      <button class="btn wide">Crear cuenta</button></form>
    <p class="muted">¿Ya tienes cuenta? ${cambiarA('login', 'Entra')}</p>`,

  googleName: () => `<h3>Elige tu nombre</h3>
    <p class="muted">Es la primera vez que entras con esta cuenta de Google. De Google solo guardamos un identificador: tu nombre real y tu correo no se guardan ni se muestran.</p>
    <form>${campoDeNombre}
      <p class="muted hint">${REGLAS_DE_USUARIO} Es el nombre que se verá en el ranking.</p>
      <p class="error" role="alert"></p>
      <button class="btn wide">Crear cuenta</button></form>
    <p class="muted">${cambiarA('login', 'Volver')}</p>`,

  profile: () => `<h3>👤 ${escaparHtml(usuario.nombre)}</h3>
    <p class="muted">Tus rondas 🏆 se guardan en el ranking con este nombre (las de práctica, no).</p>
    ${usuario.google ? '<p class="muted">✓ Vinculada con Google: puedes entrar con tu cuenta de Google.</p>' : `<p class="muted">Vincula tu cuenta con Google para entrar sin clave:</p>${botonDeGoogle}`}
    <div class="row"><button type="button" class="btn" id="profileRanking">Ver ranking</button><button type="button" class="btn sec" id="logOut">Cerrar sesión</button></div>`,
}

const ENVIAR = {
  login: ({ nombre, clave }) => entrar(nombre, clave),
  register: ({ nombre, clave }) => registrarse(nombre, clave),
  googleName: ({ nombre }) => entrarConGoogle(credencialPorCompletar, nombre),
}

async function alRecibirCredencialDeGoogle(vista, credencial) {
  const error = $('#googleError', dialogo)
  if (error) error.textContent = ''
  try {
    if (vista === 'profile') {
      await vincularGoogle(credencial)
      mostrar('profile')
    } else if (await entrarConGoogle(credencial)) {
      credencialPorCompletar = credencial
      mostrar('googleName')
    } else dialogo.close()
  } catch (falla) {
    if (error) error.textContent = falla.message
  }
}

function mostrar(vista) {
  dialogo.innerHTML = `<button type="button" class="dialog-close" data-close aria-label="Cerrar">✕</button>${VISTAS[vista]()}`
  for (const enlace of dialogo.querySelectorAll('[data-view]'))
    enlace.onclick = () => mostrar(enlace.dataset.view)
  for (const cerrar of dialogo.querySelectorAll('[data-close]')) cerrar.onclick = () => dialogo.close()
  const olvido = $('[data-forgot]', dialogo)
  if (olvido) olvido.onclick = () => alert('pucha :(')

  const contenedorDeGoogle = $('#googleButton', dialogo)
  if (contenedorDeGoogle)
    mostrarBotonDeGoogle(contenedorDeGoogle, credencial => alRecibirCredencialDeGoogle(vista, credencial))

  const formulario = $('form', dialogo)
  if (formulario) formulario.onsubmit = evento => enviarFormulario(evento, vista)
  if (vista === 'profile') {
    $('#logOut').onclick = () => salir().then(() => dialogo.close())
    $('#profileRanking').onclick = () => {
      dialogo.close()
      navegar('ranking')
    }
  }
}

async function enviarFormulario(evento, vista) {
  evento.preventDefault()
  const formulario = evento.target
  const error = $('.error', formulario)
  const botonDeEnviar = $('button.btn', formulario)
  error.textContent = ''
  botonDeEnviar.disabled = true
  try {
    await ENVIAR[vista](Object.fromEntries(new FormData(formulario)))
    dialogo.close()
  } catch (falla) {
    error.textContent = falla.message
    botonDeEnviar.disabled = false
  }
}

// Se resuelve al cerrar el diálogo: con el usuario si quedó con sesión, o null.
export function abrirDialogoDeCuenta() {
  mostrar(usuario ? 'profile' : 'login')
  dialogo.showModal()
  return new Promise(resolver => dialogo.addEventListener('close', () => resolver(usuario), { once: true }))
}

boton.onclick = abrirDialogoDeCuenta

alCambiarLaSesion(() => {
  boton.hidden = !cuentasDisponibles
  boton.textContent = usuario ? `👤 ${usuario.nombre}` : 'Entrar'
})
