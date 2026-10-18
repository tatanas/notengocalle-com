import { mejores, reiniciarProgreso, estadisticas } from '../nucleo/progreso.js'
import { borrarProgresoCompartido } from '../cuenta/progresoCompartido.js'
import { usuario } from '../cuenta/sesion.js'
import { $, escaparHtml, formatearTiempo } from '../nucleo/utilidades.js'
import { limpiarCapa, fijarChile, fijarRelieve } from '../mapa/mapa.js'
import { detenerPartida } from '../juego/engine.js'
import { MODOS } from '../juego/registry.js'
import { definirPantalla } from './navegacion.js'
import { ocultarPanel, mostrarPantalla } from './panel.js'
import { htmlDelPie } from './pie.js'
import { htmlDeAnuncio } from './anuncios.js'

function mejorRonda(idDeModo) {
  const llaves = Object.keys(mejores).filter(llave => llave.startsWith(idDeModo + ':'))
  if (!llaves.length) return '—'
  const ultimo = llaves.sort((a, b) => mejores[b].d - mejores[a].d)[0]
  const total = ultimo.split(':')[1]
  return `${mejores[ultimo].ok}/${total} · ${formatearTiempo(mejores[ultimo].ms)}`
}

function htmlDeProgreso() {
  const filas = MODOS.map(modo => {
    const entradas = Object.keys(estadisticas)
      .filter(llave => llave.startsWith(modo.id + ':'))
      .map(llave => estadisticas[llave])
    return {
      mode: modo,
      answers: entradas.reduce((suma, entrada) => suma + entrada.n, 0),
      correct: entradas.reduce((suma, entrada) => suma + entrada.ok, 0),
    }
  }).filter(fila => fila.answers)
  if (!filas.length) return '<p class="muted">Todavía no juegas. ¡Parte por “¿Qué comuna es?”!</p>'

  const masDebiles = Object.entries(estadisticas)
    .filter(([, entrada]) => entrada.n >= 2 && entrada.ok / entrada.n < 0.6)
    .sort(([, a], [, b]) => a.ok / a.n - b.ok / b.n)
    .slice(0, 10)
    .map(([llave]) => escaparHtml(llave.split(':').slice(1).join(':')))
  const filasDeTabla = filas.map(
    ({ mode: modo, answers: respuestas, correct: correctas }) =>
      `<tr><td>${escaparHtml(modo.name)}</td><td>${respuestas}</td><td>${Math.round((correctas / respuestas) * 100)}%</td><td>${mejorRonda(modo.id)}</td></tr>`,
  )
  return `<table class="stats"><tr><th>Modo</th><th>Respuestas</th><th>Acierto</th><th>Mejor ronda</th></tr>${filasDeTabla.join('')}</table>
    ${masDebiles.length ? `<p class="muted" style="margin:10px 0 4px">Tus puntos débiles:</p><p style="margin:0;font-size:13.5px">${masDebiles.join(' · ')}</p>` : ''}`
}

function abrirProgreso() {
  detenerPartida()
  limpiarCapa()
  ocultarPanel()
  fijarRelieve(false)
  fijarChile(false)
  mostrarPantalla(`<div class="wrap pagina-angosta"><div class="card">${htmlDeProgreso()}
    <p class="muted nota">${usuario ? 'Tu progreso de práctica se guarda en tu cuenta: es el mismo en todos tus dispositivos.' : 'Tu progreso se guarda solo en este navegador. Con una cuenta, es el mismo en todos tus dispositivos.'}</p>
    <div class="row" style="margin-top:10px"><button class="btn sec small" id="resetStats">Borrar progreso</button></div></div>${htmlDeAnuncio('paginas')}${htmlDelPie()}</div>`)
  $('#resetStats').onclick = () => {
    if (!confirm('¿Borrar todo tu progreso?')) return
    reiniciarProgreso()
    borrarProgresoCompartido()
    abrirProgreso()
  }
}

definirPantalla('progress', abrirProgreso)
