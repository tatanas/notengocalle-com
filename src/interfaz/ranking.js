import {
  CATEGORIAS_DE_RONDA,
  TODAS_LAS_PREGUNTAS,
  ajusteDeCategoria,
  categoriasValidasDe,
  etiquetaDeCategoria,
  textoDeCategoria,
} from '../../compartido/oficial.js'
import { pedirTabla, pedirLideres } from '../cuenta/puntajes.js'
import { cuentasDisponibles, usuario } from '../cuenta/sesion.js'
import { ajustes, almacen } from '../nucleo/almacen.js'
import { $, escaparHtml, formatearTiempoExacto } from '../nucleo/utilidades.js'
import { limpiarCapa } from '../mapa/mapa.js'
import { tieneRondaOficial, iniciarPartida, detenerPartida } from '../juego/engine.js'
import { MODOS, modoPorId } from '../juego/registry.js'
import { abrirDialogoDeCuenta } from './cuenta.js'
import { definirPantalla } from './navegacion.js'
import { ocultarPanel, mostrarPantalla } from './panel.js'
import { htmlDelPie } from './pie.js'
import { htmlDeAnuncio } from './anuncios.js'

const ETIQUETAS_DE_PERIODO = { todo: 'Histórico', semana: 'Últimos 7 días' }
const TODOS_LOS_JUEGOS = ''
const CATEGORIA_POR_DEFECTO = '20'

// Qué tabla se está mirando: un juego (o el resumen de líderes), el largo de la ronda y el período.
const vista = {
  modo: TODOS_LOS_JUEGOS,
  categoria: CATEGORIA_POR_DEFECTO,
  periodo: 'todo',
  ...almacen.get('ranking', {}),
}

// Cuántos jugadores tiene cada categoría del juego mirado; solo se conoce al cargar su tabla.
let jugadoresPorCategoria = {}

// Los juegos que recorren siempre todo su conjunto (las comunas) no tienen largos: solo "todas".
const categoriasDe = idDeModo => {
  if (!idDeModo) return CATEGORIAS_DE_RONDA
  if (ajusteDeCategoria(idDeModo)) return categoriasValidasDe(idDeModo)
  return modoPorId(idDeModo)?.all ? [TODAS_LAS_PREGUNTAS] : categoriasValidasDe(idDeModo)
}

const modosOficiales = () => MODOS.filter(tieneRondaOficial)
const gruposDe = modos => [...new Set(modos.map(modo => modo.group))]
const puntaje = entrada => `${entrada.aciertos}/${entrada.total}`
const fechaYHora = iso =>
  new Date(iso).toLocaleString('es-CL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
const soyYo = entrada => !!usuario && entrada.nombre === usuario.nombre

function htmlDeSelectorDeJuego() {
  const modos = modosOficiales()
  const grupos = gruposDe(modos).map(grupo => {
    const opciones = modos
      .filter(modo => modo.group === grupo)
      .map(
        modo =>
          `<option value="${modo.id}" ${modo.id === vista.modo ? 'selected' : ''}>${escaparHtml(modo.name)}</option>`,
      )
    return `<optgroup label="${escaparHtml(grupo)}">${opciones.join('')}</optgroup>`
  })
  return `<select id="rankMode" aria-label="Juego"><option value="${TODOS_LOS_JUEGOS}">Líderes de cada juego</option>${grupos.join('')}</select>`
}

const htmlDeFichasDePeriodo = () =>
  Object.entries(ETIQUETAS_DE_PERIODO)
    .map(
      ([periodo, etiqueta]) =>
        `<button class="chip ${periodo === vista.periodo ? 'on' : ''}" data-period="${periodo}">${etiqueta}</button>`,
    )
    .join('')

// Pestañas por largo de ronda: cada una es un ranking aparte, porque 20 preguntas y todas no se pueden comparar.
function htmlDePestanasDeCategoria() {
  const pestanas = categoriasDe(vista.modo).map(categoria => {
    const jugadores = vista.modo ? jugadoresPorCategoria[categoria] : null
    const cantidad = jugadores ? ` <small>${jugadores}</small>` : ''
    return `<button class="tab ${categoria === vista.categoria ? 'on' : ''}" data-category="${categoria}">${etiquetaDeCategoria(categoria)}${cantidad}</button>`
  })
  return `<div class="tabs" role="tablist" aria-label="Número de preguntas">${pestanas.join('')}</div>`
}

const filaDeTabla = entrada =>
  `<tr class="${soyYo(entrada) ? 'me' : ''}"><td>${entrada.puesto}</td><td>${escaparHtml(entrada.nombre)}</td><td>${puntaje(entrada)}</td><td>${formatearTiempoExacto(entrada.ms)}</td><td class="muted">${fechaYHora(entrada.en)}</td></tr>`

function htmlDeTabla({ filas, jugadores, yo }) {
  if (!filas.length)
    return `<p class="muted">Nadie ha jugado esta ronda (${textoDeCategoria(vista.modo, vista.categoria)}) en este período. ¡Puedes ser el primero!</p>`
  const sobreLaTabla =
    yo && !filas.some(soyYo)
      ? `<tr><td colspan="5" class="muted">…</td></tr>${filaDeTabla({ ...yo, nombre: usuario.nombre })}`
      : ''
  return `<table class="stats board"><tr><th>#</th><th>Jugador</th><th>Aciertos</th><th>Tiempo</th><th>Fecha</th></tr>
    ${filas.map(filaDeTabla).join('')}${sobreLaTabla}</table>
    <p class="muted" style="font-size:12.5px">${jugadores} ${jugadores === 1 ? 'jugador' : 'jugadores'} en ${textoDeCategoria(vista.modo, vista.categoria)}. Cuenta la mejor ronda de cada uno.</p>`
}

function htmlDeLideres({ modos }) {
  const filas = modosOficiales().map(modo => {
    const entrada = modos[modo.id]
    const lider = entrada
      ? `<td>${escaparHtml(entrada.lider.nombre)}</td><td>${puntaje(entrada.lider)} · ${formatearTiempoExacto(entrada.lider.ms)}</td>`
      : '<td class="muted" colspan="2">sin marcas todavía</td>'
    const mia = entrada?.yo ? `${entrada.yo.puesto}.º de ${entrada.jugadores}` : '—'
    return `<tr data-open="${modo.id}"><td><b>${escaparHtml(modo.name)}</b><br><small class="muted">${escaparHtml(modo.group)}</small></td>${lider}<td>${mia}</td></tr>`
  })
  return `<table class="stats board clickable"><tr><th>Juego</th><th>Líder</th><th>Marca</th><th>Tu puesto</th></tr>${filas.join('')}</table>`
}

const htmlDeRegistrados = registrados =>
  registrados
    ? `<p class="muted" style="font-size:12.5px">${registrados} ${registrados === 1 ? 'usuario registrado' : 'usuarios registrados'} en NoTengoCalle.</p>`
    : ''

function htmlDePie() {
  const jugar = vista.modo
    ? `<button class="btn" id="rankPlay">🏆 Jugar la ronda oficial (${textoDeCategoria(vista.modo, vista.categoria)})</button>`
    : ''
  const iniciarSesionEnRanking = usuario
    ? ''
    : '<button class="btn sec" id="rankSignIn">Entrar o crear cuenta</button>'
  const notaDeInvitado = usuario
    ? ''
    : '<p class="muted" style="font-size:12.5px">Puedes jugar sin cuenta, pero solo los puntajes con cuenta aparecen aquí.</p>'
  return `<div class="row" style="margin-top:12px">${jugar}${iniciarSesionEnRanking}</div>${notaDeInvitado}`
}

async function cargarTabla() {
  const cuerpo = $('#rankBody')
  const solicitado = { ...vista }
  cuerpo.innerHTML = '<p class="muted">Cargando…</p>'
  let html
  let registrados = null
  try {
    if (vista.modo) {
      const tabla = await pedirTabla(vista.modo, vista.categoria, vista.periodo)
      jugadoresPorCategoria = tabla.jugadas
      registrados = tabla.registrados
      html = htmlDeTabla(tabla)
    } else {
      jugadoresPorCategoria = {}
      const resumen = await pedirLideres(vista.categoria, vista.periodo)
      registrados = resumen.registrados
      html = htmlDeLideres(resumen)
    }
  } catch (error) {
    html = `<p class="muted">No se pudo cargar el ranking: ${escaparHtml(error.message)}.</p>`
  }
  const sigueVigente =
    cuerpo.isConnected &&
    solicitado.modo === vista.modo &&
    solicitado.categoria === vista.categoria &&
    solicitado.periodo === vista.periodo
  if (!sigueVigente) return
  cuerpo.innerHTML = html + htmlDePie() + htmlDeRegistrados(registrados)
  $('#rankTabs').innerHTML = htmlDePestanasDeCategoria()
  conectarPestanas()

  for (const fila of cuerpo.querySelectorAll('[data-open]'))
    fila.onclick = () => elegirVista({ modo: fila.dataset.open })
  if ($('#rankPlay'))
    $('#rankPlay').onclick = () =>
      iniciarPartida(modoPorId(vista.modo), { ranked: true, category: vista.categoria })
  if ($('#rankSignIn')) $('#rankSignIn').onclick = () => abrirDialogoDeCuenta().then(cargarTabla)
}

// Si la pestaña elegida no existe en este juego (los de comunas solo tienen "todas"), se pasa a la que sí.
function mantenerCategoriaValida() {
  const validas = categoriasDe(vista.modo)
  if (!validas.includes(vista.categoria))
    vista.categoria =
      [ajustes[ajusteDeCategoria(vista.modo)?.ajuste], CATEGORIA_POR_DEFECTO].find(c =>
        validas.includes(c),
      ) ?? validas[0]
}

function elegirVista(cambio) {
  Object.assign(vista, cambio)
  mantenerCategoriaValida()
  almacen.set('ranking', vista)
  dibujar()
}

function conectarPestanas() {
  for (const pestana of document.querySelectorAll('[data-category]'))
    pestana.onclick = () => elegirVista({ categoria: pestana.dataset.category })
}

function dibujar() {
  mostrarPantalla(`<div class="wrap narrow">
    <div class="hero"><h2>🏆 Ranking</h2>
      <p>Solo cuentan las rondas oficiales. Gana quien acierta más; si hay empate, quien pensó menos tiempo. Cada largo de ronda tiene su propio ranking.</p></div>
    <div class="card">
      <div class="row">${htmlDeSelectorDeJuego()}<div class="chips">${htmlDeFichasDePeriodo()}</div></div>
      <div id="rankTabs" style="margin-top:12px">${htmlDePestanasDeCategoria()}</div>
      <div id="rankBody" style="margin-top:12px"></div>
    </div>
    ${htmlDeAnuncio('paginas')}
    ${htmlDelPie()}
  </div>`)
  $('#rankMode').onchange = evento => elegirVista({ modo: evento.target.value })
  for (const pastilla of document.querySelectorAll('[data-period]'))
    pastilla.onclick = () => elegirVista({ periodo: pastilla.dataset.period })
  conectarPestanas()

  if (cuentasDisponibles) cargarTabla()
  else $('#rankBody').innerHTML = '<p class="muted">El ranking no está disponible en este momento.</p>'
}

// Se abre en "Líderes de cada juego", salvo que vengan de un resultado: ahí, en el juego y el largo de la ronda recién jugada.
function abrirRanking(idDeModo, categoria) {
  detenerPartida()
  limpiarCapa()
  ocultarPanel()
  vista.modo = idDeModo ?? TODOS_LOS_JUEGOS
  if (categoria !== undefined) vista.categoria = categoria
  if (vista.modo && !modosOficiales().some(modo => modo.id === vista.modo)) vista.modo = TODOS_LOS_JUEGOS
  mantenerCategoriaValida()
  jugadoresPorCategoria = {}
  dibujar()
}

definirPantalla('ranking', abrirRanking)
