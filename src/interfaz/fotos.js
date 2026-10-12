import { FOTOS } from '../datos/datos.js'
import { escaparHtml } from '../nucleo/utilidades.js'

const enlace = (href, texto) => `<a href="${href}" target="_blank" rel="noopener">${texto}</a>`

function credito(foto) {
  if (foto.px) {
    const url = `https://api.panoramax.xyz/#focus=pic&pic=${encodeURIComponent(foto.px)}`
    return `Foto: ${escaparHtml(foto.a)} · ${escaparHtml(foto.l || 'CC BY-SA 4.0')} · ${enlace(url, 'Panoramax')}`
  }
  const url = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(foto.f)}`
  const licencia = foto.l ? ' · ' + escaparHtml(foto.l) : ''
  return `Foto: ${escaparHtml(foto.a)}${licencia} · ${enlace(url, 'Wikimedia Commons')}`
}

export const tieneFotos = llave => !!FOTOS[llave]?.length

export const indiceDeFotoAlAzar = llave => Math.floor(Math.random() * FOTOS[llave].length)

export function htmlDeFoto(llave, { start: comienzo = 0, big: grandes = false } = {}) {
  const fotos = FOTOS[llave]
  if (!fotos?.length) return ''
  const indice = comienzo % fotos.length
  const carrusel =
    fotos.length > 1
      ? `<button type="button" class="phnav prev" data-photo-step="-1" aria-label="Foto anterior">‹</button>
         <button type="button" class="phnav next" data-photo-step="1" aria-label="Foto siguiente">›</button>
         <span class="phcount">${indice + 1}/${fotos.length}</span>`
      : ''
  return `<div class="ph${grandes ? ' big' : ''}" data-key="${escaparHtml(llave)}" data-i="${indice}">
    <img src="${fotos[indice].u}" alt="" loading="lazy" data-photo-zoom>
    ${carrusel}
    <div class="cred">${credito(fotos[indice])}</div></div>`
}

function pasarFoto(boton) {
  const caja = boton.closest('.ph')
  const fotos = FOTOS[caja.dataset.key]
  const indice = (+caja.dataset.i + +boton.dataset.photoStep + fotos.length) % fotos.length
  caja.dataset.i = indice
  caja.querySelector('img').src = fotos[indice].u
  caja.querySelector('.cred').innerHTML = credito(fotos[indice])
  caja.querySelector('.phcount').textContent = `${indice + 1}/${fotos.length}`
}

function ampliarFoto(imagen) {
  const visor = document.createElement('div')
  visor.className = 'lightbox'
  visor.innerHTML = `<img src="${imagen.src}" alt="">`
  visor.onclick = () => visor.remove()
  document.body.appendChild(visor)
}

// Las fotos se insertan como HTML en paneles y popups del mapa; un solo listener global las atiende a todas.
document.addEventListener('click', evento => {
  const paso = evento.target.closest('[data-photo-step]')
  if (paso) return pasarFoto(paso)
  if (evento.target.matches('[data-photo-zoom]')) ampliarFoto(evento.target)
})
