export const $ = (selector, padre = document) => padre.querySelector(selector)

const ENTIDADES_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escaparHtml = texto => String(texto).replace(/[&<>"']/g, caracter => ENTIDADES_HTML[caracter])

export function mezclar(elementos) {
  const resultado = elementos.slice()
  for (let i = resultado.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[resultado[i], resultado[j]] = [resultado[j], resultado[i]]
  }
  return resultado
}

export const elegir = elementos => elementos[Math.floor(Math.random() * elementos.length)]

export const mismoConjunto = (a, b) => a.length === b.length && a.every(x => b.includes(x))

export const formatearKm = km =>
  km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km'

export function formatearTiempo(ms) {
  const segundos = Math.round(ms / 1000)
  return Math.floor(segundos / 60) + ':' + String(segundos % 60).padStart(2, '0')
}

// Con milésimas (1:23,456) para el ranking, donde a igual número de aciertos gana el tiempo.
export function formatearTiempoExacto(ms) {
  const minutos = Math.floor(ms / 60000)
  const resto = String(ms % 60000).padStart(5, '0')
  return `${minutos}:${resto.slice(0, 2)},${resto.slice(2)}`
}
