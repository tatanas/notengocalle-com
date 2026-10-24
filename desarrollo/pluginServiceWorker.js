import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const listarArchivos = carpeta =>
  readdirSync(carpeta, { withFileTypes: true }).flatMap(elemento =>
    elemento.isDirectory() ? listarArchivos(join(carpeta, elemento.name)) : [join(carpeta, elemento.name)],
  )

// Los grafos de Ruta libre pesan megas cada uno: se bajan al jugar esa ruta (y el service worker los guarda entonces).
const RUTA_DE_LOS_ARCHIVOS_BAJO_DEMANDA = '/data/ruta-libre/'

// Plugin de Vite: publica sw.js con la lista de archivos a guardar y una versión que cambia sola
// cuando cambia cualquiera de ellos (código, datos o librerías). Ya no hay que subir un número a mano.
export function serviceWorker({ source: fuente, publicDir: carpetaPublica }) {
  return {
    name: 'ntc-service-worker',
    apply: 'build',
    generateBundle(_, paquete) {
      const resumen = createHash('sha256')
      const archivosPublicos = listarArchivos(carpetaPublica)
        .map(archivo => '/' + relative(carpetaPublica, archivo).replaceAll('\\', '/'))
        .filter(ruta => !ruta.startsWith(RUTA_DE_LOS_ARCHIVOS_BAJO_DEMANDA))
      archivosPublicos.forEach(ruta => resumen.update(readFileSync(join(carpetaPublica, ruta))))
      const archivosConstruidos = Object.keys(paquete)
        .filter(archivo => archivo !== 'index.html')
        .map(archivo => '/' + archivo)
      archivosConstruidos.forEach(archivo => resumen.update(archivo))

      const build = {
        version: resumen.digest('hex').slice(0, 12),
        files: ['/', ...archivosConstruidos, ...archivosPublicos],
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const BUILD = ${JSON.stringify(build)}\n${readFileSync(fuente, 'utf8')}`,
      })
    },
  }
}
