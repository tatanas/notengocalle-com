import { textoParaCompartir } from '../dominio/compartir.js'

const MS_DEL_AVISO_DE_COPIADO = 2000

// El menú de compartir del sistema (celular, Chrome y Safari en el computador) o, si no hay, copiar el texto.
async function compartir(texto, boton) {
  if (navigator.share) {
    try {
      await navigator.share({ text: texto })
      return
    } catch (error) {
      if (error.name === 'AbortError') return
    }
  }
  await navigator.clipboard.writeText(texto)
  const etiqueta = boton.querySelector('span')
  etiqueta.textContent = 'Texto copiado'
  setTimeout(() => (etiqueta.textContent = 'Compartir'), MS_DEL_AVISO_DE_COPIADO)
}

const ICONO_DE_COMPARTIR = `<svg class="icono-compartir" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
  fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/></svg>`

export const htmlDelBotonCompartir = () =>
  `<button class="btn" id="share">${ICONO_DE_COMPARTIR}<span>Compartir</span></button>`

// rondaActual() se lee al tocar el botón: así incluye el puesto en el ranking si ya llegó del servidor.
export function conectarBotonCompartir(boton, rondaActual) {
  boton.onclick = () => compartir(textoParaCompartir(rondaActual()), boton).catch(() => {})
}
