import { COLORES, etiquetaDeMapa, iconoDeParque, capaDeRegiones } from '../../mapa/dibujo.js'
import { PARQUES, FOTOS, puntoDeEtiqueta, regionPorNombre } from '../../datos/datos.js'
import { responder, encabezadoDePregunta } from '../engine.js'
import { escaparHtml, mezclar } from '../../nucleo/utilidades.js'
import { parqueLejano, textoDeParque } from '../../dominio/chile.js'
import { encuadrar, encuadrarChile, capa } from '../../mapa/mapa.js'
import { htmlDeFoto } from '../../interfaz/fotos.js'
import { registrarModo } from '../registry.js'
import { mostrarOpciones } from '../options.js'
import { mostrarPanel } from '../../interfaz/panel.js'

registrarModo({
  id: 'pn-reg',
  group: 'Parques nacionales',
  name: '¿En qué región está el parque?',
  desc: 'Toca la región del parque nacional.',
  chile: true,
  pool: () => PARQUES.filter(p => regionPorNombre[p.region]),
  key: p => p.name,
  ask(p, q) {
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">¿En qué región está el Parque Nacional <b>${escaparHtml(p.name)}</b>?</div><div class="q-sub">Toca la región</div>`,
    )
    if (q.i === 0) encuadrarChile()
    capaDeRegiones({
      onClick: (g, l) => {
        if (q.answered) return
        const ok = g.properties.name === p.region
        l.setStyle({ fillColor: ok ? COLORES.ok : COLORES.bad, fillOpacity: 0.8 })
        etiquetaDeMapa(puntoDeEtiqueta(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(capa)
        if (!ok) etiquetaDeMapa(puntoDeEtiqueta(regionPorNombre[p.region]), p.region, 'lbl big').addTo(capa)
        if (!parqueLejano(p))
          L.marker([p.lat, p.lon], { icon: iconoDeParque(), pane: 'points' })
            .addTo(capa)
            .bindTooltip(escaparHtml(p.name), { permanent: true, direction: 'top', offset: [0, -10] })
        responder(
          ok,
          textoDeParque(p) +
            (parqueLejano(p)
              ? '<p class="muted">Es territorio insular: administrativamente pertenece a la región de Valparaíso.</p>'
              : ''),
        )
      },
    }).addTo(capa)
  },
})
registrarModo({
  id: 'pn-photo',
  group: 'Parques nacionales',
  name: 'Reconoce el parque por la foto',
  desc: 'Te muestro una foto de un parque nacional; eliges cuál es.',
  chile: true,
  tall: true,
  pool: () => PARQUES.filter(p => FOTOS['p:' + p.name]),
  key: p => p.name,
  ask(p, q) {
    const ps = FOTOS['p:' + p.name]
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-prompt">¿Qué parque nacional es este?</div>${htmlDeFoto('p:' + p.name, { start: Math.floor(Math.random() * ps.length), big: true })}`,
    )
    capaDeRegiones({
      interactive: false,
      style: () => ({ color: '#64748b', weight: 1, fillOpacity: 0.08 }),
    }).addTo(capa)
    if (q.i === 0) encuadrarChile()
    const cerca = PARQUES.filter(x => x !== p)
      .map(x => ({ x, d: Math.abs(x.lat - p.lat) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .map(o => o.x)
    const opciones = mezclar([p, ...mezclar(cerca).slice(0, 3)])
    mostrarOpciones(
      opciones.map(x => ({ label: escaparHtml(x.name), value: x.name })),
      p.name,
      v => {
        for (const o of opciones.filter(o => !parqueLejano(o)))
          L.marker([o.lat, o.lon], { icon: iconoDeParque(), pane: 'points' })
            .addTo(capa)
            .bindTooltip(escaparHtml(o.name), {
              permanent: true,
              direction: 'right',
              offset: [10, 0],
              className: 'lbl' + (o === p ? ' big' : ''),
            })
        const visibilidad = opciones.filter(o => !parqueLejano(o))
        if (visibilidad.length) encuadrar(L.latLngBounds(visibilidad.map(o => [o.lat, o.lon])).pad(0.4), 8)
        responder(v === p.name, textoDeParque(p))
      },
      { one: true },
    )
  },
})
