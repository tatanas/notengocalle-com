// Flechas con el sentido de las calles de un solo sentido. El mapa base no las trae; se dibujan con los mismos datos que usa
// "Ruta libre" para saber por dónde se puede ir. Con poco zoom solo se ven en las calles largas.

const PIXELES_ENTRE_FLECHAS = 70
const PIXELES_MINIMOS_DE_UNA_CALLE = 45
const LARGO_DE_LA_FLECHA = 6
const ABERTURA_DE_LA_FLECHA = 0.6
const COLOR_DE_LA_FLECHA = '#475569'

function puntoYRumboAlLargo(puntos, distancia) {
  let recorrido = 0
  for (let i = 1; i < puntos.length; i++) {
    const largo = Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].y - puntos[i - 1].y)
    if (recorrido + largo >= distancia && largo > 0) {
      const fraccion = (distancia - recorrido) / largo
      return {
        x: puntos[i - 1].x + (puntos[i].x - puntos[i - 1].x) * fraccion,
        y: puntos[i - 1].y + (puntos[i].y - puntos[i - 1].y) * fraccion,
        angulo: Math.atan2(puntos[i].y - puntos[i - 1].y, puntos[i].x - puntos[i - 1].x),
      }
    }
    recorrido += largo
  }
  return null
}

function dibujarFlecha(contexto, { x, y, angulo }) {
  const punta = {
    x: x + (Math.cos(angulo) * LARGO_DE_LA_FLECHA) / 2,
    y: y + (Math.sin(angulo) * LARGO_DE_LA_FLECHA) / 2,
  }
  contexto.beginPath()
  for (const lado of [-1, 1]) {
    const hacia = angulo + Math.PI + lado * ABERTURA_DE_LA_FLECHA
    contexto.moveTo(
      punta.x + Math.cos(hacia) * LARGO_DE_LA_FLECHA,
      punta.y + Math.sin(hacia) * LARGO_DE_LA_FLECHA,
    )
    contexto.lineTo(punta.x, punta.y)
  }
  contexto.stroke()
}

// trazados: [[[lat, lon], …], …], cada uno en el sentido en que se puede avanzar.
export const CapaDeSentidos = L.Layer.extend({
  initialize(trazados) {
    this._trazados = trazados.map(puntos => ({ puntos, limites: L.latLngBounds(puntos) }))
  },

  getEvents() {
    return { moveend: this._dibujar, zoomend: this._dibujar, resize: this._dibujar, zoomstart: this._ocultar }
  },

  onAdd(mapa) {
    this._canvas = L.DomUtil.create('canvas', 'capa-de-sentidos')
    this._canvas.style.pointerEvents = 'none'
    mapa.getPane('streets').appendChild(this._canvas)
    this._dibujar()
  },

  onRemove() {
    this._canvas.remove()
  },

  _ocultar() {
    this._canvas.style.visibility = 'hidden'
  },

  _dibujar() {
    const mapa = this._map
    const canvas = this._canvas
    const tamano = mapa.getSize()
    const escala = window.devicePixelRatio || 1
    canvas.width = tamano.x * escala
    canvas.height = tamano.y * escala
    canvas.style.width = `${tamano.x}px`
    canvas.style.height = `${tamano.y}px`
    L.DomUtil.setPosition(canvas, mapa.containerPointToLayerPoint([0, 0]))
    canvas.style.visibility = 'visible'
    const contexto = canvas.getContext('2d')
    contexto.scale(escala, escala)
    contexto.strokeStyle = COLOR_DE_LA_FLECHA
    contexto.lineWidth = 1.6
    contexto.lineCap = 'round'
    contexto.lineJoin = 'round'
    const visible = mapa.getBounds().pad(0.1)
    for (const { puntos, limites } of this._trazados) {
      if (!visible.intersects(limites)) continue
      const enPantalla = puntos.map(punto => mapa.latLngToContainerPoint(punto))
      const largo = enPantalla
        .slice(1)
        .reduce((suma, p, i) => suma + Math.hypot(p.x - enPantalla[i].x, p.y - enPantalla[i].y), 0)
      if (largo < PIXELES_MINIMOS_DE_UNA_CALLE) continue
      const flechas = Math.max(1, Math.floor(largo / PIXELES_ENTRE_FLECHAS))
      for (let i = 0; i < flechas; i++) {
        const flecha = puntoYRumboAlLargo(enPantalla, ((i + 0.5) * largo) / flechas)
        if (flecha) dibujarFlecha(contexto, flecha)
      }
    }
  },
})
