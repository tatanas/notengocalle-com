import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const listFiles = directory =>
  readdirSync(directory, { withFileTypes: true }).flatMap(item =>
    item.isDirectory() ? listFiles(join(directory, item.name)) : [join(directory, item.name)],
  )

// Plugin de Vite: publica sw.js con la lista de archivos a guardar y una versión que cambia sola
// cuando cambia cualquiera de ellos (código, datos o librerías). Ya no hay que subir un número a mano.
export function serviceWorker({ source, publicDir }) {
  return {
    name: 'ntc-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const digest = createHash('sha256')
      const publicFiles = listFiles(publicDir).map(file => {
        digest.update(readFileSync(file))
        return '/' + relative(publicDir, file).replaceAll('\\', '/')
      })
      const builtFiles = Object.keys(bundle)
        .filter(file => file !== 'index.html')
        .map(file => '/' + file)
      builtFiles.forEach(file => digest.update(file))

      const build = {
        version: digest.digest('hex').slice(0, 12),
        files: ['/', ...builtFiles, ...publicFiles],
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const BUILD = ${JSON.stringify(build)}\n${readFileSync(source, 'utf8')}`,
      })
    },
  }
}
