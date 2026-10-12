import { distanciaALinea, distanciaKm } from '../../nucleo/geografia.js'
import { escaparHtml, formatearKm } from '../../nucleo/utilidades.js'
import { vias } from '../../datos/datos.js'
import LUGARES from '../../datos/lugaresStreetView.json'
import { esAciertoDeStreetView, puntajeDeStreetView } from '../../dominio/streetView.js'
import { COLORES, dibujarCalle, iconoDiv } from '../../mapa/dibujo.js'
import { capa, encuadrar, encuadrarCiudad, mapa } from '../../mapa/mapa.js'
import { mostrarPanorama, ocultarPanorama, streetViewDisponible } from '../../mapa/streetView.js'
import { aviso, mostrarPanel } from '../../interfaz/panel.js'
import { encabezadoDePregunta, partida, responder, saltarPregunta } from '../engine.js'
import { registrarModo } from '../registry.js'

// Un punto está "sobre" una calle si queda a menos de esto de su trazado.
const SOBRE_UNA_CALLE_KM = 0.05
// Si no se acierta pero se toca a menos de esto de una de esas calles, se avisa que estaba cerca (sin puntos).
const MARGEN_DE_CALLE_KM = 0.1
const MAXIMO_DE_CALLES_MOSTRADAS = 3

const callesBajoElPunto = punto =>
  vias()
    .map(calle => ({ calle, km: distanciaALinea(punto, calle.lines) }))
    .filter(({ km }) => km <= SOBRE_UNA_CALLE_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, MAXIMO_DE_CALLES_MOSTRADAS)
    .map(({ calle }) => calle)

const textoDeLaPregunta = `<div class="q-prompt">Mira alrededor y <b>toca en el mapa</b> dónde estás parado.</div>`

registrarModo({
  id: 'sv-ubicar',
  roomy: true,
  noHint: true,
  balance: lugar => lugar.comuna,
  group: 'Street View',
  name: '¿Dónde estás?',
  desc: 'Te dejo parado en un punto de Santiago visto desde la calle: mira alrededor y toca en el mapa dónde estás.',
  disponible: streetViewDisponible,
  pool: () => LUGARES,
  key: lugar => lugar.nombre,
  label: lugar => lugar.nombre,
  limpiar: ocultarPanorama,
  async ask(lugar, q) {
    mostrarPanel(
      encabezadoDePregunta(q) + textoDeLaPregunta + '<p class="muted tight">Cargando Street View…</p>',
    )
    let verdadero
    try {
      verdadero = await mostrarPanorama(lugar)
    } catch {
      aviso('No pude cargar Street View. Revisa tu conexión.')
      return saltarPregunta()
    }
    if (!verdadero) {
      aviso('Ese punto no tiene Street View: paso al siguiente.')
      return saltarPregunta()
    }
    if (partida !== q || q.answered) return ocultarPanorama()
    mostrarPanel(encabezadoDePregunta(q) + textoDeLaPregunta)
    encuadrarCiudad()
    mapa.on('click', evento => {
      if (q.answered) return
      const adivinado = [evento.latlng.lat, evento.latlng.lng]
      const distancia = distanciaKm(adivinado, verdadero)
      const acierto = esAciertoDeStreetView(distancia)
      const puntos = puntajeDeStreetView(distancia)
      const calles = callesBajoElPunto(verdadero)
      const enLaCalle = calles.some(calle => distanciaALinea(adivinado, calle.lines) <= MARGEN_DE_CALLE_KM)

      ocultarPanorama()
      for (const calle of calles) dibujarCalle(calle, COLORES.ok, { labelText: calle.name })
      L.marker(adivinado, { icon: iconoDiv('pin you'), pane: 'points' }).addTo(capa)
      L.marker(verdadero, { icon: iconoDiv('pin ' + (acierto ? 'good' : 'ans')), pane: 'points' })
        .addTo(capa)
        .bindTooltip('Estabas aquí', { permanent: true, direction: 'top', offset: [0, -10] })
      L.polyline([adivinado, verdadero], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(capa)
      encuadrar(L.latLngBounds([adivinado, verdadero]).pad(0.3), 18)

      const nombresDeCalles = calles.map(calle => `<b>${escaparHtml(calle.name)}</b>`).join(' y ')
      const dondeEstabas = nombresDeCalles
        ? `<p>Estabas sobre ${nombresDeCalles}.</p>`
        : `<p class="muted">${escaparHtml(lugar.nombre)}</p>`
      const cerca =
        enLaCalle && !acierto ? '<p>Estabas en la calle correcta, pero en otro punto de ella.</p>' : ''
      responder(
        acierto,
        `<p>Quedaste a <b>${formatearKm(distancia)}</b> (+${puntos} pts).</p>${dondeEstabas}${cerca}`,
        { points: puntos, partial: enLaCalle && !acierto },
      )
    })
  },
})
