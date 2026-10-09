import { settings, store } from '../core/store.js'
import { $, escapeHtml } from '../core/util.js'
import {
  CATEGORIES,
  CHILE,
  DATA,
  METRO_LINES,
  PARKS,
  REGIONS,
  ZONES,
  cerros,
  comunas,
  labelPoint,
  stations,
} from '../data/dataset.js'
import { cerroInfo } from '../domain/cerros.js'
import { cityText, parkText, regionText } from '../domain/chile.js'
import { linePill } from '../domain/metro.js'
import { namedSegmentsHtml } from '../domain/streets.js'
import { zoneInfo } from '../domain/zones.js'
import { REGION_COLORS, comunaLayer, drawMetro, mapLabel, parkIcon, peakIcon } from '../map/draw.js'
import {
  boundsOfFeatures,
  clearLayer,
  fit,
  fitChile,
  fitCity,
  labelMode,
  layer,
  map,
  setChile,
  setLabelMode,
  setRelief,
  showingChile,
} from '../map/map.js'
import { stopQuiz } from '../quiz/engine.js'
import { defineScreen } from './navigation.js'
import { hidePanel, hideScreen, panel, showPanel, title } from './panel.js'
import { photoHtml } from './photos.js'

let alreadyFramed = false
let reopenControl = null

function openExplore() {
  stopQuiz()
  hideScreen()
  title.textContent = 'Explorar'
  clearLayer()
  setLabelMode('labels')
  const st = Object.assign(
    {
      com: true,
      names: true,
      metro: false,
      streets: false,
      lm: false,
      cerros: false,
      zones: false,
      tren: false,
      micros: false,
      regs: false,
      cities: false,
      parks: false,
      relief: false,
      cats: CATEGORIES.slice(),
    },
    store.get('explore', {}),
  )
  const groups = {
    com: L.layerGroup(),
    names: L.layerGroup(),
    metro: L.layerGroup(),
    streets: L.layerGroup(),
    lm: L.layerGroup(),
    cerros: L.layerGroup(),
  }
  groups.zones = L.layerGroup()
  for (const z of ZONES) {
    L.polygon(z.poly, {
      pane: 'comunas',
      color: '#b45309',
      weight: 2.5,
      dashArray: z.approx ? '6 6' : null,
      fillColor: '#f59e0b',
      fillOpacity: 0.25,
    })
      .bindPopup(`<h4>${escapeHtml(z.name)}</h4>${zoneInfo(z)}`, { maxWidth: 280 })
      .addTo(groups.zones)
    mapLabel(z.c, z.name).addTo(groups.zones)
  }
  for (const c of cerros)
    L.marker([c.lat, c.lon], { icon: peakIcon(), pane: 'points' })
      .bindPopup(`<h4>${escapeHtml(c.name)}</h4>${cerroInfo(c)}`, { maxWidth: 280 })
      .addTo(groups.cerros)
  const all = comunas.filter(f => f.properties.group !== 'rural' || settings.scope === 'all')
  comunaLayer(all, {
    style: () => ({ fillOpacity: 0.12, fillColor: '#0f766e', color: '#0f766e', weight: 1.6 }),
    onClick: (f, l, e) => {
      L.popup()
        .setLatLng(e.latlng)
        .setContent(
          `<h4>${escapeHtml(f.properties.name)}</h4><p>${f.properties.km2.toLocaleString('es-CL')} km²</p><p class="muted">Limita con: ${f.properties.nb.map(escapeHtml).join(', ')}</p>`,
        )
        .openOn(map)
    },
  }).addTo(groups.com)
  const nameLabels = all.map(f => ({
    f,
    t: mapLabel(labelPoint(f), f.properties.name),
  }))
  const refreshNames = () => {
    groups.names.clearLayers()
    const z = map.getZoom()
    for (const { f, t } of nameLabels) {
      if (z >= 11 || f.properties.km2 > 40 || (z >= 10 && f.properties.km2 > 15)) groups.names.addLayer(t)
    }
  }
  map.on('zoomend', refreshNames)
  refreshNames()
  groups.tren = L.layerGroup()
  groups.micros = L.layerGroup()
  groups.regs = L.layerGroup()
  groups.cities = L.layerGroup()
  groups.parks = L.layerGroup()
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
  ;(DATA.micros || []).forEach((m, i) => {
    const pl = L.polyline(m.g, {
      pane: 'routes',
      color: MC[i % MC.length],
      weight: 3.5,
      opacity: 0.8,
    }).bindPopup(
      `<h4>🚌 Micro ${escapeHtml(m.name)}</h4><p>${escapeHtml(m.long)}</p><p class="muted">Pasa cada ~${m.min} min (día laboral, media mañana) · ${m.km} km${m.why === 'casa' ? ' · pasa cerca de tu casa' : m.why === 'campus' ? ' · pasa por el Campus San Joaquín' : ''}</p>`,
    )
    pl.on('mouseover', () => pl.setStyle({ weight: 7, opacity: 1 }))
    pl.on('mouseout', () => pl.setStyle({ weight: 3.5, opacity: 0.8 }))
    groups.micros.addLayer(pl)
    L.tooltip({ permanent: true, direction: 'center', className: 'lbl' })
      .setLatLng(m.g[Math.floor(m.g.length * (0.3 + 0.4 * ((i % 5) / 5)))])
      .setContent(escapeHtml(m.name))
      .addTo(groups.micros)
  })
  comunaLayer(REGIONS, {
    style: f => ({
      color: '#475569',
      weight: 1,
      fillColor: REGION_COLORS[f.properties.ord % REGION_COLORS.length],
      fillOpacity: 0.45,
    }),
    onClick: (f, l, e) =>
      L.popup()
        .setLatLng(e.latlng)
        .setContent(`<h4>Región de ${escapeHtml(f.properties.name)}</h4>${regionText(f)}`)
        .openOn(map),
  }).addTo(groups.regs)
  for (const c of CHILE.cities)
    L.circleMarker([c.lat, c.lon], {
      pane: 'points',
      radius: c.cap ? 7 : c.pop > 100000 ? 6 : 4.5,
      color: '#fff',
      weight: 2,
      fillColor: c.cap ? '#dc2626' : '#1e293b',
      fillOpacity: 1,
    })
      .bindPopup(cityText(c))
      .bindTooltip(escapeHtml(c.name), {
        permanent: !!c.cap,
        direction: 'right',
        offset: [7, 0],
        className: 'lbl',
      })
      .addTo(groups.cities)
  for (const p of PARKS)
    L.marker([p.lat, p.lon], { icon: parkIcon(), pane: 'points' })
      .bindPopup(parkText(p))
      .bindTooltip(escapeHtml(p.name), { direction: 'right', offset: [10, 0], className: 'lbl' })
      .addTo(groups.parks)
  for (const s of DATA.streets) {
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
      `<h4>${escapeHtml(s.name)}</h4><p>${escapeHtml(s.hint)}</p><p class="muted">${s.comunas.map(escapeHtml).join(', ')}</p>${photoHtml('s:' + s.name)}`,
      { maxWidth: 280 },
    )
    pl.on('mouseover', () => pl.setStyle({ weight: 7, opacity: 1 }))
    pl.on('mouseout', () => pl.setStyle({ weight: 4, opacity: 0.75 }))
    if (s.tr)
      pl.setPopupContent(
        `<h4>${escapeHtml(s.name)}</h4><p>${escapeHtml(s.hint)}</p>${namedSegmentsHtml(s)}${photoHtml('s:' + s.name)}`,
      )
    ;(s.kind === 'tren' ? groups.tren : groups.streets).addLayer(pl)
  }
  drawMetro(groups.metro, { dots: false })
  for (const s of stations)
    L.circleMarker([s.lat, s.lon], {
      pane: 'metro',
      radius: 5,
      color: '#fff',
      weight: 2,
      fillColor: METRO_LINES[s.lines[0]].color,
      fillOpacity: 1,
    })
      .bindPopup(
        `<h4>${escapeHtml(s.name)}</h4><p>${s.lines.map(linePill).join('')}</p><p class="muted">${escapeHtml(s.comuna)}</p>`,
      )
      .addTo(groups.metro)
  const CAT_COLORS = [
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
  const lmMarkers = DATA.landmarks
    .filter(l => !l.metro)
    .map(l => ({
      l,
      m: L.circleMarker([l.lat, l.lon], {
        pane: 'points',
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: CAT_COLORS[CATEGORIES.indexOf(l.cat) % CAT_COLORS.length],
        fillOpacity: 1,
      }).bindPopup(
        `<h4>${escapeHtml(l.name)}</h4><p>${escapeHtml(l.cat)} · <b>${escapeHtml(l.comuna)}</b></p><p class="muted">${escapeHtml(l.desc || '')}</p>${l.car ? `<p><b>Qué se estudia:</b> ${escapeHtml(l.car)}</p>` : ''}${photoHtml('l:' + l.name)}`,
        { maxWidth: 280 },
      ),
    }))
  const refreshLm = () => {
    groups.lm.clearLayers()
    lmMarkers.forEach(({ l, m }) => {
      if (st.cats.includes(l.cat)) groups.lm.addLayer(m)
    })
  }
  refreshLm()
  const apply = () => {
    setRelief(st.relief)
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
      if (st[k]) layer.addLayer(groups[k])
      else layer.removeLayer(groups[k])
    }
    const wantCh = st.regs || st.cities || st.parks
    if (wantCh !== showingChile) {
      setChile(wantCh)
      if (wantCh) fitChile()
    }
    if (labelMode !== 'plain') setLabelMode(st.names ? 'streets' : 'labels')
    store.set('explore', st)
  }
  const searchItems = [
    ...comunas.map(f => ({
      t: f.properties.name,
      k: 'Comuna',
      go: () => {
        fit(boundsOfFeatures([f]), 14)
      },
    })),
    ...DATA.landmarks.map(l => ({
      t: l.name,
      k: l.cat,
      go: () => {
        map.setView([l.lat, l.lon], 15)
        setTimeout(() => {
          if (!st.lm) {
            st.lm = true
            $('#ex-lm').checked = true
          }
          if (!st.cats.includes(l.cat)) {
            st.cats.push(l.cat)
            refreshLm()
          }
          apply()
          lmMarkers.find(x => x.l === l).m.openPopup()
        }, 300)
      },
    })),
    ...DATA.streets.map(s => ({
      t: s.name,
      k: 'Calle',
      go: () => {
        if (!st.streets) {
          st.streets = true
          $('#ex-streets').checked = true
          apply()
        }
        fit(L.latLngBounds(s.bb).pad(0.1), 15)
        const hl = L.polyline(s.lines, { pane: 'routes', color: '#f59e0b', weight: 8, opacity: 0.9 }).addTo(
          layer,
        )
        setTimeout(() => layer.removeLayer(hl), 4000)
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
          apply()
        }
        map.setView([c.lat, c.lon], c.tipo === 'Cordillera' ? 11 : 13)
      },
    })),
    ...stations.map(s => ({
      t: 'Metro ' + s.name,
      k: s.lines.join('/'),
      go: () => {
        if (!st.metro) {
          st.metro = true
          $('#ex-metro').checked = true
          apply()
        }
        map.setView([s.lat, s.lon], 15)
      },
    })),
  ]
  showPanel(`<div class="q-prompt" style="margin-top:0">Explora el mapa</div>
    <input type="search" id="ex-q" placeholder="Buscar comuna, lugar, calle o estación…" list="ex-list" autocomplete="off">
    <datalist id="ex-list">${searchItems.map(s => `<option value="${escapeHtml(s.t)}">${escapeHtml(s.k)}</option>`).join('')}</datalist>
    <div class="chips" style="margin-top:10px">
      ${[
        ['com', 'Comunas'],
        ['names', 'Nombres comunas'],
        ['metro', 'Metro'],
        ['streets', 'Calles principales'],
        ['lm', 'Lugares'],
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
    <div id="ex-cats" style="margin-top:10px;${st.lm ? '' : 'display:none'}"><div class="muted" style="font-size:12.5px;margin-bottom:4px">Categorías de lugares</div><div class="chips">
      ${CATEGORIES.map((c, i) => `<label class="chip ${st.cats.includes(c) ? 'on' : ''}"><input type="checkbox" data-cat="${escapeHtml(c)}" ${st.cats.includes(c) ? 'checked' : ''}><span class="dot" style="background:${CAT_COLORS[i % CAT_COLORS.length]}"></span>${escapeHtml(c)}</label>`).join('')}
    </div></div>
    <div class="row" style="margin-top:10px"><button class="btn sec small" id="ex-tiles">Mapa sin nombres</button><button class="btn sec small" id="ex-hide">Ocultar panel</button></div>
    <p class="muted" style="font-size:12px;margin-bottom:0">Toca cualquier comuna, calle, estación o lugar para ver su info.</p>`)
  panel.querySelectorAll('.chip input').forEach(
    inp =>
      (inp.onchange = () => {
        inp.parentElement.classList.toggle('on', inp.checked)
        if (inp.dataset.cat) {
          const c = inp.dataset.cat
          st.cats = inp.checked ? [...st.cats, c] : st.cats.filter(x => x !== c)
          refreshLm()
        } else {
          const k = inp.id.slice(3)
          st[k] = inp.checked
          if (k === 'lm') $('#ex-cats').style.display = inp.checked ? '' : 'none'
        }
        apply()
      }),
  )
  $('#ex-q').onchange = e => {
    const it = searchItems.find(s => s.t.toLowerCase() === e.target.value.trim().toLowerCase())
    if (it) {
      it.go()
      if (innerWidth <= 760) e.target.blur()
    }
  }
  $('#ex-tiles').onclick = e => {
    const on = labelMode !== 'plain'
    setLabelMode(on ? 'plain' : st.names ? 'streets' : 'labels')
    e.target.textContent = on ? 'Mapa con nombres' : 'Mapa sin nombres'
  }
  $('#ex-hide').onclick = () => {
    hidePanel()
    showReopenButton()
  }
  apply()
  if (!alreadyFramed) {
    fitCity()
    alreadyFramed = true
  }
  return function closeExplore() {
    map.off('zoomend', refreshNames)
    setRelief(false)
    if (reopenControl) map.removeControl(reopenControl)
    reopenControl = null
  }
}

const ReopenPanelControl = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    const button = L.DomUtil.create('button', 'maptoggle')
    button.textContent = '☰ Panel'
    L.DomEvent.disableClickPropagation(button)
    button.onclick = () => {
      panel.classList.remove('hidden')
      map.removeControl(reopenControl)
      reopenControl = null
    }
    return button
  },
})

function showReopenButton() {
  reopenControl = new ReopenPanelControl().addTo(map)
}

defineScreen('explore', openExplore)
