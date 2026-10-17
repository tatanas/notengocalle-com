import { distanciaALinea, distanciaKm, puntoEnPoligono } from '../../nucleo/geografia.js'
import { ajustes, almacen } from '../../nucleo/almacen.js'
import { escaparHtml, formatearKm } from '../../nucleo/utilidades.js'
import { reportarPunto } from '../../cuenta/reportes.js'
import { vias } from '../../datos/datos.js'
import LUGARES from '../../datos/lugaresStreetView.json'
import RECINTOS from '../../datos/recintos.json'
import { PUNTOS_MAXIMOS, esAciertoDeStreetView, puntajeDeStreetView } from '../../dominio/streetView.js'
import { describirUbicacion } from '../../dominio/ubicacion.js'
import { COLORES, dibujarCalle, iconoDiv } from '../../mapa/dibujo.js'
import { capa, encuadrar, encuadrarCiudad, mapa, repararMapaBase } from '../../mapa/mapa.js'
import {
  DISTANCIA_MAXIMA_DE_CAMINATA_KM,
  caminoRecorrido,
  mostrarPanorama,
  ocultarPanorama,
  streetViewDisponible,
} from '../../mapa/streetView.js'
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

const textoDeLaPregunta = `<div class="q-prompt">Mira alrededor y <b>toca en el mapa</b> dónde partiste.</div>
  <p class="muted tight">Puedes caminar hasta ${DISTANCIA_MAXIMA_DE_CAMINATA_KM * 1000} m para ubicarte; el puntaje se mide desde el punto de partida (↩ te devuelve ahí).</p>`

// Los puntos que alguien reportó como túnel no vuelven a salir en este dispositivo.
const llaveDelPunto = punto => `${punto.lat},${punto.lon}`
const reportados = new Set(almacen.get('puntosReportados', []))
const puntosDisponibles = lugar => lugar.puntos.filter(punto => !reportados.has(llaveDelPunto(punto)))
const NIVEL_MAXIMO = { facil: 1, medio: 2, dificil: 3, extremo: 4 }
const lugaresDisponibles = () =>
  LUGARES.filter(
    lugar => lugar.nivel <= NIVEL_MAXIMO[ajustes.nivelStreetView] && puntosDisponibles(lugar).length,
  )
const nombreDelRecinto = lugar => (lugar.referencia ?? lugar.nombre).replace(/\s*\(.*\)/, '')
const alAzar = lista => lista[Math.floor(Math.random() * lista.length)]

// Cambia la pregunta actual por otra que no haya salido en la ronda (no se pierde ni se acorta la ronda).
function reemplazarPregunta(q) {
  ocultarPanorama()
  const usados = new Set(q.items.map(lugar => lugar.nombre))
  const candidatos = lugaresDisponibles().filter(lugar => !usados.has(lugar.nombre))
  if (!candidatos.length) return saltarPregunta()
  q.items[q.i] = alAzar(candidatos)
  q.mode.ask(q.items[q.i], q)
}

function reportarTunel(lugar, punto, q) {
  reportados.add(llaveDelPunto(punto))
  almacen.set('puntosReportados', [...reportados])
  reportarPunto({ lugar: lugar.nombre, lat: punto.lat, lon: punto.lon, motivo: 'tunel' })
  aviso('Gracias: ese punto no volverá a salir.')
  reemplazarPregunta(q)
}

registrarModo({
  id: 'sv-ubicar',
  roomy: true,
  puntosPorPregunta: PUNTOS_MAXIMOS,
  noHint: true,
  balance: lugar => lugar.comuna,
  group: 'Street View',
  name: '¿Dónde estás?',
  disponible: streetViewDisponible,
  pool: lugaresDisponibles,
  key: lugar => lugar.nombre,
  label: lugar => lugar.nombre,
  limpiar: ocultarPanorama,
  async ask(lugar, q) {
    mostrarPanel(
      encabezadoDePregunta(q) + textoDeLaPregunta + '<p class="muted tight">Cargando Street View…</p>',
    )
    const punto = alAzar(puntosDisponibles(lugar))
    let verdadero
    try {
      verdadero = await mostrarPanorama(punto, { alReportarTunel: () => reportarTunel(lugar, punto, q) })
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
    repararMapaBase()
    encuadrarCiudad()
    mapa.on('click', evento => {
      if (q.answered) return
      const adivinado = [evento.latlng.lat, evento.latlng.lng]
      // En un cerro grande vale cualquier punto dentro de él: no importa en cuál rincón se estaba.
      const recinto = RECINTOS[lugar.referencia]
      const dentroDelRecinto = !!recinto && puntoEnPoligono(verdadero, recinto)
      const distancia =
        dentroDelRecinto && puntoEnPoligono(adivinado, recinto) ? 0 : distanciaKm(adivinado, verdadero)
      const acierto = esAciertoDeStreetView(distancia)
      const puntos = puntajeDeStreetView(distancia)
      const calles = callesBajoElPunto(verdadero)
      const enLaCalle = calles.some(calle => distanciaALinea(adivinado, calle.lines) <= MARGEN_DE_CALLE_KM)
      const camino = caminoRecorrido()
      const seMovio = camino.length > 1

      ocultarPanorama()
      for (const calle of calles) dibujarCalle(calle, COLORES.ok, { labelText: calle.name })
      if (dentroDelRecinto)
        L.polygon(recinto, { pane: 'routes', color: '#16a34a', weight: 2, fillOpacity: 0.12 }).addTo(capa)
      if (seMovio)
        L.polyline(camino, { pane: 'routes', color: '#2563eb', weight: 3, opacity: 0.8 }).addTo(capa)
      L.marker(adivinado, { icon: iconoDiv('pin you'), pane: 'points' }).addTo(capa)
      L.marker(verdadero, { icon: iconoDiv('pin ' + (acierto ? 'good' : 'ans')), pane: 'points' })
        .addTo(capa)
        .bindTooltip(seMovio ? 'Partiste aquí' : 'Estabas aquí', {
          permanent: true,
          direction: 'top',
          offset: [0, -10],
        })
      L.polyline([adivinado, verdadero], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(capa)
      encuadrar(L.latLngBounds([adivinado, verdadero, ...camino]).pad(0.3), 18)

      const descripcion = describirUbicacion(verdadero, calles)
      const referencia = lugar.referencia ?? lugar.nombre
      const sector =
        lugar.tipo === 'lugar' && !descripcion.includes(escaparHtml(referencia))
          ? ` En el sector de <b>${escaparHtml(referencia)}</b>.`
          : ''
      const cerca =
        enLaCalle && !acierto ? '<p>Estabas en la calle correcta, pero en otro punto de ella.</p>' : ''
      const delRecinto = dentroDelRecinto
        ? '<p>Estabas dentro de <b>' +
          escaparHtml(nombreDelRecinto(lugar)) +
          '</b>: vale cualquier punto dentro de él.</p>'
        : ''
      const pista = punto.pista
        ? `<p class="muted">Para reconocer esta calle: ${escaparHtml(punto.pista)}.</p>`
        : ''
      responder(
        acierto,
        `<p>Quedaste a <b>${formatearKm(distancia)}</b> (+${puntos} de ${PUNTOS_MAXIMOS} puntos).</p><p>${descripcion}${sector}</p>${delRecinto}${cerca}${pista}`,
        { points: puntos, partial: !acierto && (puntos > 0 || enLaCalle) },
      )
    })
  },
})
