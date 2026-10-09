import { createApi } from '../../server/api.js'
import { connectProductionDatabase } from '../../server/database.js'

export default createApi(connectProductionDatabase())

export const config = {
  path: '/api/*',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
