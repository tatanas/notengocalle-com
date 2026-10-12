import {
  cuentasDisponibles,
  entrar,
  salir,
  alCambiarLaSesion,
  registrarse,
  usuario,
} from '../cuenta/sesion.js'
import { $, escaparHtml } from '../nucleo/utilidades.js'
import { LARGO_MINIMO_DE_CLAVE, REGLAS_DE_USUARIO } from '../../compartido/cuentas.js'
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

const VISTAS = {
  login: () => `<h3>Entrar</h3>
    <form>${campoDeNombre}${campoDeClave('Clave', 'current-password')}
      <p class="error" role="alert"></p>
      <button class="btn wide">Entrar</button></form>
    <p class="muted">¿No tienes cuenta? ${cambiarA('register', 'Crea una')} · <button type="button" class="linklike" data-forgot>Olvidé mi clave</button></p>`,

  register: () => `<h3>Crear cuenta</h3>
    <p class="muted">Solo un nombre y una clave. Sin correo.</p>
    <form>${campoDeNombre}${campoDeClave(`Clave (mínimo ${LARGO_MINIMO_DE_CLAVE} caracteres)`, 'new-password')}
      <p class="muted hint">${REGLAS_DE_USUARIO} Es el nombre que se verá en el ranking. Usa una clave que no tengas en otros sitios.</p>
      <p class="error" role="alert"></p>
      <button class="btn wide">Crear cuenta</button></form>
    <p class="muted">¿Ya tienes cuenta? ${cambiarA('login', 'Entra')}</p>`,

  profile: () => `<h3>👤 ${escaparHtml(usuario.nombre)}</h3>
    <p class="muted">Tus rondas oficiales 🏆 se guardan en el ranking con este nombre.</p>
    <div class="row"><button type="button" class="btn" id="profileRanking">Ver ranking</button><button type="button" class="btn sec" id="logOut">Cerrar sesión</button></div>`,
}

const ENVIAR = {
  login: ({ nombre, clave }) => entrar(nombre, clave),
  register: ({ nombre, clave }) => registrarse(nombre, clave),
}

function mostrar(vista) {
  dialogo.innerHTML = `<button type="button" class="dialog-close" data-close aria-label="Cerrar">✕</button>${VISTAS[vista]()}`
  for (const enlace of dialogo.querySelectorAll('[data-view]'))
    enlace.onclick = () => mostrar(enlace.dataset.view)
  for (const cerrar of dialogo.querySelectorAll('[data-close]')) cerrar.onclick = () => dialogo.close()
  const olvido = $('[data-forgot]', dialogo)
  if (olvido) olvido.onclick = () => alert('pucha :(')

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
