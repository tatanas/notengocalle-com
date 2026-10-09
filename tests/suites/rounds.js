import { OFFICIAL_ROUNDS } from '../../shared/ranked.js'
import { exists, goHome, openPage, playRoundOfChoices, sleep, text } from '../support.js'

const seconds = hud => {
  const [, minutes, secs] = hud.match(/(\d+):(\d\d)/)
  return +minutes * 60 + +secs
}

// El cronómetro solo cuenta el tiempo de pensar, y el récord personal se guarda y se muestra.
export async function timer(browser, { check }) {
  const { page, errors } = await openPage(browser)
  await page.select('#setLen', '10')
  await page.click('[data-mode="com-name"]')
  await page.waitForSelector('.opt:not([disabled])')
  await sleep(1200)
  await page.click('.opt:not([disabled])')
  const atAnswer = seconds(await text(page, '#hud'))
  await sleep(2600)
  const afterReading = seconds(await text(page, '#hud'))
  check(
    atAnswer >= 1 && afterReading === atAnswer,
    `el reloj se detiene al responder (${atAnswer}s → ${afterReading}s)`,
  )

  await page.click('#btnNext')
  await playRoundOfChoices(page, { thinkMs: 60 })
  const result = await text(page, '#panel')
  check(/\/ 10/.test(result), 'la ronda respeta el largo elegido (10 preguntas)')
  check(/Primera marca en rondas de 10/.test(result), 'la primera ronda queda como marca personal')

  await page.click('#again')
  await playRoundOfChoices(page, { thinkMs: 60 })
  check(/récord/i.test(await text(page, '#panel')), 'la segunda ronda se compara con el récord')

  await page.click('#menu')
  check(/¿Qué comuna es\?\s+20/.test(await text(page, 'table.stats')), 'el progreso suma las 20 respuestas')
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

const OWN_STREET = {
  name: 'Calle de Prueba',
  km: 1.2,
  comunas: ['Providencia'],
  lines: [
    [
      [-33.43, -70.62],
      [-33.43, -70.61],
      [-33.431, -70.6],
    ],
  ],
}

// Una calle propia aparece en el menú y en la práctica, pero nunca en una ronda oficial.
export async function ownStreets(browser, { check }) {
  const { page, errors } = await openPage(browser, {
    storage: { myStreets: [OWN_STREET], settings: { len: 999 } },
  })
  check((await text(page, '#myst')).includes(OWN_STREET.name), 'la calle propia aparece en "Mis calles"')

  const streetsAsked = async official => {
    await goHome(page)
    await page.click(official ? '[data-official="st-find"]' : '[data-mode="st-find"]')
    await page.waitForSelector('.q-head')
    return +(await text(page, '.q-head')).match(/de (\d+)/)[1]
  }
  const practice = await streetsAsked(false)
  const official = await streetsAsked(true)
  check(official === 15, `la ronda oficial ignora los ajustes del jugador (${official} preguntas)`)
  check(!(await exists(page, '.chips input[data-key]')), 'la ronda oficial no ofrece ayudas opcionales')

  await goHome(page)
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('#myst [data-del]')])
  await page.click('[data-mode="st-find"]')
  await page.waitForSelector('.q-head')
  const withoutOwn = +(await text(page, '.q-head')).match(/de (\d+)/)[1]
  check(
    practice === withoutOwn + 1,
    `la práctica incluye la calle propia (${practice} con ella, ${withoutOwn} sin ella)`,
  )
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

// Cada juego con ranking debe poder iniciar su ronda oficial con el largo que el servidor espera.
export async function officialRounds(browser, { check }) {
  const { page, errors } = await openPage(browser, { storage: { settings: { scope: 'all', len: 10 } } })
  const offered = await page.$$eval('[data-official]', buttons =>
    buttons.map(button => button.dataset.official),
  )
  check(
    offered.length === Object.keys(OFFICIAL_ROUNDS).length && offered.every(id => id in OFFICIAL_ROUNDS),
    `los ${offered.length} juegos del menú tienen ronda oficial definida`,
  )
  const wrong = []
  for (const id of offered) {
    await goHome(page)
    await page.click(`[data-official="${id}"]`)
    await sleep(600)
    const header = (await exists(page, '.q-head')) ? await text(page, '.q-head') : ''
    const total = +(header.match(/de (\d+)/) || [])[1]
    if (total !== OFFICIAL_ROUNDS[id] || !/Ronda oficial/.test(header))
      wrong.push(`${id} (${total || 'no partió'})`)
  }
  check(
    !wrong.length,
    `todas parten con su largo oficial${wrong.length ? '; fallan: ' + wrong.join(', ') : ''}`,
  )
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

// Las fotos se insertan como HTML: el carrusel y el zoom dependen de un listener global.
export async function photos(browser, { check }) {
  const { page, errors } = await openPage(browser)
  await page.click('[data-mode="pn-photo"]')
  await page.waitForSelector('.ph img')
  for (let question = 0; question < 15 && !(await exists(page, '.phnav.next')); question++) {
    await page.click('.opt:not([disabled])')
    await page.click('#btnNext')
    await page.waitForSelector('.ph img')
  }
  const counter = () => text(page, '.phcount')
  const before = await counter()
  await page.click('.phnav.next')
  check((await counter()) !== before, `el carrusel avanza (${before} → ${await counter()})`)
  check(/Wikimedia|Panoramax/.test(await text(page, '.cred')), 'cada foto muestra su crédito')
  // La imagen viene de un servidor externo y puede no haber cargado: se dispara el clic sin depender de su tamaño.
  await page.$eval('.ph img', image => image.click())
  check(await exists(page, '.lightbox'), 'tocar la foto la amplía')
  await page.click('.lightbox')
  check(!(await exists(page, '.lightbox')), 'tocar de nuevo la cierra')
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}
