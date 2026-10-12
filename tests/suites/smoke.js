import { SHOTS, answerSomehow, clickNext, exists, goHome, openPage, sleep } from '../support.js'

// Conexiones mezcla 13 tipos de pregunta: se juegan más para pasar por todos.
// En el celular se prueba el diseño, no la lógica de cada juego (ya la prueba la versión de escritorio): una pregunta basta.
const questionsFor = (id, mobile) =>
  id === 'cx' ? (mobile ? 3 : 14) : mobile ? 1 : id.startsWith('rs-') ? 2 : 3
// Cuánto se espera, como máximo, a que aparezca "Siguiente" tras un paso. Los juegos paso a paso tardan más entre pasos.
const settleMs = id => (id.startsWith('rs-') ? 1900 : 800)
const MAX_STEPS_PER_QUESTION = 16

// Una pregunta puede pedir varios pasos (rutas) o varios intentos (completar el mapa).
async function answerQuestion(page, id) {
  for (let step = 0; step < MAX_STEPS_PER_QUESTION; step++) {
    await answerSomehow(page, step)
    const answered = await page.waitForSelector('#btnNext', { timeout: settleMs(id) }).catch(() => null)
    if (answered) return true
  }
  return false
}

// Recorre todos los juegos del menú respondiendo unas cuantas preguntas, y después Explorar.
// Falla si aparece un error de JavaScript, si algo local no carga o si la página se recarga sola.
// `only`: prefijos de los ids de juego que se juegan (para probar solo lo que cambió); sin él, todos.
export async function smoke(browser, { check }, { mobile = false, only = null } = {}) {
  const prefix = mobile ? 'm_' : ''
  const { page, errors, reloads, during } = await openPage(browser, { mobile })
  await page.screenshot({ path: SHOTS + prefix + 'home.png' })

  const offered = await page.$$eval('[data-mode]', buttons => buttons.map(button => button.dataset.mode))
  check(offered.length >= 15, `el menú ofrece ${offered.length} juegos`)
  const modes = only ? offered.filter(id => only.some(prefix => id.startsWith(prefix))) : offered

  const unanswered = []
  for (const id of modes) {
    during(id)
    await goHome(page)
    await page.click(`[data-mode="${id}"]`)
    await page.waitForSelector('.q-head, #screen:not(.hidden)', { timeout: 3000 }).catch(() => {})
    await sleep(200)
    if (!(await page.$eval('#screen', screen => screen.classList.contains('hidden')))) {
      console.log(`  · ${id}: sin elementos, se omite`)
      continue
    }
    if (await exists(page, '#frSel')) continue // modo de estudio: no hace preguntas
    for (let question = 0; question < questionsFor(id, mobile); question++) {
      if (question === 0) await page.screenshot({ path: `${SHOTS}${prefix}${id}_q.png` })
      if (!(await answerQuestion(page, id))) {
        unanswered.push(id)
        break
      }
      if (question === 0) await page.screenshot({ path: `${SHOTS}${prefix}${id}_a.png` })
      await clickNext(page)
      await sleep(250)
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
