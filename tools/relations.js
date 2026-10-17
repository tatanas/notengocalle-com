// Relaciones precalculadas entre calles y comunas, para el modo "Conexiones". Lo dudoso se marca como tal para que el
// juego no lo pregunte ni como respuesta correcta ni como incorrecta.
const fs = require('fs')
const turf = require('@turf/turf')

const KX = 92.9
const KY = 111.2
const xy = p => [p[1] * KX, p[0] * KY] // [lat, lon] -> km

// Puntos cada ~50 m sobre las líneas, [lat, lon].
function samples(lines, step = 0.05) {
  const out = []
  for (const l of lines)
    for (let i = 0; i < l.length - 1; i++) {
      const A = xy(l[i])
      const B = xy(l[i + 1])
      const n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / step))
      for (let k = 0; k < n; k++) {
        const t = k / n
        out.push([l[i][0] + (l[i + 1][0] - l[i][0]) * t, l[i][1] + (l[i + 1][1] - l[i][1]) * t])
      }
    }
  return out
}

function distPL(p, lines) {
  const P = xy(p)
  let best = Infinity
  for (const l of lines)
    for (let i = 0; i < l.length - 1; i++) {
      const A = xy(l[i])
      const B = xy(l[i + 1])
      const dx = B[0] - A[0]
      const dy = B[1] - A[1]
      const L = dx * dx + dy * dy
      const t = L ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L)) : 0
      best = Math.min(best, Math.hypot(A[0] + t * dx - P[0], A[1] + t * dy - P[1]))
    }
  return best
}

const METROS_POR_MUESTRA = 50
// "Pasa por" una comuna: al menos esto adentro (el texto de las calles lo usa así).
const METROS_PARA_PASAR_POR_UNA_COMUNA = 300
// Una comuna está "cerca" de la calle si la calle pasa a menos de esto de ella (para no preguntar lo que roza el borde).
const KM_DE_BORDE = 0.06
// Dos calles que se acercan a menos de esto sin cruzarse son un caso dudoso (¿termina en la otra o no?).
const KM_DE_CASI_CRUCE = 0.08

module.exports = function relaciones(streets, comunas) {
  const urbanas = comunas.filter(f => f.properties.group !== 'rural')
  const conBorde = urbanas.map(f => {
    const b = turf.buffer(f, KM_DE_BORDE)
    return { n: f.properties.name, f, b, bb: turf.bbox(b) }
  })
  const dentroDeLaCaja = (lat, lon, bb) => lon >= bb[0] && lon <= bb[2] && lat >= bb[1] && lat <= bb[3]
  const comunaDe = (lat, lon) =>
    conBorde.find(o => dentroDeLaCaja(lat, lon, o.bb) && turf.booleanPointInPolygon([lon, lat], o.f))?.n
  const comunasCerca = (lat, lon) =>
    conBorde.filter(o => dentroDeLaCaja(lat, lon, o.bb) && turf.booleanPointInPolygon([lon, lat], o.b)).map(o => o.n)

  // cl: metros de la calle dentro de cada comuna (sin margen); cc: comunas a las que se acerca a menos de KM_DE_BORDE.
  for (const s of streets) {
    const muestras = samples(s.lines)
    const metros = {}
    const cerca = new Set()
    for (const [lat, lon] of muestras) {
      const c = comunaDe(lat, lon)
      if (c) metros[c] = (metros[c] || 0) + METROS_POR_MUESTRA
      for (const otra of comunasCerca(lat, lon)) cerca.add(otra)
    }
    s.cl = metros
    s.cc = [...cerca]
    const porLargo = Object.entries(metros).sort((a, b) => b[1] - a[1])
    s.comunas = porLargo.filter(([, m]) => m >= METROS_PARA_PASAR_POR_UNA_COMUNA).map(([c]) => c)
    if (!s.comunas.length) s.comunas = porLargo.slice(0, 1).map(([c]) => c)
    s.samp = muestras.filter((_, i) => i % 6 === 0)
  }

  // Pares paralelos o que corren juntos un buen trecho.
  const caja = s => {
    const puntos = s.lines.flat()
    return [
      Math.min(...puntos.map(p => p[0])),
      Math.min(...puntos.map(p => p[1])),
      Math.max(...puntos.map(p => p[0])),
      Math.max(...puntos.map(p => p[1])),
    ]
  }
  for (const s of streets) s.bx = caja(s)
  const cerca = (A, B, m) => !(A[0] > B[2] + m || B[0] > A[2] + m || A[1] > B[3] + m || B[1] > A[3] + m)
  const para = []
  const parDe = (a, b) => [a, b].sort().join('\n')
  const paralelos = new Set()
  for (let i = 0; i < streets.length; i++)
    for (let j = i + 1; j < streets.length; j++) {
      const A = streets[i]
      const B = streets[j]
      if (!cerca(A.bx, B.bx, 0.003)) continue
      const fa = A.samp.filter(p => distPL(p, B.lines) < 0.08).length / A.samp.length
      const fb = B.samp.filter(p => distPL(p, A.lines) < 0.08).length / B.samp.length
      const kmA = fa * A.samp.length * 0.3
      const kmB = fb * B.samp.length * 0.3
      if ((fa > 0.25 && kmA >= 0.6) || (fb > 0.25 && kmB >= 0.6)) {
        para.push([A.name, B.name])
        paralelos.add(parDe(A.name, B.name))
      }
    }

  // Cruces: los de OpenStreetMap (tools/cruces.js), salvo los paralelos.
  const { cruces, aDesnivel } = JSON.parse(fs.readFileSync('cruces.json'))
  const inter = cruces
    .filter(({ a, b }) => !paralelos.has(parDe(a, b)))
    .map(({ a, b, pts }) => ({ a, b, pts, comunas: [...new Set(pts.flatMap(([lat, lon]) => comunasCerca(lat, lon)))] }))

  // Dudosos: pasan uno sobre el otro, o se acercan mucho sin cruzarse.
  const conCruce = new Set(cruces.map(({ a, b }) => parDe(a, b)))
  const dudosos = new Set(aDesnivel.map(([a, b]) => parDe(a, b)))
  const vias = streets.filter(s => s.kind === 'calle' || s.kind === 'autopista')
  for (let i = 0; i < vias.length; i++)
    for (let j = i + 1; j < vias.length; j++) {
      const A = vias[i]
      const B = vias[j]
      const par = parDe(A.name, B.name)
      if (conCruce.has(par) || paralelos.has(par) || dudosos.has(par) || !cerca(A.bx, B.bx, 0.001)) continue
      if (samples(A.lines, 0.03).some(p => distPL(p, B.lines) < KM_DE_CASI_CRUCE)) dudosos.add(par)
    }

  for (const s of streets) {
    delete s.samp
    delete s.bx
  }
  return { inter, para, dudosos: [...dudosos].map(par => par.split('\n')) }
}
module.exports.distPL = distPL
