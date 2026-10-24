// Una ciudad chica con la forma de lo que devuelve Overpass, para probar el grafo de "Ruta libre" sin bajar nada.
//
//   Calle Oeste ─ Av. Paralela ─────────────────────────── Calle Este      y = 500
//        │            │ (Atajo, x=4500)                          │
//        │   Av. Principal ──────────────────────────────────────┘          y = 0   (nodos cada 1500 m)
//        │      │ Calle Norte (x=3000)    Pasaje Ciego ↓ (x=1500)
//
// Av. Principal y Av. Paralela son secundarias de dos sentidos; Calle Norte, terciaria; el Atajo une las dos arterias y el
// Pasaje Ciego no lleva a ninguna parte.

const LATITUD_BASE = -33.4
const LONGITUD_BASE = -70.6
const METROS_POR_GRADO_DE_LATITUD = 111200
const METROS_POR_GRADO_DE_LONGITUD = 111320 * Math.cos((LATITUD_BASE * Math.PI) / 180)

export const enMetros = (este, norte) => [
  LATITUD_BASE + norte / METROS_POR_GRADO_DE_LATITUD,
  LONGITUD_BASE + este / METROS_POR_GRADO_DE_LONGITUD,
]

export function ciudadDePrueba({
  conRestriccion = false,
  conBandejon = false,
  conTramoLento = false,
  conBifurcacion = false,
} = {}) {
  const nodos = new Map()
  const calles = []
  const restricciones = []
  let siguienteId = 1
  const nodo = (este, norte, etiquetas) => {
    const clave = `${este},${norte}`
    if (!nodos.has(clave)) {
      const [lat, lon] = enMetros(este, norte)
      nodos.set(clave, { type: 'node', id: siguienteId++, lat, lon, ...(etiquetas && { tags: etiquetas }) })
    }
    return nodos.get(clave).id
  }
  const calle = (id, etiquetas, ...puntos) =>
    calles.push({ type: 'way', id, tags: etiquetas, nodes: puntos.map(([este, norte]) => nodo(este, norte)) })

  const principal = [0, 1500, 3000, 4500, 6000].map(este => [este, 0])
  const paralela = [0, 1500, 3000, 4500, 6000].map(este => [este, 500])
  calle(100, { highway: 'secondary', name: 'Av. Principal' }, ...principal.slice(0, 2))
  calle(
    102,
    { highway: 'secondary', name: 'Av. Principal', ...(conTramoLento && { maxspeed: '5' }) },
    ...principal.slice(1, 3),
  )
  calle(101, { highway: 'secondary', name: 'Av. Principal' }, ...principal.slice(2))
  if (conTramoLento)
    calle(
      170,
      { highway: 'residential', name: 'Rodeo', maxspeed: '50' },
      [1500, 0],
      [1500, 250],
      [3000, 250],
      [3000, 0],
    )
  if (conBifurcacion)
    calle(180, { highway: 'secondary', name: 'Av. Alta' }, [3000, 0], [4000, 270], [4500, 500])
  calle(110, { highway: 'secondary', name: 'Av. Paralela' }, ...paralela)
  calle(120, { highway: 'tertiary', name: 'Calle Oeste' }, [0, 0], [0, 500])
  calle(121, { highway: 'tertiary', name: 'Calle Este' }, [6000, 0], [6000, 500])
  calle(130, { highway: 'tertiary', name: 'Calle Norte' }, [3000, 0], [3000, 500])
  calle(140, { highway: 'residential', name: 'Atajo' }, [4500, 0], [4500, 500])
  calle(150, { highway: 'residential', name: 'Pasaje Ciego' }, [1500, 0], [1500, -150])
  calle(160, { highway: 'residential', name: 'Isla' }, [9000, 9000], [9100, 9000])

  if (conBandejon) {
    calle(
      200,
      { highway: 'primary', name: 'Av. Doble', oneway: 'yes' },
      [0, 2000],
      [1500, 2000],
      [3000, 2000],
    )
    calle(
      201,
      { highway: 'primary', name: 'Av. Doble', oneway: 'yes' },
      [3000, 2020],
      [1500, 2020],
      [0, 2020],
    )
    calle(202, { highway: 'residential', name: 'Retorno oriente' }, [3000, 2000], [3000, 2020])
    calle(203, { highway: 'residential', name: 'Retorno poniente' }, [0, 2020], [0, 2000])
    calle(204, { highway: 'residential', name: 'Conexión' }, [0, 500], [0, 2000])
  }
  if (conRestriccion)
    restricciones.push({
      type: 'relation',
      id: 900,
      tags: { type: 'restriction', restriction: 'no_left_turn' },
      members: [
        { type: 'way', ref: 102, role: 'from' },
        { type: 'node', ref: nodo(3000, 0), role: 'via' },
        { type: 'way', ref: 130, role: 'to' },
      ],
    })
  return [...nodos.values(), ...calles, ...restricciones]
}

export const AREA_DE_PRUEBA = { sur: -33.41, norte: -33.38, oeste: -70.61, este: -70.52 }

// Un cruce grande modelado con varios nodos seguidos, como lo dibuja OpenStreetMap: desde Y1, Camino Santa Teresa sigue por M y Gran Vía
// pasa por Y2, desde donde un ramal vuelve a Santa Teresa. Para el jugador es una sola decisión: Santa Teresa o Gran Vía.
//
//   Av. Principal ── Y1 ─┬─ M ───────── T ─┐ Cierre
//                        └─ Y2 ─────────  G ─┘   (Y2 → M: ramal de un solo sentido)
export function ciudadConHorquilla() {
  const nodos = new Map()
  const calles = []
  let siguienteId = 1
  const nodo = (este, norte) => {
    const clave = `${este},${norte}`
    if (!nodos.has(clave)) {
      const [lat, lon] = enMetros(este, norte)
      nodos.set(clave, { type: 'node', id: siguienteId++, lat, lon })
    }
    return nodos.get(clave).id
  }
  const calle = (id, etiquetas, ...puntos) =>
    calles.push({ type: 'way', id, tags: etiquetas, nodes: puntos.map(([este, norte]) => nodo(este, norte)) })
  calle(1, { highway: 'secondary', name: 'Av. Principal' }, [0, 0], [1000, 0])
  calle(2, { highway: 'secondary', name: 'Camino Santa Teresa' }, [1000, 0], [1040, -10])
  calle(3, { highway: 'secondary', name: 'Camino Santa Teresa' }, [1040, -10], [1500, -60])
  calle(4, { highway: 'secondary', name: 'Gran Vía' }, [1000, 0], [1070, 15])
  calle(5, { highway: 'secondary', name: 'Gran Vía' }, [1070, 15], [1500, 150])
  calle(6, { highway: 'secondary_link', oneway: 'yes' }, [1070, 15], [1040, -10])
  calle(7, { highway: 'tertiary', name: 'Cierre' }, [1500, -60], [1500, 150])
  return [...nodos.values(), ...calles]
}

// Una rotonda de cuatro calles, cada una con dos calzadas que llegan al anillo por nodos distintos (una entra y la otra sale), como
// las dibuja OpenStreetMap. Calle Sur es por donde se llega; las salidas, en orden, son Este, Norte, Oeste y Sur.
export function ciudadConRotonda() {
  const nodos = new Map()
  const calles = []
  let siguienteId = 1
  const nodo = (este, norte) => {
    const clave = `${este.toFixed(2)},${norte.toFixed(2)}`
    if (!nodos.has(clave)) {
      const [lat, lon] = enMetros(este, norte)
      nodos.set(clave, { type: 'node', id: siguienteId++, lat, lon })
    }
    return nodos.get(clave).id
  }
  const calle = (id, etiquetas, ...puntos) =>
    calles.push({ type: 'way', id, tags: etiquetas, nodes: puntos.map(([este, norte]) => nodo(este, norte)) })
  const RADIO = 25
  const LARGO = 225
  const enElAnillo = grados => [
    RADIO * Math.cos((grados * Math.PI) / 180),
    RADIO * Math.sin((grados * Math.PI) / 180),
  ]
  const calles4 = [
    ['Calle Este', 0],
    ['Calle Norte', 90],
    ['Calle Oeste', 180],
    ['Calle Sur', 270],
  ]
  calles4.forEach(([nombre, grados], i) => {
    const lejos = [LARGO * Math.cos((grados * Math.PI) / 180), LARGO * Math.sin((grados * Math.PI) / 180)]
    calle(10 + 2 * i, { highway: 'secondary', name: nombre, oneway: 'yes' }, enElAnillo(grados - 10), lejos)
    calle(11 + 2 * i, { highway: 'secondary', name: nombre, oneway: 'yes' }, lejos, enElAnillo(grados + 10))
  })
  const orden = calles4
    .flatMap(([, grados]) => [grados - 10, grados + 10])
    .map(grados => (grados + 360) % 360)
  const delAnillo = [...orden].sort((a, b) => a - b)
  calle(
    1,
    { highway: 'secondary', junction: 'roundabout', name: 'Rotonda' },
    ...delAnillo.map(enElAnillo),
    enElAnillo(delAnillo[0]),
  )
  return [...nodos.values(), ...calles]
}

// Una avenida con una calle lateral cada 200 m (Calle 1 a Calle 9), unidas por una paralela: muchas salidas seguidas.
export function ciudadConCallesSeguidas() {
  const nodos = new Map()
  const calles = []
  let siguienteId = 1
  const nodo = (este, norte) => {
    const clave = `${este},${norte}`
    if (!nodos.has(clave)) {
      const [lat, lon] = enMetros(este, norte)
      nodos.set(clave, { type: 'node', id: siguienteId++, lat, lon })
    }
    return nodos.get(clave).id
  }
  const calle = (id, etiquetas, ...puntos) =>
    calles.push({ type: 'way', id, tags: etiquetas, nodes: puntos.map(([este, norte]) => nodo(este, norte)) })
  const cruces = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => i * 200)
  calle(1, { highway: 'secondary', name: 'Av. Principal' }, ...cruces.map(este => [este, 0]))
  calle(2, { highway: 'secondary', name: 'Av. Paralela' }, ...cruces.map(este => [este, 300]))
  cruces.slice(1, -1).forEach((este, i) => {
    calle(10 + i, { highway: 'tertiary', name: `Calle ${i + 1}` }, [este, 0], [este, 300])
  })
  calle(30, { highway: 'tertiary', name: 'Calle Oeste' }, [0, 0], [0, 300])
  calle(31, { highway: 'tertiary', name: 'Calle Este' }, [2000, 0], [2000, 300])
  return [...nodos.values(), ...calles]
}

// Una autopista de un sentido con una salida (un ramal sin nombre que llega a "Calle Salida"), que se junta con una avenida de
// retorno; se entra por "Calle Acceso".
export function ciudadConAutopista() {
  const nodos = new Map()
  const calles = []
  let siguienteId = 1
  const nodo = (este, norte) => {
    const clave = `${este},${norte}`
    if (!nodos.has(clave)) {
      const [lat, lon] = enMetros(este, norte)
      nodos.set(clave, { type: 'node', id: siguienteId++, lat, lon })
    }
    return nodos.get(clave).id
  }
  const calle = (id, etiquetas, ...puntos) =>
    calles.push({ type: 'way', id, tags: etiquetas, nodes: puntos.map(([este, norte]) => nodo(este, norte)) })
  calle(1, { highway: 'motorway', name: 'Autopista Uno' }, [0, 0], [1500, 0], [3000, 0], [4500, 0])
  calle(2, { highway: 'motorway_link' }, [1500, 0], [1600, -120])
  calle(3, { highway: 'secondary', name: 'Calle Salida' }, [1600, -120], [1600, -500])
  calle(4, { highway: 'secondary', name: 'Av. Retorno' }, [0, -500], [1600, -500], [4500, -500])
  calle(5, { highway: 'tertiary', name: 'Calle Acceso' }, [0, 0], [0, -500])
  calle(6, { highway: 'tertiary', name: 'Calle Final' }, [4500, 0], [4500, -500])
  return [...nodos.values(), ...calles]
}

// Un punto entre dos calles paralelas de un solo sentido que van hacia el oeste (como una plaza del centro): las dos salidas son
// "a la izquierda", cada una por una calle distinta.
export function ciudadConUnaPlaza() {
  const nodos = new Map()
  const calles = []
  let siguienteId = 1
  const nodo = (este, norte) => {
    const clave = `${este},${norte}`
    if (!nodos.has(clave)) {
      const [lat, lon] = enMetros(este, norte)
      nodos.set(clave, { type: 'node', id: siguienteId++, lat, lon })
    }
    return nodos.get(clave).id
  }
  const calle = (id, etiquetas, ...puntos) =>
    calles.push({ type: 'way', id, tags: etiquetas, nodes: puntos.map(([este, norte]) => nodo(este, norte)) })
  calle(1, { highway: 'secondary', name: 'Calle Norte', oneway: 'yes' }, [400, 40], [0, 40], [-400, 40])
  calle(2, { highway: 'secondary', name: 'Calle Sur', oneway: 'yes' }, [400, -40], [0, -40], [-400, -40])
  calle(3, { highway: 'tertiary', name: 'Calle Este' }, [400, -200], [400, -40], [400, 40])
  calle(4, { highway: 'tertiary', name: 'Calle Oeste' }, [-400, 40], [-400, -40], [-400, -200])
  calle(5, { highway: 'secondary', name: 'Av. Retorno' }, [-400, -200], [400, -200])
  return [...nodos.values(), ...calles]
}

function constructorDeCiudad() {
  const nodos = new Map()
  const calles = []
  const nodo = (este, norte) => {
    const clave = `${este},${norte}`
    if (!nodos.has(clave)) {
      const [lat, lon] = enMetros(este, norte)
      nodos.set(clave, { type: 'node', id: nodos.size + 1, lat, lon })
    }
    return nodos.get(clave).id
  }
  return {
    calle: (id, etiquetas, ...puntos) =>
      calles.push({
        type: 'way',
        id,
        tags: etiquetas,
        nodes: puntos.map(([este, norte]) => nodo(este, norte)),
      }),
    elementos: () => [...nodos.values(), ...calles],
  }
}

// Un camino sin nombre (como los del cerro Santa Lucía) que sale a "Av. Parque" por el oriente y, si hay salida al poniente, a
// "Calle Poniente"; si no, por ese lado no lleva a ninguna parte.
export function ciudadConUnCaminoSinNombre({ conSalidaAlPoniente }) {
  const { calle, elementos } = constructorDeCiudad()
  calle(1, { highway: 'service' }, [-300, 0], [0, 0], [300, 0])
  calle(2, { highway: 'secondary', name: 'Av. Parque' }, [300, -300], [300, 0], [300, 600])
  const alPoniente = conSalidaAlPoniente ? [[-300, 0]] : []
  calle(3, { highway: 'tertiary', name: 'Calle Poniente' }, [-300, -300], ...alPoniente, [-300, 600])
  calle(4, { highway: 'tertiary', name: 'Av. Sur' }, [-300, -300], [300, -300])
  calle(5, { highway: 'tertiary', name: 'Av. Norte' }, [-300, 600], [300, 600])
  return elementos()
}
