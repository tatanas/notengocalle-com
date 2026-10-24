// Una ciudad chica con la forma de lo que devuelve OpenStreetMap, para probar la conducción libre sin bajar nada.
// Medidas en metros hacia el este y hacia el norte desde un punto cualquiera de Santiago.
//
//   y=800  Av. Alta ───────────────────────────────────────────
//   y=620  Av. Doble (poniente) ◄── Calle Cruce (x=300) cruza las dos calzadas ──┐
//   y=600  Av. Doble (oriente)  ──►                                              ┘ retorno en x=1200
//   y=300  Av. Norte ─────────────────────────────────────────────
//   y=0    Av. Principal ── Calle Uno (x=200) ── Pasaje Ciego (x=400, sin salida) ── Acceso (x=600, 20 m)
//          ── Calle Ocho (x=800, giro prohibido) ── Calle Única (x=1000, solo hacia el norte) ── Calle Doce (x=1200)
//          ── bifurcación en x=1400: Rama Norte / Rama Sur, que se juntan en x=1800
//   y=-300 Av. Sur ───────────────────────────────────────────

const LATITUD_BASE = -33.4
const LONGITUD_BASE = -70.6
const METROS_POR_GRADO_DE_LATITUD = 111200
const METROS_POR_GRADO_DE_LONGITUD = 111320 * Math.cos((LATITUD_BASE * Math.PI) / 180)

export const enMetros = (este, norte) => [
  LATITUD_BASE + norte / METROS_POR_GRADO_DE_LATITUD,
  LONGITUD_BASE + este / METROS_POR_GRADO_DE_LONGITUD,
]

export const AREA_DE_PRUEBA = { sur: -34, norte: -33, oeste: -71, este: -70 }

function constructorDeCiudad() {
  const nodos = new Map()
  const calles = []
  const restricciones = []
  const nodo = (este, norte) => {
    const clave = `${este.toFixed(2)},${norte.toFixed(2)}`
    if (!nodos.has(clave)) {
      const [lat, lon] = enMetros(este, norte)
      nodos.set(clave, { type: 'node', id: nodos.size + 1, lat, lon })
    }
    return nodos.get(clave).id
  }
  return {
    nodo,
    calle: (id, etiquetas, ...puntos) =>
      calles.push({
        type: 'way',
        id,
        tags: etiquetas,
        nodes: puntos.map(([este, norte]) => nodo(este, norte)),
      }),
    restriccion: (id, tipo, desde, via, hacia) =>
      restricciones.push({
        type: 'relation',
        id,
        tags: { type: 'restriction', restriction: tipo },
        members: [
          { type: 'way', ref: desde, role: 'from' },
          { type: 'node', ref: nodo(...via), role: 'via' },
          { type: 'way', ref: hacia, role: 'to' },
        ],
      }),
    elementos: () => [...nodos.values(), ...calles, ...restricciones],
  }
}

export function ciudadDeConduccion() {
  const { calle, restriccion, elementos } = constructorDeCiudad()
  const cada = (separacion, hasta) => Array.from({ length: hasta / separacion + 1 }, (_, i) => i * separacion)
  calle(1, { highway: 'secondary', name: 'Av. Principal' }, ...cada(200, 1400).map(x => [x, 0]))
  calle(2, { highway: 'secondary', name: 'Av. Norte' }, ...cada(100, 1200).map(x => [x, 300]))
  calle(3, { highway: 'secondary', name: 'Av. Sur' }, ...cada(200, 1200).map(x => [x, -300]))
  calle(4, { highway: 'tertiary', name: 'Calle Cero' }, [0, -300], [0, 0], [0, 300])
  calle(5, { highway: 'tertiary', name: 'Calle Uno' }, [200, -300], [200, 0], [200, 300])
  calle(6, { highway: 'tertiary', name: 'Calle Ocho' }, [800, -300], [800, 0], [800, 300])
  calle(7, { highway: 'tertiary', name: 'Calle Doce' }, [1200, -300], [1200, 0], [1200, 300])
  calle(8, { highway: 'residential', name: 'Calle Única', oneway: 'yes' }, [1000, 0], [1000, 300])
  calle(9, { highway: 'residential', name: 'Pasaje Ciego' }, [400, 0], [400, -60])
  calle(10, { highway: 'residential', name: 'Acceso' }, [600, 0], [600, 20])
  restriccion(900, 'no_left_turn', 1, [800, 0], 6)

  calle(20, { highway: 'tertiary', name: 'Conexión' }, [0, 300], [0, 600], [0, 620], [0, 800])
  calle(21, { highway: 'primary', name: 'Av. Doble', oneway: 'yes' }, ...cada(100, 1200).map(x => [x, 600]))
  calle(
    22,
    { highway: 'primary', name: 'Av. Doble', oneway: 'yes' },
    ...cada(100, 1200)
      .reverse()
      .map(x => [x, 620]),
  )
  calle(23, { highway: 'residential', name: 'Retorno oriente' }, [1200, 600], [1200, 620])
  calle(24, { highway: 'secondary', name: 'Av. Alta' }, ...cada(100, 1200).map(x => [x, 800]))
  calle(25, { highway: 'tertiary', name: 'Calle Cruce' }, [300, 300], [300, 600], [300, 620], [300, 800])
  calle(26, { highway: 'tertiary', name: 'Calle Doce Norte' }, [1200, 620], [1200, 800])
  calle(27, { highway: 'tertiary', name: 'Calle Doce Centro' }, [1200, 300], [1200, 600])

  calle(30, { highway: 'secondary', name: 'Rama Norte' }, [1400, 0], [1600, 40], [1800, 0])
  calle(31, { highway: 'secondary', name: 'Rama Sur' }, [1400, 0], [1600, -40], [1800, 0])
  calle(32, { highway: 'tertiary', name: 'Calle Final' }, [1800, 0], [2000, 0])
  return elementos()
}

// Una rotonda de cuatro calles, cada una con dos calzadas que llegan al anillo por nodos distintos (una entra y la otra sale).
// Calle Sur es por donde se llega; las salidas, en orden, son Este, Norte, Oeste y Sur.
export function ciudadConRotonda() {
  const { calle, elementos } = constructorDeCiudad()
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
  const delAnillo = calles4
    .flatMap(([, grados]) => [grados - 10, grados + 10])
    .map(grados => (grados + 360) % 360)
    .sort((a, b) => a - b)
  calle(
    1,
    { highway: 'secondary', junction: 'roundabout', name: 'Rotonda' },
    ...delAnillo.map(enElAnillo),
    enElAnillo(delAnillo[0]),
  )
  return elementos()
}

// Una calle que cambia de nombre a mitad de camino (o que pasa a ser una autopista), sin nada más que decidir.
export function ciudadConCambioDeCalle({ conAutopista }) {
  const { calle, elementos } = constructorDeCiudad()
  calle(1, { highway: 'secondary', name: 'Calle A' }, [0, 0], [500, 0])
  calle(
    2,
    conAutopista ? { highway: 'trunk', name: 'Autopista X' } : { highway: 'secondary', name: 'Calle B' },
    [500, 0],
    [1000, 0],
  )
  return elementos()
}
