import { textosDelCruce } from '../dominio/instruccionesDeCruce.js'
import { escaparHtml } from '../nucleo/utilidades.js'

const TITULO_POR_MOTIVO = {
  llegada: '🎯 ¡Llegaste!',
  rendicion: '🏳️ Te rendiste',
  lejos: '😵 Ya fregaste: vas a demorar más del doble que la ruta óptima',
}

const formatearKm = metros => `${(metros / 1000).toFixed(1).replace('.', ',')} km`
const formatearMinutos = segundos => `${Math.max(1, Math.round(segundos / 60))} min`
const formatearDiferencia = segundos =>
  segundos >= 60
    ? `${Math.floor(segundos / 60)} min ${Math.round(segundos % 60)} s`
    : `${Math.round(segundos)} s`
const colorDelPuntaje = puntaje => `hsl(${Math.round(puntaje * 1.2)}, 65%, 38%)`

function htmlDeUnError(registro) {
  const textos = textosDelCruce(registro.opciones)
  const elegida = textos[registro.opciones.indexOf(registro.elegida)]
  const mejor = textos[registro.opciones.indexOf(registro.mejor)]
  const perdidos = Number.isFinite(registro.segundosPerdidos)
    ? `+${formatearDiferencia(registro.segundosPerdidos)}`
    : 'sin vuelta'
  return `<li><b>${escaparHtml(registro.calle || 'Calle sin nombre')}</b> · km ${(registro.metros / 1000).toFixed(1).replace('.', ',')} · <b>${perdidos}</b><br>Elegiste «${escaparHtml(elegida)}»; lo mejor era «${escaparHtml(mejor)}».</li>`
}

// Lo que se perdió, en un desplegable para que el resultado no se llene.
function htmlDeLosErrores(errores, motivo) {
  if (errores.length)
    return `<details class="cd-detalle"><summary>Dónde perdiste tiempo (${errores.length})</summary><ul class="cd-errores">${errores.map(htmlDeUnError).join('')}</ul></details>`
  return motivo === 'llegada' ? '<p class="muted nota">Sin pérdidas importantes en ninguna decisión.</p>' : ''
}

// El análisis de una ruta terminada: puntaje, lo recorrido frente al óptimo y dónde se perdió más tiempo.
export function htmlDelResultado({ motivo, etiqueta, analisis }) {
  const { jugador, optima, errores } = analisis
  const puntaje = motivo === 'llegada' ? analisis.puntaje : 0
  const fila = (nombre, usuario, mejor) => `<tr><td>${nombre}</td><td>${usuario}</td><td>${mejor}</td></tr>`
  const conAutopistas = jugador.metrosConTag || optima.metrosConTag
  return `<div class="muted nota">${TITULO_POR_MOTIVO[motivo]} · ${escaparHtml(etiqueta)}</div>
    <div class="cd-puntaje" style="color:${colorDelPuntaje(puntaje)}">${puntaje}<small> / 100</small></div>
    <table class="cd-tabla">
      <tr><th></th><th>Tú</th><th>Óptima</th></tr>
      ${fila('Distancia', formatearKm(jugador.metros), formatearKm(optima.metros))}
      ${fila('Tiempo', formatearMinutos(jugador.segundos), formatearMinutos(optima.segundos))}
      ${fila('En hora punta', formatearMinutos(jugador.segundosEnPunta), formatearMinutos(optima.segundosEnPunta))}
      ${conAutopistas ? fila('Autopistas con TAG', formatearKm(jugador.metrosConTag), formatearKm(optima.metrosConTag)) : ''}
    </table>
    <p class="muted nota">Tiempos estimados con un modelo propio, no tráfico real. En el mapa: <b style="color:#2563eb">tu ruta</b> y <b style="color:#16a34a">la óptima</b>.</p>
    ${htmlDeLosErrores(errores, motivo)}`
}
