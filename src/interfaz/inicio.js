import { mejores, reiniciarProgreso, estadisticas } from '../nucleo/progreso.js'
import { largoPara, guardarAjustes, ajustes } from '../nucleo/almacen.js'
import { $, escaparHtml, formatearTiempo } from '../nucleo/utilidades.js'
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
import { definirPantalla, navegar } from './navegacion.js'
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
    blurb: 'Ubica las comunas del Gran Santiago y aprende con cuáles limita cada una.',
  },
  {
    name: 'Lugares emblemáticos',
    emoji: '📍',
    blurb: `${DATOS.landmarks.length} lugares: estadios, parques, malls, universidades, colegios, barrios, ríos y restaurantes.`,
  },
  {
    name: 'Metro',
    emoji: '🚇',
    blurb: `${estaciones.length} estaciones de las líneas L1 a L6, con sus combinaciones. Elige con qué líneas jugar.`,
  },
  {
    name: 'Ruteo',
    emoji: '🧭',
    blurb: `Arma rutas paso a paso: ${(DATOS.steps || []).length} en auto entre dos puntos cualquiera y ${(DATOS.transit || []).length} en micro y metro. En Explorar puedes ver los recorridos de micro más importantes.`,
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

// El botón grande es la ronda oficial (cuenta para el ranking); el chico, una ronda de práctica.
// Un juego sin ronda oficial deja su único botón como práctica.
function filaDeModo(modo) {
  const etiqueta = `<span><b>${escaparHtml(modo.name)}</b><br><small>${escaparHtml(modo.desc)}</small></span>
      <span class="mastery">${dominio(modo)}</span>`
  if (!tieneRondaOficial(modo))
    return `<div class="mode-row"><button class="mode" data-mode="${modo.id}">${etiqueta}</button></div>`
  return `<div class="mode-row">
    <button class="mode ranked" data-official="${modo.id}" title="Ronda oficial: cuenta para el ranking">${etiqueta}</button>
    <button class="practice" data-mode="${modo.id}" title="Práctica: ronda sin ranking, con ayudas" aria-label="Práctica de ${escaparHtml(modo.name)}">🏋️</button>
  </div>`
}

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
  return `<div class="chips" id="setLines" style="margin-bottom:10px">${fichas.join('')}
    <span class="muted" style="font-size:12px;align-self:center">← líneas con las que jugar</span></div>`
}

// Los juegos paso a paso van primero dentro de su grupo.
const pasosPrimero = (a, b) => (b.id.startsWith('rs-') ? 1 : 0) - (a.id.startsWith('rs-') ? 1 : 0)

const OPCIONES_DE_LARGO = [20, 999]

// Cuántas preguntas por ronda, en la tarjeta del juego. Los juegos que siempre recorren todo su conjunto
// (las comunas: son pocas) no lo ofrecen.
function selectorDeLargo(grupo, modos) {
  if (modos.every(modo => modo.all)) return ''
  const opciones = OPCIONES_DE_LARGO.map(
    eleccion =>
      `<option value="${eleccion}" ${eleccion === largoPara(grupo) ? 'selected' : ''}>${eleccion === 999 ? 'Todas' : eleccion}</option>`,
  )
  return `<label class="length-row">Preguntas por ronda <select data-length-group="${escaparHtml(grupo)}">${opciones.join('')}</select></label>`
}

function tarjetaDeGrupo(grupo) {
  const modos = MODOS.filter(modo => modo.group === grupo.name && (modo.disponible?.() ?? true)).sort(
    pasosPrimero,
  )
  if (!modos.length) return ''
  return `<div class="card">
    <h3><span class="em">${grupo.emoji}</span>${grupo.name}</h3><p>${grupo.blurb}</p>
    ${selectorDeLargo(grupo.name, modos)}
    ${grupo.name === 'Metro' ? fichasDeLineasDeMetro() : ''}
    <div class="modes">${modos.map(filaDeModo).join('')}</div>
  </div>`
}

function tarjetaDeAjustes() {
  const elegidos = ajustes.cats || CATEGORIAS
  const fichasDeCategoria = CATEGORIAS.map(categoria =>
    pastilla(escaparHtml(categoria), elegidos.includes(categoria), `data-cat="${escaparHtml(categoria)}"`),
  )
  return `<div class="card"><h3><span class="em">⚙️</span>Ajustes</h3>
    <label for="setScope">Comunas incluidas</label>
    <select id="setScope">
      <option value="core">Gran Santiago (34 comunas)</option>
      <option value="peri">Gran Santiago + periferia (Colina, Lampa, Padre Hurtado, Pirque, Buin…)</option>
      <option value="all">Toda la Región Metropolitana (52)</option>
    </select>
    <label>Categorías de lugares emblemáticos</label>
    <div class="chips" id="setCats">${fichasDeCategoria.join('')}</div>
    <div style="margin-top:10px">${pastilla('Modo estricto en lugares emblemáticos (800 m en vez de 1,5 km)', ajustes.strict, 'id="setStrict"')}</div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">Los demás ajustes valen solo para la práctica; las rondas oficiales usan reglas fijas.</p>
  </div>`
}

function mejorRonda(idDeModo) {
  const llaves = Object.keys(mejores).filter(llave => llave.startsWith(idDeModo + ':'))
  if (!llaves.length) return '—'
  const ultimo = llaves.sort((a, b) => mejores[b].d - mejores[a].d)[0]
  const total = ultimo.split(':').pop()
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

const htmlDeCreditos = () =>
  `<p class="foot">Mapas y datos: © ${enlace('https://www.openstreetmap.org/copyright', 'OpenStreetMap')} (ODbL),
    mapa base © ${enlace('https://openfreemap.org', 'OpenFreeMap')} / OpenMapTiles, rutas: ${enlace('https://project-osrm.org', 'OSRM')},
    recorridos: Red (DTPM), relieve: AWS Terrain Tiles, fotos: autores indicados en cada foto vía
    ${enlace('https://commons.wikimedia.org', 'Wikimedia Commons')} y ${enlace('https://panoramax.fr', 'Panoramax')}.
    Datos generados el ${escaparHtml(DATOS.built)}.</p>`

const htmlDeInicio = () => `<div class="home-backdrop" aria-hidden="true"></div>
  <div class="wrap">
  <div class="hero"><h2>¿Dónde queda eso? 🏔️</h2>
    <p>Practica comunas, lugares, calles, rutas y metro de Santiago.</p></div>
  <div class="grid">
    ${GRUPOS.map(tarjetaDeGrupo).join('')}
    <div class="card"><h3><span class="em">🏆</span>Ranking</h3>
      <p>El botón grande de cada juego es su ronda oficial: mismas reglas para todos y cuenta para el ranking (con cuenta), con el número de preguntas que tengas elegido en la tarjeta del juego. El botón 🏋️ es la <b>práctica</b>: una ronda con ayudas (bordes de comunas y líneas del metro) que aprende de lo que fallas.</p>
      <button class="btn wide" id="goRanking">Ver ranking</button></div>
    <div class="card"><h3><span class="em">🔎</span>Explorar</h3>
      <p>Mapa interactivo con comunas, metro, calles y lugares. Para estudiar antes de jugar.</p>
      <button class="btn wide" id="goExplore">Abrir mapa</button></div>
  </div>
  <div class="grid settings">
    ${tarjetaDeAjustes()}
    <div class="card"><h3><span class="em">➕</span>Mis calles</h3>
      <p>Agrega calles que te importan a ti (la de tu casa, la de un amigo). Aparecen en los juegos de calles y se guardan solo en este navegador.</p>
      <div id="myst"></div></div>
    <div class="card"><h3><span class="em">📊</span>Tu progreso</h3>${htmlDeProgreso()}
      <div class="row" style="margin-top:10px"><button class="btn sec small" id="resetStats">Borrar progreso</button></div></div>
  </div>
  ${htmlDeCreditos()}
</div>`

const valoresMarcados = (contenedor, atributo) =>
  [...contenedor.querySelectorAll('input:checked')].map(entrada => entrada.dataset[atributo])

function conectarAjustes() {
  const lineas = $('#setLines')
  for (const entrada of lineas.querySelectorAll('input'))
    entrada.onchange = () => {
      const elegidos = valoresMarcados(lineas, 'line')
      ajustes.lines = !elegidos.length || elegidos.length === IDS_DE_LINEA.length ? null : elegidos
      guardarAjustes()
      abrirInicio()
    }

  const alcance = $('#setScope')
  alcance.value = ajustes.scope
  alcance.onchange = () => {
    ajustes.scope = alcance.value
    guardarAjustes()
    abrirInicio()
  }

  for (const selectorElegido of vistaDePantalla.querySelectorAll('[data-length-group]'))
    selectorElegido.onchange = () => {
      ajustes.lengths = { ...ajustes.lengths, [selectorElegido.dataset.lengthGroup]: +selectorElegido.value }
      guardarAjustes()
    }

  const categorias = $('#setCats')
  for (const entrada of categorias.querySelectorAll('input'))
    entrada.onchange = () => {
      entrada.parentElement.classList.toggle('on', entrada.checked)
      const elegidos = valoresMarcados(categorias, 'cat')
      ajustes.cats = elegidos.length === CATEGORIAS.length ? null : elegidos
      guardarAjustes()
    }

  $('#setStrict').onchange = evento => {
    ajustes.strict = evento.target.checked
    evento.target.parentElement.classList.toggle('on', evento.target.checked)
    guardarAjustes()
  }

  $('#resetStats').onclick = () => {
    if (!confirm('¿Borrar todo tu progreso?')) return
    reiniciarProgreso()
    abrirInicio()
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

  $('#goExplore').onclick = () => navegar('explore')
  $('#goRanking').onclick = () => navegar('ranking')
  for (const boton of vistaDePantalla.querySelectorAll('[data-mode]'))
    boton.onclick = () => iniciarPartida(modoPorId(boton.dataset.mode))
  for (const boton of vistaDePantalla.querySelectorAll('[data-official]'))
    boton.onclick = () => iniciarPartida(modoPorId(boton.dataset.official), { ranked: true })
  mostrarMisCalles($('#myst'))
  conectarAjustes()
}

definirPantalla('home', abrirInicio)
