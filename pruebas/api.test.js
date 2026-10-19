// Pruebas del servidor contra un Postgres en memoria (PGlite): node --test tests/api.test.js
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { abrirBaseLocal } from '../desarrollo/baseLocal.js'
import { PGlite } from '@electric-sql/pglite'
import { crearApi } from '../servidor/api.js'
import { restablecerClave } from '../servidor/autenticacion.js'
import { aplicarEsquema } from '../servidor/esquema.js'
import { COSTO, cifrarClave, claveFiltrada } from '../servidor/claves.js'

let db, manejar

beforeEach(async () => {
  db = await abrirBaseLocal()
  manejar = crearApi(db, { estaFiltrada: async clave => clave === 'filtrada123' })
})

// Un "navegador" mínimo: recuerda la cookie de sesión entre llamadas.
function cliente() {
  let galleta = ''
  return async function llamar(metodo, camino, cuerpo, encabezados = {}) {
    const respuesta = await manejar(
      new Request('https://juego.test/api' + camino, {
        method: metodo,
        headers: {
          cookie: galleta,
          ...(cuerpo ? { 'content-type': 'application/json' } : {}),
          ...encabezados,
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      }),
    )
    const fijarGalleta = respuesta.headers.get('set-cookie')
    if (fijarGalleta) galleta = fijarGalleta.split(';')[0]
    return { estado: respuesta.status, datos: await respuesta.json(), galleta: fijarGalleta }
  }
}

const categoriaPara = total => (total > 20 ? 'todas' : String(total))
const ronda = (modo, aciertos, ms, total = 20, categoria = categoriaPara(total)) => ({
  modo,
  categoria,
  aciertos,
  total,
  ms,
})

async function registrado(nombre, clave = 'secreto1') {
  const llamar = cliente()
  await llamar('POST', '/registrarse', { nombre, clave })
  return { llamar }
}

test('registrarse deja la sesión iniciada', async () => {
  const llamar = cliente()
  const creada = await llamar('POST', '/registrarse', { nombre: 'Seba', clave: 'secreto1' })
  assert.equal(creada.estado, 201)
  assert.deepEqual(creada.datos.usuario, { nombre: 'Seba' })
  assert.match(creada.galleta, /HttpOnly; SameSite=Lax/)
  assert.match(creada.galleta, /Secure/)
  assert.deepEqual((await llamar('GET', '/yo')).datos.usuario, { nombre: 'Seba' })
})

test('sin sesión, /yo responde usuario nulo', async () => {
  assert.deepEqual((await cliente()('GET', '/yo')).datos, { usuario: null })
})

test('la clave no se guarda en claro', async () => {
  await registrado('Seba', 'secreto1')
  const [usuario] = await db.query('select * from usuarios')
  const [sesion] = await db.query('select * from sesiones')
  const almacenada = JSON.stringify([usuario, sesion])
  assert.ok(!almacenada.includes('secreto1'))
  assert.match(usuario.clave_cifrada, /^scrypt\$/)
})

test('rechaza nombres y claves no válidos', async () => {
  const llamar = cliente()
  for (const nombre of ['ab', 'con espacio', 'x'.repeat(21), '<script>', ''])
    assert.equal(
      (await llamar('POST', '/registrarse', { nombre, clave: 'secreto1' })).datos.error,
      'nombre_invalido',
      nombre,
    )
  assert.equal(
    (await llamar('POST', '/registrarse', { nombre: 'valido', clave: '12345' })).datos.error,
    'clave_invalida',
  )
  assert.equal((await llamar('POST', '/registrarse', { nombre: 'valido' })).datos.error, 'clave_invalida')
})

test('un nombre no se puede repetir, ni cambiando mayúsculas o tildes', async () => {
  await registrado('Ñandú')
  for (const nombre of ['Ñandú', 'ñandu', 'NANDU'])
    assert.equal((await cliente()('POST', '/registrarse', { nombre, clave: 'secreto1' })).estado, 409, nombre)
})

test('entrar: clave correcta sí, clave incorrecta o usuario inexistente no', async () => {
  await registrado('Seba', 'secreto1')
  const llamar = cliente()
  assert.equal((await llamar('POST', '/entrar', { nombre: 'seba', clave: 'otra-clave' })).estado, 401)
  assert.equal((await llamar('POST', '/entrar', { nombre: 'nadie', clave: 'secreto1' })).estado, 401)
  assert.deepEqual((await llamar('GET', '/yo')).datos.usuario, null)
  assert.equal((await llamar('POST', '/entrar', { nombre: 'SEBA', clave: 'secreto1' })).estado, 200)
  assert.deepEqual((await llamar('GET', '/yo')).datos.usuario, { nombre: 'Seba' })
})

test('cerrar sesión invalida la cookie', async () => {
  const { llamar } = await registrado('Seba')
  await llamar('POST', '/salir')
  assert.deepEqual((await llamar('GET', '/yo')).datos.usuario, null)
  assert.equal((await db.query('select * from sesiones')).length, 0)
})

test('tras muchos intentos fallidos se bloquea ese nombre por un rato', async () => {
  await registrado('Seba', 'secreto1')
  const llamar = cliente()
  for (let i = 0; i < 10; i++)
    assert.equal((await llamar('POST', '/entrar', { nombre: 'Seba', clave: 'mala' })).estado, 401)
  assert.equal((await llamar('POST', '/entrar', { nombre: 'Seba', clave: 'secreto1' })).estado, 429)
})

test('solo se guardan puntajes con sesión y con forma de ronda oficial', async () => {
  assert.equal((await cliente()('POST', '/puntajes', ronda('ch-city', 10, 60000))).estado, 401)
  const { llamar } = await registrado('Seba')
  const rechazados = [
    ronda('no-existe', 10, 60000),
    ronda('ch-city', 10, 60000, 15, '20'),
    ronda('ch-city', 10, 60000, 20, 'cuarenta'),
    ronda('ch-city', 10, 60000, 15, '15'),
    ronda('ch-city', 10, 60000, 5, 'todas'),
    ronda('ch-city', 21, 60000),
    ronda('ch-city', -1, 60000),
    ronda('ch-city', 10.5, 60000),
    ronda('ch-city', 10, 100),
    ronda('ch-city', 10, '60000'),
  ]
  for (const malo of rechazados)
    assert.equal(
      (await llamar('POST', '/puntajes', malo)).datos.error,
      'puntaje_invalido',
      JSON.stringify(malo),
    )
  assert.equal((await llamar('POST', '/puntajes', ronda('ch-all', 34, 90000, 34))).estado, 201)
  assert.equal((await llamar('POST', '/puntajes', ronda('st-name', 40, 120000, 179, 'todas'))).estado, 201)
  assert.equal((await llamar('POST', '/puntajes', ronda('lm-loc', 20, 60000, 30))).estado, 201)
  assert.equal((await db.query('select * from puntajes')).length, 3)
})

test('el ranking ordena por aciertos y luego por tiempo, con la mejor ronda de cada jugador', async () => {
  const ana = await registrado('Ana')
  const beto = await registrado('Beto')
  const caro = await registrado('Caro')

  const primero = await ana.llamar('POST', '/puntajes', ronda('ch-city', 12, 50000))
  assert.deepEqual(primero.datos, {
    categoria: '20',
    puesto: 1,
    jugadores: 1,
    mejoro: true,
    mejor: { aciertos: 12, total: 20, ms: 50000 },
  })

  await beto.llamar('POST', '/puntajes', ronda('ch-city', 14, 90000))
  await caro.llamar('POST', '/puntajes', ronda('ch-city', 14, 70000))
  const peor = await ana.llamar('POST', '/puntajes', ronda('ch-city', 9, 20000))
  assert.deepEqual(peor.datos, {
    categoria: '20',
    puesto: 3,
    jugadores: 3,
    mejoro: false,
    mejor: { aciertos: 12, total: 20, ms: 50000 },
  })
  const rondaMejor = await ana.llamar('POST', '/puntajes', ronda('ch-city', 14, 60000))
  assert.equal(rondaMejor.datos.puesto, 1)
  assert.equal(rondaMejor.datos.mejoro, true)

  const tabla = (await beto.llamar('GET', '/tabla?modo=ch-city')).datos
  assert.deepEqual(
    tabla.filas.map(fila => [fila.puesto, fila.nombre, fila.aciertos, fila.ms]),
    [
      [1, 'Ana', 14, 60000],
      [2, 'Caro', 14, 70000],
      [3, 'Beto', 14, 90000],
    ],
  )
  assert.equal(tabla.jugadores, 3)
  assert.equal(tabla.registrados, 3)
  assert.equal(tabla.yo.puesto, 3)
  assert.equal((await cliente()('GET', '/tabla?modo=ch-city')).datos.yo, null)
})

test('cada juego tiene su propio ranking y el resumen muestra al líder de cada uno', async () => {
  const ana = await registrado('Ana')
  const beto = await registrado('Beto')
  await ana.llamar('POST', '/puntajes', ronda('ch-city', 10, 50000))
  await beto.llamar('POST', '/puntajes', ronda('ch-city', 12, 50000))
  await ana.llamar('POST', '/puntajes', ronda('st-name', 8, 40000))

  const { modos } = (await ana.llamar('GET', '/lideres')).datos
  assert.deepEqual(Object.keys(modos).sort(), ['ch-city', 'st-name'])
  assert.equal(modos['ch-city'].lider.nombre, 'Beto')
  assert.equal(modos['ch-city'].jugadores, 2)
  assert.equal(modos['ch-city'].yo.puesto, 2)
  assert.equal(modos['st-name'].lider.nombre, 'Ana')
  assert.equal(modos['st-name'].yo.puesto, 1)
  assert.equal((await ana.llamar('GET', '/lideres')).datos.registrados, 2)
  assert.equal((await cliente()('GET', '/lideres')).datos.modos['ch-city'].yo, null)
})

test('el período "semana" solo cuenta los últimos 7 días', async () => {
  const ana = await registrado('Ana')
  const beto = await registrado('Beto')
  await ana.llamar('POST', '/puntajes', ronda('ch-city', 20, 30000))
  await beto.llamar('POST', '/puntajes', ronda('ch-city', 10, 50000))
  await db.query(`update puntajes set creado_en = now() - interval '10 days' where aciertos = 20`)

  const nombres = async periodo =>
    (await ana.llamar('GET', `/tabla?modo=ch-city&periodo=${periodo}`)).datos.filas.map(fila => fila.nombre)
  assert.deepEqual(await nombres('todo'), ['Ana', 'Beto'])
  assert.deepEqual(await nombres('semana'), ['Beto'])
  assert.equal((await ana.llamar('GET', '/tabla?modo=ch-city&periodo=siempre')).estado, 400)
  assert.equal((await ana.llamar('GET', '/tabla?modo=inventado')).estado, 400)
})

test('un POST desde otro sitio se rechaza', async () => {
  const { llamar } = await registrado('Seba')
  const ajeno = await llamar('POST', '/puntajes', ronda('ch-city', 10, 60000), {
    origin: 'https://otro-sitio.test',
  })
  assert.equal(ajeno.estado, 403)
  const propio = await llamar('POST', '/puntajes', ronda('ch-city', 10, 60000), {
    origin: 'https://juego.test',
  })
  assert.equal(propio.estado, 201)
})

test('solicitudes mal formadas responden error en JSON, no una caída', async () => {
  const enviar = (camino, inicializar) => manejar(new Request('https://juego.test/api' + camino, inicializar))
  const basura = await enviar('/entrar', { method: 'POST', body: '{no es json' })
  assert.equal(basura.status, 400)
  assert.equal((await basura.json()).error, 'json_invalido')
  assert.equal((await enviar('/no-existe', { method: 'GET' })).status, 404)
  assert.equal((await enviar('/entrar', { method: 'GET' })).status, 404)
})

test('sin base de datos el API avisa que las cuentas no están disponibles', async () => {
  const respuesta = await crearApi(null)(new Request('https://juego.test/api/yo'))
  assert.equal(respuesta.status, 503)
  assert.equal((await respuesta.json()).error, 'no_disponible')
})

test('el administrador puede cambiar una clave, y eso cierra las sesiones abiertas', async () => {
  const { llamar: dispositivoAntiguo } = await registrado('Seba', 'secreto1')
  assert.equal(await restablecerClave(db, 'seba', 'nueva-clave'), 'Seba')
  assert.equal(await restablecerClave(db, 'nadie', 'nueva-clave'), null)
  assert.deepEqual((await dispositivoAntiguo('GET', '/yo')).datos.usuario, null)
  assert.equal((await cliente()('POST', '/entrar', { nombre: 'Seba', clave: 'secreto1' })).estado, 401)
  assert.equal((await cliente()('POST', '/entrar', { nombre: 'Seba', clave: 'nueva-clave' })).estado, 200)
})

test('ya no existe la recuperación por código', async () => {
  const { llamar } = await registrado('Seba')
  assert.equal((await llamar('POST', '/recover', { nombre: 'Seba' })).estado, 404)
})

test('se rechazan claves filtradas, iguales al nombre o muy cortas', async () => {
  const llamar = cliente()
  const intento = (nombre, clave) => llamar('POST', '/registrarse', { nombre, clave })
  assert.equal((await intento('seba', 'filtrada123')).datos.error, 'clave_filtrada')
  assert.equal((await intento('sebastian', 'SEBASTIAN')).datos.error, 'clave_invalida')
  assert.equal((await intento('seba', '1234567')).datos.error, 'clave_invalida')
  assert.equal((await intento('seba', 'otra-clave-1')).estado, 201)
})

test('las claves nuevas usan el costo actual y las antiguas se actualizan al entrar', async () => {
  await registrado('Nueva', 'secreto1')
  const [nuevo] = await db.query("select clave_cifrada from usuarios where nombre = 'Nueva'")
  assert.equal(+nuevo.clave_cifrada.split('$')[1], COSTO)

  await db.query('insert into usuarios (nombre, llave_de_nombre, clave_cifrada) values ($1, $2, $3)', [
    'Vieja',
    'vieja',
    await cifrarClave('secreto1', 16384),
  ])
  assert.equal((await cliente()('POST', '/entrar', { nombre: 'Vieja', clave: 'secreto1' })).estado, 200)
  const [actualizada] = await db.query("select clave_cifrada from usuarios where nombre = 'Vieja'")
  assert.equal(+actualizada.clave_cifrada.split('$')[1], COSTO)
  assert.equal((await cliente()('POST', '/entrar', { nombre: 'Vieja', clave: 'secreto1' })).estado, 200)
  assert.equal((await cliente()('POST', '/entrar', { nombre: 'Vieja', clave: 'incorrecta1' })).estado, 401)
})

test('la consulta de claves filtradas manda solo 5 caracteres del hash y falla hacia "permitir"', async () => {
  const enviado = []
  const simulada = cuerpo => async url => {
    enviado.push(url)
    return { ok: true, text: async () => cuerpo }
  }
  // SHA-1 de "password" = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  const acierto = simulada(
    '0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n',
  )
  assert.equal(await claveFiltrada('password', acierto), true)
  assert.deepEqual(enviado, ['https://api.pwnedpasswords.com/range/5BAA6'])
  assert.equal(await claveFiltrada('password', simulada('0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n')), false)
  assert.equal(await claveFiltrada('password', simulada('1E4C9B93F3F0682250B6CF8331B7EE68FD8:0\r\n')), false)
  assert.equal(
    await claveFiltrada('password', async () => {
      throw new Error('sin red')
    }),
    false,
  )
  assert.equal(await claveFiltrada('password', async () => ({ ok: false })), false)
})

test('cada largo de ronda (20 o todas) tiene su propio ranking, y se avisa qué largos tienen marcas', async () => {
  const ana = await registrado('Ana')
  const beto = await registrado('Beto')
  await ana.llamar('POST', '/puntajes', ronda('st-name', 12, 50000, 20))
  await ana.llamar('POST', '/puntajes', ronda('st-name', 100, 700000, 120, 'todas'))
  await beto.llamar('POST', '/puntajes', ronda('st-name', 150, 900000, 179, 'todas'))
  const guardado = await beto.llamar('POST', '/puntajes', ronda('st-name', 160, 960000, 179, 'todas'))
  assert.equal(guardado.datos.categoria, 'todas')
  assert.equal(guardado.datos.puesto, 1)

  const tabla = async categoria =>
    (await ana.llamar('GET', `/tabla?modo=st-name&categoria=${categoria}`)).datos
  const veinte = await tabla('20')
  assert.deepEqual(
    veinte.filas.map(fila => [fila.nombre, fila.aciertos]),
    [['Ana', 12]],
  )
  const todo = await tabla('todas')
  assert.deepEqual(
    todo.filas.map(fila => [fila.nombre, fila.aciertos]),
    [
      ['Beto', 160],
      ['Ana', 100],
    ],
  )
  assert.deepEqual(todo.jugadas, { 20: 1, todas: 2 })
  assert.equal(
    (await ana.llamar('GET', '/tabla?modo=st-name&categoria=15')).estado,
    400,
    'ya no hay rondas de 15',
  )

  const lideres = (await ana.llamar('GET', '/lideres?categoria=todas')).datos.modos
  assert.equal(lideres['st-name'].lider.nombre, 'Beto')
  assert.equal(lideres['st-name'].yo.puesto, 2)
  assert.equal((await ana.llamar('GET', '/tabla?modo=st-name&categoria=7')).estado, 400)
})

test('las rondas de una categoría no se mezclan con las de otra al comparar la mejor marca', async () => {
  const { llamar } = await registrado('Ana')
  assert.equal((await llamar('POST', '/puntajes', ronda('ch-city', 14, 60000, 20))).datos.mejoro, true)
  const otro = await llamar('POST', '/puntajes', ronda('ch-city', 5, 60000, 12, 'todas'))
  assert.equal(otro.datos.mejoro, true, 'la primera de "todas" es marca propia aunque sea peor que la de 20')
  assert.equal(otro.datos.puesto, 1)
})

test('un puntaje sin categoría (de antes de que existiera) se clasifica por su largo', async () => {
  const { llamar } = await registrado('Ana')
  const heredado = ({ modo, aciertos, total, ms }) => ({
    modo,
    aciertos,
    total,
    ms,
  })
  assert.equal(
    (await llamar('POST', '/puntajes', heredado(ronda('ch-city', 10, 60000)))).datos.categoria,
    '20',
  )
  assert.equal(
    (await llamar('POST', '/puntajes', heredado(ronda('ch-all', 30, 90000, 34)))).datos.categoria,
    'todas',
  )
  assert.equal(
    (await llamar('POST', '/puntajes', heredado(ronda('ch-all', 12, 60000, 16)))).datos.categoria,
    'todas',
  )
})

test('al actualizar la base no se pierde ninguna marca: las anteriores quedan en su categoría', async () => {
  // Una base creada antes de las categorías, con rondas ya guardadas.
  const antigua = new PGlite()
  const consulta = async (texto, parametros = []) => (await antigua.query(texto, parametros)).rows
  await consulta(
    'create table users (id integer generated always as identity primary key, name text not null, name_key text not null unique, password_hash text not null, created_at timestamptz not null default now())',
  )
  await consulta(
    'create table sessions (token_hash text primary key, user_id integer not null references users (id) on delete cascade, expires_at timestamptz not null)',
  )
  await consulta(
    'create table scores (id integer generated always as identity primary key, user_id integer not null references users (id) on delete cascade, mode text not null, correct integer not null, total integer not null, ms integer not null, created_at timestamptz not null default now())',
  )
  await consulta('create table failed_logins (name_key text not null, at timestamptz not null default now())')
  await consulta("insert into users (name, name_key, password_hash) values ('Ana', 'ana', 'x')")
  const antes = [
    ['ch-all', 33, 34, 70000],
    ['ch-city', 12, 15, 55000],
    ['ch-all', 16, 16, 40000],
    ['lm-loc', 20, 30, 120000],
    ['com-name', 30, 34, 80000],
  ]
  for (const [modo, correctas, total, ms] of antes)
    await consulta('insert into scores (user_id, mode, correct, total, ms) values (1, $1, $2, $3, $4)', [
      modo,
      correctas,
      total,
      ms,
    ])

  const actualizada = { query: consulta }
  await aplicarEsquema(actualizada)
  await aplicarEsquema(actualizada) // cada despliegue lo vuelve a aplicar: tiene que poder repetirse

  const filas = await consulta('select modo, categoria, aciertos, total, ms from puntajes order by id')
  assert.deepEqual(
    filas.map(fila => [fila.modo, fila.categoria, fila.aciertos, fila.total, fila.ms]),
    [
      ['ch-all', 'todas', 33, 34, 70000],
      ['ch-city', '15', 12, 15, 55000],
      ['ch-all', 'todas', 16, 16, 40000],
      ['lm-loc', '30', 20, 30, 120000],
      ['com-name', 'core', 30, 34, 80000], // los juegos de comunas se separan por alcance
    ],
  )

  // y siguen apareciendo en el ranking
  const api = crearApi(actualizada, { estaFiltrada: async () => false })
  const respuesta = await api(new Request('https://juego.test/api/tabla?modo=ch-all&categoria=todas'))
  const tabla = await respuesta.json()
  assert.deepEqual(
    tabla.filas.map(fila => [fila.nombre, fila.aciertos, fila.total]),
    [['Ana', 33, 34]],
  )
})

test('el progreso de práctica se comparte entre dispositivos y gana lo más reciente', async () => {
  assert.equal((await cliente()('GET', '/progreso')).estado, 401)
  const { llamar: celular } = await registrado('Seba')
  const computador = cliente()
  await computador('POST', '/entrar', { nombre: 'Seba', clave: 'secreto1' })
  const entrada = (n, ok, last) => ({ n, ok, streak: ok ? 1 : 0, last })

  await celular('POST', '/progreso', { estadisticas: { 'lm-loc:Plaza de Armas': entrada(3, 2, 1000) } })
  assert.deepEqual((await computador('GET', '/progreso')).datos.estadisticas, {
    'lm-loc:Plaza de Armas': entrada(3, 2, 1000),
  })
  await computador('POST', '/progreso', {
    estadisticas: { 'lm-loc:Plaza de Armas': entrada(1, 0, 500), 'st-name:Moneda': entrada(1, 1, 600) },
  })
  await computador('POST', '/progreso', { estadisticas: { 'st-name:Moneda': entrada(2, 1, 900) } })
  assert.deepEqual((await celular('GET', '/progreso')).datos.estadisticas, {
    'lm-loc:Plaza de Armas': entrada(3, 2, 1000),
    'st-name:Moneda': entrada(2, 1, 900),
  })

  const { llamar: otro } = await registrado('Otra')
  assert.deepEqual((await otro('GET', '/progreso')).datos.estadisticas, {})
  for (const malo of [{ x: entrada(1, 2, 5) }, { x: null }, { x: { n: 1, ok: 1, streak: 1, last: -3 } }])
    assert.equal(
      (await celular('POST', '/progreso', { estadisticas: malo })).datos.error,
      'progreso_invalido',
    )

  await celular('POST', '/progreso/borrar')
  assert.deepEqual((await computador('GET', '/progreso')).datos.estadisticas, {})
})
