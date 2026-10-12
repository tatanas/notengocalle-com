import { distanciaKm, puntoMasCercanoEnLineas, puntoEnPoligono } from '../../nucleo/geografia.js'
import { ajustes } from '../../nucleo/almacen.js'
import { escaparHtml, formatearKm } from '../../nucleo/utilidades.js'
import {
  comunaPorNombre,
  comunas,
  enElAlcance,
  puntoDeEtiqueta,
  comunasDelAlcance,
} from '../../datos/datos.js'
import { infoDeLugar, conjuntoDeLugares, mostrarLugaresCercanos, mostrarZona } from '../../dominio/lugares.js'
import { mostrarAyudas } from '../../mapa/ayudas.js'
import { COLORES, capaDeComunas, iconoDiv, etiquetaDeMapa } from '../../mapa/dibujo.js'
import { encuadrar, encuadrarCiudad, capa, mapa } from '../../mapa/mapa.js'
import { mostrarPanel } from '../../interfaz/panel.js'
import { responder, encabezadoDePregunta } from '../engine.js'
import { registrarModo } from '../registry.js'

// Un río o canal se acierta tocando cerca de su cauce.
const TOQUE_EN_CAUCE_KM = 0.4

registrarModo({
  id: 'lm-loc',
  aids: true,
  balance: l => l.comuna,
  group: 'Lugares emblemáticos',
  name: 'Ubícalo en el mapa',
  desc: 'Toca dónde crees que está el lugar.',
  cats: true,
  pool: conjuntoDeLugares,
  key: l => l.name,
  label: l => l.name,
  ask(l, q) {
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">¿Dónde está <b>${escaparHtml(l.name)}</b>?</div><div class="q-sub">${escaparHtml(l.cat)} · toca el mapa</div>`,
    )
    mostrarAyudas({ borders: comunasDelAlcance() })
    if (q.i === 0) encuadrarCiudad()
    mapa.on('click', e => {
      if (q.answered) return
      const tu = [e.latlng.lat, e.latlng.lng]
      const enElCauce = l.line ? puntoMasCercanoEnLineas(tu, l.line) : null
      const respuestaCorrecta = enElCauce ? enElCauce.point : [l.lat, l.lon]
      const d = enElCauce ? enElCauce.km : distanciaKm(tu, respuestaCorrecta)
      const limite = l.line ? TOQUE_EN_CAUCE_KM : l.tol || (ajustes.strict ? 0.8 : 1.5),
        ok = d <= limite || !!(l.zone && puntoEnPoligono(tu, l.zone.poly))
      mostrarZona(l)
      mostrarLugaresCercanos(l)
      L.marker(tu, { icon: iconoDiv('pin you'), pane: 'points' }).addTo(capa)
      L.marker(respuestaCorrecta, { icon: iconoDiv('pin ' + (ok ? 'good' : 'ans')), pane: 'points' })
        .addTo(capa)
        .bindTooltip(escaparHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
      L.polyline([tu, respuestaCorrecta], {
        pane: 'routes',
        color: '#334155',
        dashArray: '5 6',
        weight: 2,
      }).addTo(capa)
      encuadrar(L.latLngBounds([tu, respuestaCorrecta]).pad(0.3), 15)
      const pts = Math.max(0, Math.round(100 * (1 - d / 6)))
      responder(ok, `<p>Quedaste a <b>${formatearKm(d)}</b> (+${pts} pts).</p>${infoDeLugar(l)}`, {
        points: pts,
        partial: !ok && d <= 3,
      })
    })
  },
})
registrarModo({
  id: 'lm-com',
  aids: true,
  balance: l => l.comuna,
  group: 'Lugares emblemáticos',
  name: '¿En qué comuna está?',
  desc: 'Toca la comuna donde queda el lugar.',
  cats: true,
  pool: () => conjuntoDeLugares().filter(l => !l.obvious),
  key: l => l.name,
  label: l => l.name,
  ask(l, q) {
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">¿En qué comuna está <b>${escaparHtml(l.name)}</b>?</div><div class="q-sub">${escaparHtml(l.cat)} · toca la comuna</div>`,
    )
    mostrarAyudas()
    const fs = comunas.filter(f => enElAlcance(f) || f.properties.name === l.comuna)
    if (q.i === 0) encuadrarCiudad()
    capaDeComunas(fs, {
      onClick: (g, subcapa) => {
        if (q.answered) return
        const ok = g.properties.name === l.comuna || (l.alt || []).includes(g.properties.name)
        subcapa.setStyle({ fillColor: ok ? COLORES.ok : COLORES.bad, fillOpacity: 0.75 })
        etiquetaDeMapa(puntoDeEtiqueta(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(capa)
        if (!ok) {
          const c = comunaPorNombre[l.comuna]
          if (c) etiquetaDeMapa(puntoDeEtiqueta(c), c.properties.name, 'lbl big').addTo(capa)
        }
        L.marker([l.lat, l.lon], { icon: iconoDiv('pin good'), pane: 'points' })
          .addTo(capa)
          .bindTooltip(escaparHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        mostrarZona(l)
        mostrarLugaresCercanos(l)
        responder(ok, infoDeLugar(l))
      },
    }).addTo(capa)
  },
})
