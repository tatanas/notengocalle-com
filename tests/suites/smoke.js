import { SHOTS, answerSomehow, exists, goHome, openPage, sleep } from '../support.js'

// Conexiones mezcla 13 tipos de pregunta: se juegan más para pasar por todos.
const questionsFor = id => (id === 'cx' ? 14 : id.startsWith('rs-') ? 2 : 3)
// Los juegos paso a paso esperan un momento entre un paso y el siguiente.
const settleMs = id => (id.startsWith('rs-') ? 1900 : 700)
const MAX_STEPS_PER_QUESTION = 16

// Una pregunta puede pedir varios pasos (rutas) o varios intentos (completar el mapa).
async function answerQuestion(page, id) {
  for (let step = 0; step < MAX_STEPS_PER_QUESTION; step++) {
    await answerSomehow(page)
    await sleep(settleMs(id))
    if (await exists(page, '#btnNext')) return true
  }
  return false
}

// Recorre todos los juegos del menú respondiendo unas cuantas preguntas, y después Explorar.
// Falla si aparece un error de JavaScript, si algo local no carga o si la página se recarga sola.
export async function smoke(browser, { check }, { mobile = false, retired = false } = {}) {
  const prefix = (mobile ? 'm_' : '') + (retired ? 'r_' : '')
  const { page, errors, reloads, during } = await openPage(browser, {
    mobile,
    path: retired ? '/?retirados' : '/',
  })
  await page.screenshot({ path: SHOTS + prefix + 'home.png' })

  const modes = await page.$$eval('[data-mode]', buttons => buttons.map(button => button.dataset.mode))
  check(modes.length >= (retired ? 30 : 15), `el menú ofrece ${modes.length} juegos`)

  const unanswered = []
  for (const id of modes) {
    during(id)
    await goHome(page)
    await page.click(`[data-mode="${id}"]`)
    await sleep(900)
    if (!(await page.$eval('#screen', screen => screen.classList.contains('hidden')))) {
      console.log(`  · ${id}: sin elementos, se omite`)
      continue
    }
    if (await exists(page, '#frSel')) continue // modo de estudio: no hace preguntas
    for (let question = 0; question < questionsFor(id); question++) {
      if (question === 0) await page.screenshot({ path: `${SHOTS}${prefix}${id}_q.png` })
      if (!(await answerQuestion(page, id))) {
        unanswered.push(id)
        break
      }
      if (question === 0) await page.screenshot({ path: `${SHOTS}${prefix}${id}_a.png` })
      await page.click('#btnNext')
      await sleep(500)
    }
  }
  check(
    !unanswered.length,
    `todos los juegos aceptan respuestas${unanswered.length ? ' (fallan: ' + unanswered.join(', ') + ')' : ''}`,
  )

  during('explorar')
  await goHome(page)
  await page.click('#goExplore')
  await sleep(1500)
  await page.screenshot({ path: SHOTS + prefix + 'explore.png' })
  await page.evaluate(() => {
    for (const id of ['ex-metro', 'ex-streets']) document.getElementById(id).click()
    document.querySelector('[data-cat="Universidades"]').click()
  })
  await sleep(1200)
  await page.screenshot({ path: SHOTS + prefix + 'explore_layers.png' })
  check(await exists(page, '#ex-q'), 'Explorar abre con su buscador')

  await goHome(page)
  check(await exists(page, '[data-mode]'), 'se puede volver al menú')
  check(
    !errors.length,
    `sin errores en la consola${errors.length ? ':\n      ' + errors.join('\n      ') : ''}`,
  )
  check(reloads() === 0, 'la página no se recargó sola')
  await page.close()
}
