import { crearApi } from '../../servidor/api.js'
import { conectarBaseDeProduccion } from '../../servidor/baseDeDatos.js'

export default crearApi(conectarBaseDeProduccion())

export const config = {
  path: '/api/*',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
