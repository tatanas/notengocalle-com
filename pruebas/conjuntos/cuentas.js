import {
  CAPTURAS,
  existe,
  irAlInicio,
  abrirPagina,
  jugarRondaDeAlternativas,
  dormir,
  texto,
} from '../apoyo.js'

const CLAVE_DE_PRUEBA = 'clave-de-prueba'

const botonDeCuenta = pagina => texto(pagina, '#btnAccount')
const esperarBotonDeCuenta = (pagina, esperado) =>
  pagina.waitForFunction(
    etiqueta => document.getElementById('btnAccount').innerText.includes(etiqueta),
    {},
    esperado,
  )

async function llenar(pagina, valores) {
  for (const [nombre, valor] of Object.entries(valores)) {
    const selector = `#accountDialog input[name="${nombre}"]`
    await pagina.$eval(selector, entrada => (entrada.value = ''))
    await pagina.type(selector, valor)
  }
  await pagina.click('#accountDialog form button.btn')
}

async function jugarRondaOficial(pagina) {
  await irAlInicio(pagina)
  await pagina.click('[data-official="st-name"]')
  await jugarRondaDeAlternativas(pagina)
}

const desenlace = pagina =>
  pagina.waitForFunction(() => !/Guardando/.test(document.getElementById('officialOutcome').innerText))
const errorDelDialogo = pagina =>
  pagina.waitForFunction(() => document.querySelector('#accountDialog .error')?.innerText)

// El recorrido completo de una cuenta: jugar sin ella, crearla, aparecer en el ranking, salir y entrar.
export async function cuentas(navegador, { verificar }) {
  const { page: pagina, context: contexto, errors: errores } = await abrirPagina(navegador)
  await esperarBotonDeCuenta(pagina, 'Entrar')
  verificar(true, 'sin sesión, la barra ofrece "Entrar"')

  await jugarRondaOficial(pagina)
  await desenlace(pagina)
  verificar(
    /sin cuenta/.test(await texto(pagina, '#officialOutcome')),
    'una ronda oficial sin cuenta avisa que aún no está en el ranking',
  )
  verificar(/20 preguntas|\/ 20/.test(await texto(pagina, '#panel')), 'la ronda oficial tiene 20 preguntas')

  await pagina.click('#outcomeLogin')
  await pagina.click('#accountDialog [data-view="register"]')
  await llenar(pagina, { nombre: 'Ana', clave: CLAVE_DE_PRUEBA })
  await esperarBotonDeCuenta(pagina, 'Ana')
  await pagina.waitForFunction(() => /Puesto 1/.test(document.getElementById('officialOutcome').innerText))
  verificar(true, 'la ronda jugada sin cuenta se sube al crearla (puesto 1 de 1)')
  verificar((await botonDeCuenta(pagina)).includes('Ana'), 'la barra muestra el nombre del usuario')

  await pagina.click('#outcomeRanking')
  await pagina.waitForSelector('table.board tr.me')
  verificar(
    /Ana/.test(await texto(pagina, 'table.board tr.me')),
    'el ranking del juego destaca la fila propia',
  )
  await pagina.screenshot({ path: CAPTURAS + 'ranking_mode.png' })

  await pagina.reload({ waitUntil: 'networkidle2' })
  await esperarBotonDeCuenta(pagina, 'Ana')
  verificar(true, 'la sesión sobrevive a recargar la página')

  await jugarRondaOficial(pagina)
  await pagina.waitForFunction(() => /Puesto 1/.test(document.getElementById('officialOutcome').innerText))
  verificar(
    /de 1 en el ranking/.test(await texto(pagina, '#officialOutcome')),
    'con sesión, la ronda oficial se guarda sola',
  )

  // Un segundo jugador, en otro navegador.
  const segundo = await abrirPagina(navegador)
  await segundo.page.click('#btnAccount')
  await segundo.page.click('#accountDialog [data-view="register"]')
  await llenar(segundo.page, { nombre: 'ana', clave: CLAVE_DE_PRUEBA })
  await errorDelDialogo(segundo.page)
  verificar(
    /ya está en uso/.test(await texto(segundo.page, '#accountDialog .error')),
    'no se puede registrar un nombre ya tomado',
  )
  await llenar(segundo.page, { nombre: 'Beto', clave: CLAVE_DE_PRUEBA })
  await segundo.page.waitForFunction(() => document.getElementById('btnAccount').innerText.includes('Beto'))
  await jugarRondaOficial(segundo.page)
  await segundo.page.waitForFunction(() =>
    /de 2 en el ranking/.test(document.getElementById('officialOutcome').innerText),
  )
  verificar(true, 'el segundo jugador entra a un ranking de 2')
  await segundo.page.click('#menu')
  await segundo.page.click('#goRanking')
  await segundo.page.select('#rankMode', '')
  await segundo.page.waitForSelector('table.board [data-open="st-name"]')
  verificar(
    /de 2/.test(await texto(segundo.page, 'table.board [data-open="st-name"]')),
    'el resumen de líderes muestra tu puesto en cada juego',
  )
  await segundo.page.screenshot({ path: CAPTURAS + 'ranking_leaders.png' })
  await segundo.page.close()

  await irAlInicio(pagina)
  await pagina.click('#btnAccount')
  await pagina.click('#logOut')
  await esperarBotonDeCuenta(pagina, 'Entrar')
  verificar(true, 'cerrar sesión vuelve a "Entrar"')

  await pagina.click('#btnAccount')
  await llenar(pagina, { nombre: 'Ana', clave: 'no-es-la-clave' })
  await errorDelDialogo(pagina)
  verificar(
    /incorrectos/.test(await texto(pagina, '#accountDialog .error')),
    'una clave incorrecta se rechaza con un mensaje claro',
  )
  await pagina.screenshot({ path: CAPTURAS + 'account_login.png' })

  let textoDeAlerta = ''
  pagina.once('dialog', async dialogo => {
    textoDeAlerta = dialogo.message()
    await dialogo.dismiss()
  })
  await pagina.click('#accountDialog [data-forgot]')
  await dormir(200)
  verificar(textoDeAlerta === 'pucha :(', '"Olvidé mi clave" muestra el aviso "pucha :("')
  await pagina.click('#accountDialog .dialog-close')

  await pagina.click('#btnAccount')
  await llenar(pagina, { nombre: 'Ana', clave: CLAVE_DE_PRUEBA })
  await esperarBotonDeCuenta(pagina, 'Ana')
  verificar(true, 'se puede volver a entrar con la clave')

  // El 401 de la clave incorrecta es esperado; cualquier otro error no.
  const inesperado = errores.filter(error => !/401/.test(error))
  verificar(
    !inesperado.length,
    `sin errores en la consola${inesperado.length ? ':\n      ' + inesperado.join('\n      ') : ''}`,
  )
  verificar(!(await existe(pagina, '#accountDialog[open]')), 'el diálogo queda cerrado al terminar')
  await dormir(100)
  await contexto.close()
}
