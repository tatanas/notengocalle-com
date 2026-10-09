import { PHOTOS } from '../data/dataset.js'
import { escapeHtml } from '../core/util.js'

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`

function credit(photo) {
  if (photo.px) {
    const url = `https://api.panoramax.xyz/#focus=pic&pic=${encodeURIComponent(photo.px)}`
    return `Foto: ${escapeHtml(photo.a)} · ${escapeHtml(photo.l || 'CC BY-SA 4.0')} · ${link(url, 'Panoramax')}`
  }
  const url = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(photo.f)}`
  const license = photo.l ? ' · ' + escapeHtml(photo.l) : ''
  return `Foto: ${escapeHtml(photo.a)}${license} · ${link(url, 'Wikimedia Commons')}`
}

export const hasPhotos = key => !!PHOTOS[key]?.length

export const randomPhotoIndex = key => Math.floor(Math.random() * PHOTOS[key].length)

export function photoHtml(key, { start = 0, big = false } = {}) {
  const photos = PHOTOS[key]
  if (!photos?.length) return ''
  const index = start % photos.length
  const carousel =
    photos.length > 1
      ? `<button type="button" class="phnav prev" data-photo-step="-1" aria-label="Foto anterior">‹</button>
         <button type="button" class="phnav next" data-photo-step="1" aria-label="Foto siguiente">›</button>
         <span class="phcount">${index + 1}/${photos.length}</span>`
      : ''
  return `<div class="ph${big ? ' big' : ''}" data-key="${escapeHtml(key)}" data-i="${index}">
    <img src="${photos[index].u}" alt="" loading="lazy" data-photo-zoom>
    ${carousel}
    <div class="cred">${credit(photos[index])}</div></div>`
}

function stepPhoto(button) {
  const box = button.closest('.ph')
  const photos = PHOTOS[box.dataset.key]
  const index = (+box.dataset.i + +button.dataset.photoStep + photos.length) % photos.length
  box.dataset.i = index
  box.querySelector('img').src = photos[index].u
  box.querySelector('.cred').innerHTML = credit(photos[index])
  box.querySelector('.phcount').textContent = `${index + 1}/${photos.length}`
}

function zoomPhoto(image) {
  const lightbox = document.createElement('div')
  lightbox.className = 'lightbox'
  lightbox.innerHTML = `<img src="${image.src}" alt="">`
  lightbox.onclick = () => lightbox.remove()
  document.body.appendChild(lightbox)
}

// Las fotos se insertan como HTML en paneles y popups del mapa; un solo listener global las atiende a todas.
document.addEventListener('click', event => {
  const step = event.target.closest('[data-photo-step]')
  if (step) return stepPhoto(step)
  if (event.target.matches('[data-photo-zoom]')) zoomPhoto(event.target)
})
