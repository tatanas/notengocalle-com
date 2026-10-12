import { distanciaALinea, distanciaKm } from '../../nucleo/geografia.js'
import { escaparHtml, formatearKm } from '../../nucleo/utilidades.js'
import { vias } from '../../datos/datos.js'
import { iconoDiv } from '../../mapa/dibujo.js'
import { capa, encuadrar, encuadrarCiudad, mapa } from '../../mapa/mapa.js'
import { mostrarPanorama, ocultarPanorama, streetViewDisponible } from '../../mapa/streetView.js'
import { aviso, mostrarPanel } from '../../interfaz/panel.js'
import { encabezadoDePregunta, partida, responder, saltarPregunta } from '../engine.js'
import { registrarModo } from '../registry.js'

// Lugares de prueba. rumbo: hacia dónde mira al partir (0 = norte, 90 = oriente); sin él, mira al azar.
const LUGARES = [
  { nombre: 'Kennedy con Las Tranqueras', lat: -33.39089, lon: -70.55333, rumbo: 180 },
  { nombre: 'Rotonda Atenas', lat: -33.41717, lon: -70.5531, rumbo: 180 },
  { nombre: 'Frente al Estadio Nacional', lat: -33.46211, lon: -70.61037, rumbo: 180 },
]

// Acertar es quedar a menos de esto del punto exacto.
const ACIERTO_KM = 0.15
// Con esto se llega a la calle correcta aunque no al punto: cuenta como "cerca".
const MARGEN_DE_CALLE_KM = 0.1
// Un punto pertenece a una calle si queda a menos de esto de su trazado.
const PERTENENCIA_A_CALLE_KM = 0.06
// Los puntos bajan con la distancia: a 1 km quedan unos 37 de 100.
const ESCALA_DE_PUNTOS_KM = 1

const calleDeUnPunto = punto =>
  vias().find(calle => distanciaALinea(punto, calle.lines) <= PERTENENCIA_A_CALLE_KM) ?? null

registrarModo({
  id: 'sv-ubicar',
  roomy: true,
  noHint: true,
  group: 'Street View',
  name: '¿Dónde estás?',
  desc: 'Te dejo en un punto de Santiago visto desde la calle: mira alrededor y toca en el mapa dónde crees que estás.',
  disponible: streetViewDisponible,
  pool: () => LUGARES,
  key: lugar => lugar.nombre,
  label: lugar => lugar.nombre,
  limpiar: ocultarPanorama,
  async ask(lugar, q) {
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">Mira alrededor y <b>toca en el mapa</b> dónde crees que estás.</div>
         <p class="muted tight">Cargando Street View…</p>`,
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
    encuadrarCiudad()
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">Mira alrededor y <b>toca en el mapa</b> dónde crees que estás.</div>`,
    )
    mapa.on('click', evento => {
      if (q.answered) return
      const adivinado = [evento.latlng.lat, evento.latlng.lng]
      const distancia = distanciaKm(adivinado, verdadero)
      const calle = calleDeUnPunto(verdadero)
      const enLaCalle = !!calle && distanciaALinea(adivinado, calle.lines) <= MARGEN_DE_CALLE_KM
      const acierto = distancia <= ACIERTO_KM
      const puntos = Math.round(100 * Math.exp(-distancia / ESCALA_DE_PUNTOS_KM))

      ocultarPanorama()
      L.marker(adivinado, { icon: iconoDiv('pin you'), pane: 'points' }).addTo(capa)
      L.marker(verdadero, { icon: iconoDiv('pin ' + (acierto ? 'good' : 'ans')), pane: 'points' })
        .addTo(capa)
        .bindTooltip(escaparHtml(lugar.nombre), { permanent: true, direction: 'top', offset: [0, -10] })
      L.polyline([adivinado, verdadero], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(capa)
      encuadrar(L.latLngBounds([adivinado, verdadero]).pad(0.3), 17)

      const sobreLaCalle =
        enLaCalle && !acierto
          ? `<p>Pero estabas en la calle correcta: <b>${escaparHtml(calle.name)}</b>.</p>`
          : calle
            ? `<p class="muted">Era en <b>${escaparHtml(calle.name)}</b>.</p>`
            : ''
      responder(
        acierto,
        `<p>Quedaste a <b>${formatearKm(distancia)}</b> (+${puntos} pts).</p>${sobreLaCalle}<p class="muted">${escaparHtml(lugar.nombre)}</p>`,
        { points: puntos, partial: enLaCalle && !acierto },
      )
    })
  },
})
