import { ID_DE_CLIENTE_DE_GOOGLE } from '../../compartido/configuracion.js'

const URL_DEL_SCRIPT = 'https://accounts.google.com/gsi/client'
const ANCHO_MAXIMO_DEL_BOTON = 400

let cargando = null
let alRecibirCredencial = () => {}

// El script de Google se baja recién cuando alguien abre el diálogo de cuenta: el juego nunca lo espera.
function cargarGoogle() {
  cargando ||= new Promise((resolver, rechazar) => {
    const script = document.createElement('script')
    script.src = URL_DEL_SCRIPT
    script.async = true
    script.onload = () => {
      const identidad = window.google.accounts.id
      identidad.initialize({
        client_id: ID_DE_CLIENTE_DE_GOOGLE,
        callback: respuesta => alRecibirCredencial(respuesta.credential),
      })
      resolver(identidad)
    }
    script.onerror = () => {
      cargando = null
      rechazar(new Error('No se pudo cargar Google'))
    }
    document.head.append(script)
  })
  return cargando
}

// Dibuja "Continuar con Google" dentro del contenedor; si Google no carga (sin red, bloqueadores), lo esconde.
export async function mostrarBotonDeGoogle(contenedor, alRecibir) {
  alRecibirCredencial = alRecibir
  try {
    const identidad = await cargarGoogle()
    if (!contenedor.isConnected) return
    identidad.renderButton(contenedor, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      locale: 'es',
      width: Math.min(contenedor.clientWidth || 300, ANCHO_MAXIMO_DEL_BOTON),
    })
  } catch {
    contenedor.hidden = true
  }
}
