import { CHILE, REGIONES, puntoDeEtiqueta, regionPorNombre } from '../../datos/datos.js'
import { COLORES, iconoDiv, etiquetaDeMapa, capaDeRegiones } from '../../mapa/dibujo.js'
import { responder, encabezadoDePregunta, partida } from '../engine.js'
import { textoDeCiudad, textoDeRegion } from '../../dominio/chile.js'
import { limpiarCapa, encuadrarChile, capa, mapa } from '../../mapa/mapa.js'
import { distanciaKmCualquierLatitud } from '../../nucleo/geografia.js'
import { escaparHtml } from '../../nucleo/utilidades.js'
import { registrarModo } from '../registry.js'
import { mostrarPanel, aviso } from '../../interfaz/panel.js'

registrarModo({
  id: 'ch-find',
  all: true,
  group: 'Chile',
  name: 'Ubica la región',
  desc: 'Te digo la región; la tocas en el mapa de Chile.',
  chile: true,
  pool: () => REGIONES,
  key: f => f.properties.name,
  ask(f, q) {
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">Toca la región: <b>${escaparHtml(f.properties.name)}</b></div><div class="q-sub">Haz zoom: las del centro son angostas.</div>`,
    )
    if (q.i === 0) encuadrarChile()
    const subcapa = capaDeRegiones({
      onClick: (g, l) => {
        if (q.answered) return
        const ok = g === f
        l.setStyle({ fillColor: ok ? COLORES.ok : COLORES.bad, fillOpacity: 0.8 })
        etiquetaDeMapa(puntoDeEtiqueta(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(capa)
        if (!ok) {
          subcapa.eachLayer(x => {
            if (x.feature === f) x.setStyle({ fillColor: COLORES.hi, fillOpacity: 0.85 })
          })
          etiquetaDeMapa(puntoDeEtiqueta(f), f.properties.name, 'lbl big').addTo(capa)
        }
        responder(ok, (ok ? '' : `<p>Tocaste ${escaparHtml(g.properties.name)}.</p>`) + textoDeRegion(f))
      },
    }).addTo(capa)
  },
})
registrarModo({
  id: 'ch-city',
  group: 'Chile',
  name: 'Ubica la ciudad',
  desc: 'Toca dónde está la ciudad en el mapa de Chile (margen 60 km).',
  chile: true,
  pool: () => CHILE.cities,
  key: c => c.name,
  ask(c, q) {
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">¿Dónde está <b>${escaparHtml(c.name)}</b>?</div><div class="q-sub">Toca el mapa</div>`,
    )
    capaDeRegiones({
      interactive: false,
      style: () => ({ color: '#64748b', weight: 1, fillOpacity: 0.08 }),
    }).addTo(capa)
    if (q.i === 0) encuadrarChile()
    mapa.on('click', e => {
      if (q.answered) return
      const tu = [e.latlng.lat, e.latlng.lng]
      const dk = distanciaKmCualquierLatitud(tu, [c.lat, c.lon])
      const ok = dk <= 60
      L.marker(tu, { icon: iconoDiv('pin you'), pane: 'points' }).addTo(capa)
      L.marker([c.lat, c.lon], { icon: iconoDiv('pin ' + (ok ? 'good' : 'ans')), pane: 'points' })
        .addTo(capa)
        .bindTooltip(escaparHtml(c.name), { permanent: true, direction: 'top', offset: [0, -10] })
      L.polyline([tu, [c.lat, c.lon]], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(capa)
      const R = regionPorNombre[c.region]
      if (R) etiquetaDeMapa(puntoDeEtiqueta(R), R.properties.name).addTo(capa)
      responder(ok, `<p>Quedaste a <b>${Math.round(dk)} km</b>.</p>${textoDeCiudad(c)}`, {
        partial: !ok && dk <= 150,
      })
    })
  },
})
registrarModo({
  id: 'ch-cityreg',
  group: 'Chile',
  name: '¿En qué región está la ciudad?',
  desc: 'Toca la región donde queda la ciudad.',
  chile: true,
  pool: () => CHILE.cities.filter(c => regionPorNombre[c.region]),
  key: c => c.name,
  ask(c, q) {
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">¿En qué región está <b>${escaparHtml(c.name)}</b>?</div><div class="q-sub">Toca la región</div>`,
    )
    if (q.i === 0) encuadrarChile()
    capaDeRegiones({
      onClick: (g, l) => {
        if (q.answered) return
        const ok = g.properties.name === c.region
        l.setStyle({ fillColor: ok ? COLORES.ok : COLORES.bad, fillOpacity: 0.75 })
        etiquetaDeMapa(puntoDeEtiqueta(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(capa)
        if (!ok) etiquetaDeMapa(puntoDeEtiqueta(regionPorNombre[c.region]), c.region, 'lbl big').addTo(capa)
        L.marker([c.lat, c.lon], { icon: iconoDiv('pin good'), pane: 'points' })
          .addTo(capa)
          .bindTooltip(escaparHtml(c.name), { permanent: true, direction: 'top', offset: [0, -10] })
        responder(ok, textoDeCiudad(c))
      },
    }).addTo(capa)
  },
})
registrarModo({
  id: 'ch-all',
  group: 'Chile',
  name: 'Completa el mapa (regiones)',
  desc: 'Las 16 regiones, una por una, hasta pintar el mapa entero.',
  all: true,
  keepLayer: true,
  chile: true,
  pool: () => REGIONES,
  key: f => f.properties.name,
  setup(q) {
    limpiarCapa()
    q.state = {}
    q.tries = 0
    q.lay = capaDeRegiones({
      style: () => ({ color: '#475569', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.6 }),
      onClick: (g, l) => this.click(g, l),
    }).addTo(capa)
    encuadrarChile()
  },
  ask(f, q) {
    q.tries = 0
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">Toca: <b>${escaparHtml(f.properties.name)}</b></div><div class="q-sub">Verde = a la primera · amarillo = 2º intento · naranjo = 3º · rojo = no la encontraste</div>`,
    )
  },
  click(g, l) {
    const q = partida
    if (!q || q.answered || q.starting) return
    const f = q.items[q.i],
      nombre = f.properties.name
    if (q.state[g.properties.name]) {
      aviso(g.properties.name + ' (ya respondida)')
      return
    }
    if (g === f) {
      l.setStyle({ fillColor: [COLORES.ok, COLORES.ok2, COLORES.mid][q.tries], fillOpacity: 0.85 })
      q.state[nombre] = true
      etiquetaDeMapa(puntoDeEtiqueta(g), nombre).addTo(capa)
      responder(q.tries === 0, q.tries ? `<p>Encontrada al intento ${q.tries + 1}.</p>` : '', {
        partial: q.tries > 0,
      })
    } else {
      q.tries++
      aviso('Esa es ' + g.properties.name)
      const tl = etiquetaDeMapa(puntoDeEtiqueta(g), g.properties.name, 'lbl bad').addTo(capa)
      setTimeout(() => capa.removeLayer(tl), 1500)
      if (q.tries >= 3) {
        q.lay.eachLayer(x => {
          if (x.feature === f) x.setStyle({ fillColor: COLORES.bad, fillOpacity: 0.8 })
        })
        q.state[nombre] = true
        etiquetaDeMapa(puntoDeEtiqueta(f), nombre, 'lbl bad').addTo(capa)
        responder(false, '<p>Está marcada en rojo.</p>')
      }
    }
  },
})
