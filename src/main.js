import { restaurarSesion } from './cuenta/sesion.js'
import { $ } from './nucleo/utilidades.js'
import './juego/modos/index.js'
import './interfaz/cuenta.js'
import './interfaz/explorar.js'
import './interfaz/inicio.js'
import './interfaz/ranking.js'
import { navegar } from './interfaz/navegacion.js'

$('#btnHome').onclick = () => navegar('home')
navegar('home')
restaurarSesion()

if ('serviceWorker' in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register('/sw.js').catch(() => {})
