import {
  CATEGORIAS_DE_RONDA,
  MODOS_DIARIOS,
  esModoDiario,
  fechaDeAyerEnChile,
  fechaDeHoyEnChile,
  ajusteDeCategoria,
  categoriaEnElResumen,
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

// Cada juego tiene solo los largos que existen para él (las comunas y las regiones recorren todo su conjunto: no tienen de 10 ni de 20).
const categoriasDe = idDeModo => (idDeModo ? categoriasValidasDe(idDeModo) : CATEGORIAS_DE_RONDA)

// Los desafíos diarios tienen su propia tarjeta arriba; el resto, la de siempre.
const modosOficiales = () => MODOS.filter(modo => tieneRondaOficial(modo) && !modo.diario)
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

function htmlDeTabla({ filas, jugadores, yo }, modo = vista.modo, categoria = vista.categoria) {
  if (!filas.length)
    return `<p class="muted">Nadie ha jugado esta ronda (${textoDeCategoria(modo, categoria)}) en este período. ¡Puedes ser el primero!</p>`
  const sobreLaTabla =
    yo && !filas.some(soyYo)
      ? `<tr><td colspan="5" class="muted">…</td></tr>${filaDeTabla({ ...yo, nombre: usuario.nombre })}`
      : ''
  return `<table class="stats board"><tr><th>#</th><th>Jugador</th><th>Aciertos</th><th>Tiempo</th><th>Fecha</th></tr>
    ${filas.map(filaDeTabla).join('')}${sobreLaTabla}</table>
    <p class="muted" style="font-size:12.5px">${jugadores} ${jugadores === 1 ? 'jugador' : 'jugadores'} en ${textoDeCategoria(modo, categoria)}. Gana quien más acierta; si hay empate, quien tardó menos.</p>`
}

// Solo los juegos que tienen la pestaña elegida; los de comunas y Street View, con el alcance o el nivel que cuenta en ella.
function htmlDeLideres({ modos }) {
  const filas = modosOficiales().flatMap(modo => {
    const categoria = categoriaEnElResumen(modo.id, vista.categoria)
    if (!categoria) return []
    const entrada = modos[modo.id]
    const detalle = ajusteDeCategoria(modo.id) ? ` · ${etiquetaDeCategoria(categoria)}` : ''
    const lider = entrada
      ? `<td>${escaparHtml(entrada.lider.nombre)}</td><td>${puntaje(entrada.lider)} · ${formatearTiempoExacto(entrada.lider.ms)}</td>`
      : '<td class="muted" colspan="2">sin marcas todavía</td>'
    const mia = entrada?.yo ? `${entrada.yo.puesto}.º de ${entrada.jugadores}` : '—'
    return [
      `<tr data-open="${modo.id}"><td><b>${escaparHtml(modo.name)}</b><br><small class="muted">${escaparHtml(modo.group)}${escaparHtml(detalle)}</small></td>${lider}<td>${mia}</td></tr>`,
    ]
  })
  return `<table class="stats board clickable"><tr><th>Juego</th><th>Líder</th><th>Marca</th><th>Tu puesto</th></tr>${filas.join('')}</table>`
}

const htmlDeRegistrados = registrados =>
  registrados
    ? `<p class="muted" style="font-size:12.5px">${registrados} ${registrados === 1 ? 'usuario registrado' : 'usuarios registrados'} en NoTengoCalle.</p>`
    : ''

function htmlDePie() {
  // Los desafíos diarios se juegan una sola vez desde el menú.
  const jugar =
    vista.modo && !modoPorId(vista.modo)?.diario
      ? `<button class="btn" id="rankPlay">🏆 Jugar (${textoDeCategoria(vista.modo, vista.categoria)})</button>`
      : ''
  const iniciarSesionEnRanking = usuario
    ? ''
    : '<button class="btn sec" id="rankSignIn">Entrar o crear cuenta</button>'
  const notaDeInvitado = usuario
    ? ''
    : '<p class="muted" style="font-size:12.5px">Puedes jugar sin cuenta, pero solo los puntajes con cuenta aparecen aquí.</p>'
  return `<div class="row" style="margin-top:12px">${jugar}${iniciarSesionEnRanking}</div>${notaDeInvitado}`
}

// ----- los desafíos diarios: una tarjeta aparte, arriba de todo, con el del día elegido (hoy o ayer)

const vistaDiaria = { modo: MODOS_DIARIOS[0], dia: 'hoy' }
const modosDiarios = () => MODOS_DIARIOS.map(modoPorId).filter(modo => modo && (modo.disponible?.() ?? true))
const categoriaDelDia = () => (vistaDiaria.dia === 'hoy' ? fechaDeHoyEnChile() : fechaDeAyerEnChile())

function htmlDeLaTarjetaDiaria() {
  const fichas = (lista, activo, atributo) =>
    lista
      .map(
        ([valor, etiqueta]) =>
          `<button class="chip ${valor === activo ? 'on' : ''}" ${atributo}="${valor}">${escaparHtml(etiqueta)}</button>`,
      )
      .join('')
  return `<div class="card" id="rankDiario">
    <h3 style="margin-top:0">📅 Desafíos diarios</h3>
    <div class="chips">${fichas(
      modosDiarios().map(modo => [modo.id, modo.name]),
      vistaDiaria.modo,
      'data-diario-modo',
    )}</div>
    <div class="chips" style="margin-top:8px">${fichas(
      [
        ['hoy', 'Hoy'],
        ['ayer', 'Ayer'],
      ],
      vistaDiaria.dia,
      'data-diario-dia',
    )}</div>
    <div id="rankDiarioCuerpo" style="margin-top:12px"></div>
  </div>`
}

async function cargarTablaDiaria() {
  const cuerpo = $('#rankDiarioCuerpo')
  const solicitado = { ...vistaDiaria }
  cuerpo.innerHTML = '<p class="muted">Cargando…</p>'
  let html
  try {
    html = htmlDeTabla(
      await pedirTabla(vistaDiaria.modo, categoriaDelDia(), 'todo'),
      vistaDiaria.modo,
      categoriaDelDia(),
    )
  } catch (error) {
    html = `<p class="muted">No se pudo cargar el ranking: ${escaparHtml(error.message)}.</p>`
  }
  if (cuerpo.isConnected && solicitado.modo === vistaDiaria.modo && solicitado.dia === vistaDiaria.dia)
    cuerpo.innerHTML = html
}

function conectarTarjetaDiaria() {
  for (const ficha of document.querySelectorAll('[data-diario-modo], [data-diario-dia]'))
    ficha.onclick = () => {
      vistaDiaria.modo = ficha.dataset.diarioModo ?? vistaDiaria.modo
      vistaDiaria.dia = ficha.dataset.diarioDia ?? vistaDiaria.dia
      dibujar()
    }
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
      <p>Las rondas de práctica no cuentan. Gana quien acierta más; si hay empate, quien pensó menos tiempo. Cada largo de ronda tiene su propio ranking.</p></div>
    ${htmlDeLaTarjetaDiaria()}
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
  conectarTarjetaDiaria()

  if (cuentasDisponibles) {
    cargarTablaDiaria()
    cargarTabla()
  } else {
    const noDisponible = '<p class="muted">El ranking no está disponible en este momento.</p>'
    $('#rankDiarioCuerpo').innerHTML = noDisponible
    $('#rankBody').innerHTML = noDisponible
  }
}

// Se abre en "Líderes de cada juego", salvo que vengan de un resultado: ahí, en el juego y el largo de la ronda recién jugada.
function abrirRanking(idDeModo, categoria) {
  // Venir de un desafío diario abre su tarjeta, arriba; la de siempre queda como estaba.
  if (esModoDiario(idDeModo)) {
    vistaDiaria.modo = idDeModo
    vistaDiaria.dia = categoria === fechaDeAyerEnChile() ? 'ayer' : 'hoy'
    idDeModo = undefined
    categoria = undefined
  }
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
