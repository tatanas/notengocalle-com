import { RANKED_MODES } from '../../shared/ranked.js'
import { clickNext, exists, goHome, openPage, playRoundOfChoices, sleep, text } from '../support.js'

const seconds = hud => {
  const [, minutes, secs] = hud.match(/(\d+):(\d\d)/)
  return +minutes * 60 + +secs
}

// El cronómetro solo cuenta el tiempo de pensar, y el récord personal se guarda y se muestra.
export async function timer(browser, { check }) {
  const { page, errors } = await openPage(browser)
  await page.select('[data-length-group="Calles"]', '10')
  await page.click('[data-mode="st-name"]')
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

  await clickNext(page)
  await playRoundOfChoices(page, { thinkMs: 60 })
  const result = await text(page, '#panel')
  check(/\/ 10/.test(result), 'la ronda respeta el largo elegido (10 preguntas)')
  check(/Primera marca en rondas de 10/.test(result), 'la primera ronda queda como marca personal')

  await page.click('#again')
  await playRoundOfChoices(page, { thinkMs: 60 })
  check(/récord/i.test(await text(page, '#panel')), 'la segunda ronda se compara con el récord')

  await page.click('#menu')
  check(/¿Qué calle es\?\s+20/.test(await text(page, 'table.stats')), 'el progreso suma las 20 respuestas')
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
  check(!(await exists(page, '.maptoggle')), 'la ronda oficial no ofrece botones de ayuda')

  await goHome(page)
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('#myst [data-del]')])
  await page.click('[data-mode="st-find"]')
  await page.waitForSelector('.q-head')
  const withoutOwn = +(await text(page, '.q-head')).match(/de (\d+)/)[1]
  check(
    official === withoutOwn,
    `la ronda oficial no incluye la calle propia (${official} preguntas, como la práctica sin ella)`,
  )
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
    offered.length === RANKED_MODES.length && offered.every(id => RANKED_MODES.includes(id)),
    `los ${offered.length} juegos del menú tienen ronda oficial definida`,
  )
  const wrong = []
  for (const id of offered) {
    await goHome(page)
    await page.click(`[data-official="${id}"]`)
    const started = await page.waitForSelector('.q-head', { timeout: 8000 }).catch(() => null)
    const header = started ? await text(page, '.q-head') : ''
    const total = +(header.match(/de (\d+)/) || [])[1]
    const expected = { 'com-name': 34, 'com-all': 34, 'ch-all': 16 }[id] ?? 10
    if (total !== expected || !/Ronda oficial/.test(header)) wrong.push(`${id} (${total || 'no partió'})`)
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
    await clickNext(page)
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

// Salir de una ronda a medias pide confirmación; "seguir jugando" no pierde nada.
export async function leaveConfirm(browser, { check }) {
  const { page, errors } = await openPage(browser)
  await page.click('[data-mode="com-name"]')
  await page.waitForSelector('.opt:not([disabled])')
  await page.click('#btnHome')
  await page.waitForSelector('#confirmDialog[open]')
  check(/Perderás el avance/.test(await text(page, '#confirmDialog')), 'salir de una ronda pide confirmación')
  await page.click('#confirmCancel')
  await sleep(100)
  check(await exists(page, '.opt:not([disabled])'), '"Seguir jugando" deja la pregunta como estaba')
  check(await page.$eval('#screen', screen => screen.classList.contains('hidden')), 'y no vuelve al menú')

  await page.click('#btnHome')
  await page.waitForSelector('#confirmDialog[open]')
  await page.keyboard.press('Escape')
  await sleep(100)
  check(await exists(page, '.opt:not([disabled])'), 'Escape equivale a quedarse')

  await page.click('#btnHome')
  await page.waitForSelector('#confirmDialog[open]')
  await page.click('#confirmOk')
  await page.waitForSelector('[data-mode]', { visible: true })
  check(
    !(await exists(page, '.hud-active')) && !(await text(page, '#hud')),
    'confirmar vuelve al menú y borra la ronda',
  )

  await page.click('[data-official="com-name"]')
  await page.waitForSelector('.opt:not([disabled])')
  await page.click('#btnHome')
  await page.waitForSelector('#confirmDialog[open]')
  check(
    /ranking/.test(await text(page, '#confirmDialog')),
    'en una ronda oficial el aviso menciona el ranking',
  )
  await page.click('#confirmCancel')

  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

// En el celular las alternativas ocupan la mitad de la pantalla: la calle marcada debe quedar a la vista.
export async function mobileFit(browser, { check }) {
  const { page, errors } = await openPage(browser, { mobile: true })
  await page.click('[data-mode="st-name"]')
  let visible = 0
  const questions = 6
  for (let question = 0; question < questions; question++) {
    await page.waitForSelector('.opt:not([disabled])')
    await sleep(1300)
    const fits = await page.evaluate(() => {
      const mapBox = document.getElementById('map').getBoundingClientRect()
      const panelTop = document.getElementById('panel').getBoundingClientRect().top
      const paths = [...document.querySelectorAll('path[stroke="#2563eb"]')].filter(
        path => !path.getAttribute('stroke-dasharray'),
      )
      if (!paths.length) return null
      const rects = paths.map(path => path.getBoundingClientRect())
      const top = Math.min(...rects.map(rect => rect.top))
      const bottom = Math.max(...rects.map(rect => rect.bottom))
      return top >= mapBox.top - 4 && bottom <= panelTop + 4
    })
    if (fits) visible++
    await page.click('.opt:not([disabled])')
    await page.waitForSelector('#btnNext')
    await clickNext(page)
  }
  check(
    visible >= questions - 1,
    `la calle marcada queda sobre el panel en el celular (${visible} de ${questions})`,
  )
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

// El botón grande de cada juego es la ronda oficial y el chico, la práctica; el menú sigue el orden pedido.
export async function menuLayout(browser, { check }) {
  const { page, errors } = await openPage(browser)
  const headings = await page.$eval('.grid', grid =>
    [...grid.querySelectorAll('.card h3')].map(title => title.innerText.trim()),
  )
  const order = ['Calles', 'Comunas', 'Lugares emblemáticos', 'Ruteo', 'Ranking', 'Explorar']
  const positions = order.map(name => headings.findIndex(heading => heading.endsWith(name)))
  check(
    positions.every((position, i) => position >= 0 && (i === 0 || position > positions[i - 1])),
    `las tarjetas salen en el orden Calles, Comunas, Lugares emblemáticos, Ruteo, Ranking, Explorar (${headings.join(' · ')})`,
  )
  const big = await page.$$eval('.mode-row .mode.ranked', buttons => buttons.length)
  const small = await page.$$eval('.mode-row .practice', buttons =>
    buttons.map(button => button.innerText.trim()),
  )
  check(
    big === 15 && small.length === 15,
    `cada juego tiene botón grande (oficial) y chico (práctica): ${big} y ${small.length}`,
  )
  check(
    small.every(label => label === 'Práctica'),
    'el botón chico dice "Práctica"',
  )

  await page.click('[data-mode="com-name"]')
  await page.waitForSelector('.q-head', { timeout: 1500 })
  check(
    !/Ronda oficial/.test(await text(page, '.q-head')),
    'el botón chico abre una ronda de práctica, sin cuenta regresiva',
  )
  await goHome(page)
  await page.click('[data-official="com-name"]')
  await page.waitForSelector('.q-head', { timeout: 8000 })
  check(/Ronda oficial/.test(await text(page, '.q-head')), 'el botón grande abre la ronda oficial')
  check(!(await page.$eval('#countdown', box => !box.hidden)), 'la cuenta regresiva se cierra al empezar')
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

// Las rondas oficiales parten con 3, 2, 1; el reloj de la ronda no cuenta ese tiempo.
export async function countdown(browser, { check }) {
  const { page, errors } = await openPage(browser)
  await page.click('[data-official="com-name"]')
  await page.waitForSelector('#countdown:not([hidden])')
  const shown = () => page.$eval('.countdown-number', number => number.innerText)
  check((await shown()) === '3', 'la cuenta regresiva parte en 3')
  check(!(await exists(page, '.q-head')), 'mientras cuenta no se ve ninguna pregunta')
  await sleep(1150)
  check((await shown()) === '2', 'a los 1,1 segundos va en 2')
  const startedAt = Date.now()
  await page.waitForSelector('.q-head', { timeout: 6000 })
  const waited = Date.now() - startedAt
  check(
    waited > 1000 && waited < 2600,
    `la primera pregunta aparece a los 3 segundos (${waited} ms después del "2")`,
  )
  check(
    /0:0[01]/.test(await text(page, '#hud')),
    'el reloj de la ronda parte en cero: no cuenta la cuenta regresiva',
  )

  // Salir durante la cuenta regresiva no pide confirmación: todavía no hay nada que perder.
  await goHome(page)
  await page.click('[data-official="st-name"]')
  await page.waitForSelector('#countdown:not([hidden])')
  await page.click('#btnHome')
  await page.waitForSelector('#screen:not(.hidden) [data-mode]')
  check(!(await exists(page, '#confirmDialog[open]')), 'salir durante la cuenta no pide confirmación')
  check(await page.$eval('#countdown', box => box.hidden), 'y la cuenta regresiva desaparece')
  await sleep(3300)
  check(!(await exists(page, '.q-head')), 'tampoco parte una ronda fantasma después')
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

const mapButtons = page =>
  page.$$eval('button.maptoggle', buttons => buttons.map(button => button.innerText.trim()))
const metroLines = page => page.$$eval('.leaflet-metro-pane path', paths => paths.length)

// Un solo botón de modo fácil / difícil activa o apaga los bordes de comunas y las líneas del metro; solo en práctica.
export async function easyHard(browser, { check }) {
  const { page, errors } = await openPage(browser)
  await page.click('[data-mode="lm-loc"]')
  await page.waitForSelector('.q-head')
  await sleep(500)
  const buttons = await mapButtons(page)
  check(
    /Modo fácil/.test(buttons[0] ?? ''),
    `la práctica ofrece el botón de modo fácil / difícil (${buttons.join(' | ')})`,
  )
  check(/Ver nombres/.test(buttons[1] ?? ''), 'y debajo, "Ver nombres", donde sigue existiendo')
  check((await metroLines(page)) > 0, 'en modo fácil se dibujan las líneas del metro')
  await page.$eval('.maptoggle', button => button.click())
  await sleep(200)
  check(/Modo difícil/.test((await mapButtons(page))[0]), 'al tocarlo pasa a modo difícil')
  check((await metroLines(page)) === 0, 'en modo difícil no hay líneas del metro')

  await goHome(page)
  await page.reload({ waitUntil: 'networkidle2' })
  await page.click('[data-mode="com-name"]')
  await page.waitForSelector('.q-head')
  const comunas = await mapButtons(page)
  check(/Modo difícil/.test(comunas[0] ?? ''), 'el modo elegido se recuerda al volver a jugar')
  check(comunas.length === 1, 'en el juego de comunas ya no está "Ver nombres"')

  await goHome(page)
  await page.click('[data-official="lm-loc"]')
  await page.waitForSelector('#panel .q-head', { timeout: 8000 })
  check(
    (await mapButtons(page)).length === 0,
    'una ronda oficial no muestra ni el modo fácil / difícil ni "Ver nombres"',
  )
  check((await metroLines(page)) === 0, 'y se juega sin ayudas')
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

// Reiniciar una ronda oficial a medias, sin volver al menú.
export async function restartRound(browser, { check }) {
  const { page, errors } = await openPage(browser)
  const restartVisible = () => page.$eval('#btnRestart', button => !button.hidden)
  await page.click('[data-mode="com-name"]')
  await page.waitForSelector('.q-head')
  check(!(await restartVisible()), 'en la práctica no hay botón de reiniciar')

  await goHome(page)
  await page.click('[data-official="com-name"]')
  await page.waitForSelector('#countdown:not([hidden])')
  check(!(await restartVisible()), 'durante la cuenta regresiva tampoco')
  await page.waitForSelector('#panel .q-head', { timeout: 8000 })
  check(await restartVisible(), 'en una ronda oficial sí')

  await page.click('#btnRestart')
  check(!(await exists(page, '#confirmDialog[open]')), 'sin responder nada, reiniciar no pide confirmación')
  await page.waitForSelector('#countdown:not([hidden])')
  check(true, 'y vuelve a partir con la cuenta regresiva')
  await page.waitForSelector('#panel .q-head', { timeout: 8000 })

  await sleep(400)
  await page.click('.opt:not([disabled])')
  await clickNext(page)
  await page.waitForSelector('.opt:not([disabled])')
  await page.click('#btnRestart')
  await page.waitForSelector('#confirmDialog[open]')
  check(
    /no cuenta para el ranking/.test(await text(page, '#confirmDialog')),
    'con la ronda avanzada pide confirmación',
  )
  await page.click('#confirmCancel')
  await sleep(150)
  check(/Pregunta 2 de/.test(await text(page, '#panel .q-head')), '"Seguir jugando" conserva el avance')
  await page.click('#btnRestart')
  await page.waitForSelector('#confirmDialog[open]')
  await page.click('#confirmOk')
  await page.waitForSelector('#countdown:not([hidden])')
  await page.waitForSelector('#panel .q-head', { timeout: 8000 })
  check(/Pregunta 1 de/.test(await text(page, '#panel .q-head')), 'al confirmar la ronda parte de cero')
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

// Cada largo de ronda tiene su ranking: una ronda de 10 preguntas cae en la pestaña "10", no en la de 15.
export async function rankingCategories(browser, { check }) {
  const { page, errors } = await openPage(browser, { storage: { settings: { len: 10 } } })
  await page.evaluate(() =>
    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cata', password: 'clave-larga-1' }),
    }),
  )
  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForFunction(() => document.getElementById('btnAccount').innerText.includes('Cata'))
  await page.click('[data-official="st-name"]')
  await playRoundOfChoices(page)
  await page.waitForFunction(() => /Puesto/.test(document.getElementById('officialOutcome')?.innerText ?? ''))
  check(
    /con 10 preguntas/.test(await text(page, '#officialOutcome')),
    'el resultado dice en qué largo quedó (10 preguntas)',
  )

  await page.click('#outcomeRanking')
  await page.waitForSelector('table.board tr.me')
  const tabs = await page.$$eval('.tab', items =>
    items.map(item => item.innerText.replace(/\s+/g, ' ').trim()),
  )
  check(
    tabs.length === 5 && /^10/.test(tabs[0]) && /^Todas/.test(tabs[4]),
    `el ranking tiene pestañas 10, 15, 20, 30 y Todas (${tabs.join(' | ')})`,
  )
  check(/^10 1$/.test(tabs[0]), 'la pestaña "10" muestra que tiene 1 jugador')
  check(
    await page.$eval('.tab.on', tab => tab.dataset.category === '10'),
    'y se abre en la del largo recién jugado',
  )

  await page.$eval('[data-category="15"]', tab => tab.click())
  await page.waitForSelector('#rankBody p.muted')
  check(
    /Nadie ha jugado/.test(await text(page, '#rankBody')),
    'la pestaña de 15 preguntas está vacía: no se mezclan',
  )
  await page.$eval('[data-category="10"]', tab => tab.click())
  await page.waitForSelector('table.board tr.me')
  check(true, 'y la de 10 sigue mostrando la marca')

  await page.click('#rankPlay')
  await page.waitForSelector('#panel .q-head', { timeout: 8000 })
  check(
    /de 10$/.test((await text(page, '#panel .q-head')).split('\n')[0].trim()),
    'jugar desde el ranking usa el largo de la pestaña',
  )
  check(!errors.length, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}
