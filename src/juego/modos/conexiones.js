import {
  KM_POR_GRADO_LATITUD,
  KM_POR_GRADO_LONGITUD,
  distanciaKm,
  distanciaALinea,
} from '../../nucleo/geografia.js'
import { escaparHtml, formatearKm, elegir, mismoConjunto, mezclar } from '../../nucleo/utilidades.js'
import {
  DATOS,
  IDS_DE_LINEA,
  LINEAS_DE_METRO,
  cerros,
  comunaPorNombre,
  comunasDelNucleo,
  crucesDe,
  enElAlcance,
  sonParalelas,
  esVia,
  puntoDeEtiqueta,
  vias,
  comunasDelAlcance,
  estacionPorNombre,
  estaciones,
  callePorNombre,
} from '../../datos/datos.js'
import { distractoresDeComuna } from '../../dominio/comunas.js'
import { lugarEnComuna, infoDeLugar } from '../../dominio/lugares.js'
import { nombreDeLinea, pildoraDeLinea } from '../../dominio/metro.js'
import { mostrarAyudas } from '../../mapa/ayudas.js'
import {
  COLORES,
  capaDeComunas,
  iconoDiv,
  dibujarMetro,
  dibujarCalle,
  resaltarComuna,
  etiquetaDeMapa,
  iconoDeCumbre,
} from '../../mapa/dibujo.js'
import {
  limitesDeRasgos,
  encuadrar,
  encuadrarCiudad,
  capa,
  mapa,
  fijarModoDeEtiquetas,
} from '../../mapa/mapa.js'
import { mostrarPanel } from '../../interfaz/panel.js'
import { responder, encabezadoDePregunta } from '../engine.js'
import { opcion, mostrarMultiple, mostrarOpciones } from '../options.js'
import { registrarModo } from '../registry.js'

export const GENERADORES = {
  roundabout() {
    const R = elegir(DATOS.rotondas || [])
    if (!R) return null
    const cerca = vias()
      .filter(
        s =>
          !R.streets.some(
            n => n.replace(/^Av\. /, '') === s.name.replace(/^Av\. /, '').replace(/\s*\(.*\)/, ''),
          ) &&
          distanciaALinea(R.c, s.lines) > 0.25 &&
          distanciaALinea(R.c, s.lines) < 2.5,
      )
      .map(s => s.name)
    if (cerca.length < 2) return null
    const cor = mezclar(R.streets).slice(0, Math.min(3, R.streets.length))
    const ds = mezclar(cerca).slice(0, 5 - cor.length)
    return {
      key: 'rotonda:' + R.name,
      prompt: `¿Qué calles llegan a la <b>${escaparHtml(R.name)}</b>?`,
      sub: 'Es la rotonda marcada en el mapa.',
      multi: true,
      opts: mezclar([...cor, ...ds]).map(n => opcion(n)),
      correct: cor,
      pre() {
        L.marker(R.c, { icon: iconoDiv('pulse', '', 22), pane: 'points' }).addTo(capa)
        mapa.setView(R.c, 14)
      },
      reveal(selector) {
        fijarModoDeEtiquetas('streets')
        L.marker(R.c, { icon: iconoDiv('pulse', '', 22), pane: 'points' })
          .addTo(capa)
          .bindTooltip(escaparHtml(R.name), { permanent: true, direction: 'top', offset: [0, -12] })
        for (const n of selector.filter(x => !cor.includes(x))) {
          const s = callePorNombre[n]
          if (s) dibujarCalle(s, COLORES.bad, { weight: 3, labelText: n })
        }
        for (const n of R.streets) {
          const s = callePorNombre[n]
          if (s) dibujarCalle(s, COLORES.ok, { weight: 4 })
        }
        mapa.setView(R.c, 15)
        return `<p>A la <b>${escaparHtml(R.name)}</b> llegan: ${R.streets.map(escaparHtml).join(', ')}.</p>`
      },
    }
  },
  metroStreets() {
    const L0 = elegir(IDS_DE_LINEA.filter(id => (DATOS.metroAlong[id] || []).length))
    const al = DATOS.metroAlong[L0]
    const cor = al.map(x => x[0])
    const no = vias()
      .filter(
        s =>
          !cor.includes(s.name) &&
          LINEAS_DE_METRO[L0].segs.some(trecho =>
            trecho.some((p, i) => i % 8 === 0 && distanciaALinea(p, s.lines) < 1.5),
          ),
      )
      .map(s => s.name)
    if (no.length < 2) return null
    const c = mezclar(cor).slice(0, Math.min(3, cor.length))
    const ds = mezclar(no).slice(0, 5 - c.length)
    return {
      key: 'metro-calles:' + L0,
      prompt: `¿Por (sobre o bajo) cuáles de estas calles corre la ${pildoraDeLinea(L0)} <b>${nombreDeLinea(L0)}</b>?`,
      multi: true,
      opts: mezclar([...c, ...ds]).map(n => opcion(n)),
      correct: c,
      reveal(selector) {
        for (const n of ds)
          if (selector.includes(n)) dibujarCalle(callePorNombre[n], COLORES.bad, { weight: 3, labelText: n })
        for (const [n] of al) dibujarCalle(callePorNombre[n], COLORES.ok, { weight: 7, labelText: n })
        dibujarMetro(capa, { ids: [L0] })
        encuadrar(L.latLngBounds(LINEAS_DE_METRO[L0].segs.flat()).pad(0.05), 13)
        return `<p>La ${nombreDeLinea(L0)} va principalmente por: ${al.map(([n, k]) => `<b>${escaparHtml(n)}</b> (${String(k).replace('.', ',')} km)`).join(', ')}.</p>`
      },
    }
  },
  streetsInComuna() {
    const C = elegir(comunasDelNucleo())
    const c = C.properties.name
    const si = vias().filter(s => (s.cl[c] || 0) >= 300)
    const no = vias().filter(s => !s.cl[c] && distanciaALinea(puntoDeEtiqueta(C), s.lines) < 3.5)
    if (!si.length || no.length < 2) return null
    const k = 1 + Math.floor(Math.random() * Math.min(3, si.length))
    const cor = mezclar(si).slice(0, k)
    const ds = mezclar(no).slice(0, 5 - k)
    return {
      key: 'calles-comuna:' + c,
      prompt: `¿Cuáles de estas calles pasan por <b>${escaparHtml(c)}</b>?`,
      multi: true,
      opts: mezclar([...cor, ...ds]).map(s => opcion(s.name)),
      correct: cor.map(s => s.name),
      reveal(selector) {
        resaltarComuna(C)
        for (const s of [...cor, ...ds]) {
          const isC = cor.includes(s)
          dibujarCalle(s, isC ? COLORES.ok : selector.includes(s.name) ? COLORES.bad : '#94a3b8', {
            weight: isC ? 5 : 3,
            labelText: s.name,
          })
        }
        encuadrar(limitesDeRasgos([C]).pad(0.4), 14)
        return `<p>Pasan por ${escaparHtml(c)}: <b>${cor.map(s => escaparHtml(s.name)).join(', ')}</b>.</p>`
      },
    }
  },
  crossings() {
    const X = elegir(vias().filter(s => crucesDe(s.name).length >= 2))
    const cr = crucesDe(X.name).filter(o => callePorNombre[o.other] && esVia(callePorNombre[o.other]))
    const crN = cr.map(o => o.other)
    const no = (X.nb || [])
      .map(([n]) => n)
      .filter(n => n !== X.name && !crN.includes(n) && !sonParalelas(n, X.name))
      .slice(0, 8)
    if (no.length < 2) return null
    const k = 1 + Math.floor(Math.random() * Math.min(3, crN.length))
    const cor = mezclar(crN).slice(0, k)
    const ds = mezclar(no).slice(0, 5 - k)
    return {
      key: 'cruces:' + X.name,
      prompt: `¿Cuáles de estas calles se cruzan con <b>${escaparHtml(X.name)}</b>?`,
      sub: 'Cuenta también si una termina en la otra.',
      multi: true,
      opts: mezclar([...cor, ...ds]).map(n => opcion(n)),
      correct: cor,
      pre() {
        dibujarCalle(X, COLORES.hi, { weight: 6 })
        encuadrar(L.latLngBounds(X.bb).pad(0.2), 14)
      },
      reveal(selector) {
        for (const n of [...cor, ...ds]) {
          const s = callePorNombre[n],
            isC = cor.includes(n)
          dibujarCalle(s, isC ? COLORES.ok : selector.includes(n) ? COLORES.bad : '#94a3b8', {
            weight: isC ? 5 : 3,
            labelText: n,
          })
        }
        for (const o of cr.filter(o => cor.includes(o.other)))
          for (const p of o.i.pts)
            L.circleMarker(p, {
              pane: 'points',
              radius: 6,
              color: '#fff',
              weight: 2,
              fillColor: COLORES.ok,
              fillOpacity: 1,
            })
              .addTo(capa)
              .bindTooltip(
                `${escaparHtml(X.name)} × ${escaparHtml(o.other)} (${escaparHtml(o.i.comunas.join(' / '))})`,
              )
        return `<p><b>${escaparHtml(X.name)}</b> se cruza con: ${cr.map(o => escaparHtml(o.other)).join(', ')}.</p>`
      },
    }
  },
  nearestStreet() {
    const l = elegir(
      DATOS.landmarks.filter(l => l.ns && l.ns[0][1] <= 0.4 && l.ns[1][1] - l.ns[0][1] >= 0.35),
    )
    if (!l) return null
    const corr = l.ns[0][0]
    const lejos = vias().filter(s => {
      const d = distanciaALinea([l.lat, l.lon], s.lines)
      return d > 1.2 && d < 6
    })
    if (lejos.length < 3) return null
    const ds = mezclar(lejos)
      .slice(0, 3)
      .map(s => s.name)
    return {
      key: 'calle-cerca:' + l.name,
      prompt: `¿Qué calle importante pasa más cerca de <b>${escaparHtml(l.name)}</b>?`,
      opts: mezclar([corr, ...ds]).map(n => opcion(n)),
      correct: corr,
      reveal(v) {
        L.marker([l.lat, l.lon], { icon: iconoDiv('pin good'), pane: 'points' })
          .addTo(capa)
          .bindTooltip(escaparHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        dibujarCalle(callePorNombre[corr], COLORES.ok, { labelText: corr })
        if (v !== corr) dibujarCalle(callePorNombre[v], COLORES.bad, { labelText: v })
        encuadrar(
          L.latLngBounds([[l.lat, l.lon]])
            .extend(L.latLngBounds(callePorNombre[v].bb))
            .pad(0.1),
          15,
        )
        return `<p>${escaparHtml(l.name)} está a ${formatearKm(l.ns[0][1])} de <b>${escaparHtml(corr)}</b>.</p>${infoDeLugar(l)}`
      },
    }
  },
  nearestStation() {
    const l = elegir(DATOS.landmarks.filter(l => l.nm && l.nm[0][1] <= 1.2 && l.nm[1][1] - l.nm[0][1] >= 0.3))
    if (!l) return null
    const corr = l.nm[0][0]
    const lejos = estaciones.filter(s => {
      const d = distanciaKm([l.lat, l.lon], [s.lat, s.lon])
      return d > 2.5 && d < 8
    })
    const ds = mezclar(lejos)
      .slice(0, 3)
      .map(s => s.name)
    return {
      key: 'metro-cerca:' + l.name,
      prompt: `¿Cuál es la estación de metro más cercana a <b>${escaparHtml(l.name)}</b>?`,
      opts: mezclar([corr, ...ds]).map(n =>
        opcion(n, `${escaparHtml(n)} ${estacionPorNombre[n].lines.map(pildoraDeLinea).join('')}`),
      ),
      correct: corr,
      reveal(v) {
        L.marker([l.lat, l.lon], { icon: iconoDiv('pin good'), pane: 'points' })
          .addTo(capa)
          .bindTooltip(escaparHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        for (const n of [corr, v]) {
          const s = estacionPorNombre[n]
          L.marker([s.lat, s.lon], { icon: iconoDiv('pulse', '', 22), pane: 'points' })
            .addTo(capa)
            .bindTooltip(escaparHtml(n), { permanent: true, direction: 'right', offset: [10, 0] })
        }
        dibujarMetro(capa, { ids: estacionPorNombre[corr].lines, dots: false, opacity: 0.6 })
        encuadrar(
          L.latLngBounds([
            [l.lat, l.lon],
            [estacionPorNombre[corr].lat, estacionPorNombre[corr].lon],
            [estacionPorNombre[v].lat, estacionPorNombre[v].lon],
          ]).pad(0.2),
          15,
        )
        return `<p>La más cercana es <b>${escaparHtml(corr)}</b> ${estacionPorNombre[corr].lines.map(pildoraDeLinea).join('')}, a ${formatearKm(l.nm[0][1])}.</p>`
      },
    }
  },
  crossComuna() {
    const I = elegir(
      (DATOS.inter || []).filter(
        i =>
          esVia(callePorNombre[i.a]) &&
          esVia(callePorNombre[i.b]) &&
          i.pts.length === 1 &&
          i.comunas.length === 1 &&
          comunaPorNombre[i.comunas[0]] &&
          enElAlcance(comunaPorNombre[i.comunas[0]]),
      ),
    )
    if (!I) return null
    const c = I.comunas[0]
    const ds = distractoresDeComuna(c, 3)
    return {
      key: 'cruce-comuna:' + I.a + '×' + I.b,
      prompt: `¿En qué comuna se cruzan <b>${escaparHtml(I.a)}</b> y <b>${escaparHtml(I.b)}</b>?`,
      opts: mezclar([c, ...ds]).map(n => opcion(n)),
      correct: c,
      reveal(v) {
        dibujarCalle(callePorNombre[I.a], COLORES.street, { labelText: I.a })
        dibujarCalle(callePorNombre[I.b], '#7c3aed', { labelText: I.b })
        L.circleMarker(I.pts[0], {
          pane: 'points',
          radius: 8,
          color: '#fff',
          weight: 2,
          fillColor: COLORES.hi,
          fillOpacity: 1,
        }).addTo(capa)
        resaltarComuna(comunaPorNombre[c])
        encuadrar(L.latLng(I.pts[0]).toBounds(4000), 14)
        return `<p>Se cruzan en <b>${escaparHtml(c)}</b>.</p>`
      },
    }
  },
  landmarksInComuna() {
    const C = elegir(comunasDelNucleo())
    const c = C.properties.name
    const si = DATOS.landmarks.filter(l => lugarEnComuna(l, c) && !l.obvious)
    const vecinasCercanas = C.properties.nb
    const no = DATOS.landmarks.filter(
      l => !lugarEnComuna(l, c) && vecinasCercanas.includes(l.comuna) && !(l.alt || []).length && !l.obvious,
    )
    if (!si.length || no.length < 2) return null
    const k = 1 + Math.floor(Math.random() * Math.min(3, si.length))
    const cor = mezclar(si).slice(0, k)
    const ds = mezclar(no).slice(0, 5 - k)
    return {
      key: 'lugares-comuna:' + c,
      prompt: `¿Cuáles de estos lugares están en <b>${escaparHtml(c)}</b>?`,
      multi: true,
      opts: mezclar([...cor, ...ds]).map(l => opcion(l.name)),
      correct: cor.map(l => l.name),
      reveal(selector) {
        resaltarComuna(C)
        for (const l of [...cor, ...ds]) {
          const isC = cor.includes(l)
          L.marker([l.lat, l.lon], {
            icon: iconoDiv('pin ' + (isC ? 'good' : selector.includes(l.name) ? 'ans' : 'you')),
            pane: 'points',
          })
            .addTo(capa)
            .bindTooltip(`${escaparHtml(l.name)} (${escaparHtml(l.comuna)})`, {
              permanent: true,
              direction: 'top',
              offset: [0, -10],
            })
        }
        encuadrar(
          limitesDeRasgos([C])
            .extend(L.latLngBounds([...cor, ...ds].map(l => [l.lat, l.lon])))
            .pad(0.1),
          14,
        )
        return `<p>En ${escaparHtml(c)}: <b>${cor.map(l => escaparHtml(l.name)).join(', ')}</b>. Los otros están en: ${ds.map(l => escaparHtml(l.name) + ' (' + escaparHtml(l.comuna) + ')').join(', ')}.</p>`
      },
    }
  },
  comunaNeighbors() {
    const C = elegir(comunasDelNucleo())
    const c = C.properties.name
    const sc = comunasDelAlcance().map(f => f.properties.name)
    const nb = C.properties.nb.filter(n => sc.includes(n))
    const ring2 = [...new Set(nb.flatMap(n => comunaPorNombre[n].properties.nb))].filter(
      n => n !== c && !nb.includes(n) && sc.includes(n),
    )
    if (nb.length < 2 || ring2.length < 2) return null
    const k = 2 + Math.floor(Math.random() * Math.min(2, nb.length - 1))
    const cor = mezclar(nb).slice(0, k)
    const ds = mezclar(ring2).slice(0, Math.max(2, 5 - k))
    return {
      key: 'limites:' + c,
      prompt: `¿Cuáles de estas comunas limitan con <b>${escaparHtml(c)}</b>?`,
      multi: true,
      opts: mezclar([...cor, ...ds]).map(n => opcion(n)),
      correct: cor,
      reveal(selector) {
        capaDeComunas(comunasDelAlcance(), {
          interactive: false,
          style: f => {
            const n = f.properties.name
            return n === c
              ? { fillColor: COLORES.hi, fillOpacity: 0.85 }
              : nb.includes(n)
                ? { fillColor: COLORES.ok, fillOpacity: 0.55 }
                : selector.includes(n)
                  ? { fillColor: COLORES.bad, fillOpacity: 0.6 }
                  : { fillOpacity: 0.25 }
          },
        }).addTo(capa)
        for (const n of [c, ...nb, ...ds]) etiquetaDeMapa(puntoDeEtiqueta(comunaPorNombre[n]), n).addTo(capa)
        encuadrar(limitesDeRasgos([C, ...nb.map(n => comunaPorNombre[n])]), 13)
        return `<p>${escaparHtml(c)} limita con: <b>${nb.map(escaparHtml).join(', ')}</b>.</p>`
      },
    }
  },
  linesInComuna() {
    const inC = (s, c) => s.comuna === c || (s.alt || []).includes(c)
    const conCalle = comunasDelNucleo().filter(f => estaciones.some(s => inC(s, f.properties.name)))
    const C = elegir(conCalle)
    const c = C.properties.name
    const sts = estaciones.filter(s => inC(s, c))
    const cor = [...new Set(sts.flatMap(s => s.lines))]
    return {
      key: 'lineas-comuna:' + c,
      prompt: `¿Qué líneas de metro tienen estaciones en <b>${escaparHtml(c)}</b>?`,
      multi: true,
      opts: IDS_DE_LINEA.map(id => opcion(id, `${pildoraDeLinea(id)} ${nombreDeLinea(id)}`)),
      correct: cor,
      reveal() {
        resaltarComuna(C)
        dibujarMetro(capa, { ids: cor, dots: false, opacity: 0.7 })
        for (const s of sts)
          L.circleMarker([s.lat, s.lon], {
            pane: 'points',
            radius: 5,
            color: '#fff',
            weight: 2,
            fillColor: LINEAS_DE_METRO[s.lines[0]].color,
            fillOpacity: 1,
          })
            .addTo(capa)
            .bindTooltip(escaparHtml(s.name), {
              permanent: true,
              direction: 'right',
              offset: [6, 0],
              className: 'lbl',
            })
        encuadrar(limitesDeRasgos([C]).pad(0.2), 14)
        return `<p>Estaciones en ${escaparHtml(c)}: ${sts.map(s => escaparHtml(s.name) + ' ' + s.lines.map(pildoraDeLinea).join('')).join(', ')}.</p>`
      },
    }
  },
  extreme() {
    const direcciones = [
      ['norte', l => l.lat],
      ['sur', l => -l.lat],
      ['oriente', l => l.lon],
      ['poniente', l => -l.lon],
    ]
    const [dn, f] = elegir(direcciones)
    const KM = dn === 'norte' || dn === 'sur' ? KM_POR_GRADO_LATITUD : KM_POR_GRADO_LONGITUD
    const conjunto = mezclar(
      DATOS.landmarks.filter(
        l => !l.line && comunaPorNombre[l.comuna] && comunaPorNombre[l.comuna].properties.group === 'core',
      ),
    )
    const ch = []
    for (const l of conjunto) {
      if (ch.every(x => x.comuna !== l.comuna)) ch.push(l)
      if (ch.length === 4) break
    }
    const ordenados = ch.slice().sort((a, b) => f(b) - f(a))
    if ((f(ordenados[0]) - f(ordenados[1])) * KM < 1.5) return null
    return {
      key: 'extremo:' + dn + ':' + ordenados[0].name,
      prompt: `¿Cuál de estos lugares está más al <b>${dn}</b>?`,
      opts: mezclar(ch).map(l => opcion(l.name)),
      correct: ordenados[0].name,
      reveal(v) {
        for (const l of ch)
          L.marker([l.lat, l.lon], {
            icon: iconoDiv('pin ' + (l === ordenados[0] ? 'good' : l.name === v ? 'ans' : 'you')),
            pane: 'points',
          })
            .addTo(capa)
            .bindTooltip(escaparHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        encuadrar(L.latLngBounds(ch.map(l => [l.lat, l.lon])).pad(0.2), 14)
        return `<p>El más al ${dn} es <b>${escaparHtml(ordenados[0].name)}</b> (${escaparHtml(ordenados[0].comuna)}).</p>`
      },
    }
  },
  stationStreet() {
    const st = elegir(estaciones.filter(s => s.ns && s.ns[0][1] <= 0.15 && s.ns[1][1] >= 0.35))
    if (!st) return null
    const corr = st.ns[0][0]
    const lejos = vias().filter(s => {
      const d = distanciaALinea([st.lat, st.lon], s.lines)
      return d > 1 && d < 5
    })
    if (lejos.length < 3) return null
    const ds = mezclar(lejos)
      .slice(0, 3)
      .map(s => s.name)
    return {
      key: 'estacion-calle:' + st.name,
      prompt: `¿Sobre (o junto a) qué calle está la estación <b>${escaparHtml(st.name)}</b> ${st.lines.map(pildoraDeLinea).join('')}?`,
      opts: mezclar([corr, ...ds]).map(n => opcion(n)),
      correct: corr,
      reveal(v) {
        dibujarCalle(callePorNombre[corr], COLORES.ok, { labelText: corr })
        if (v !== corr) dibujarCalle(callePorNombre[v], COLORES.bad, { labelText: v })
        L.marker([st.lat, st.lon], { icon: iconoDiv('pulse', '', 22), pane: 'points' })
          .addTo(capa)
          .bindTooltip(escaparHtml(st.name), { permanent: true, direction: 'right', offset: [10, 0] })
        encuadrar(
          L.latLngBounds([[st.lat, st.lon]])
            .extend(L.latLngBounds(callePorNombre[v].bb))
            .pad(0.1),
          15,
        )
        return `<p>${escaparHtml(st.name)} está sobre <b>${escaparHtml(corr)}</b> (${escaparHtml(st.comuna)}).</p>`
      },
    }
  },
  nearestCerro() {
    const urbanas = cerros.filter(c => c.tipo === 'Cerros islas')
    const l = elegir(DATOS.landmarks.filter(lugar => !lugar.line))
    const ds = urbanas
      .map(c => ({ c, d: distanciaKm([l.lat, l.lon], [c.lat, c.lon]) }))
      .sort((a, b) => a.d - b.d)
    if (ds[0].d > 5 || ds[1].d - ds[0].d < 1.5) return null
    const corr = ds[0].c.name
    const otros = mezclar(ds.slice(3, 12))
      .slice(0, 3)
      .map(o => o.c.name)
    return {
      key: 'cerro-cerca:' + l.name,
      prompt: `¿Qué cerro queda más cerca de <b>${escaparHtml(l.name)}</b>?`,
      opts: mezclar([corr, ...otros]).map(n => opcion(n)),
      correct: corr,
      reveal(v) {
        L.marker([l.lat, l.lon], { icon: iconoDiv('pin good'), pane: 'points' })
          .addTo(capa)
          .bindTooltip(escaparHtml(l.name), { permanent: true, direction: 'top', offset: [0, -10] })
        for (const n of new Set([corr, v])) {
          const c = cerros.find(x => x.name === n)
          L.marker([c.lat, c.lon], { icon: iconoDeCumbre(n === corr ? 'ok' : 'bad'), pane: 'points' })
            .addTo(capa)
            .bindTooltip(escaparHtml(n), { permanent: true, direction: 'top', offset: [0, -12] })
        }
        const cs = cerros.filter(x => x.name === corr || x.name === v)
        encuadrar(L.latLngBounds([[l.lat, l.lon], ...cs.map(c => [c.lat, c.lon])]).pad(0.2), 14)
        return `<p>El más cercano es el <b>${escaparHtml(corr)}</b>, a ${formatearKm(ds[0].d)}.</p>`
      },
    }
  },
}
export const NOMBRES_DE_GENERADORES = {
  roundabout: 'Rotondas',
  metroStreets: 'Calles de cada línea de metro',
  streetsInComuna: 'Calles por comuna',
  crossings: 'Cruces de calles',
  nearestStreet: 'Calle más cercana a un lugar',
  nearestStation: 'Metro más cercano',
  crossComuna: 'Comuna de un cruce',
  landmarksInComuna: 'Lugares por comuna',
  comunaNeighbors: 'Comunas vecinas',
  linesInComuna: 'Líneas por comuna',
  extreme: 'Más al norte / sur / oriente / poniente',
  stationStreet: 'Calle de una estación',
  nearestCerro: 'Cerro más cercano',
}
registrarModo({
  id: 'cx',
  aids: true,
  group: 'Conexiones',
  name: 'Conexiones (mezcla)',
  desc: 'Preguntas que relacionan todo: cruces, calles por comuna, metro más cercano, vecinas, puntos cardinales…',
  pool() {
    const salida = [],
      llaves = new Set(),
      generadores = Object.keys(GENERADORES)
    for (let t = 0; t < 400 && salida.length < 80; t++) {
      const g = generadores[t % generadores.length]
      const qq = GENERADORES[g]()
      if (qq && !llaves.has(qq.key)) {
        llaves.add(qq.key)
        qq.gen = g
        salida.push(qq)
      }
    }
    return salida
  },
  key: x => x.key,
  label: x => x.key.split(':').slice(1).join(':'),
  ask(x, q) {
    mostrarPanel(
      encabezadoDePregunta(q) +
        `<div class="q-head" style="margin-top:-4px"><span>${escaparHtml(NOMBRES_DE_GENERADORES[x.gen])}</span></div><div class="q-prompt">${x.prompt}</div>${x.sub ? `<div class="q-sub">${escaparHtml(x.sub)}</div>` : ''}`,
    )
    mostrarAyudas({ borders: comunasDelNucleo() })
    if (x.pre) x.pre()
    else if (q.i === 0) encuadrarCiudad()
    if (x.multi)
      mostrarMultiple(x.opts, x.correct, selector => {
        const html = x.reveal(selector)
        responder(mismoConjunto(selector, x.correct), html)
      })
    else
      mostrarOpciones(
        x.opts,
        x.correct,
        v => {
          const html = x.reveal(v)
          responder(v === x.correct, html)
        },
        { one: x.opts.some(o => o.label.length > 22) },
      )
  },
})
