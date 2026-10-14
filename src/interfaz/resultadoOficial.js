import { textoDeCategoria } from '../../compartido/oficial.js'
import { entregaDe, vaciarBandejaDeSalida, enviarRondaOficial } from '../cuenta/puntajes.js'
import { $, formatearTiempo } from '../nucleo/utilidades.js'
import { abrirDialogoDeCuenta } from './cuenta.js'
import { navegar } from './navegacion.js'

function htmlDeGuardados(modo, { categoria, puesto, jugadores, mejoro, mejor }) {
  const lugarEnTabla = `🏆 <b>Puesto ${puesto}</b> de ${jugadores} en el ranking de este juego con ${textoDeCategoria(modo, categoria)}.`
  const personales = mejoro
    ? 'Es tu mejor ronda oficial de este largo.'
    : `Tu mejor ronda oficial de este largo sigue siendo ${mejor.aciertos}/${mejor.total} en ${formatearTiempo(mejor.ms)}.`
  return `<p class="tight">${lugarEnTabla}</p><p class="muted tight">${personales}</p>
    <button class="btn sec small" id="outcomeRanking" style="margin-top:6px">Ver ranking</button>`
}

const HTML_DE_INVITADO = `<p class="tight">Jugaste sin cuenta, así que este puntaje todavía no está en el ranking.</p>
  <button class="btn small" id="outcomeLogin" style="margin-top:6px">Entrar o crear cuenta</button>`

const MENSAJES = {
  sin_conexion:
    'Sin conexión: el puntaje quedó guardado en este dispositivo y se sube solo cuando vuelvas a abrir el juego con internet.',
  no_disponible: 'El ranking no está disponible en este momento.',
}

// Muestra, al terminar una ronda oficial, en qué quedó ese puntaje en el ranking.
export async function mostrarResultadoOficial(resultado, caja) {
  caja.innerHTML = '<p class="muted tight">Guardando en el ranking…</p>'
  dibujar(resultado, caja, await enviarRondaOficial(resultado))
}

function dibujar(resultado, caja, desenlace) {
  if (!caja.isConnected) return
  if (desenlace.estado === 'guardado') {
    caja.innerHTML = htmlDeGuardados(resultado.modo, desenlace)
    $('#outcomeRanking').onclick = () => navegar('ranking', resultado.modo, desenlace.categoria)
  } else if (desenlace.estado === 'invitado') {
    caja.innerHTML = HTML_DE_INVITADO
    $('#outcomeLogin').onclick = async () => {
      if (!(await abrirDialogoDeCuenta())) return
      await vaciarBandejaDeSalida()
      const guardado = entregaDe(resultado)
      if (guardado) dibujar(resultado, caja, { estado: 'guardado', ...guardado })
    }
  } else {
    caja.innerHTML = `<p class="muted tight">${desenlace.mensaje || MENSAJES[desenlace.estado]}</p>`
  }
}
