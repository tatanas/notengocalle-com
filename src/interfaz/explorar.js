import { ajustes, almacen } from '../nucleo/almacen.js'
import { $, escaparHtml } from '../nucleo/utilidades.js'
import {
  CATEGORIAS,
  CHILE,
  DATOS,
  LINEAS_DE_METRO,
  PARQUES,
  REGIONES,
  ZONAS,
  cerros,
  comunas,
  puntoDeEtiqueta,
  estaciones,
} from '../datos/datos.js'
import { infoDeCerro } from '../dominio/cerros.js'
import { textoDeCiudad, textoDeParque, textoDeRegion } from '../dominio/chile.js'
import { pildoraDeLinea } from '../dominio/metro.js'
import { htmlDeTramosConNombre } from '../dominio/calles.js'
import { infoDeZona } from '../dominio/zonas.js'
import {
  COLORES_DE_REGIONES,
  estiloDeContinuacion,
  capaDeComunas,
  dibujarMetro,
  etiquetaDeMapa,
  iconoDeParque,
  iconoDeCumbre,
} from '../mapa/dibujo.js'
import {
  limitesDeRasgos,
  limpiarCapa,
  encuadrar,
  encuadrarChile,
  encuadrarCiudad,
  modoDeEtiquetas,
  capa,
  mapa,
  fijarChile,
  fijarModoDeEtiquetas,
  fijarRelieve,
  mostrandoChile,
} from '../mapa/mapa.js'
import { detenerPartida } from '../juego/engine.js'
import { definirPantalla } from './navegacion.js'
import { ocultarPanel, ocultarPantalla, panel, mostrarPanel, titulo } from './panel.js'
import { htmlDeFoto } from './fotos.js'

let yaEncuadrado = false
let controlDeReapertura = null

function abrirExplorar() {
  detenerPartida()
  ocultarPantalla()
  titulo.textContent = 'Explorar'
  limpiarCapa()
  fijarModoDeEtiquetas('labels')
  const st = Object.assign(
    {
      com: true,
      names: true,
      metro: false,
      streets: false,
      cerros: false,
      zones: false,
      tren: false,
      micros: false,
      regs: false,
      cities: false,
      parks: false,
      relief: false,
      cats: [],
    },
    almacen.get('explore', {}),
  )
  const grupos = {
    com: L.layerGroup(),
    names: L.layerGroup(),
    metro: L.layerGroup(),
    streets: L.layerGroup(),
    lm: L.layerGroup(),
    cerros: L.layerGroup(),
  }
  grupos.zones = L.layerGroup()
  for (const z of ZONAS) {
    L.polygon(z.poly, {
      pane: 'comunas',
      color: '#b45309',
      weight: 2.5,
      dashArray: z.approx ? '6 6' : null,
      fillColor: '#f59e0b',
      fillOpacity: 0.25,
    })
      .bindPopup(`<h4>${escaparHtml(z.name)}</h4>${infoDeZona(z)}`, { maxWidth: 280 })
      .addTo(grupos.zones)
    etiquetaDeMapa(z.c, z.name).addTo(grupos.zones)
  }
  for (const c of cerros)
    L.marker([c.lat, c.lon], { icon: iconoDeCumbre(), pane: 'points' })
      .bindPopup(`<h4>${escaparHtml(c.name)}</h4>${infoDeCerro(c)}`, { maxWidth: 280 })
      .addTo(grupos.cerros)
  const todos = comunas.filter(f => f.properties.group !== 'rural' || ajustes.scope === 'all')
  capaDeComunas(todos, {
    style: () => ({ fillOpacity: 0.12, fillColor: '#0f766e', color: '#0f766e', weight: 1.6 }),
    onClick: (f, l, e) => {
      L.popup()
        .setLatLng(e.latlng)
        .setContent(
          `<h4>${escaparHtml(f.properties.name)}</h4><p>${f.properties.km2.toLocaleString('es-CL')} km²</p><p class="muted">Limita con: ${f.properties.nb.map(escaparHtml).join(', ')}</p>`,
        )
        .openOn(mapa)
    },
  }).addTo(grupos.com)
  const etiquetasDeNombres = todos.map(f => ({
    f,
    t: etiquetaDeMapa(puntoDeEtiqueta(f), f.properties.name),
  }))
  const actualizarNombres = () => {
    grupos.names.clearLayers()
    const z = mapa.getZoom()
    for (const { f, t } of etiquetasDeNombres) {
      if (z >= 11 || f.properties.km2 > 40 || (z >= 10 && f.properties.km2 > 15)) grupos.names.addLayer(t)
    }
  }
  mapa.on('zoomend', actualizarNombres)
  actualizarNombres()
  grupos.tren = L.layerGroup()
  grupos.micros = L.layerGroup()
  grupos.regs = L.layerGroup()
  grupos.cities = L.layerGroup()
  grupos.parks = L.layerGroup()
  const MC = [
    '#dc2626',
    '#ea580c',
    '#ca8a04',
    '#16a34a',
    '#0891b2',
    '#2563eb',
    '#7c3aed',
    '#db2777',
    '#0f766e',
    '#a16207',
  ]
  ;(DATOS.micros || []).forEach((m, i) => {
    const pl = L.polyline(m.g, {
      pane: 'routes',
      color: MC[i % MC.length],
      weight: 3.5,
      opacity: 0.8,
    }).bindPopup(
      `<h4>🚌 Micro ${escaparHtml(m.name)}</h4><p>${escaparHtml(m.long)}</p><p class="muted">Pasa cada ~${m.min} min (día laboral, media mañana) · ${m.km} km${m.why === 'casa' ? ' · pasa cerca del punto fijo' : m.why === 'campus' ? ' · pasa por el Campus San Joaquín' : ''}</p>`,
    )
    pl.on('mouseover', () => pl.setStyle({ weight: 7, opacity: 1 }))
    pl.on('mouseout', () => pl.setStyle({ weight: 3.5, opacity: 0.8 }))
    grupos.micros.addLayer(pl)
    L.tooltip({ permanent: true, direction: 'center', className: 'lbl' })
      .setLatLng(m.g[Math.floor(m.g.length * (0.3 + 0.4 * ((i % 5) / 5)))])
      .setContent(escaparHtml(m.name))
      .addTo(grupos.micros)
  })
  capaDeComunas(REGIONES, {
    style: f => ({
      color: '#475569',
      weight: 1,
      fillColor: COLORES_DE_REGIONES[f.properties.ord % COLORES_DE_REGIONES.length],
      fillOpacity: 0.45,
    }),
    onClick: (f, l, e) =>
      L.popup()
        .setLatLng(e.latlng)
        .setContent(`<h4>Región de ${escaparHtml(f.properties.name)}</h4>${textoDeRegion(f)}`)
        .openOn(mapa),
  }).addTo(grupos.regs)
  for (const c of CHILE.cities)
    L.circleMarker([c.lat, c.lon], {
      pane: 'points',
      radius: c.cap ? 7 : c.pop > 100000 ? 6 : 4.5,
      color: '#fff',
      weight: 2,
      fillColor: c.cap ? '#dc2626' : '#1e293b',
      fillOpacity: 1,
    })
      .bindPopup(textoDeCiudad(c))
      .bindTooltip(escaparHtml(c.name), {
        permanent: !!c.cap,
        direction: 'right',
        offset: [7, 0],
        className: 'lbl',
      })
      .addTo(grupos.cities)
  for (const p of PARQUES)
    L.marker([p.lat, p.lon], { icon: iconoDeParque(), pane: 'points' })
      .bindPopup(textoDeParque(p))
      .bindTooltip(escaparHtml(p.name), { direction: 'right', offset: [10, 0], className: 'lbl' })
      .addTo(grupos.parks)
  for (const s of DATOS.streets) {
    const pl = L.polyline(s.lines, {
      pane: 'streets',
      color:
        s.kind === 'agua'
          ? '#0891b2'
          : s.kind === 'tren'
            ? '#57534e'
            : s.kind === 'autopista'
              ? '#7c3aed'
              : '#2563eb',
      dashArray: s.kind === 'tren' ? '8 6' : null,
      weight: 4,
      opacity: 0.75,
    })
    pl.bindPopup(
      `<h4>${escaparHtml(s.name)}</h4><p>${escaparHtml(s.hint)}</p><p class="muted">${s.comunas.map(escaparHtml).join(', ')}</p>${htmlDeFoto('s:' + s.name)}`,
      { maxWidth: 280 },
    )
    pl.on('mouseover', () => pl.setStyle({ weight: 7, opacity: 1 }))
    pl.on('mouseout', () => pl.setStyle({ weight: 4, opacity: 0.75 }))
    if (s.tr)
      pl.setPopupContent(
        `<h4>${escaparHtml(s.name)}</h4><p>${escaparHtml(s.hint)}</p>${htmlDeTramosConNombre(s)}${htmlDeFoto('s:' + s.name)}`,
      )
    const grupo = s.kind === 'tren' ? grupos.tren : grupos.streets
    grupo.addLayer(pl)
    for (const linea of s.ext || [])
      grupo.addLayer(L.polyline(linea, estiloDeContinuacion(pl.options.color, 3)))
  }
  dibujarMetro(grupos.metro, { dots: false })
  for (const s of estaciones)
    L.circleMarker([s.lat, s.lon], {
      pane: 'metro',
      radius: 5,
      color: '#fff',
      weight: 2,
      fillColor: LINEAS_DE_METRO[s.lines[0]].color,
      fillOpacity: 1,
    })
      .bindPopup(
        `<h4>${escaparHtml(s.name)}</h4><p>${s.lines.map(pildoraDeLinea).join('')}</p><p class="muted">${escaparHtml(s.comuna)}</p>`,
      )
      .addTo(grupos.metro)
  const COLORES_DE_CATEGORIA = [
    '#dc2626',
    '#ea580c',
    '#ca8a04',
    '#16a34a',
    '#0891b2',
    '#2563eb',
    '#7c3aed',
    '#db2777',
    '#64748b',
    '#0f766e',
    '#a16207',
    '#4b5563',
  ]
  const categoriasDeLugares = CATEGORIAS
  const marcadoresDeLugares = DATOS.landmarks.map(l => ({
    l,
    m: L.circleMarker([l.lat, l.lon], {
      pane: 'points',
      radius: 6,
      color: '#fff',
      weight: 2,
      fillColor: COLORES_DE_CATEGORIA[CATEGORIAS.indexOf(l.cat) % COLORES_DE_CATEGORIA.length],
      fillOpacity: 1,
    }).bindPopup(
      `<h4>${escaparHtml(l.name)}</h4><p>${escaparHtml(l.cat)} · <b>${escaparHtml(l.comuna)}</b></p><p class="muted">${escaparHtml(l.desc || '')}</p>${l.car ? `<p><b>Qué se estudia:</b> ${escaparHtml(l.car)}</p>` : ''}${htmlDeFoto('l:' + l.name)}`,
      { maxWidth: 280 },
    ),
  }))
  const actualizarLugares = () => {
    grupos.lm.clearLayers()
    marcadoresDeLugares.forEach(({ l, m }) => {
      if (st.cats.includes(l.cat)) grupos.lm.addLayer(m)
    })
  }
  actualizarLugares()
  const aplicar = () => {
    fijarRelieve(st.relief)
    for (const k of [
      'com',
      'names',
      'metro',
      'streets',
      'lm',
      'cerros',
      'zones',
      'tren',
      'micros',
      'regs',
      'cities',
      'parks',
    ]) {
      const visible = k === 'lm' ? st.cats.length > 0 : st[k]
      if (visible) capa.addLayer(grupos[k])
      else capa.removeLayer(grupos[k])
    }
    const quiereChile = st.regs || st.cities || st.parks
    if (quiereChile !== mostrandoChile) {
      fijarChile(quiereChile)
      if (quiereChile) encuadrarChile()
    }
    if (modoDeEtiquetas !== 'plain') fijarModoDeEtiquetas(st.names ? 'streets' : 'labels')
    almacen.set('explore', st)
  }
  function fijarCategoria(categoria, on) {
    st.cats = on ? [...new Set([...st.cats, categoria])] : st.cats.filter(c => c !== categoria)
    const casilla = panel.querySelector(`[data-cat="${CSS.escape(categoria)}"]`)
    if (casilla) {
      casilla.checked = on
      casilla.parentElement.classList.toggle('on', on)
    }
    actualizarLugares()
    aplicar()
  }
  const elementosDeBusqueda = [
    ...comunas.map(f => ({
      t: f.properties.name,
      k: 'Comuna',
      go: () => {
        encuadrar(limitesDeRasgos([f]), 14)
      },
    })),
    ...DATOS.landmarks.map(l => ({
      t: l.name,
      k: l.cat,
      go: () => {
        mapa.setView([l.lat, l.lon], 15)
        setTimeout(() => {
          fijarCategoria(l.cat, true)
          marcadoresDeLugares.find(x => x.l === l).m.openPopup()
        }, 300)
      },
    })),
    ...DATOS.streets.map(s => ({
      t: s.name,
      k: 'Calle',
      go: () => {
        if (!st.streets) {
          st.streets = true
          $('#ex-streets').checked = true
          aplicar()
        }
        encuadrar(L.latLngBounds(s.bb).pad(0.1), 15)
        const hl = L.polyline(s.lines, { pane: 'routes', color: '#f59e0b', weight: 8, opacity: 0.9 }).addTo(
          capa,
        )
        setTimeout(() => capa.removeLayer(hl), 4000)
      },
    })),
    ...cerros.map(c => ({
      t: c.name,
      k: 'Cerro',
      go: () => {
        if (!st.cerros) {
          st.cerros = true
          $('#ex-cerros').checked = true
          $('#ex-cerros').parentElement.classList.add('on')
          aplicar()
        }
        mapa.setView([c.lat, c.lon], c.tipo === 'Cordillera' ? 11 : 13)
      },
    })),
    ...estaciones.map(s => ({
      t: 'Metro ' + s.name,
      k: s.lines.join('/'),
      go: () => {
        if (!st.metro) {
          st.metro = true
          $('#ex-metro').checked = true
          aplicar()
        }
        mapa.setView([s.lat, s.lon], 15)
      },
    })),
  ]
  mostrarPanel(`<div class="q-prompt" style="margin-top:0">Explora el mapa</div>
    <input type="search" id="ex-q" placeholder="Buscar comuna, lugar, calle o estación…" list="ex-list" autocomplete="off">
    <datalist id="ex-list">${elementosDeBusqueda.map(s => `<option value="${escaparHtml(s.t)}">${escaparHtml(s.k)}</option>`).join('')}</datalist>
    <div class="chips" style="margin-top:10px">
      ${[
        ['com', 'Comunas'],
        ['names', 'Nombres comunas'],
        ['metro', 'Metro'],
        ['streets', 'Calles principales'],
        ['zones', 'Barrios (perímetros)'],
        ['cerros', 'Cerros'],
        ['tren', 'Tren'],
        ['micros', 'Micros importantes'],
        ['regs', 'Chile: regiones'],
        ['cities', 'Chile: ciudades'],
        ['parks', 'Chile: parques nacionales'],
        ['relief', 'Relieve'],
      ]
        .map(
          ([k, t]) =>
            `<label class="chip ${st[k] ? 'on' : ''}"><input type="checkbox" id="ex-${k}" ${st[k] ? 'checked' : ''}>${t}</label>`,
        )
        .join('')}
    </div>
    <div style="margin-top:12px">
      <div class="row" style="justify-content:space-between;margin-bottom:4px">
        <span class="muted" style="font-size:12.5px">Lugares por categoría</span>
        <span><button type="button" class="linklike" id="ex-cats-all">Todas</button> · <button type="button" class="linklike" id="ex-cats-none">Ninguna</button></span>
      </div>
      <div class="chips" id="ex-cats">
        ${categoriasDeLugares.map(c => `<label class="chip ${st.cats.includes(c) ? 'on' : ''}"><input type="checkbox" data-cat="${escaparHtml(c)}" ${st.cats.includes(c) ? 'checked' : ''}><span class="dot" style="background:${COLORES_DE_CATEGORIA[CATEGORIAS.indexOf(c) % COLORES_DE_CATEGORIA.length]}"></span>${escaparHtml(c)}</label>`).join('')}
      </div>
    </div>
    <div class="row" style="margin-top:10px"><button class="btn sec small" id="ex-tiles">Mapa sin nombres</button><button class="btn sec small" id="ex-hide">Ocultar panel</button></div>
    <p class="muted" style="font-size:12px;margin-bottom:0">Toca cualquier comuna, calle, estación o lugar para ver su info.</p>`)
  panel.querySelectorAll('.chip input').forEach(
    campo =>
      (campo.onchange = () => {
        if (campo.dataset.cat) return fijarCategoria(campo.dataset.cat, campo.checked)
        campo.parentElement.classList.toggle('on', campo.checked)
        st[campo.id.slice(3)] = campo.checked
        aplicar()
      }),
  )
  $('#ex-cats-all').onclick = () => categoriasDeLugares.forEach(categoria => fijarCategoria(categoria, true))
  $('#ex-cats-none').onclick = () =>
    categoriasDeLugares.forEach(categoria => fijarCategoria(categoria, false))
  $('#ex-q').onchange = e => {
    const it = elementosDeBusqueda.find(s => s.t.toLowerCase() === e.target.value.trim().toLowerCase())
    if (it) {
      it.go()
      if (innerWidth <= 760) e.target.blur()
    }
  }
  $('#ex-tiles').onclick = e => {
    const on = modoDeEtiquetas !== 'plain'
    fijarModoDeEtiquetas(on ? 'plain' : st.names ? 'streets' : 'labels')
    e.target.textContent = on ? 'Mapa con nombres' : 'Mapa sin nombres'
  }
  $('#ex-hide').onclick = () => {
    ocultarPanel()
    mostrarBotonDeReapertura()
  }
  aplicar()
  if (!yaEncuadrado) {
    encuadrarCiudad()
    yaEncuadrado = true
  }
  return function cerrarExplorar() {
    mapa.off('zoomend', actualizarNombres)
    fijarRelieve(false)
    if (controlDeReapertura) mapa.removeControl(controlDeReapertura)
    controlDeReapertura = null
  }
}

const ControlDeReapertura = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    const boton = L.DomUtil.create('button', 'maptoggle')
    boton.textContent = '☰ Panel'
    L.DomEvent.disableClickPropagation(boton)
    boton.onclick = () => {
      panel.classList.remove('hidden')
      mapa.removeControl(controlDeReapertura)
      controlDeReapertura = null
    }
    return boton
  },
})

function mostrarBotonDeReapertura() {
  controlDeReapertura = new ControlDeReapertura().addTo(mapa)
}

definirPantalla('explore', abrirExplorar)
