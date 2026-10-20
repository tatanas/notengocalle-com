import { ajustes } from '../../nucleo/almacen.js'
import { escaparHtml, mezclar } from '../../nucleo/utilidades.js'
import { puntoDeEtiqueta } from '../../datos/datos.js'
import {
  COMUNAS_DE_CHILE,
  cargarComunasDeChile,
  comunasDeLaRegion,
  rasgoDeComuna,
} from '../../datos/comunasDeChile.js'
import { distractoresDeComunaDeChile } from '../../dominio/comunasDeChile.js'
import { COLORES, capaDeComunas, etiquetaDeMapa } from '../../mapa/dibujo.js'
import { capa, encuadrar, limitesDeRasgos } from '../../mapa/mapa.js'
import { aviso, mostrarPanel } from '../../interfaz/panel.js'
import { encabezadoDePregunta, partida, responder, saltarPregunta } from '../engine.js'
import { mostrarOpciones } from '../options.js'
import { registrarModo } from '../registry.js'

// Las comunas de todo Chile, de a una por pregunta. La práctica puede limitarse a algunas regiones (ajustes.regiones; null = todas);
// las rondas oficiales son siempre de todo Chile. Los polígonos se bajan recién al jugar (src/datos/comunasDeChile.js).

const comunasElegidas = () =>
  ajustes.regiones
    ? COMUNAS_DE_CHILE.filter(comuna => ajustes.regiones.includes(comuna.region))
    : COMUNAS_DE_CHILE

// Las comunas de la región se dibujan siempre como contexto: sin ellas, un polígono suelto en el mapa de Chile no se reconoce.
const rasgosDeLaRegion = region => comunasDeLaRegion(region).map(rasgoDeComuna)

// Cuánto se aleja el encuadre de una comuna: las enormes (Cabo de Hornos) casi llenan la pantalla; las chicas dejan ver sus vecinas.
const KM2_DE_COMUNA_ENORME = 3000
const KM2_DE_COMUNA_GRANDE = 500
const margenDeEncuadre = km2 => (km2 > KM2_DE_COMUNA_ENORME ? 0.2 : km2 > KM2_DE_COMUNA_GRANDE ? 0.5 : 1.5)
const ZOOM_MAXIMO_DE_COMUNA = 12

// El encuadre de la región, sin las islas lejanas (Isla de Pascua y Juan Fernández son de la Región de Valparaíso y dejarían todo
// diminuto). Si la comuna de la pregunta es una de ellas, se encuadra ella sola.
const GRADOS_MAXIMOS_DE_LA_MEDIANA = 6
const mediana = numeros => [...numeros].sort((a, b) => a - b)[Math.floor(numeros.length / 2)]
function comunasDelContinente(region) {
  const delaRegion = comunasDeLaRegion(region)
  const centro = [mediana(delaRegion.map(otra => otra.lab[0])), mediana(delaRegion.map(otra => otra.lab[1]))]
  return delaRegion.filter(
    otra =>
      Math.abs(otra.lab[0] - centro[0]) <= GRADOS_MAXIMOS_DE_LA_MEDIANA &&
      Math.abs(otra.lab[1] - centro[1]) <= GRADOS_MAXIMOS_DE_LA_MEDIANA,
  )
}
const limitesDe = comunas => L.latLngBounds(comunas.flatMap(otra => otra.limites))
function encuadreDeLaRegion(comuna) {
  const delContinente = comunasDelContinente(comuna.region)
  return limitesDe(delContinente.includes(comuna) ? delContinente : [comuna])
}
// Todo Chile continental (sin las islas) o, en la práctica, las regiones elegidas.
const CHILE_CONTINENTAL = [
  [-56.2, -76.5],
  [-17.4, -66.3],
]
const ZOOM_MAXIMO_DE_CHILE = 6
function encuadreDeLasComunasElegidas() {
  if (!ajustes.regiones) return L.latLngBounds(CHILE_CONTINENTAL)
  return limitesDe(ajustes.regiones.flatMap(comunasDelContinente))
}

// Baja los polígonos; si no se puede (sin conexión), la pregunta se salta con un aviso.
async function conLasComunas(q) {
  try {
    await cargarComunasDeChile()
  } catch {
    aviso('No pude cargar las comunas: revisa tu conexión.')
    saltarPregunta()
    return false
  }
  return partida === q
}

const alIniciar = () => cargarComunasDeChile().catch(() => {})
const textoDeRegion = comuna => `Región ${escaparHtml(comuna.region)}`

registrarModo({
  id: 'cc-name',
  group: 'Comunas de Chile',
  name: '¿Qué comuna de Chile es esta?',
  noHint: true,
  chile: true,
  pool: comunasElegidas,
  key: comuna => comuna.name,
  balance: comuna => comuna.region,
  setup: alIniciar,
  async ask(comuna, q) {
    mostrarPanel(encabezadoDePregunta(q) + '<p class="muted">Cargando las comunas…</p>')
    if (!(await conLasComunas(q))) return
    const objetivo = rasgoDeComuna(comuna)
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">¿Qué comuna está marcada en naranjo?</div><div class="q-sub">${textoDeRegion(comuna)}</div>`,
    )
    capaDeComunas(rasgosDeLaRegion(comuna.region), {
      interactive: false,
      style: rasgo =>
        rasgo === objetivo ? { fillColor: COLORES.hi, fillOpacity: 0.85, weight: 3, color: '#92400e' } : {},
    }).addTo(capa)
    encuadrar(limitesDeRasgos([objetivo]).pad(margenDeEncuadre(comuna.km2)), ZOOM_MAXIMO_DE_COMUNA)
    const vecinas = distractoresDeComunaDeChile(comuna)
    const opciones = mezclar([comuna, ...vecinas]).map(otra => ({
      label: escaparHtml(otra.name),
      value: otra.name,
    }))
    mostrarOpciones(opciones, comuna.name, elegida => {
      etiquetaDeMapa(puntoDeEtiqueta(objetivo), comuna.name, 'lbl big').addTo(capa)
      for (const vecina of vecinas.filter(otra => otra.region === comuna.region))
        etiquetaDeMapa(puntoDeEtiqueta(rasgoDeComuna(vecina)), vecina.name).addTo(capa)
      responder(
        elegida === comuna.name,
        `<p>Es <b>${escaparHtml(comuna.name)}</b>, en la ${textoDeRegion(comuna)}.</p>`,
      )
    })
  },
})

registrarModo({
  id: 'cc-find',
  group: 'Comunas de Chile',
  name: 'Ubica la comuna',
  desc: 'Te digo la comuna y su región; la tocas en el mapa de la región.',
  noHint: true,
  chile: true,
  pool: comunasElegidas,
  key: comuna => comuna.name,
  balance: comuna => comuna.region,
  setup: alIniciar,
  async ask(comuna, q) {
    mostrarPanel(encabezadoDePregunta(q) + '<p class="muted">Cargando las comunas…</p>')
    if (!(await conLasComunas(q))) return
    const objetivo = rasgoDeComuna(comuna)
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">Toca la comuna: <b>${escaparHtml(comuna.name)}</b></div><div class="q-sub">${textoDeRegion(comuna)}</div>`,
    )
    const rasgos = rasgosDeLaRegion(comuna.region)
    const subcapa = capaDeComunas(rasgos, {
      onClick: (tocado, poligono) => {
        if (q.answered) return
        const acierto = tocado === objetivo
        poligono.setStyle({ fillColor: acierto ? COLORES.ok : COLORES.bad, fillOpacity: 0.8 })
        etiquetaDeMapa(
          puntoDeEtiqueta(tocado),
          tocado.properties.name,
          `lbl ${acierto ? 'ok' : 'bad'}`,
        ).addTo(capa)
        if (!acierto) {
          subcapa.eachLayer(otra => {
            if (otra.feature === objetivo) otra.setStyle({ fillColor: COLORES.hi, fillOpacity: 0.85 })
          })
          etiquetaDeMapa(puntoDeEtiqueta(objetivo), comuna.name, 'lbl big').addTo(capa)
        }
        responder(
          acierto,
          `${acierto ? '' : `<p>Tocaste ${escaparHtml(tocado.properties.name)}.</p>`}<p><b>${escaparHtml(comuna.name)}</b> está en la ${textoDeRegion(comuna)}.</p>`,
        )
      },
    }).addTo(capa)
    encuadrar(encuadreDeLaRegion(comuna), ZOOM_MAXIMO_DE_COMUNA)
  },
})

// El difícil: sin pista de región, hay que encontrar la comuna en todo Chile. Funciona como "Completa el mapa" de las comunas de la
// Región Metropolitana: el mapa queda dibujado entre preguntas y cada comuna se pinta según el intento en que se encontró.
const INTENTOS_PARA_ENCONTRAR = 3
registrarModo({
  id: 'cc-hard',
  group: 'Comunas de Chile',
  name: 'Ubica la comuna (difícil)',
  desc: 'Sin pista de región: búscala en todo Chile. Tienes 3 intentos.',
  noHint: true,
  keepLayer: true,
  chile: true,
  pool: comunasElegidas,
  key: comuna => comuna.name,
  balance: comuna => comuna.region,
  setup(q) {
    q.state = {}
    q.tries = 0
    q.mapaDibujado = false
    alIniciar()
  },
  async ask(comuna, q) {
    q.tries = 0
    mostrarPanel(encabezadoDePregunta(q) + '<p class="muted">Cargando las comunas…</p>')
    if (!(await conLasComunas(q))) return
    if (!q.mapaDibujado) {
      q.mapaDibujado = true
      q.capaDeComunas = capaDeComunas(comunasElegidas().map(rasgoDeComuna), {
        style: () => ({ color: '#475569', weight: 0.8, fillColor: '#cbd5e1', fillOpacity: 0.6 }),
        onClick: (tocado, poligono) => this.click(tocado, poligono),
      }).addTo(capa)
    }
    // La primera pregunta parte de todo el país, y también la que sigue a una en que hubo que mostrar dónde estaba la comuna.
    if (q.i === 0 || q.reveloLaAnterior) encuadrar(encuadreDeLasComunasElegidas(), ZOOM_MAXIMO_DE_CHILE)
    q.reveloLaAnterior = false
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">Toca: <b>${escaparHtml(comuna.name)}</b></div><div class="q-sub">Haz zoom para buscarla. Verde = a la primera · amarillo = 2º intento · naranjo = 3º · rojo = no la encontraste</div>`,
    )
  },
  click(tocado, poligono) {
    const q = partida
    if (!q || q.answered || q.starting || !q.mapaDibujado) return
    const comuna = q.items[q.i]
    const nombre = tocado.properties.name
    if (q.state[nombre]) {
      aviso(`${nombre} (ya respondida)`)
      return
    }
    if (nombre === comuna.name) {
      poligono.setStyle({ fillColor: [COLORES.ok, COLORES.ok2, COLORES.mid][q.tries], fillOpacity: 0.85 })
      q.state[nombre] = true
      etiquetaDeMapa(puntoDeEtiqueta(tocado), nombre).addTo(capa)
      responder(
        q.tries === 0,
        `<p>${q.tries ? `Encontrada al intento ${q.tries + 1}. ` : ''}${escaparHtml(nombre)} está en la ${textoDeRegion(comuna)}.</p>`,
        { partial: q.tries > 0 },
      )
      return
    }
    q.tries++
    aviso(`Esa es ${nombre} (región ${tocado.properties.region})`)
    const rotulo = etiquetaDeMapa(puntoDeEtiqueta(tocado), nombre, 'lbl bad').addTo(capa)
    setTimeout(() => capa.removeLayer(rotulo), 1500)
    if (q.tries < INTENTOS_PARA_ENCONTRAR) return
    // Sin intentos: se muestra dónde estaba, acercándose para que se vea.
    const objetivo = rasgoDeComuna(comuna)
    q.capaDeComunas.eachLayer(otra => {
      if (otra.feature === objetivo) otra.setStyle({ fillColor: COLORES.bad, fillOpacity: 0.85 })
    })
    q.state[comuna.name] = true
    q.reveloLaAnterior = true
    encuadrar(limitesDeRasgos([objetivo]).pad(margenDeEncuadre(comuna.km2)), ZOOM_MAXIMO_DE_COMUNA)
    etiquetaDeMapa(puntoDeEtiqueta(objetivo), comuna.name, 'lbl bad').addTo(capa)
    responder(
      false,
      `<p>Estaba marcada en rojo: <b>${escaparHtml(comuna.name)}</b>, en la ${textoDeRegion(comuna)}.</p>`,
    )
  },
})
