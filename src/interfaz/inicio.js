import { estadisticas } from '../nucleo/progreso.js'
import {
  MODOS_DIARIOS,
  fechaDeHoyEnChile,
  LARGOS_ELEGIBLES,
  LARGO_DE_TODAS,
  NIVELES_DE_STREET_VIEW,
  etiquetaDeCategoria,
  tieneLargoElegible,
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
import { REGIONES_DE_COMUNAS, COMUNAS_DE_CHILE } from '../datos/comunasDeChile.js'
import { lineasElegidas } from '../dominio/metro.js'
import { limpiarCapa, fijarChile, fijarRelieve } from '../mapa/mapa.js'
import {
  tieneRondaOficial,
  iniciarPartida,
  detenerPartida,
  cerrarDesafiosSinTerminar,
} from '../juego/engine.js'
import { MODOS, modoPorId } from '../juego/registry.js'
import { mostrarMisCalles } from './misCalles.js'
import { resultadoDelDia, yaSeEmpezo } from '../juego/diarios.js'
import { definirPantalla, navegar } from './navegacion.js'
import { ocultarPanel, vistaDePantalla, mostrarPantalla } from './panel.js'
import { htmlDelPie } from './pie.js'
import { htmlDeAnuncio } from './anuncios.js'
import { conectarPuntoDeRuteo, htmlDelPuntoDeRuteo } from './puntoDeRuteo.js'
import { alTraerProgreso } from '../cuenta/progresoCompartido.js'

const GRUPOS = [
  {
    name: 'Desafíos diarios',
    emoji: '📅',
    blurb: 'Compite con tus amigos para ver quién tiene calle.',
    diario: true,
  },
  {
    name: 'Ruteo',
    emoji: '🧭',
    blurb:
      'Llega de un lugar a otro por la ruta más rápida: en auto, decidiendo en cada cruce viendo la calle, y en micro y metro. En Explorar puedes ver los recorridos de micro más importantes.',
  },
  {
    name: 'Calles',
    emoji: '🛣️',
    blurb: `${callesDelJuego().length} avenidas, autopistas y carreteras.`,
  },
  {
    name: 'Comunas',
    emoji: '🗺️',
    blurb: 'Ubica las comunas del Gran Santiago',
  },
  {
    name: 'Street View',
    emoji: '👀',
    blurb: 'Te dejo parado en un punto de Santiago visto desde la calle y lo ubicas en el mapa.',
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
    name: 'Chile',
    emoji: '🇨🇱',
    blurb: `Las 16 regiones y ${CHILE.cities.length} ciudades (con su población).`,
  },
  {
    name: 'Comunas de Chile',
    emoji: '🏘️',
    blurb: `Las ${COMUNAS_DE_CHILE.length} comunas de las 16 regiones de Chile. En la práctica puedes elegir qué regiones.`,
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

// Metro y Lugares emblemáticos llevan la práctica aparte, abajo, con las líneas o categorías que elija el jugador.
// Arriba van las rondas oficiales, cuyo "% dominado" cuenta todas (sinFiltro).
const PRACTICA_APARTE = {
  Metro: { sinFiltro: { lines: null }, fichas: () => fichasDeLineasDeMetro() },
  'Lugares emblemáticos': { sinFiltro: { cats: null }, fichas: () => fichasDeCategoriasDeLugares() },
  'Comunas de Chile': { sinFiltro: { regiones: null }, fichas: () => fichasDeRegionesDeComunas() },
}

// El "% dominado" de un juego con otras reglas que las del jugador (todas las líneas del metro, un nivel de Street View).
function conReglas(reglas, calcular) {
  aplicarReglasDeRonda(reglas)
  try {
    return calcular()
  } finally {
    aplicarReglasDeRonda(null)
  }
}

function etiquetaDeModo(modo, { reglas = null, conDescripcion = true } = {}) {
  const descripcion = conDescripcion && modo.desc ? `<br><small>${escaparHtml(modo.desc)}</small>` : ''
  const dominado = reglas ? conReglas(reglas, () => dominio(modo)) : dominio(modo)
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
    <button class="mode ranked" data-official="${modo.id}" data-nivel="${nivel}" title="Nivel ${nombre}: cuenta para su ranking">
      <span><b>${nombre}</b><br><small>${DESCRIPCION_DE_NIVEL[nivel]}</small></span><span class="mastery">${dominado}</span>
    </button>
  </div>`
  }).join('')
}

// El botón grande es la ronda oficial (cuenta para el ranking); el chico, una ronda de práctica.
// Un juego sin ronda oficial deja su único botón como práctica. Excepciones: los juegos solo oficiales (soloOficial: Street
// View, con un botón por nivel, Comunas, Chile y Parques) no tienen práctica; y en Metro y Lugares emblemáticos la
// práctica va aparte, abajo.
function filaDeModo(modo) {
  if (modo.group === 'Street View' && tieneRondaOficial(modo)) return filasDeNivelesDeStreetView(modo)
  const practicaAparte = PRACTICA_APARTE[modo.group]
  const etiqueta = etiquetaDeModo(modo, { reglas: practicaAparte?.sinFiltro })
  if (!tieneRondaOficial(modo))
    return `<div class="mode-row"><button class="mode" data-mode="${modo.id}">${etiqueta}</button></div>`
  const botonOficial = `<button class="mode ranked" data-official="${modo.id}" title="Cuenta para el ranking">${etiqueta}</button>`
  if (practicaAparte || modo.soloOficial) return `<div class="mode-row">${botonOficial}</div>`
  return `<div class="mode-row">
    ${botonOficial}
    <button class="practice" data-mode="${modo.id}" title="Práctica: ronda sin ranking, con ayudas" aria-label="Práctica de ${escaparHtml(modo.name)}">🏋️</button>
  </div>`
}

const filaDePractica = modo =>
  `<div class="mode-row"><button class="mode" data-mode="${modo.id}">${etiquetaDeModo(modo, { conDescripcion: false })}</button></div>`

function subseccionDePractica(grupo, modos) {
  return `<hr class="separador"><h4 class="subseccion">Práctica</h4>
    ${PRACTICA_APARTE[grupo].fichas()}
    <div class="modes">${modos.map(filaDePractica).join('')}</div>`
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

// Cuántas preguntas por ronda, en la tarjeta del juego: 10, 20 o todas (si algún juego del grupo las tiene todas). Los juegos
// que siempre recorren todo su conjunto (las comunas: son pocas) o tienen un largo fijo no lo ofrecen.
function selectorDeLargo(grupo, modos) {
  const conLargoElegible = modos.filter(modo => tieneLargoElegible(modo.id))
  if (!conLargoElegible.length) return ''
  const hayRondaDeTodas = conLargoElegible.some(modo => tieneRondaDeTodas(modo.id))
  const opciones = [...LARGOS_ELEGIBLES, ...(hayRondaDeTodas ? [LARGO_DE_TODAS] : [])].map(
    eleccion =>
      `<option value="${eleccion}" ${eleccion === largoPara(grupo) ? 'selected' : ''}>${eleccion === LARGO_DE_TODAS ? 'Todas' : eleccion}</option>`,
  )
  return `<label class="length-row">Preguntas por ronda <select data-length-group="${escaparHtml(grupo)}">${opciones.join('')}</select></label>`
}

function fichasDeRegionesDeComunas() {
  const elegidas = ajustes.regiones || REGIONES_DE_COMUNAS
  const fichas = REGIONES_DE_COMUNAS.map(region =>
    pastilla(escaparHtml(region), elegidas.includes(region), `data-region="${escaparHtml(region)}"`),
  )
  return `<div class="chips" id="setRegiones" style="margin-bottom:10px">${fichas.join('')}</div>`
}

function fichasDeCategoriasDeLugares() {
  const elegidas = ajustes.cats || CATEGORIAS
  const fichas = CATEGORIAS.map(categoria =>
    pastilla(escaparHtml(categoria), elegidas.includes(categoria), `data-cat="${escaparHtml(categoria)}"`),
  )
  return `<div class="chips" id="setCats" style="margin-bottom:10px">${fichas.join('')}</div>`
}

// Todo lo configurable de un grupo va al final de su tarjeta, bajo una raya.
function ajustesDeLaTarjeta(grupo, modos) {
  const opciones = [
    selectorDeLargo(grupo.name, modos),
    grupo.name === 'Comunas' ? selectorDeAlcance() : '',
    grupo.name === 'Ruteo' ? htmlDelPuntoDeRuteo() : '',
  ].filter(Boolean)
  return opciones.length
    ? `<hr class="separador"><div class="ajustes-de-tarjeta">${opciones.join('')}</div>`
    : ''
}

// "Mis calles" va dentro de la tarjeta de Calles, al final: las calles propias aparecen en esos juegos.
const htmlDeMisCalles = () => `<hr class="separador"><div class="ajustes-de-tarjeta">
      <h4 class="subseccion">➕ Mis calles</h4>
      <p class="muted">Agrega calles que te importan a ti (la de tu casa, la de un amigo). Aparecen en los juegos de calles y se guardan solo en este navegador.</p>
      <div id="myst"></div></div>`

// Los desafíos diarios: un botón por desafío (sin práctica: esa está más abajo, en cada juego). Si ya se jugó, muestra cómo salió y
// lleva al ranking del día.
function filaDeDesafio(modo) {
  const resultado = resultadoDelDia(modo.id)
  const estado = resultado?.total
    ? `${resultado.abandonado ? 'Abandonado' : '✓'} ${resultado.aciertos}/${resultado.total}`
    : yaSeEmpezo(modo.id)
      ? 'Ya empezado'
      : 'Jugar'
  return `<div class="mode-row"><button class="mode diario" data-diario="${modo.id}">
    <span><b>${escaparHtml(modo.name)}</b></span><span class="estado-diario">${estado}</span></button></div>`
}

function tarjetaDeDesafiosDiarios(grupo) {
  const modos = MODOS_DIARIOS.map(modoPorId).filter(modo => modo && (modo.disponible?.() ?? true))
  return `<div class="card card-diaria" data-fecha="${fechaDeHoyEnChile()}">
    <h3><span class="em">${grupo.emoji}</span>${grupo.name}</h3><p>${grupo.blurb}</p>
    <div class="modes">${modos.map(filaDeDesafio).join('')}</div>
  </div>`
}

function tarjetaDeGrupo(grupo) {
  if (grupo.diario) return tarjetaDeDesafiosDiarios(grupo)
  const modos = MODOS.filter(modo => modo.group === grupo.name && (modo.disponible?.() ?? true)).sort(
    pasosPrimero,
  )
  if (!modos.length) return ''
  return `<div class="card">
    <h3><span class="em">${grupo.emoji}</span>${grupo.name}</h3><p>${grupo.blurb}</p>
    <div class="modes">${modos.map(filaDeModo).join('')}</div>
    ${PRACTICA_APARTE[grupo.name] ? subseccionDePractica(grupo.name, modos) : ''}
    ${ajustesDeLaTarjeta(grupo, modos)}
    ${grupo.name === 'Calles' ? htmlDeMisCalles() : ''}
  </div>`
}

const htmlDeInicio = () => `<div class="home-backdrop" aria-hidden="true"></div>
  <div class="wrap">
  <div class="hero inicio"><h2>¿Dónde queda eso? 🏔️</h2>
    <p>Practica comunas, lugares, calles, rutas y metro de Santiago.</p></div>
  ${htmlDeAnuncio('menu')}
  <div class="grid">
    ${GRUPOS.map(tarjetaDeGrupo).join('')}
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

  const regiones = $('#setRegiones')
  for (const entrada of regiones?.querySelectorAll('input') ?? [])
    entrada.onchange = () => {
      const elegidas = valoresMarcados(regiones, 'region')
      ajustes.regiones = !elegidas.length || elegidas.length === REGIONES_DE_COMUNAS.length ? null : elegidas
      guardarAjustes()
      redibujarInicioSinSaltar()
    }

  const categorias = $('#setCats')
  for (const entrada of categorias?.querySelectorAll('input') ?? [])
    entrada.onchange = () => {
      const elegidas = valoresMarcados(categorias, 'cat')
      ajustes.cats = elegidas.length === CATEGORIAS.length ? null : elegidas
      guardarAjustes()
      redibujarInicioSinSaltar()
    }
}

// Un desafío se juega una sola vez: si ya se empezó, lleva al ranking del día.
function jugarDesafio(idDeModo, fechaDeLaTarjeta) {
  if (fechaDeLaTarjeta !== fechaDeHoyEnChile()) return redibujarInicioSinSaltar()
  if (yaSeEmpezo(idDeModo)) return navegar('ranking', idDeModo, fechaDeLaTarjeta)
  iniciarPartida(modoPorId(idDeModo), { ranked: true })
}

const MS_ENTRE_REVISIONES_DEL_DIA = 30000
let revisorDelDia = null

function abrirInicio() {
  clearInterval(revisorDelDia)
  detenerPartida()
  cerrarDesafiosSinTerminar()
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
  for (const boton of vistaDePantalla.querySelectorAll('[data-diario]'))
    boton.onclick = () => jugarDesafio(boton.dataset.diario, boton.closest('.card-diaria').dataset.fecha)
  // Si el menú queda abierto pasada la medianoche, los desafíos se renuevan solos.
  revisorDelDia = setInterval(() => {
    const tarjeta = vistaDePantalla.querySelector('.card-diaria')
    if (!tarjeta) return
    if (tarjeta.dataset.fecha !== fechaDeHoyEnChile()) redibujarInicioSinSaltar()
  }, MS_ENTRE_REVISIONES_DEL_DIA)
  mostrarMisCalles($('#myst'))
  conectarAjustes()
  conectarPuntoDeRuteo(redibujarInicioSinSaltar)
  return () => clearInterval(revisorDelDia)
}

definirPantalla('home', abrirInicio)

// Cuando llega el progreso de la cuenta (jugado en otro dispositivo), el "% dominado" del menú se pone al día.
const menuALaVista = () =>
  !vistaDePantalla.classList.contains('hidden') && !!vistaDePantalla.querySelector('.home-backdrop')
alTraerProgreso(() => {
  if (menuALaVista()) redibujarInicioSinSaltar()
})
