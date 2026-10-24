import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const listarArchivos = carpeta =>
  readdirSync(carpeta, { withFileTypes: true }).flatMap(elemento =>
    elemento.isDirectory() ? listarArchivos(join(carpeta, elemento.name)) : [join(carpeta, elemento.name)],
  )

// Plugin de Vite: publica sw.js con la lista de archivos a guardar y una versión que cambia sola
// cuando cambia cualquiera de ellos (código, datos o librerías). Ya no hay que subir un número a mano.
export function serviceWorker({ source: fuente, publicDir: carpetaPublica }) {
  return {
    name: 'ntc-service-worker',
    apply: 'build',
    generateBundle(_, paquete) {
      const resumen = createHash('sha256')
      // El grafo vial de "Conducir libre" (solo desarrollo, decenas de MB) no se guarda para abrir sin conexión.
      const archivosPublicos = listarArchivos(carpetaPublica)
        .map(archivo => ({ archivo, ruta: '/' + relative(carpetaPublica, archivo).replaceAll('\\', '/') }))
        .filter(({ ruta }) => !ruta.startsWith('/data/grafo/'))
        .map(({ archivo, ruta }) => {
          resumen.update(readFileSync(archivo))
          return ruta
        })
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
