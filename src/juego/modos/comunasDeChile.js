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
function encuadreDeLaRegion(comuna) {
  const delaRegion = comunasDeLaRegion(comuna.region)
  const centro = [mediana(delaRegion.map(otra => otra.lab[0])), mediana(delaRegion.map(otra => otra.lab[1]))]
  const delContinente = delaRegion.filter(
    otra =>
      Math.abs(otra.lab[0] - centro[0]) <= GRADOS_MAXIMOS_DE_LA_MEDIANA &&
      Math.abs(otra.lab[1] - centro[1]) <= GRADOS_MAXIMOS_DE_LA_MEDIANA,
  )
  const aEncuadrar = delContinente.includes(comuna) ? delContinente : [comuna]
  return L.latLngBounds(aEncuadrar.flatMap(otra => otra.limites))
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
