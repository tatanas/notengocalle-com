import { MODOS_OFICIALES } from '../../compartido/oficial.js'
import {
  clicEnSiguiente,
  existe,
  irAlInicio,
  abrirPagina,
  jugarRondaDeAlternativas,
  dormir,
  responderComoSea,
  texto,
} from '../apoyo.js'

const segundos = indicador => {
  const [, minutos, segs] = indicador.match(/(\d+):(\d\d)/)
  return +minutos * 60 + +segs
}

// El cronómetro solo cuenta el tiempo de pensar, y el récord personal se guarda y se muestra.
export async function cronometro(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador)
  await pagina.select('[data-length-group="Calles"]', '20')
  await pagina.click('[data-mode="st-name"]')
  await pagina.waitForSelector('.opt:not([disabled])')
  await dormir(1200)
  await pagina.click('.opt:not([disabled])')
  const alResponder = segundos(await texto(pagina, '#hud'))
  await dormir(2600)
  const despuesDeLeer = segundos(await texto(pagina, '#hud'))
  verificar(
    alResponder >= 1 && despuesDeLeer === alResponder,
    `el reloj se detiene al responder (${alResponder}s → ${despuesDeLeer}s)`,
  )

  await clicEnSiguiente(pagina)
  await jugarRondaDeAlternativas(pagina, { thinkMs: 60 })
  const resultado = await texto(pagina, '#panel')
  verificar(/\/ 20/.test(resultado), 'la ronda respeta el largo elegido (20 preguntas)')
  verificar(/Primera marca en rondas de 20/.test(resultado), 'la primera ronda queda como marca personal')

  await pagina.click('#again')
  await jugarRondaDeAlternativas(pagina, { thinkMs: 60 })
  verificar(/récord/i.test(await texto(pagina, '#panel')), 'la segunda ronda se compara con el récord')

  await pagina.click('#btnProgreso')
  await pagina.waitForSelector('table.stats', { timeout: 3000 })
  verificar(
    /¿Qué calle es esta\?\s+40/.test(await texto(pagina, 'table.stats')),
    'el progreso suma las 40 respuestas',
  )
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

const CALLE_PROPIA = {
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
export async function callesPropias(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador, {
    storage: { myStreets: [CALLE_PROPIA], settings: { len: 999 } },
  })
  verificar(
    (await texto(pagina, '#myst')).includes(CALLE_PROPIA.name),
    'la calle propia aparece en "Mis calles"',
  )

  const callesPreguntadas = async rondaOficial => {
    await irAlInicio(pagina)
    await pagina.click(rondaOficial ? '[data-official="st-find"]' : '[data-mode="st-find"]')
    await pagina.waitForSelector('.q-head')
    return +(await texto(pagina, '.q-head')).match(/de (\d+)/)[1]
  }
  const practica = await callesPreguntadas(false)
  const rondaOficial = await callesPreguntadas(true)
  verificar(!(await existe(pagina, '.maptoggle')), 'la ronda oficial no ofrece botones de ayuda')

  await irAlInicio(pagina)
  await Promise.all([
    pagina.waitForNavigation({ waitUntil: 'networkidle2' }),
    pagina.click('#myst [data-del]'),
  ])
  await pagina.click('[data-mode="st-find"]')
  await pagina.waitForSelector('.q-head')
  const sinPropias = +(await texto(pagina, '.q-head')).match(/de (\d+)/)[1]
  verificar(
    rondaOficial === sinPropias,
    `la ronda oficial no incluye la calle propia (${rondaOficial} preguntas, como la práctica sin ella)`,
  )
  verificar(
    practica === sinPropias + 1,
    `la práctica incluye la calle propia (${practica} con ella, ${sinPropias} sin ella)`,
  )
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

// Cada juego con ranking debe poder iniciar su ronda oficial con el largo que el servidor espera.
export async function rondasOficiales(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador, {
    storage: { settings: { scope: 'all', len: 20 } },
  })
  // Street View carga el script de Google y gasta cuota: se prueba a mano.
  const ofrecidos = (
    await pagina.$$eval('[data-official]', botones => botones.map(boton => boton.dataset.official))
  ).filter(id => !id.startsWith('sv-'))
  const oficialesSinStreetView = MODOS_OFICIALES.filter(id => !id.startsWith('sv-'))
  verificar(
    ofrecidos.length === oficialesSinStreetView.length && ofrecidos.every(id => MODOS_OFICIALES.includes(id)),
    `los ${ofrecidos.length} juegos del menú tienen ronda oficial definida`,
  )
  const incorrectas = []
  for (const id of ofrecidos) {
    await irAlInicio(pagina)
    await pagina.click(`[data-official="${id}"]`)
    const iniciado = await pagina.waitForSelector('.q-head', { timeout: 8000 }).catch(() => null)
    const encabezado = iniciado ? await texto(pagina, '.q-head') : ''
    const total = +(encabezado.match(/de (\d+)/) || [])[1]
    // Las comunas se piden según el alcance elegido (aquí, toda la RM: 52).
    const esperado = { 'com-name': 52, 'com-all': 52, 'ch-all': 16, 'ch-find': 16 }[id] ?? 20
    if (total !== esperado || !/Ronda oficial/.test(encabezado))
      incorrectas.push(`${id} (${total || 'no partió'})`)
  }
  verificar(
    !incorrectas.length,
    `todas parten con su largo oficial${incorrectas.length ? '; fallan: ' + incorrectas.join(', ') : ''}`,
  )
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

// Las fotos se insertan como HTML: el carrusel y el zoom dependen de un listener global.
export async function fotos(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador)
  await pagina.click('[data-official="pn-photo"]')
  await pagina.waitForSelector('.ph img', { timeout: 8000 })
  for (let pregunta = 0; pregunta < 20 && !(await existe(pagina, '.phnav.next')); pregunta++) {
    await pagina.click('.opt:not([disabled])')
    await clicEnSiguiente(pagina)
    await pagina.waitForSelector('.ph img')
  }
  const contador = () => texto(pagina, '.phcount')
  const antes = await contador()
  await pagina.click('.phnav.next')
  verificar((await contador()) !== antes, `el carrusel avanza (${antes} → ${await contador()})`)
  verificar(/Wikimedia|Panoramax/.test(await texto(pagina, '.cred')), 'cada foto muestra su crédito')
  // La imagen viene de un servidor externo y puede no haber cargado: se dispara el clic sin depender de su tamaño.
  await pagina.$eval('.ph img', imagen => imagen.click())
  verificar(await existe(pagina, '.lightbox'), 'tocar la foto la amplía')
  await pagina.click('.lightbox')
  verificar(!(await existe(pagina, '.lightbox')), 'tocar de nuevo la cierra')
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

// Salir de una ronda a medias pide confirmación; "seguir jugando" no pierde nada.
export async function confirmarSalida(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador)
  await pagina.click('[data-mode="st-name"]')
  await pagina.waitForSelector('.opt:not([disabled])')
  await pagina.click('#btnHome')
  await pagina.waitForSelector('#confirmDialog[open]')
  verificar(
    /Perderás el avance/.test(await texto(pagina, '#confirmDialog')),
    'salir de una ronda pide confirmación',
  )
  await pagina.click('#confirmCancel')
  await dormir(100)
  verificar(await existe(pagina, '.opt:not([disabled])'), '"Seguir jugando" deja la pregunta como estaba')
  verificar(
    await pagina.$eval('#screen', pantalla => pantalla.classList.contains('hidden')),
    'y no vuelve al menú',
  )

  await pagina.click('#btnHome')
  await pagina.waitForSelector('#confirmDialog[open]')
  await pagina.keyboard.press('Escape')
  await dormir(100)
  verificar(await existe(pagina, '.opt:not([disabled])'), 'Escape equivale a quedarse')

  await pagina.click('#btnHome')
  await pagina.waitForSelector('#confirmDialog[open]')
  await pagina.click('#confirmOk')
  await pagina.waitForSelector('[data-mode]', { visible: true })
  verificar(
    !(await existe(pagina, '.hud-active')) && !(await texto(pagina, '#hud')),
    'confirmar vuelve al menú y borra la ronda',
  )

  await pagina.click('[data-official="com-name"]')
  await pagina.waitForSelector('.opt:not([disabled])')
  await pagina.click('#btnHome')
  await pagina.waitForSelector('#confirmDialog[open]')
  verificar(
    /ranking/.test(await texto(pagina, '#confirmDialog')),
    'en una ronda oficial el aviso menciona el ranking',
  )
  await pagina.click('#confirmCancel')

  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

// En el celular las alternativas ocupan la mitad de la pantalla: la calle marcada debe quedar a la vista.
export async function ajusteCelular(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador, { celular: true })
  await pagina.click('[data-mode="st-name"]')
  let visible = 0
  const preguntas = 6
  for (let pregunta = 0; pregunta < preguntas; pregunta++) {
    await pagina.waitForSelector('.opt:not([disabled])')
    await dormir(1300)
    const encuadres = await pagina.evaluate(() => {
      const cajaDelMapa = document.getElementById('map').getBoundingClientRect()
      const arribaDelPanel = document.getElementById('panel').getBoundingClientRect().top
      const caminos = [...document.querySelectorAll('path[stroke="#2563eb"]')].filter(
        camino => !camino.getAttribute('stroke-dasharray'),
      )
      if (!caminos.length) return null
      const rectangulos = caminos.map(camino => camino.getBoundingClientRect())
      const arriba = Math.min(...rectangulos.map(rectangulo => rectangulo.top))
      const abajo = Math.max(...rectangulos.map(rectangulo => rectangulo.bottom))
      return arriba >= cajaDelMapa.top - 4 && abajo <= arribaDelPanel + 4
    })
    if (encuadres) visible++
    await pagina.click('.opt:not([disabled])')
    await pagina.waitForSelector('#btnNext')
    await clicEnSiguiente(pagina)
  }
  verificar(
    visible >= preguntas - 1,
    `la calle marcada queda sobre el panel en el celular (${visible} de ${preguntas})`,
  )
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

// El botón grande de cada juego es la ronda oficial y el chico, la práctica; el menú sigue el orden pedido.
export async function disenoMenu(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador)
  const titulos = await pagina.$eval('.grid', cuadricula =>
    [...cuadricula.querySelectorAll('.card h3')].map(titulo => titulo.innerText.trim()),
  )
  const orden = ['Calles', 'Comunas', 'Lugares emblemáticos', 'Ruteo']
  const posiciones = orden.map(nombre =>
    titulos.findIndex(encabezadoDeTarjeta => encabezadoDeTarjeta.endsWith(nombre)),
  )
  verificar(
    posiciones.every((posicion, i) => posicion >= 0 && (i === 0 || posicion > posiciones[i - 1])),
    `las tarjetas salen en el orden Calles, Comunas, Lugares emblemáticos, Ruteo (${titulos.join(' · ')})`,
  )
  verificar(
    titulos.some(encabezadoDeTarjeta => encabezadoDeTarjeta.endsWith('Metro')),
    'el metro tiene su propia tarjeta de juegos',
  )
  const categorias = await pagina.$$eval('#setCats label', etiquetas =>
    etiquetas.map(etiqueta => etiqueta.innerText.trim()),
  )
  verificar(!categorias.includes('Metro'), 'y ya no es una categoría de los lugares emblemáticos')
  // Street View solo aparece si hay llave de Google: se cuenta aparte (un botón oficial por nivel, sin práctica).
  // Comunas, Chile y Parques nacionales no tienen práctica; en Metro y Lugares emblemáticos la práctica no va al lado
  // sino abajo, con las líneas o categorías elegidas.
  const grandes = await pagina.$$eval(
    '.mode-row .mode.ranked',
    botones => botones.filter(boton => !boton.dataset.official.startsWith('sv-')).length,
  )
  const chicos = await pagina.$$eval('.mode-row .practice', botones =>
    botones.map(boton => boton.innerText.trim()),
  )
  const sinStreetView = MODOS_OFICIALES.filter(id => !id.startsWith('sv-'))
  const cantidadEsperada = sinStreetView.length
  const chicosEsperados = sinStreetView.filter(
    id => !['mt-', 'lm-', 'com-', 'ch-', 'pn-'].some(prefijo => id.startsWith(prefijo)),
  ).length
  verificar(
    grandes === cantidadEsperada && chicos.length === chicosEsperados,
    `cada juego tiene botón grande (oficial) y chico (práctica), salvo metro, lugares, comunas, Chile y parques: ${grandes} y ${chicos.length}`,
  )
  verificar(
    !(await existe(pagina, '[data-mode^="com-"], [data-mode^="ch-"], [data-mode^="pn-"]')),
    'comunas, Chile y parques nacionales no tienen práctica',
  )
  const practicaDelMetro = await pagina.$$eval(
    '.card .separador ~ .modes [data-mode^="mt-"]',
    botones => botones.length,
  )
  verificar(practicaDelMetro === 2, 'el metro tiene su subsección de práctica con los dos juegos')
  const practicaDeLugares = await pagina.$$eval(
    '.card .separador ~ .modes [data-mode^="lm-"]',
    botones => botones.length,
  )
  verificar(
    practicaDeLugares === 2,
    'los lugares emblemáticos tienen su subsección de práctica con los dos juegos',
  )
  verificar(
    chicos.every(etiqueta => etiqueta === '🏋️'),
    'el botón chico es la pesa 🏋️ (práctica)',
  )

  await pagina.click('[data-mode="lm-loc"]')
  await pagina.waitForSelector('.q-head', { timeout: 1500 })
  verificar(
    !/Ronda oficial/.test(await texto(pagina, '.q-head')),
    'el botón chico abre una ronda de práctica, sin cuenta regresiva',
  )
  await irAlInicio(pagina)
  await pagina.click('[data-official="com-name"]')
  await pagina.waitForSelector('.q-head', { timeout: 8000 })
  verificar(/Ronda oficial/.test(await texto(pagina, '.q-head')), 'el botón grande abre la ronda oficial')
  verificar(
    !(await pagina.$eval('#countdown', caja => !caja.hidden)),
    'la cuenta regresiva se cierra al empezar',
  )
  await irAlInicio(pagina)
  verificar(
    (await pagina.$$eval('#btnRanking, #btnExplorar, #btnProgreso', botones => botones.length)) === 3,
    'Ranking, Explorar y Mi progreso están en la barra superior',
  )
  await pagina.click('#btnProgreso')
  await pagina.waitForSelector('#resetStats', { timeout: 2000 })
  verificar(
    (await pagina.$eval('.pestana.activa', pestana => pestana.dataset.pantalla)) === 'progress',
    'Mi progreso abre su propia página, con su pestaña marcada',
  )
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

// Las rondas oficiales parten con 3, 2, 1; el reloj de la ronda no cuenta ese tiempo.
export async function cuentaRegresiva(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador)
  await pagina.click('[data-official="com-name"]')
  await pagina.waitForSelector('#countdown:not([hidden])')
  const mostrado = () => pagina.$eval('.countdown-number', numero => numero.innerText)
  verificar((await mostrado()) === '3', 'la cuenta regresiva parte en 3')
  verificar(!(await existe(pagina, '.q-head')), 'mientras cuenta no se ve ninguna pregunta')
  await dormir(1150)
  verificar((await mostrado()) === '2', 'a los 1,1 segundos va en 2')
  const inicio = Date.now()
  await pagina.waitForSelector('.q-head', { timeout: 6000 })
  const espera = Date.now() - inicio
  verificar(
    espera > 1000 && espera < 2600,
    `la primera pregunta aparece a los 3 segundos (${espera} ms después del "2")`,
  )
  verificar(
    /0:0[01]/.test(await texto(pagina, '#hud')),
    'el reloj de la ronda parte en cero: no cuenta la cuenta regresiva',
  )

  // Salir durante la cuenta regresiva no pide confirmación: todavía no hay nada que perder.
  await irAlInicio(pagina)
  await pagina.click('[data-official="st-name"]')
  await pagina.waitForSelector('#countdown:not([hidden])')
  await pagina.click('#btnHome')
  await pagina.waitForSelector('#screen:not(.hidden) [data-mode]')
  verificar(!(await existe(pagina, '#confirmDialog[open]')), 'salir durante la cuenta no pide confirmación')
  verificar(await pagina.$eval('#countdown', caja => caja.hidden), 'y la cuenta regresiva desaparece')
  await dormir(3300)
  verificar(!(await existe(pagina, '.q-head')), 'tampoco parte una ronda fantasma después')
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

const botonesDelMapa = pagina =>
  pagina.$$eval('button.maptoggle', botones => botones.map(boton => boton.innerText.trim()))
const lineasDeMetro = pagina => pagina.$$eval('.leaflet-metro-pane path', caminos => caminos.length)

// La práctica es siempre el modo fácil (bordes de comunas y líneas del metro); la ronda oficial, el difícil.
export async function facilDificil(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador)
  await pagina.click('[data-mode="lm-loc"]')
  await pagina.waitForSelector('.q-head')
  await dormir(500)
  const botones = await botonesDelMapa(pagina)
  verificar(
    botones.length === 1 && /Ver nombres/.test(botones[0]),
    `la práctica ya no tiene botón de modo fácil / difícil, solo "Ver nombres" (${botones.join(' | ')})`,
  )
  verificar((await lineasDeMetro(pagina)) > 0, 'la práctica dibuja las líneas del metro')

  await irAlInicio(pagina)
  await pagina.click('[data-official="com-name"]')
  await pagina.waitForSelector('#panel .q-head', { timeout: 8000 })
  verificar(
    (await botonesDelMapa(pagina)).length === 0,
    'en el juego de comunas no hay ningún botón sobre el mapa',
  )

  await irAlInicio(pagina)
  await pagina.click('[data-official="lm-loc"]')
  await pagina.waitForSelector('#panel .q-head', { timeout: 8000 })
  verificar(
    (await botonesDelMapa(pagina)).length === 0,
    'una ronda oficial no muestra ni ayudas ni "Ver nombres"',
  )
  verificar((await lineasDeMetro(pagina)) === 0, 'y se juega sin ayudas')
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

// Reiniciar una ronda oficial a medias, sin volver al menú.
export async function reiniciarRonda(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador)
  const reinicioVisible = () => pagina.$eval('#btnRestart', boton => !boton.hidden)
  await pagina.click('[data-mode="lm-com"]')
  await pagina.waitForSelector('.q-head')
  verificar(!(await reinicioVisible()), 'en la práctica no hay botón de reiniciar')

  await irAlInicio(pagina)
  await pagina.click('[data-official="com-name"]')
  await pagina.waitForSelector('#countdown:not([hidden])')
  verificar(!(await reinicioVisible()), 'durante la cuenta regresiva tampoco')
  await pagina.waitForSelector('#panel .q-head', { timeout: 8000 })
  verificar(await reinicioVisible(), 'en una ronda oficial sí')

  await pagina.click('#btnRestart')
  verificar(
    !(await existe(pagina, '#confirmDialog[open]')),
    'sin responder nada, reiniciar no pide confirmación',
  )
  await pagina.waitForSelector('#countdown:not([hidden])')
  verificar(true, 'y vuelve a partir con la cuenta regresiva')
  await pagina.waitForSelector('#panel .q-head', { timeout: 8000 })

  await dormir(400)
  await pagina.click('.opt:not([disabled])')
  await clicEnSiguiente(pagina)
  await pagina.waitForSelector('.opt:not([disabled])')
  await pagina.click('#btnRestart')
  await pagina.waitForSelector('#confirmDialog[open]')
  verificar(
    /no cuenta para el ranking/.test(await texto(pagina, '#confirmDialog')),
    'con la ronda avanzada pide confirmación',
  )
  await pagina.click('#confirmCancel')
  await dormir(150)
  verificar(
    /Pregunta 2 de/.test(await texto(pagina, '#panel .q-head')),
    '"Seguir jugando" conserva el avance',
  )
  await pagina.click('#btnRestart')
  await pagina.waitForSelector('#confirmDialog[open]')
  await pagina.click('#confirmOk')
  await pagina.waitForSelector('#countdown:not([hidden])')
  await pagina.waitForSelector('#panel .q-head', { timeout: 8000 })
  verificar(
    /Pregunta 1 de/.test(await texto(pagina, '#panel .q-head')),
    'al confirmar la ronda parte de cero',
  )
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

// Cada largo de ronda tiene su ranking: una ronda de 20 preguntas cae en la pestaña "20", no en la de "Todas".
export async function categoriasRanking(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador, {
    storage: { settings: { len: 20 } },
  })
  await pagina.evaluate(() =>
    fetch('/api/registrarse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Cata', clave: 'clave-larga-1' }),
    }),
  )
  await pagina.reload({ waitUntil: 'networkidle2' })
  await pagina.waitForFunction(() => document.getElementById('btnAccount').innerText.includes('Cata'))
  await pagina.click('[data-official="st-name"]')
  await jugarRondaDeAlternativas(pagina)
  await pagina.waitForFunction(() =>
    /Puesto/.test(document.getElementById('officialOutcome')?.innerText ?? ''),
  )
  verificar(
    /con 20 preguntas/.test(await texto(pagina, '#officialOutcome')),
    'el resultado dice en qué largo quedó (20 preguntas)',
  )

  await pagina.click('#outcomeRanking')
  await pagina.waitForSelector('table.board tr.me')
  const pestanas = await pagina.$$eval('.tab', elementos =>
    elementos.map(elemento => elemento.innerText.replace(/\s+/g, ' ').trim()),
  )
  verificar(
    pestanas.length === 2 && /^20/.test(pestanas[0]) && /^Todas/.test(pestanas[1]),
    `el ranking tiene pestañas 20 y Todas (${pestanas.join(' | ')})`,
  )
  verificar(/^20 1$/.test(pestanas[0]), 'la pestaña "20" muestra que tiene 1 jugador')
  verificar(
    await pagina.$eval('.tab.on', pestana => pestana.dataset.category === '20'),
    'y se abre en la del largo recién jugado',
  )

  await pagina.$eval('[data-category="todas"]', pestana => pestana.click())
  await pagina.waitForSelector('#rankBody p.muted')
  verificar(
    /Nadie ha jugado/.test(await texto(pagina, '#rankBody')),
    'la pestaña "Todas" está vacía: no se mezclan',
  )
  await pagina.$eval('[data-category="20"]', pestana => pestana.click())
  await pagina.waitForSelector('table.board tr.me')
  verificar(true, 'y la de 20 sigue mostrando la marca')

  await pagina.click('#rankPlay')
  await pagina.waitForSelector('#panel .q-head', { timeout: 8000 })
  verificar(
    /de 20$/.test((await texto(pagina, '#panel .q-head')).split('\n')[0].trim()),
    'jugar desde el ranking usa el largo de la pestaña',
  )
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}

// "¿Qué calle es esta? (difícil)" marca solo un punto de la calle; el otro juego destaca la calle completa.
export async function puntoEnCalle(navegador, { verificar }) {
  const { page: pagina, errors: errores } = await abrirPagina(navegador)
  const prompt = () => pagina.$eval('.q-prompt', nodo => nodo.innerText)
  await pagina.click('[data-mode="st-punto"]')
  await pagina.waitForSelector('.q-head')
  await dormir(500)
  verificar(/punto marcado/.test(await prompt()), `la pregunta habla de un punto: «${await prompt()}»`)
  verificar(!!(await pagina.$('.pin.ans')), 'el punto está marcado en el mapa')
  await responderComoSea(pagina)
  await pagina.waitForSelector('#btnNext', { timeout: 3000 })
  verificar(true, 'se puede responder y sale "Siguiente"')

  await irAlInicio(pagina)
  await pagina.click('[data-mode="st-name"]')
  await pagina.waitForSelector('.q-head')
  await dormir(300)
  verificar(!/punto marcado/.test(await prompt()), 'el otro juego marca la calle entera')
  verificar(!errores.length, `sin errores en la consola${errores.length ? ': ' + errores.join(' | ') : ''}`)
  await pagina.close()
}
