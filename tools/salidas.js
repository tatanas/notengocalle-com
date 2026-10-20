// Salidas numeradas de las autopistas urbanas (nodos highway=motorway_junction de OpenStreetMap con su número en `ref`),
// para que los juegos de ruteo hablen de "salida 8" y ofrezcan como alternativas salidas que existen. Cada una lleva a dónde
// sale: lo que dice el cartel (`destination` de la rampa) o, si no hay, la calle a la que llega la rampa (se la sigue en
// OpenStreetMap hasta una calle con nombre); si tampoco, las calles del juego que quedan cerca y, a falta de todo, la comuna.
// Uso (desde tools/, después de streets.js):  node salidas.js   → salidas.json
// Las descargas de Overpass quedan en salidas_raw.json (nodos) y rampas_raw.json (rampas y las calles que tocan), ignorados
// por git; si ya existen, se reutilizan.
const fs = require('fs')
const turf = require('@turf/turf')
const calles = require('./streets.json')
const comunas = JSON.parse(fs.readFileSync('comunas_s.geojson')).features

const CAJA = '-33.75,-71.0,-33.0,-70.2'
const ESPEJOS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const USER_AGENT = 'NoTengoCalle/1.0 (juego educativo de Santiago)'
const MS_DE_ESPERA = 170000

const KX = 92.9
const KY = 111.2
// Un nodo es de una autopista si queda pegado a su trazado del juego.
const KM_DE_AUTOPISTA = 0.06
// Calles del juego que se anotan para nombrar la salida si OpenStreetMap no dice a dónde lleva.
const KM_PARA_NOMBRAR = 0.4
const CALLES_ANOTADAS = 3
// Cuántas rampas encadenadas se siguen hasta llegar a una calle.
const RAMPAS_MAXIMAS_ENCADENADAS = 5
const DESTINOS_ANOTADOS = 3

async function descargar(consulta) {
  for (const espejo of ESPEJOS) {
    try {
      const respuesta = await fetch(espejo, {
        method: 'POST',
        signal: AbortSignal.timeout(MS_DE_ESPERA),
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(consulta),
      })
      if (respuesta.ok) return respuesta.json()
      console.log(espejo, respuesta.status)
    } catch (error) {
      console.log(espejo, error.message)
    }
  }
  throw new Error('Ningún espejo de Overpass respondió')
}

async function leerOBajar(archivo, consulta) {
  if (!fs.existsSync(archivo)) fs.writeFileSync(archivo, JSON.stringify(await descargar(consulta)))
  return JSON.parse(fs.readFileSync(archivo))
}

function kmALineas(punto, lineas) {
  let mejor = Infinity
  for (const linea of lineas)
    for (let i = 0; i < linea.length - 1; i++) {
      const ax = (linea[i][1] - punto[1]) * KX
      const ay = (linea[i][0] - punto[0]) * KY
      const dx = (linea[i + 1][1] - punto[1]) * KX - ax
      const dy = (linea[i + 1][0] - punto[0]) * KY - ay
      const largo = dx * dx + dy * dy
      const t = largo ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo)) : 0
      mejor = Math.min(mejor, Math.hypot(ax + t * dx, ay + t * dy))
    }
  return mejor
}

// "11a;11b" es una sola salida con dos ramales; "2d-N" es la salida 2d de la calzada norte (Autopista Central).
function leerReferencia(ref) {
  const primera = ref.split(';')[0].trim()
  const conSentido = primera.match(/^(.+)-([NS])$/)
  return conSentido ? { r: conSentido[1], d: conSentido[2] } : { r: primera }
}

const esRampa = via => /_link$/.test(via.tags.highway)
const separar = texto =>
  (texto ?? '')
    .split(';')
    .map(parte => parte.trim())
    .filter(Boolean)
const esSoloReferencia = texto => /^[A-Z]?-?\d+[A-Za-z]?$/.test(texto)

// Lo que no dice a dónde se va ("Calle Local") y las erratas conocidas de OpenStreetMap.
const esDestinoVacio = texto => /^Calle (Local|de Servicio)$/.test(texto)
const corregir = texto => texto.replace('Contanera', 'Costanera')

// Lo que dicen los carteles de una rampa: `destination` (a veces con calles, a veces con comunas o ciudades).
function destinosDeLaRampa(rampa) {
  const { destination, 'destination:street': calle, exit_to: salidaA, name } = rampa.tags
  return [...separar(calle), ...separar(destination), ...separar(salidaA), ...separar(name)]
    .map(corregir)
    .filter(texto => !esSoloReferencia(texto) && !esDestinoVacio(texto))
}

;(async () => {
  const nodos = (
    await leerOBajar(
      'salidas_raw.json',
      `[out:json][timeout:60];node["highway"="motorway_junction"](${CAJA});out body;`,
    )
  ).elements
  const vias = (
    await leerOBajar(
      'rampas_raw.json',
      `[out:json][timeout:180];
      way["highway"~"_link$"](${CAJA})->.rampas;
      node(w.rampas)->.nodosDeRampas;
      way(bn.nodosDeRampas)["highway"]["name"]->.calles;
      (.rampas; .calles;);
      out body;`,
    )
  ).elements.filter(elemento => elemento.type === 'way')

  // El rumbo de la calzada en cada salida (hacia dónde se avanza ahí): las salidas de la calzada contraria no sirven.
  const calzadas = (
    await leerOBajar(
      'autopistas_raw.json',
      `[out:json][timeout:180];
      node["highway"="motorway_junction"](${CAJA})->.salidas;
      way(bn.salidas)["highway"~"^(motorway|trunk)$"];
      out body geom;`,
    )
  ).elements.filter(elemento => elemento.type === 'way')
  const rumboEnLaSalida = new Map()
  for (const via of calzadas) {
    if (via.tags.oneway !== 'yes' && via.tags.oneway !== '-1' && via.tags.highway !== 'motorway') continue
    const sentido = via.tags.oneway === '-1' ? -1 : 1
    via.nodes.forEach((nodo, indice) => {
      const antes = via.geometry[Math.max(0, indice - 1)]
      const despues = via.geometry[Math.min(via.nodes.length - 1, indice + 1)]
      if (antes === despues) return
      const grados =
        (Math.atan2((despues.lon - antes.lon) * KX, (despues.lat - antes.lat) * KY) * 180) / Math.PI
      rumboEnLaSalida.set(nodo, Math.round((((grados + (sentido < 0 ? 180 : 0)) % 360) + 360) % 360))
    })
  }

  const viasPorNodo = new Map()
  for (const via of vias)
    for (const nodo of via.nodes) {
      if (!viasPorNodo.has(nodo)) viasPorNodo.set(nodo, [])
      viasPorNodo.get(nodo).push(via)
    }

  // Se sigue la rampa hasta una calle con nombre: los carteles de la rampa y la calle a la que llega.
  function adondeLleva(rampaInicial, autopistas) {
    const carteles = []
    const llegadas = []
    const vistas = new Set()
    let pendientes = [rampaInicial]
    for (let nivel = 0; nivel < RAMPAS_MAXIMAS_ENCADENADAS && pendientes.length; nivel++) {
      const siguientes = []
      for (const rampa of pendientes) {
        if (vistas.has(rampa.id)) continue
        vistas.add(rampa.id)
        carteles.push(...destinosDeLaRampa(rampa))
        const extremo = rampa.nodes.at(-1)
        for (const via of viasPorNodo.get(extremo) ?? []) {
          if (via === rampa) continue
          if (esRampa(via)) {
            if (via.nodes[0] === extremo) siguientes.push(via)
          } else if (
            via.tags.name &&
            !autopistas.some(nombre => via.tags.name.includes(nombre.split(' (')[0]))
          )
            llegadas.push(via.tags.name)
        }
      }
      if (llegadas.length) break
      pendientes = siguientes
    }
    return { carteles, llegadas }
  }

  const todasLasVias = calles.filter(calle => calle.kind === 'calle' || calle.kind === 'autopista')
  const autopistas = todasLasVias.filter(calle => calle.kind === 'autopista')
  const nombresDeAutopistas = autopistas.map(calle => calle.name)
  const salidas = []
  let sinRampa = 0
  for (const nodo of nodos) {
    if (!nodo.tags.ref) continue
    const punto = [nodo.lat, nodo.lon]
    const deLaAutopista = autopistas.filter(calle => kmALineas(punto, calle.lines) <= KM_DE_AUTOPISTA)
    if (!deLaAutopista.length) continue
    // Solo cuentan los nodos de donde sale una rampa: en los otros se entra a la autopista, no se sale.
    const rampas = (viasPorNodo.get(nodo.id) ?? []).filter(via => esRampa(via) && via.nodes[0] === nodo.id)
    if (!rampas.length) {
      sinRampa++
      continue
    }
    const destinos = new Set()
    for (const rampa of rampas) {
      const { carteles, llegadas } = adondeLleva(rampa, nombresDeAutopistas)
      for (const texto of carteles.length ? carteles : llegadas) destinos.add(texto)
    }
    const cercanas = todasLasVias
      .filter(calle => !deLaAutopista.includes(calle))
      .map(calle => [calle.name, Math.round(kmALineas(punto, calle.lines) * 1000)])
      .filter(([, metros]) => metros <= KM_PARA_NOMBRAR * 1000)
      .sort((a, b) => a[1] - b[1])
      .slice(0, CALLES_ANOTADAS)
    salidas.push({
      ...leerReferencia(nodo.tags.ref),
      p: [+nodo.lat.toFixed(5), +nodo.lon.toFixed(5)],
      v: deLaAutopista.map(calle => calle.name),
      ...(rumboEnLaSalida.has(nodo.id) && { o: rumboEnLaSalida.get(nodo.id) }),
      ...(destinos.size && { a: [...destinos].slice(0, DESTINOS_ANOTADOS) }),
      c: cercanas,
      m: comunas.find(comuna => turf.booleanPointInPolygon([nodo.lon, nodo.lat], comuna))?.properties.name,
    })
  }
  fs.writeFileSync('salidas.json', JSON.stringify(salidas))
  console.log(
    'salidas',
    salidas.length,
    'de',
    nodos.length,
    'nodos (' + sinRampa + ' sin rampa de salida);',
    salidas.filter(salida => salida.a).length,
    'con destino;',
    fs.statSync('salidas.json').size,
    'bytes',
  )
})()
