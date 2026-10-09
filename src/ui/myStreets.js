import { $, escapeHtml } from '../core/util.js'
import { DATA, comunasOfLines, myStreets } from '../data/dataset.js'
import { distanceKm, distanceToPolyline } from '../core/geo.js'
import { store } from '../core/store.js'

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
async function findStreet(name) {
  const core = name.trim().replace(/^(avenida|av\.?|calle|pasaje|camino)\s+/i, '')
  const rx = core
    .replace(/[.*+?^${}()|[\]\\"]/g, '.')
    .replace(/[aá]/gi, '[aáAÁ]')
    .replace(/[eé]/gi, '[eéEÉ]')
    .replace(/[ií]/gi, '[iíIÍ]')
    .replace(/[oó]/gi, '[oóOÓ]')
    .replace(/[uúü]/gi, '[uúüUÚ]')
    .replace(/[nñ]/gi, m => (/ñ/i.test(m) ? '[ñÑ]' : '[nN]'))
  const q = `[out:json][timeout:25];way["highway"]["name"~"^(Avenida |Calle |Pasaje |Camino )?${rx}( Norte| Sur| Oriente| Poniente)?$",i](-33.75,-70.95,-33.25,-70.40);out geom tags;`
  let ways = null
  try {
    // Nominatim (OpenStreetMap): acepta consultas desde el navegador
    const r = await fetch(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=50&dedupe=0&countrycodes=cl&polygon_geojson=1&viewbox=-70.95,-33.25,-70.40,-33.75&bounded=1&q=' +
        encodeURIComponent(name.trim()),
    )
    if (r.ok) {
      const J = await r.json()
      const re = new RegExp(
        '^(Avenida |Calle |Pasaje |Camino )?' + rx + '( Norte| Sur| Oriente| Poniente)?$',
        'i',
      )
      ways = J.filter(
        h =>
          h.category === 'highway' &&
          h.geojson &&
          h.geojson.type === 'LineString' &&
          !/^(footway|path|cycleway|steps|service)$/.test(h.type) &&
          re.test(h.name || ''),
      ).map(h => ({ n: h.name, l: h.geojson.coordinates.map(c => [+c[1].toFixed(5), +c[0].toFixed(5)]) }))
    }
  } catch (e) {}
  if (!ways || !ways.length) {
    let j = null
    for (const u of OVERPASS) {
      try {
        const r = await fetch(u, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(q),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        if (r.ok) {
          j = await r.json()
          break
        }
      } catch (e) {}
    }
    if (j)
      ways = j.elements
        .filter(e => e.geometry && !/^(footway|path|cycleway|steps|service)$/.test(e.tags.highway))
        .map(e => ({ n: e.tags.name, l: e.geometry.map(p => [+p.lat.toFixed(5), +p.lon.toFixed(5)]) }))
    else if (!ways) throw new Error('sin conexión con el servidor de mapas')
  }
  // agrupar tramos cercanos (< 400 m) en una misma calle
  const par = ways.map((_, i) => i),
    f = i => (par[i] === i ? i : (par[i] = f(par[i])))
  for (let a = 0; a < ways.length; a++)
    for (let b = a + 1; b < ways.length; b++) {
      if (f(a) === f(b)) continue
      const A = ways[a].l,
        B = ways[b].l
      if (
        [A[0], A[A.length - 1]].some(p => distanceToPolyline(p, [B]) < 0.4) ||
        [B[0], B[B.length - 1]].some(p => distanceToPolyline(p, [A]) < 0.4)
      )
        par[f(a)] = f(b)
    }
  const g = {}
  ways.forEach((w, i) => (g[f(i)] = g[f(i)] || []).push(w))
  return Object.values(g)
    .map(ws => {
      const lines = ws.map(w => w.l)
      let len = 0
      for (const l of lines) for (let i = 0; i < l.length - 1; i++) len += distanceKm(l[i], l[i + 1])
      const cnt = {}
      ws.forEach(w => (cnt[w.n] = (cnt[w.n] || 0) + w.l.length))
      const nm = Object.entries(cnt)
        .sort((a, b) => b[1] - a[1])[0][0]
        .replace(/^Avenida /, 'Av. ')
      return { name: nm, km: +len.toFixed(1), lines, comunas: comunasOfLines(lines) }
    })
    .filter(c => c.km >= 0.15)
    .sort((a, b) => b.km - a.km)
    .slice(0, 8)
}
export function renderMyStreets(box) {
  const list = () =>
    myStreets.length
      ? myStreets
          .map(
            (m, i) =>
              `<span class="chip on">${escapeHtml(m.name)} <small class="muted">${escapeHtml(m.comunas[0] || '')}</small> <a href="#" data-del="${i}" title="Quitar" style="text-decoration:none">✕</a></span>`,
          )
          .join('')
      : '<span class="muted" style="font-size:13px">Todavía no agregas ninguna.</span>'
  box.innerHTML = `<div class="row"><input type="text" id="mystQ" placeholder="Nombre de la calle (ej.: Las Nieves)" style="flex:1;min-width:180px"><button class="btn small" id="mystGo">Buscar</button></div><div id="mystRes" style="margin-top:8px"></div><div class="chips" style="margin-top:8px">${list()}</div>`
  box.querySelectorAll('[data-del]').forEach(
    a =>
      (a.onclick = e => {
        e.preventDefault()
        myStreets.splice(+a.dataset.del, 1)
        store.set('myStreets', myStreets)
        location.reload()
      }),
  )
  const go = async () => {
    const v = $('#mystQ').value.trim()
    if (v.length < 3) return
    const res = $('#mystRes')
    res.innerHTML = '<p class="muted">Buscando en OpenStreetMap…</p>'
    try {
      const c = await findStreet(v)
      if (!c.length) {
        res.innerHTML =
          '<p class="muted">No encontré ninguna calle con ese nombre en Santiago. Prueba con el nombre completo.</p>'
        return
      }
      res.innerHTML =
        '<p class="muted" style="margin:0 0 4px;font-size:13px">Elige cuál es:</p>' +
        c
          .map(
            (x, i) =>
              `<button class="mode" data-pick="${i}" style="margin-bottom:5px"><span><b>${escapeHtml(x.name)}</b><br><small>${escapeHtml(x.comunas.slice(0, 3).join(', ') || 'fuera del Gran Santiago')} · ${String(x.km).replace('.', ',')} km</small></span><span class="mastery">Agregar</span></button>`,
          )
          .join('')
      res.querySelectorAll('[data-pick]').forEach(
        b =>
          (b.onclick = () => {
            const x = c[+b.dataset.pick]
            if (
              DATA.streets.some(s => s.name === x.name) &&
              !confirm(
                `Ya hay una calle llamada "${x.name}" en el juego. ¿Agregar esta igual, con la comuna en el nombre?`,
              )
            )
              return
            if (DATA.streets.some(s => s.name === x.name)) x.name += ` (${x.comunas[0] || 'otra'})`
            myStreets.push(x)
            store.set('myStreets', myStreets)
            location.reload()
          }),
      )
    } catch (err) {
      res.innerHTML = `<p class="muted">No pude buscar (${escapeHtml(err.message)}). Intenta de nuevo en un rato.</p>`
    }
  }
  $('#mystGo').onclick = go
  $('#mystQ').onkeydown = e => {
    if (e.key === 'Enter') go()
  }
}
