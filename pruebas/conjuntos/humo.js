import {
  CAPTURAS,
  responderComoSea,
  clicEnSiguiente,
  existe,
  irAlInicio,
  abrirPagina,
  dormir,
} from '../apoyo.js'

// Conexiones mezcla 13 tipos de pregunta: se juegan más para pasar por todos.
// En el celular se prueba el diseño, no la lógica de cada juego (ya la prueba la versión de escritorio): una pregunta basta.
const preguntasPara = (id, celular) =>
  id === 'cx' ? (celular ? 3 : 14) : celular ? 1 : id.startsWith('rs-') ? 2 : 3
// Cuánto se espera, como máximo, a que aparezca "Siguiente" tras un paso. Los juegos paso a paso tardan más entre pasos.
const msDeEspera = id => (id.startsWith('rs-') ? 1900 : 800)
const PASOS_MAXIMOS_POR_PREGUNTA = 16

// Una pregunta puede pedir varios pasos (rutas) o varios intentos (completar el mapa).
async function responderPregunta(pagina, id) {
  for (let paso = 0; paso < PASOS_MAXIMOS_POR_PREGUNTA; paso++) {
    await responderComoSea(pagina, paso)
    const respondida = await pagina.waitForSelector('#btnNext', { timeout: msDeEspera(id) }).catch(() => null)
    if (respondida) return true
  }
  return false
}

// Recorre todos los juegos del menú respondiendo unas cuantas preguntas, y después Explorar.
// Falla si aparece un error de JavaScript, si algo local no carga o si la página se recarga sola.
// `only`: prefijos de los ids de juego que se juegan (para probar solo lo que cambió); sin él, todos.
export async function humo(navegador, { verificar }, { celular = false, solo = null } = {}) {
  const prefijo = celular ? 'm_' : ''
  const {
    page: pagina,
    errors: errores,
    reloads: recargas,
    during: durante,
  } = await abrirPagina(navegador, { celular })
  await pagina.screenshot({ path: CAPTURAS + prefijo + 'home.png' })

  const conPractica = [
    ...new Set(await pagina.$$eval('[data-mode]', botones => botones.map(boton => boton.dataset.mode))),
  ]
  // Los juegos sin práctica (comunas) se juegan con su ronda oficial.
  const soloOficiales = [
    ...new Set(
      await pagina.$$eval('[data-official]', botones => botones.map(boton => boton.dataset.official)),
    ),
  ].filter(id => !conPractica.includes(id))
  const ofrecidos = [...conPractica, ...soloOficiales]
  verificar(ofrecidos.length >= 15, `el menú ofrece ${ofrecidos.length} juegos`)
  const modos = solo ? ofrecidos.filter(id => solo.some(prefijo => id.startsWith(prefijo))) : ofrecidos

  const sinResponder = []
  for (const id of modos) {
    // Street View carga el script de Google y gasta cuota: se prueba a mano.
    if (id.startsWith('sv-')) continue
    durante(id)
    await irAlInicio(pagina)
    const oficial = soloOficiales.includes(id)
    await pagina.click(oficial ? `[data-official="${id}"]` : `[data-mode="${id}"]`)
    await pagina
      .waitForSelector(oficial ? '#panel .q-head' : '.q-head, #screen:not(.hidden)', {
        timeout: oficial ? 8000 : 3000,
      })
      .catch(() => {})
    await dormir(200)
    if (!(await pagina.$eval('#screen', pantalla => pantalla.classList.contains('hidden')))) {
      console.log(`  · ${id}: sin elementos, se omite`)
      continue
    }
    if (await existe(pagina, '#frSel')) continue // modo de estudio: no hace preguntas
    for (let pregunta = 0; pregunta < preguntasPara(id, celular); pregunta++) {
      if (pregunta === 0) await pagina.screenshot({ path: `${CAPTURAS}${prefijo}${id}_q.png` })
      if (!(await responderPregunta(pagina, id))) {
        sinResponder.push(id)
        break
      }
      if (pregunta === 0) await pagina.screenshot({ path: `${CAPTURAS}${prefijo}${id}_a.png` })
      await clicEnSiguiente(pagina)
      await dormir(250)
    }
  }
  verificar(
    !sinResponder.length,
    `todos los juegos aceptan respuestas${sinResponder.length ? ' (fallan: ' + sinResponder.join(', ') + ')' : ''}`,
  )

  durante('explorar')
  await irAlInicio(pagina)
  await pagina.click('#btnExplorar')
  await dormir(1500)
  await pagina.screenshot({ path: CAPTURAS + prefijo + 'explore.png' })
  await pagina.evaluate(() => {
    for (const id of ['ex-metro', 'ex-streets']) document.getElementById(id).click()
    document.querySelector('[data-cat="Universidades"]').click()
  })
  await dormir(1200)
  await pagina.screenshot({ path: CAPTURAS + prefijo + 'explore_layers.png' })
  verificar(await existe(pagina, '#ex-q'), 'Explorar abre con su buscador')

  await irAlInicio(pagina)
  verificar(await existe(pagina, '[data-mode]'), 'se puede volver al menú')
  verificar(
    !errores.length,
    `sin errores en la consola${errores.length ? ':\n      ' + errores.join('\n      ') : ''}`,
  )
  verificar(recargas() === 0, 'la página no se recargó sola')
  await pagina.close()
}
