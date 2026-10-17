import { estadisticas } from '../nucleo/progreso.js'
import {
  NIVELES_DE_STREET_VIEW,
  etiquetaDeCategoria,
  largoNormalDe,
  tieneRondaDeTodas,
} from '../../compartido/oficial.js'
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
import { ocultarPanel, vistaDePantalla, mostrarPantalla } from './panel.js'
import { htmlDelPie } from './pie.js'
import { conectarPuntoDeRuteo, htmlDelPuntoDeRuteo } from './puntoDeRuteo.js'
import { alTraerProgreso } from '../cuenta/progresoCompartido.js'

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

// El "% dominado" de un juego con otras reglas que las del jugador (todas las líneas del metro, un nivel de Street View).
function conReglas(reglas, calcular) {
  aplicarReglasDeRonda(reglas)
  try {
    return calcular()
  } finally {
    aplicarReglasDeRonda(null)
  }
}

function etiquetaDeModo(modo, { todasLasLineas = false, conDescripcion = true } = {}) {
  const descripcion = conDescripcion && modo.desc ? `<br><small>${escaparHtml(modo.desc)}</small>` : ''
  const dominado = todasLasLineas ? conReglas(TODAS_LAS_LINEAS, () => dominio(modo)) : dominio(modo)
  return `<span><b>${escaparHtml(modo.name)}</b>${descripcion}</span>
      <span class="mastery">${dominado}</span>`
}

const DESCRIPCION_DE_NIVEL = {
  facil: 'Lo que todos conocen, sobre todo del centro',
  medio: 'Los grandes ejes, autopistas y lugares más conocidos',
  dificil: 'Además, las avenidas largas y otros lugares conocidos',
  extremo: 'Cualquier calle o lugar del juego',
}

// Street View: una ronda oficial por nivel, y cada nivel tiene su ranking.
function filasDeNivelesDeStreetView(modo) {
  return NIVELES_DE_STREET_VIEW.map(nivel => {
    const nombre = etiquetaDeCategoria(nivel)
    const dominado = conReglas({ nivelStreetView: nivel }, () => dominio(modo))
    return `<div class="mode-row">
    <button class="mode ranked" data-official="${modo.id}" data-nivel="${nivel}" title="Ronda oficial del nivel ${nombre}: cuenta para su ranking">
      <span><b>${nombre}</b><br><small>${DESCRIPCION_DE_NIVEL[nivel]}</small></span><span class="mastery">${dominado}</span>
    </button>
  </div>`
  }).join('')
}

// El botón grande es la ronda oficial (cuenta para el ranking); el chico, una ronda de práctica.
// Un juego sin ronda oficial deja su único botón como práctica. Excepciones: los juegos solo oficiales (soloOficial: Street
// View, con un botón por nivel, Comunas, Chile y Parques) no tienen práctica; y en Metro la práctica va aparte, abajo.
function filaDeModo(modo) {
  if (modo.group === 'Street View' && tieneRondaOficial(modo)) return filasDeNivelesDeStreetView(modo)
  const etiqueta = etiquetaDeModo(modo, { todasLasLineas: modo.group === 'Metro' })
  if (!tieneRondaOficial(modo))
    return `<div class="mode-row"><button class="mode" data-mode="${modo.id}">${etiqueta}</button></div>`
  const botonOficial = `<button class="mode ranked" data-official="${modo.id}" title="Ronda oficial: cuenta para el ranking">${etiqueta}</button>`
  if (modo.group === 'Metro' || modo.soloOficial) return `<div class="mode-row">${botonOficial}</div>`
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
    grupo.name === 'Comunas' ? selectorDeAlcance() : '',
    grupo.name === 'Lugares emblemáticos' ? ajustesDeLugares() : '',
    grupo.name === 'Ruteo' ? htmlDelPuntoDeRuteo() : '',
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
  ${htmlDelPie()}
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
  mostrarPantalla(htmlDeInicio())

  for (const boton of vistaDePantalla.querySelectorAll('[data-mode]'))
    boton.onclick = () => iniciarPartida(modoPorId(boton.dataset.mode))
  // Los botones de nivel de Street View traen el nivel, que es la categoría de su ranking.
  for (const boton of vistaDePantalla.querySelectorAll('[data-official]'))
    boton.onclick = () =>
      iniciarPartida(modoPorId(boton.dataset.official), {
        ranked: true,
        category: boton.dataset.nivel ?? null,
      })
  mostrarMisCalles($('#myst'))
  conectarAjustes()
  conectarPuntoDeRuteo(redibujarInicioSinSaltar)
}

definirPantalla('home', abrirInicio)

// Cuando llega el progreso de la cuenta (jugado en otro dispositivo), el "% dominado" del menú se pone al día.
const menuALaVista = () =>
  !vistaDePantalla.classList.contains('hidden') && !!vistaDePantalla.querySelector('.home-backdrop')
alTraerProgreso(() => {
  if (menuALaVista()) redibujarInicioSinSaltar()
})
