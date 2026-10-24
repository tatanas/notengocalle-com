// Rutas de verificación de la conducción libre (tools/grafo/misiones.mjs): de un lugar emblemático a otro (ids de `DATA.landmarks`).
export const MISIONES_DE_CONDUCCION = [
  { id: 'estadio-plaza', origen: 'l36', destino: 'l1' },
  { id: 'plaza-costanera', origen: 'l1', destino: 'l45' },
  { id: 'costanera-estadio', origen: 'l45', destino: 'l36' },
]

// "Estadio Nacional (selección chilena; …)" → "Estadio Nacional"; "Costanera Center / Gran Torre Santiago" → "Costanera Center".
export const nombreCortoDelLugar = nombre => nombre.split(/ \(| \/ /)[0]

// Los lugares que sirven para partir y llegar: un barrio sin límites precisos no tiene un punto al que llegar; solo valen los que
// son un lugar concreto (una plaza, un persa, un mercado).
const BARRIO_CON_PUNTO_CONCRETO = /^(Plaza|Persa|Mercado|Feria|Pueblo)/
export const esLugarDeRuteo = lugar =>
  /^l\d+$/.test(lugar.id) &&
  (lugar.cat !== 'Barrios' || BARRIO_CON_PUNTO_CONCRETO.test(lugar.name)) &&
  !/^Barrio /.test(lugar.name)
