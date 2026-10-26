import { restaurarSesion } from './cuenta/sesion.js'
import { $ } from './nucleo/utilidades.js'
import './juego/modos/index.js'
import './interfaz/conducir.js'
import './interfaz/cuenta.js'
import './interfaz/explorar.js'
import './interfaz/inicio.js'
import './interfaz/progreso.js'
import './interfaz/ranking.js'
import { navegar } from './interfaz/navegacion.js'

$('#btnHome').onclick = () => navegar('home')
$('#btnRanking').onclick = () => navegar('ranking')
$('#btnExplorar').onclick = () => navegar('explore')
$('#btnProgreso').onclick = () => navegar('progress')
const pestana = document.createElement('button')
pestana.className = 'pestana'
pestana.dataset.pantalla = 'drive'
pestana.title = 'Conducir libre'
pestana.innerHTML = '<span class="icono">🚗</span><span class="texto">Conducir</span>'
pestana.onclick = () => navegar('drive')
$('#pestanas').appendChild(pestana)
navegar('home')
restaurarSesion()

if ('serviceWorker' in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register('/sw.js').catch(() => {})
