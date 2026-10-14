import { estadisticas } from '../nucleo/progreso.js'
import { largoNormalDe, tieneRondaDeTodas } from '../../compartido/oficial.js'
import { aplicarReglasDeRonda, largoPara, guardarAjustes, ajustes } from '../nucleo/almacen.js'
import { $, escaparHtml } from '../nucleo/utilidades.js'
import {
  CATEGORIAS,
  CHILE,
  DATOS,
  IDS_DE_LINEA,
  LINEAS_DE_METRO,
  PARQUES,
  callesDelJuego,
  estaciones,
} from '../datos/datos.js'
import { lineasElegidas } from '../dominio/metro.js'
import { limpiarCapa, fijarChile, fijarRelieve } from '../mapa/mapa.js'
import { tieneRondaOficial, iniciarPartida, detenerPartida } from '../juego/engine.js'
import { MODOS, modoPorId } from '../juego/registry.js'
import { mostrarMisCalles } from './misCalles.js'
import { definirPantalla } from './navegacion.js'
import { NOMBRE_DE_LA_APP, ocultarPanel, vistaDePantalla, mostrarPantalla, titulo } from './panel.js'

const GRUPOS = [
  {
    name: 'Calles',
    emoji: '🛣️',
    blurb: `${callesDelJuego().length} avenidas, autopistas y carreteras.`,
  },
  {
    name: 'Street View',
    emoji: '👀',
    blurb: 'Te dejo parado en un punto de Santiago visto desde la calle y lo ubicas en el mapa.',
  },
  {
    name: 'Comunas',
    emoji: '🗺️',
    blurb: 'Ubica las comunas del Gran Santiago',
  },
  {
    name: 'Lugares emblemáticos',
    emoji: '📍',
    blurb: `${DATOS.landmarks.length} lugares: estadios, parques, malls, universidades, colegios, barrios, ríos y restaurantes.`,
  },
  {
    name: 'Metro',
    emoji: '🚇',
    blurb: `${estaciones.length} estaciones de las líneas L1 a L6, con sus combinaciones.`,
  },
  {
    name: 'Ruteo',
    emoji: '🧭',
    blurb:
      'Arma rutas paso a paso: en auto entre dos puntos cualquiera y en micro y metro. En Explorar puedes ver los recorridos de micro más importantes.',
  },
  {
    name: 'Chile',
    emoji: '🇨🇱',
    blurb: `Las 16 regiones y ${CHILE.cities.length} ciudades (con su población).`,
  },
  {
    name: 'Parques nacionales',
    emoji: '🌲',
    blurb: `Los ${PARQUES.length} parques nacionales: en qué región están y cómo se ven.`,
  },
  {
    name: 'Conexiones',
    emoji: '🔗',
    blurb:
      'Relaciona todo: cruces, calles de cada comuna, metro más cercano, comunas vecinas, puntos cardinales…',
  },
]

const enlace = (href, texto) => `<a href="${href}" target="_blank" rel="noopener">${texto}</a>`

const pastilla = (etiqueta, marcado, atributos, estilo = '') =>
  `<label class="chip ${marcado ? 'on' : ''}" style="${estilo}"><input type="checkbox" ${atributos} ${marcado ? 'checked' : ''}>${etiqueta}</label>`

// "Dominado" = acertado al menos dos veces seguidas.
function dominio(modo) {
  if (modo.study) return ''
  const elementos = modo.pool()
  if (!elementos.length) return ''
  const vistos = elementos.map(elemento => estadisticas[modo.id + ':' + modo.key(elemento)]).filter(Boolean)
  if (!vistos.length) return 'nuevo'
  const dominados = vistos.filter(entrada => entrada.streak >= 2).length
  return `${Math.round((dominados / elementos.length) * 100)}% dominado`
}

const TODAS_LAS_LINEAS = { lines: null }

// Los juegos de metro de la parte de arriba de su tarjeta usan siempre todas las líneas, y su "% dominado" también.
function conTodasLasLineas(calcular) {
  aplicarReglasDeRonda(TODAS_LAS_LINEAS)
  try {
    return calcular()
  } finally {
    aplicarReglasDeRonda(null)
  }
}

function etiquetaDeModo(modo, { todasLasLineas = false, conDescripcion = true } = {}) {
  const descripcion = conDescripcion && modo.desc ? `<br><small>${escaparHtml(modo.desc)}</small>` : ''
  const dominado = todasLasLineas ? conTodasLasLineas(() => dominio(modo)) : dominio(modo)
  return `<span><b>${escaparHtml(modo.name)}</b>${descripcion}</span>
      <span class="mastery">${dominado}</span>`
}

// El botón grande es la ronda oficial (cuenta para el ranking); el chico, una ronda de práctica.
// Un juego sin ronda oficial deja su único botón como práctica. Excepciones: en Street View la práctica es la grande y la
// oficial la chica (usa el nivel elegido); y en Metro la práctica va aparte, abajo, con las líneas elegidas.
function filaDeModo(modo) {
  const etiqueta = etiquetaDeModo(modo, { todasLasLineas: modo.group === 'Metro' })
  if (!tieneRondaOficial(modo))
    return `<div class="mode-row"><button class="mode" data-mode="${modo.id}">${etiqueta}</button></div>`
  if (modo.group === 'Street View')
    return `<div class="mode-row">
    <button class="mode" data-mode="${modo.id}" title="Práctica: ronda sin ranking">${etiqueta}</button>
    <button class="oficial-chico" data-official="${modo.id}" title="Ronda oficial: cuenta para el ranking, en el nivel elegido" aria-label="Ronda oficial de ${escaparHtml(modo.name)}">🏆</button>
  </div>`
  const botonOficial = `<button class="mode ranked" data-official="${modo.id}" title="Ronda oficial: cuenta para el ranking">${etiqueta}</button>`
  if (modo.group === 'Metro') return `<div class="mode-row">${botonOficial}</div>`
  return `<div class="mode-row">
    ${botonOficial}
    <button class="practice" data-mode="${modo.id}" title="Práctica: ronda sin ranking, con ayudas" aria-label="Práctica de ${escaparHtml(modo.name)}">🏋️</button>
  </div>`
}

// Práctica del metro: las líneas que elija el jugador.
const filaDePracticaDeMetro = modo =>
  `<div class="mode-row"><button class="mode" data-mode="${modo.id}">${etiquetaDeModo(modo, { conDescripcion: false })}</button></div>`

function subseccionDePracticaDeMetro(modos) {
  return `<hr class="separador"><h4 class="subseccion">Práctica</h4>
    ${fichasDeLineasDeMetro()}
    <div class="modes">${modos.map(filaDePracticaDeMetro).join('')}</div>`
}

// La periferia (Colina, Lampa, Padre Hurtado, Pirque, Buin…) cambia qué comunas hay en los juegos de comunas, y cada
// alcance tiene su propio ranking.
const selectorDeAlcance = () => `<label class="length-row" for="setScope">Comunas incluidas</label>
    <select id="setScope">
      <option value="core">Gran Santiago (34 comunas)</option>
      <option value="peri">Gran Santiago + periferia (Colina, Lampa, Padre Hurtado, Pirque, Buin…)</option>
      <option value="all">Toda la Región Metropolitana (52)</option>
    </select>`

function fichasDeLineasDeMetro() {
  const fichas = IDS_DE_LINEA.map(id => {
    const on = lineasElegidas().includes(id)
    const color = LINEAS_DE_METRO[id].color
    return pastilla(
      id,
      on,
      `data-line="${id}"`,
      on ? `background:${color};border-color:${color};color:#fff` : '',
    )
  })
  return `<div class="chips" id="setLines" style="margin-bottom:10px">${fichas.join('')}</div>`
}

// Los juegos paso a paso van primero dentro de su grupo.
const pasosPrimero = (a, b) => (b.id.startsWith('rs-') ? 1 : 0) - (a.id.startsWith('rs-') ? 1 : 0)

const OPCIONES_DE_LARGO = [20, 999]

const NIVELES_DE_STREET_VIEW = [
  ['facil', 'Fácil'],
  ['medio', 'Medio'],
  ['dificil', 'Difícil'],
  ['extremo', 'Extremo'],
]

// Cuántas preguntas por ronda, en la tarjeta del juego. Los juegos que siempre recorren todo su conjunto
// (las comunas: son pocas) no lo ofrecen.
function selectorDeLargo(grupo, modos) {
  if (modos.every(modo => modo.all || !tieneRondaDeTodas(modo.id))) return ''
  const opciones = OPCIONES_DE_LARGO.map(
    eleccion =>
      `<option value="${eleccion}" ${eleccion === largoPara(grupo) ? 'selected' : ''}>${eleccion === 999 ? 'Todas' : largoNormalDe(modos[0].id)}</option>`,
  )
  return `<label class="length-row">Preguntas por ronda <select data-length-group="${escaparHtml(grupo)}">${opciones.join('')}</select></label>`
}

// Qué tan completas son las preguntas de Street View en la práctica; la ronda oficial siempre usa todas.
function selectorDeNivel(grupo) {
  if (grupo !== 'Street View') return ''
  const opciones = NIVELES_DE_STREET_VIEW.map(
    ([valor, etiqueta]) =>
      `<option value="${valor}" ${valor === ajustes.nivelStreetView ? 'selected' : ''}>${etiqueta}</option>`,
  )
  return `<label class="length-row">Nivel <select id="nivelStreetView">${opciones.join('')}</select></label>`
}

// Lugares emblemáticos: qué categorías preguntar y qué tan estricto es el margen (solo en la práctica).
function ajustesDeLugares() {
  const elegidos = ajustes.cats || CATEGORIAS
  const fichasDeCategoria = CATEGORIAS.map(categoria =>
    pastilla(escaparHtml(categoria), elegidos.includes(categoria), `data-cat="${escaparHtml(categoria)}"`),
  )
  return `<label>Categorías de lugares emblemáticos</label>
    <div class="chips" id="setCats">${fichasDeCategoria.join('')}</div>
    <p class="muted nota">Las categorías valen solo para la práctica; las rondas oficiales preguntan todas.</p>`
}

// Todo lo configurable de un grupo va al final de su tarjeta, bajo una raya.
function ajustesDeLaTarjeta(grupo, modos) {
  const opciones = [
    selectorDeLargo(grupo.name, modos),
    selectorDeNivel(grupo.name),
    grupo.name === 'Comunas' ? selectorDeAlcance() : '',
    grupo.name === 'Lugares emblemáticos' ? ajustesDeLugares() : '',
  ].filter(Boolean)
  return opciones.length
    ? `<hr class="separador"><div class="ajustes-de-tarjeta">${opciones.join('')}</div>`
    : ''
}

function tarjetaDeGrupo(grupo) {
  const modos = MODOS.filter(modo => modo.group === grupo.name && (modo.disponible?.() ?? true)).sort(
    pasosPrimero,
  )
  if (!modos.length) return ''
  return `<div class="card">
    <h3><span class="em">${grupo.emoji}</span>${grupo.name}</h3><p>${grupo.blurb}</p>
    <div class="modes">${modos.map(filaDeModo).join('')}</div>
    ${grupo.name === 'Metro' ? subseccionDePracticaDeMetro(modos) : ''}
    ${ajustesDeLaTarjeta(grupo, modos)}
  </div>`
}

const htmlDeCreditos = () =>
  `<p class="foot">Mapas y datos: © ${enlace('https://www.openstreetmap.org/copyright', 'OpenStreetMap')} (ODbL),
    mapa base © ${enlace('https://openfreemap.org', 'OpenFreeMap')} / OpenMapTiles, rutas: ${enlace('https://project-osrm.org', 'OSRM')},
    recorridos: Red (DTPM), relieve: AWS Terrain Tiles, fotos: autores indicados en cada foto vía
    ${enlace('https://commons.wikimedia.org', 'Wikimedia Commons')} y ${enlace('https://panoramax.fr', 'Panoramax')}.
    Datos generados el ${escaparHtml(DATOS.built)}.</p>`

const htmlDeInicio = () => `<div class="home-backdrop" aria-hidden="true"></div>
  <div class="wrap">
  <div class="hero inicio"><h2>¿Dónde queda eso? 🏔️</h2>
    <p>Practica comunas, lugares, calles, rutas y metro de Santiago.</p></div>
  <div class="grid">
    ${GRUPOS.map(tarjetaDeGrupo).join('')}
  </div>
  <div class="grid settings">
    <div class="card"><h3><span class="em">➕</span>Mis calles</h3>
      <p>Agrega calles que te importan a ti (la de tu casa, la de un amigo). Aparecen en los juegos de calles y se guardan solo en este navegador.</p>
      <div id="myst"></div></div>
  </div>
  ${htmlDeCreditos()}
</div>`

const valoresMarcados = (contenedor, atributo) =>
  [...contenedor.querySelectorAll('input:checked')].map(entrada => entrada.dataset[atributo])

// Un ajuste que cambia lo que se juega vuelve a dibujar el menú, pero sin mandar al usuario arriba.
function redibujarInicioSinSaltar() {
  const posicion = vistaDePantalla.scrollTop
  abrirInicio()
  vistaDePantalla.scrollTop = posicion
}

function conectarAjustes() {
  const lineas = $('#setLines')
  for (const entrada of lineas.querySelectorAll('input'))
    entrada.onchange = () => {
      const elegidos = valoresMarcados(lineas, 'line')
      ajustes.lines = !elegidos.length || elegidos.length === IDS_DE_LINEA.length ? null : elegidos
      guardarAjustes()
      redibujarInicioSinSaltar()
    }

  const alcance = $('#setScope')
  alcance.value = ajustes.scope
  alcance.onchange = () => {
    ajustes.scope = alcance.value
    guardarAjustes()
    redibujarInicioSinSaltar()
  }

  for (const selectorElegido of vistaDePantalla.querySelectorAll('[data-length-group]'))
    selectorElegido.onchange = () => {
      ajustes.lengths = { ...ajustes.lengths, [selectorElegido.dataset.lengthGroup]: +selectorElegido.value }
      guardarAjustes()
    }

  const nivelStreetView = $('#nivelStreetView')
  if (nivelStreetView)
    nivelStreetView.onchange = () => {
      ajustes.nivelStreetView = nivelStreetView.value
      guardarAjustes()
    }

  const categorias = $('#setCats')
  for (const entrada of categorias?.querySelectorAll('input') ?? [])
    entrada.onchange = () => {
      entrada.parentElement.classList.toggle('on', entrada.checked)
      const elegidos = valoresMarcados(categorias, 'cat')
      ajustes.cats = elegidos.length === CATEGORIAS.length ? null : elegidos
      guardarAjustes()
    }
}

function abrirInicio() {
  detenerPartida()
  limpiarCapa()
  ocultarPanel()
  fijarRelieve(false)
  fijarChile(false)
  titulo.textContent = NOMBRE_DE_LA_APP
  mostrarPantalla(htmlDeInicio())

  for (const boton of vistaDePantalla.querySelectorAll('[data-mode]'))
    boton.onclick = () => iniciarPartida(modoPorId(boton.dataset.mode))
  for (const boton of vistaDePantalla.querySelectorAll('[data-official]'))
    boton.onclick = () => iniciarPartida(modoPorId(boton.dataset.official), { ranked: true })
  mostrarMisCalles($('#myst'))
  conectarAjustes()
}

definirPantalla('home', abrirInicio)
