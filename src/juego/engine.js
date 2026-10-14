import {
  REGLAS_OFICIALES,
  MODOS_OFICIALES,
  ajusteDeCategoria,
  largoNormalDe,
  tieneRondaDeTodas,
  TODAS_LAS_PREGUNTAS,
  categoriaDe,
} from '../../compartido/oficial.js'
import { pesoAdaptativo, mejores, registrar, guardarMejor, muestraPonderada } from '../nucleo/progreso.js'
import { ajustes, aplicarReglasDeRonda, largoPara } from '../nucleo/almacen.js'
import { $, escaparHtml, formatearTiempo } from '../nucleo/utilidades.js'
import { limpiarAyudas } from '../mapa/ayudas.js'
import {
  limpiarCapa,
  olvidarAjustesDeVista,
  modoDeEtiquetas,
  mapa,
  fijarChile,
  fijarModoDeEtiquetas,
  fijarRelieve,
  fijarDesplazamientoAmplio,
  vigilarAjustesDeVista,
} from '../mapa/mapa.js'
import { confirmarAccion } from '../interfaz/confirmar.js'
import { resguardarSalida, navegar } from '../interfaz/navegacion.js'
import { mostrarResultadoOficial } from '../interfaz/resultadoOficial.js'
import { ocultarPantalla, indicador, panel, mostrarPanel, titulo, aviso } from '../interfaz/panel.js'

/* Un modo define: id, group, name, desc (opcional: se muestra bajo el nombre en el menú), pool(), key(item) y ask(item, quiz).
   Opcionales: label(item), balance(item), setup(quiz), limpiar() (al salir), disponible() (si no, no aparece en el menú), all, keepLayer, noHint, aids, relief, chile, roomy, tall, study.
   noHint: sin el botón "Ver nombres". aids: en la práctica dibuja bordes de comunas y metro de ayuda (la ronda oficial, no). */

export let partida = null
let temporizadorDelIndicador = null

const llaveDeEstadistica = (modo, elemento) => modo.id + ':' + modo.key(elemento)

// Lo máximo que se puede sumar en una ronda de tantas preguntas.
const maximoDe = (modo, preguntas) => preguntas * (modo.puntosPorPregunta ?? 1)

export const tieneRondaOficial = modo => MODOS_OFICIALES.includes(modo.id)

const LARGO_DE_TODAS = 999
const SEGUNDOS_DE_CUENTA_REGRESIVA = 3
let temporizadorDeCuenta = null

// Las rondas oficiales empiezan con una cuenta regresiva en la que se puede mover el mapa; el reloj de la ronda
// parte después, con la primera pregunta.
function correrCuentaRegresiva(nombreDeModo, alTerminar) {
  const caja = $('#countdown')
  let restantes = SEGUNDOS_DE_CUENTA_REGRESIVA
  const dibujar = () => {
    caja.innerHTML = `<p class="countdown-label">🏆 Ronda oficial · ${escaparHtml(nombreDeModo)}</p>
      <p class="countdown-number">${restantes}</p>
      <p class="countdown-hint">¡Prepárate! Puedes mover el mapa para acomodarlo.</p>`
  }
  caja.hidden = false
  dibujar()
  temporizadorDeCuenta = setInterval(() => {
    restantes--
    if (restantes > 0) return dibujar()
    detenerCuentaRegresiva()
    alTerminar()
  }, 1000)
}

function detenerCuentaRegresiva() {
  clearInterval(temporizadorDeCuenta)
  temporizadorDeCuenta = null
  $('#countdown').hidden = true
}

const VER_NOMBRES = '👁 Ver nombres'
const OCULTAR_NOMBRES = '🙈 Ocultar nombres'

// Mostrar los nombres del mapa es una pista: esa respuesta deja de sumar.
const ControlDePista = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
    this.button = L.DomUtil.create('button', 'maptoggle')
    this.button.type = 'button'
    this.button.textContent = VER_NOMBRES
    L.DomEvent.disableClickPropagation(this.button)
    this.button.onclick = () => {
      if (!partida) return
      const revelar = modoDeEtiquetas === 'plain'
      fijarModoDeEtiquetas(revelar ? 'labels' : 'plain')
      this.button.textContent = revelar ? OCULTAR_NOMBRES : VER_NOMBRES
      if (revelar && !partida.answered) partida.hinted = true
    }
    return this.button
  },
  reset() {
    if (this.button) this.button.textContent = VER_NOMBRES
  },
})
const controlDePista = new ControlDePista()

const botonReiniciar = $('#btnRestart')

function actualizarIndicador() {
  if (!partida || partida.mode.study) return
  const respondida = partida.i + (partida.answered ? 1 : 0)
  const transcurrido = partida.ms + (partida.t0 && !partida.answered ? Date.now() - partida.t0 : 0)
  indicador.textContent = `${partida.ok}/${maximoDe(partida.mode, respondida)} ✓ · ⏱ ${formatearTiempo(transcurrido)}`
}

// category: solo para empezar una ronda oficial de un largo concreto (desde el ranking); si no, se usa el largo
// que la persona tiene elegido en sus ajustes.
export function iniciarPartida(
  modo,
  { ranked: oficial = false, category: categoria = null, reglas: reglasDePractica = null } = {},
) {
  detenerPartida()
  // En Street View y en los juegos de comunas la categoría de ranking es un ajuste (nivel, alcance): el de la pestaña
  // del ranking o, si no, el elegido en el menú.
  const delAjuste = ajusteDeCategoria(modo.id)
  const variante = delAjuste ? (categoria ?? ajustes[delAjuste.ajuste]) : null
  const reglas = oficial
    ? { ...REGLAS_OFICIALES, ...(delAjuste && { [delAjuste.ajuste]: variante }) }
    : reglasDePractica
  aplicarReglasDeRonda(reglas)
  const conjunto = modo.pool()
  const pedidas =
    categoria && !variante
      ? categoria === TODAS_LAS_PREGUNTAS
        ? conjunto.length
        : +categoria
      : largoPara(modo.group) >= LARGO_DE_TODAS && tieneRondaDeTodas(modo.id)
        ? LARGO_DE_TODAS
        : largoNormalDe(modo.id)
  const tamano = modo.all ? conjunto.length : Math.min(pedidas, conjunto.length)
  if (!conjunto.length) {
    aplicarReglasDeRonda(null)
    aviso('No hay elementos con estos filtros')
    return
  }
  partida = {
    mode: modo,
    ranked: oficial,
    category: oficial ? (variante ?? categoriaDe(tamano, conjunto.length)) : null,
    variante,
    reglas: reglasDePractica,
    items: muestraPonderada(conjunto, tamano, {
      weightOf: oficial ? undefined : elemento => pesoAdaptativo(llaveDeEstadistica(modo, elemento)),
      groupOf: modo.balance,
    }),
    i: 0,
    ok: 0,
    pts: 0,
    ms: 0,
    t0: 0,
    misses: [],
    answered: false,
    hinted: false,
  }
  ocultarPantalla()
  titulo.textContent = modo.name
  fijarModoDeEtiquetas('plain')
  if (!oficial && !modo.noHint && !modo.study) controlDePista.addTo(mapa)
  controlDePista.reset()
  fijarRelieve(!!modo.relief)
  fijarChile(!!modo.chile)
  fijarDesplazamientoAmplio(!!modo.roomy)
  if (!oficial) {
    prepararRonda()
    return comenzarRonda()
  }
  partida.starting = true
  limpiarCapa()
  limpiarAyudas()
  mostrarPanel(`<div class="progress"><i style="width:0%"></i></div>
    <div class="q-sub" style="margin:0 0 6px">🏆 Ronda oficial</div><div class="q-prompt">Prepárate…</div>`)
  vigilarAjustesDeVista(true)
  prepararRonda()
  correrCuentaRegresiva(modo.name, () => {
    partida.starting = false
    comenzarRonda()
  })
}

// Lo que se dibuja antes de la primera pregunta (en las oficiales, durante la cuenta regresiva).
function prepararRonda() {
  if (partida.mode.setup) partida.mode.setup(partida)
}

function comenzarRonda() {
  temporizadorDelIndicador = setInterval(actualizarIndicador, 500)
  botonReiniciar.hidden = !partida.ranked
  if (partida.mode.study) {
    limpiarCapa()
    fijarModoDeEtiquetas('streets')
    partida.mode.ask(null, partida)
    return
  }
  siguientePregunta({ first: true })
}

export function detenerPartida() {
  partida?.mode.limpiar?.()
  partida = null
  clearInterval(temporizadorDelIndicador)
  detenerCuentaRegresiva()
  aplicarReglasDeRonda(null)
  mapa.removeControl(controlDePista)
  limpiarAyudas()
  olvidarAjustesDeVista()
  fijarDesplazamientoAmplio(false)
  botonReiniciar.hidden = true
  panel.classList.remove('tall')
  indicador.textContent = ''
}

// Para los modos que descubren tarde que un ítem no se puede preguntar (ej. una ruta sin datos).
export function saltarPregunta() {
  partida.items.splice(partida.i, 1)
  siguientePregunta({ first: true })
}

export function siguientePregunta({ first: primero = false } = {}) {
  if (!primero) partida.i++
  if (partida.i >= partida.items.length) return terminarPartida()
  partida.answered = false
  partida.hinted = false
  fijarModoDeEtiquetas('plain')
  controlDePista.reset()
  panel.classList.toggle('tall', !!partida.mode.tall)
  if (!partida.mode.keepLayer) {
    limpiarCapa()
    limpiarAyudas()
  }
  partida.t0 = Date.now()
  actualizarIndicador()
  partida.mode.ask(partida.items[partida.i], partida)
}

export function encabezadoDePregunta(q) {
  const progreso = ((q.i / q.items.length) * 100).toFixed(0)
  return `<div class="progress"><i style="width:${progreso}%"></i></div>
    <div class="q-head"><span>Pregunta ${q.i + 1} de ${q.items.length}</span><span>${q.ranked ? '🏆 Ronda oficial' : q.mode.group}</span></div>`
}

function tituloDelComentario(ok, parcial, conPista) {
  if (ok) return conPista ? '✅ Correcto (con pista, no suma)' : '✅ ¡Correcto!'
  return parcial ? '🟡 Cerca' : '❌ No'
}

// Solo corre el reloj mientras se piensa la pregunta: se detiene al responder.
export function responder(ok, htmlDelComentario, { points: puntos = null, partial: parcial = false } = {}) {
  const q = partida
  if (q.answered) return
  q.ms += Date.now() - q.t0
  q.answered = true
  const elemento = q.items[q.i]
  const contadas = ok && !q.hinted
  registrar(llaveDeEstadistica(q.mode, elemento), contadas)
  const sumaPuntos = !!q.mode.puntosPorPregunta
  if (sumaPuntos) q.ok += puntos ?? 0
  else if (contadas) q.ok++
  if (!contadas) q.misses.push(q.mode.label ? q.mode.label(elemento) : q.mode.key(elemento))
  if (puntos != null && !sumaPuntos) q.pts += puntos
  actualizarIndicador()

  const esUltima = q.i + 1 >= q.items.length
  const comentario = document.createElement('div')
  comentario.className = 'fb ' + (ok ? 'ok' : parcial ? 'info' : 'bad')
  comentario.innerHTML = `<h4>${tituloDelComentario(ok, parcial, q.hinted)}</h4>${htmlDelComentario || ''}
    <button class="btn next" id="btnNext">${esUltima ? 'Ver resultado' : 'Siguiente →'}</button>`
  panel.appendChild(comentario)
  $('#btnNext').onclick = () => siguientePregunta()
  setTimeout(() => comentario.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30)
}

const GRUPOS_SIN_CALLE = ['Comunas', 'Metro', 'Calles', 'Street View']

function veredicto(porcentaje, grupo) {
  if (porcentaje >= 90) return '¡Te la sabes! 🏆'
  if (porcentaje >= 70) return 'Muy bien 👏'
  if (porcentaje >= 40) return 'Vas mejorando 💪'
  return GRUPOS_SIN_CALLE.includes(grupo) ? 'no teni calle :(' : 'A seguir practicando 🗺️'
}

function htmlDeMejorPersonal(total, maximo, anterior, esMejor) {
  if (!esMejor)
    return `<p class="muted tight">Tu récord en rondas de ${total}: ${anterior.ok}/${maximo} en ${formatearTiempo(anterior.ms)}</p>`
  if (!anterior) return `<p class="muted tight">Primera marca en rondas de ${total} preguntas.</p>`
  return `<p class="tight">🏅 <b>¡Nuevo récord!</b> <span class="muted">Antes: ${anterior.ok}/${maximo} en ${formatearTiempo(anterior.ms)}</span></p>`
}

function terminarPartida() {
  const {
    mode: modo,
    ranked: oficial,
    category: categoria,
    variante,
    reglas,
    ok,
    ms,
    pts,
    misses: fallos,
  } = partida
  const total = partida.items.length
  const maximo = maximoDe(modo, total)
  detenerPartida()
  limpiarCapa()
  fijarModoDeEtiquetas('plain')
  fijarRelieve(false)

  const llaveDeMejor = modo.id + ':' + total + (variante ? ':' + variante : '')
  const anterior = mejores[llaveDeMejor]
  const esMejor = !anterior || ok > anterior.ok || (ok === anterior.ok && ms < anterior.ms)
  if (esMejor) guardarMejor(llaveDeMejor, { ok, ms, d: Date.now() })

  const porcentaje = Math.round((ok / maximo) * 100)
  const segundosPorPregunta = (ms / total / 1000).toFixed(1).replace('.', ',')
  const notaFinal = oficial
    ? 'Las rondas oficiales usan las mismas reglas para todos: Gran Santiago, todas las categorías, sin tus calles propias y sin ayudas.'
    : 'Las preguntas que fallas aparecen más seguido en las próximas rondas.'
  mostrarPanel(`<h3 class="tight">${veredicto(porcentaje, modo.group)}</h3>
    <p class="result-score">${ok} / ${maximo} <span class="muted">(${porcentaje}%)</span></p>
    <p class="tight">⏱ <b>${formatearTiempo(ms)}</b> <span class="muted">· ${segundosPorPregunta} s por pregunta</span></p>
    ${htmlDeMejorPersonal(total, maximo, anterior, esMejor)}
    ${pts ? `<p class="muted">Puntaje: ${Math.round(pts)}</p>` : ''}
    ${oficial ? '<div id="officialOutcome" class="outcome"></div>' : ''}
    ${fallos.length ? `<p class="muted" style="margin-bottom:4px">Para repasar:</p><p style="margin-top:0">${fallos.map(escaparHtml).join(' · ')}</p>` : ''}
    <div class="row" style="margin-top:12px">
      <button class="btn" id="again">Otra ronda</button>
      ${!oficial && tieneRondaOficial(modo) ? '<button class="btn sec" id="goOfficial">🏆 Ronda oficial</button>' : ''}
      <button class="btn sec" id="menu">Menú</button>
    </div>
    <p class="muted" style="font-size:12px;margin-top:10px">${notaFinal}</p>`)

  $('#again').onclick = () => iniciarPartida(modo, { ranked: oficial, category: categoria, reglas })
  $('#menu').onclick = () => navegar('home')
  if ($('#goOfficial')) $('#goOfficial').onclick = () => iniciarPartida(modo, { ranked: true })
  if (oficial)
    mostrarResultadoOficial(
      { modo: modo.id, categoria, aciertos: ok, total: maximo, ms },
      $('#officialOutcome'),
    )
}

// Reiniciar una ronda oficial a medias: otras preguntas, mismo juego y mismo largo, otra vez con cuenta regresiva.
botonReiniciar.onclick = async () => {
  const actual = partida
  if (!actual?.ranked || actual.starting) return
  const intactas = actual.i === 0 && !actual.answered
  const confirmado =
    intactas ||
    (await confirmarAccion({
      title: '¿Reiniciar la ronda?',
      message: 'Empiezas de nuevo, con otras preguntas. Esta ronda no cuenta para el ranking.',
      confirmLabel: 'Reiniciar',
      cancelLabel: 'Seguir jugando',
    }))
  if (confirmado && partida === actual)
    iniciarPartida(actual.mode, { ranked: true, category: actual.category })
}

// Salir a media ronda pierde el avance (y, en una oficial, el puntaje): se pide confirmación.
resguardarSalida(() =>
  partida && !partida.starting
    ? confirmarAccion({
        title: '¿Salir de la ronda?',
        message: partida.ranked
          ? 'Es una ronda oficial: si sales ahora no cuenta para el ranking.'
          : 'Perderás el avance de esta ronda.',
        confirmLabel: 'Salir',
        cancelLabel: 'Seguir jugando',
      })
    : true,
)

window.addEventListener('beforeunload', evento => {
  if (partida && !partida.starting) evento.preventDefault()
})

document.addEventListener('keydown', evento => {
  if (!partida || evento.target.tagName === 'INPUT') return
  if (/^[1-9]$/.test(evento.key)) {
    const eleccion = panel.querySelectorAll('.opt')[+evento.key - 1]
    if (eleccion && !eleccion.disabled) eleccion.click()
  }
  if (evento.key === 'Enter') {
    const siguiente = $('#btnNext') || $('#btnConfirm')
    if (!siguiente || siguiente.disabled) return
    evento.preventDefault()
    siguiente.click()
  }
})
