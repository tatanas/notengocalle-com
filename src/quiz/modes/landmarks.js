import { distanceKm, pointInPolygon } from '../../core/geo.js'
import { settings } from '../../core/store.js'
import { escapeHtml, formatKm } from '../../core/util.js'
import { comunaByName, comunas, inScope, labelPoint, scopeComunas } from '../../data/dataset.js'
import { landmarkInfo, landmarkPool, showLandmarksNear, showZone } from '../../domain/landmarks.js'
import { COLORS, comunaLayer, divIcon, mapLabel, outlineComunas } from '../../map/draw.js'
import { fit, fitCity, layer, map } from '../../map/map.js'
import { showPanel } from '../../ui/panel.js'
import { answer, questionHeader } from '../engine.js'
import { registerMode } from '../registry.js'

registerMode({
  id: 'lm-loc',
  balance: l => l.comuna,
  group: 'Landmarks',
  name: 'Ubícalo en el mapa',
  desc: 'Toca dónde crees que está el lugar. Cuenta como correcto a menos de 1,5 km.',
  cats: true,
  pool: landmarkPool,
  key: l => l.name,
  label: l => l.name,
  ask(l, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿Dónde está <b>${escapeHtml(l.name)}</b>?</div><div class="q-sub">${escapeHtml(l.cat)} · toca el mapa</div>`,
    )
    outlineComunas(scopeComunas()).addTo(layer)
    if (q.i === 0) fitCity()
    map.on('click', e => {
      if (q.answered) return
      const you = [e.latlng.lat, e.latlng.lng],
        ans = [l.lat, l.lon],
        d = distanceKm(you, ans)
      const lim = l.tol || (settings.strict ? 0.8 : 1.5),
        ok = d <= lim || !!(l.zone && pointInPolygon(you, l.zone.poly))
      showZone(l)
      showLandmarksNear(l)
      L.marker(you, { icon: divIcon('pin you'), pane: 'points' }).addTo(layer)
      L.marker(ans, { icon: divIcon('pin ' + (ok ? 'good' : 'ans')), pane: 'points' })
        .addTo(layer)
        .bindTooltip(escapeHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
      L.polyline([you, ans], { pane: 'routes', color: '#334155', dashArray: '5 6', weight: 2 }).addTo(layer)
      fit(L.latLngBounds([you, ans]).pad(0.3), 15)
      const pts = Math.max(0, Math.round(100 * (1 - d / 6)))
      answer(ok, `<p>Quedaste a <b>${formatKm(d)}</b> (+${pts} pts).</p>${landmarkInfo(l)}`, {
        points: pts,
        partial: !ok && d <= 3,
      })
    })
  },
})
registerMode({
  id: 'lm-com',
  balance: l => l.comuna,
  group: 'Landmarks',
  name: '¿En qué comuna está?',
  desc: 'Toca la comuna donde queda el lugar.',
  cats: true,
  pool: () => landmarkPool().filter(l => !l.obvious),
  key: l => l.name,
  label: l => l.name,
  ask(l, q) {
    showPanel(
      questionHeader(q) +
        `<div class="q-prompt">¿En qué comuna está <b>${escapeHtml(l.name)}</b>?</div><div class="q-sub">${escapeHtml(l.cat)} · toca la comuna</div>`,
    )
    const fs = comunas.filter(f => inScope(f) || f.properties.name === l.comuna)
    if (q.i === 0) fitCity()
    comunaLayer(fs, {
      onClick: (g, lay) => {
        if (q.answered) return
        const ok = g.properties.name === l.comuna || (l.alt || []).includes(g.properties.name)
        lay.setStyle({ fillColor: ok ? COLORS.ok : COLORS.bad, fillOpacity: 0.75 })
        mapLabel(labelPoint(g), g.properties.name, 'lbl ' + (ok ? 'ok' : 'bad')).addTo(layer)
        if (!ok) {
          const c = comunaByName[l.comuna]
          if (c) mapLabel(labelPoint(c), c.properties.name, 'lbl big').addTo(layer)
        }
        L.marker([l.lat, l.lon], { icon: divIcon('pin good'), pane: 'points' })
          .addTo(layer)
          .bindTooltip(escapeHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        showZone(l)
        showLandmarksNear(l)
        answer(ok, landmarkInfo(l))
      },
    }).addTo(layer)
  },
})
