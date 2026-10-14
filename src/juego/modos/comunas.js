import { escaparHtml, mezclar } from '../../nucleo/utilidades.js'
import { comunaPorNombre, enElAlcance, puntoDeEtiqueta, comunasDelAlcance } from '../../datos/datos.js'
import { distractoresDeComuna } from '../../dominio/comunas.js'
import { COLORES, capaDeComunas, etiquetaDeMapa } from '../../mapa/dibujo.js'
import { mostrarAyudas } from '../../mapa/ayudas.js'
import { limitesDeRasgos, limpiarCapa, encuadrar, encuadrarGranSantiago, capa } from '../../mapa/mapa.js'
import { mostrarPanel, aviso } from '../../interfaz/panel.js'
import { responder, encabezadoDePregunta, partida } from '../engine.js'
import { mostrarOpciones } from '../options.js'
import { registrarModo } from '../registry.js'

registrarModo({
  id: 'com-name',
  all: true,
  noHint: true,
  aids: true,
  group: 'Comunas',
  name: '¿Qué comuna es esta?',
  pool: () => comunasDelAlcance(),
  key: f => f.properties.name,
  ask(f, q) {
    const nombre = f.properties.name
    mostrarPanel(encabezadoDePregunta(q) + `<div class="q-prompt">¿Qué comuna está marcada en naranjo?</div>`)
    mostrarAyudas()
    capaDeComunas(comunasDelAlcance(), {
      interactive: false,
      style: g => (g === f ? { fillColor: COLORES.hi, fillOpacity: 0.85, weight: 3, color: '#92400e' } : {}),
    }).addTo(capa)
    const vecinasCercanas = f.properties.nb
      .map(n => comunaPorNombre[n])
      .filter(Boolean)
      .filter(enElAlcance)
    encuadrar(limitesDeRasgos([f]).pad(f.properties.km2 > 150 ? 0.3 : 1.2), 13)
    const opciones = mezclar([nombre, ...distractoresDeComuna(nombre)]).map(v => ({
      label: escaparHtml(v),
      value: v,
    }))
    mostrarOpciones(opciones, nombre, v => {
      etiquetaDeMapa(puntoDeEtiqueta(f), nombre, 'lbl big').addTo(capa)
      vecinasCercanas.forEach(n => etiquetaDeMapa(puntoDeEtiqueta(n), n.properties.name).addTo(capa))
      responder(
        v === nombre,
        `<p>Es <b>${escaparHtml(nombre)}</b>. Limita con: ${f.properties.nb.map(escaparHtml).join(', ')}.</p>`,
      )
    })
  },
})

registrarModo({
  id: 'com-all',
  noHint: true,
  aids: true,
  group: 'Comunas',
  name: 'Completa el mapa',
  desc: 'Todas las comunas, una por una, hasta pintar el mapa entero.',
  all: true,
  keepLayer: true,
  pool: () => comunasDelAlcance(),
  key: f => f.properties.name,
  setup(q) {
    limpiarCapa()
    q.state = {}
    q.tries = 0
    q.lay = capaDeComunas(comunasDelAlcance(), { onClick: (g, l) => this.click(g, l) }).addTo(capa)
    mostrarAyudas()
    encuadrarGranSantiago()
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
    const f = q.items[q.i]
    const nombre = f.properties.name
    if (q.state[g.properties.name]) {
      aviso(g.properties.name + ' (ya respondida)')
      return
    }
    if (g.properties.name === nombre) {
      const columna = [COLORES.ok, COLORES.ok2, COLORES.mid][q.tries]
      l.setStyle({ fillColor: columna, fillOpacity: 0.85 })
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
          if (x.feature.properties.name === nombre) {
            x.setStyle({ fillColor: COLORES.bad, fillOpacity: 0.8 })
          }
        })
        q.state[nombre] = true
        etiquetaDeMapa(puntoDeEtiqueta(f), nombre, 'lbl bad').addTo(capa)
        responder(false, `<p>Está marcada en rojo.</p>`)
      }
    }
  },
})
