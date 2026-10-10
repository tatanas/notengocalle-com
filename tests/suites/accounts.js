import { SHOTS, exists, goHome, openPage, playRoundOfChoices, sleep, text } from '../support.js'

const PASSWORD = 'clave-de-prueba'

const accountButton = page => text(page, '#btnAccount')
const waitForAccountButton = (page, expected) =>
  page.waitForFunction(label => document.getElementById('btnAccount').innerText.includes(label), {}, expected)

async function fill(page, values) {
  for (const [name, value] of Object.entries(values)) {
    const selector = `#accountDialog input[name="${name}"]`
    await page.$eval(selector, input => (input.value = ''))
    await page.type(selector, value)
  }
  await page.click('#accountDialog form button.btn')
}

async function playOfficialRound(page) {
  await goHome(page)
  await page.click('[data-official="st-name"]')
  await playRoundOfChoices(page)
}

const outcome = page =>
  page.waitForFunction(() => !/Guardando/.test(document.getElementById('officialOutcome').innerText))
const dialogError = page =>
  page.waitForFunction(() => document.querySelector('#accountDialog .error')?.innerText)

// El recorrido completo de una cuenta: jugar sin ella, crearla, aparecer en el ranking, salir y entrar.
export async function accounts(browser, { check }) {
  const { page, context, errors } = await openPage(browser)
  await waitForAccountButton(page, 'Entrar')
  check(true, 'sin sesión, la barra ofrece "Entrar"')

  await playOfficialRound(page)
  await outcome(page)
  check(
    /sin cuenta/.test(await text(page, '#officialOutcome')),
    'una ronda oficial sin cuenta avisa que aún no está en el ranking',
  )
  check(/15 preguntas|\/ 15/.test(await text(page, '#panel')), 'la ronda oficial tiene 15 preguntas')

  await page.click('#outcomeLogin')
  await page.click('#accountDialog [data-view="register"]')
  await fill(page, { name: 'Ana', password: PASSWORD })
  await waitForAccountButton(page, 'Ana')
  await page.waitForFunction(() => /Puesto 1/.test(document.getElementById('officialOutcome').innerText))
  check(true, 'la ronda jugada sin cuenta se sube al crearla (puesto 1 de 1)')
  check((await accountButton(page)).includes('Ana'), 'la barra muestra el nombre del usuario')

  await page.click('#outcomeRanking')
  await page.waitForSelector('table.board tr.me')
  check(/Ana/.test(await text(page, 'table.board tr.me')), 'el ranking del juego destaca la fila propia')
  await page.screenshot({ path: SHOTS + 'ranking_mode.png' })

  await page.reload({ waitUntil: 'networkidle2' })
  await waitForAccountButton(page, 'Ana')
  check(true, 'la sesión sobrevive a recargar la página')

  await playOfficialRound(page)
  await page.waitForFunction(() => /Puesto 1/.test(document.getElementById('officialOutcome').innerText))
  check(
    /de 1 en el ranking/.test(await text(page, '#officialOutcome')),
    'con sesión, la ronda oficial se guarda sola',
  )

  // Un segundo jugador, en otro navegador.
  const second = await openPage(browser)
  await second.page.click('#btnAccount')
  await second.page.click('#accountDialog [data-view="register"]')
  await fill(second.page, { name: 'ana', password: PASSWORD })
  await dialogError(second.page)
  check(
    /ya está en uso/.test(await text(second.page, '#accountDialog .error')),
    'no se puede registrar un nombre ya tomado',
  )
  await fill(second.page, { name: 'Beto', password: PASSWORD })
  await second.page.waitForFunction(() => document.getElementById('btnAccount').innerText.includes('Beto'))
  await playOfficialRound(second.page)
  await second.page.waitForFunction(() =>
    /de 2 en el ranking/.test(document.getElementById('officialOutcome').innerText),
  )
  check(true, 'el segundo jugador entra a un ranking de 2')
  await second.page.click('#menu')
  await second.page.click('#goRanking')
  await second.page.select('#rankMode', '')
  await second.page.waitForSelector('table.board [data-open="st-name"]')
  check(
    /de 2/.test(await text(second.page, 'table.board [data-open="st-name"]')),
    'el resumen de líderes muestra tu puesto en cada juego',
  )
  await second.page.screenshot({ path: SHOTS + 'ranking_leaders.png' })
  await second.page.close()

  await goHome(page)
  await page.click('#btnAccount')
  await page.click('#logOut')
  await waitForAccountButton(page, 'Entrar')
  check(true, 'cerrar sesión vuelve a "Entrar"')

  await page.click('#btnAccount')
  await fill(page, { name: 'Ana', password: 'no-es-la-clave' })
  await dialogError(page)
  check(
    /incorrectos/.test(await text(page, '#accountDialog .error')),
    'una clave incorrecta se rechaza con un mensaje claro',
  )
  await page.screenshot({ path: SHOTS + 'account_login.png' })

  let alertText = ''
  page.once('dialog', async dialog => {
    alertText = dialog.message()
    await dialog.dismiss()
  })
  await page.click('#accountDialog [data-forgot]')
  await sleep(200)
  check(alertText === 'pucha :(', '"Olvidé mi clave" muestra el aviso "pucha :("')
  await page.click('#accountDialog .dialog-close')

  await page.click('#btnAccount')
  await fill(page, { name: 'Ana', password: PASSWORD })
  await waitForAccountButton(page, 'Ana')
  check(true, 'se puede volver a entrar con la clave')

  // El 401 de la clave incorrecta es esperado; cualquier otro error no.
  const unexpected = errors.filter(error => !/401/.test(error))
  check(
    !unexpected.length,
    `sin errores en la consola${unexpected.length ? ':\n      ' + unexpected.join('\n      ') : ''}`,
  )
  check(!(await exists(page, '#accountDialog[open]')), 'el diálogo queda cerrado al terminar')
  await sleep(100)
  await context.close()
}
