// Pruebas del servidor contra un Postgres en memoria (PGlite): node --test tests/api.test.js
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { abrirBaseLocal } from '../desarrollo/baseLocal.js'
import { PGlite } from '@electric-sql/pglite'
import { crearApi } from '../servidor/api.js'
import { restablecerClave } from '../servidor/autenticacion.js'
import { aplicarEsquema } from '../servidor/esquema.js'
import { COSTO, cifrarClave, claveFiltrada } from '../servidor/claves.js'
import { fechaDeAyerEnChile, fechaDeHoyEnChile } from '../compartido/oficial.js'
import { ID_DE_CLIENTE_DE_GOOGLE } from '../compartido/configuracion.js'

// Un "Google" de mentira: firma tokens con su propia llave, que la API recibe como si fuera de Google.
const ALGORITMO_DE_GOOGLE = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
const generarLlaves = () =>
  crypto.subtle.generateKey(
    { ...ALGORITMO_DE_GOOGLE, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify'],
  )
const llavesDeGoogle = await generarLlaves()
const llavePublicaDeGoogle = {
  ...(await crypto.subtle.exportKey('jwk', llavesDeGoogle.publicKey)),
  kid: 'llave-de-prueba',
  alg: 'RS256',
}
const base64url = valor => Buffer.from(JSON.stringify(valor)).toString('base64url')

async function tokenDeGoogle(cambios = {}, llavePrivada = llavesDeGoogle.privateKey) {
  const contenido = {
    iss: 'https://accounts.google.com',
    aud: ID_DE_CLIENTE_DE_GOOGLE,
    sub: '1234567890',
    email: 'alguien@gmail.com',
    name: 'Alguien Real',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...cambios,
  }
  const firmado = `${base64url({ alg: 'RS256', kid: 'llave-de-prueba', typ: 'JWT' })}.${base64url(contenido)}`
  const firma = await crypto.subtle.sign(ALGORITMO_DE_GOOGLE, llavePrivada, new TextEncoder().encode(firmado))
  return `${firmado}.${Buffer.from(firma).toString('base64url')}`
}

let db, manejar

beforeEach(async () => {
  db = await abrirBaseLocal()
  manejar = crearApi(db, {
    estaFiltrada: async clave => clave === 'filtrada123',
    llavesDeGoogle: async () => [llavePublicaDeGoogle],
  })
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
    'create table users (id integer generated always as identity primary key, name text not null, name_key text not null unique, password_hash text not null, recovery_hash text not null, created_at timestamptz not null default now())',
  )
  await consulta(
    'create table sessions (token_hash text primary key, user_id integer not null references users (id) on delete cascade, expires_at timestamptz not null)',
  )
  await consulta(
    'create table scores (id integer generated always as identity primary key, user_id integer not null references users (id) on delete cascade, mode text not null, correct integer not null, total integer not null, ms integer not null, created_at timestamptz not null default now())',
  )
  await consulta('create table failed_logins (name_key text not null, at timestamptz not null default now())')
  await consulta(
    "insert into users (name, name_key, password_hash, recovery_hash) values ('Ana', 'ana', 'x', 'y')",
  )
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

  // y se pueden crear cuentas nuevas (antes la columna recovery_hash, ya sin uso, lo impedía)
  const registro = await api(
    new Request('https://juego.test/api/registrarse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Beto', clave: 'secreto1' }),
    }),
  )
  assert.equal(registro.status, 201)
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

test('con Google se crea la cuenta eligiendo un nombre, y después se entra directo', async () => {
  const llamar = cliente()
  const credencial = await tokenDeGoogle()
  const primeraVez = await llamar('POST', '/google', { credencial })
  assert.deepEqual(primeraVez.datos, { necesitaNombre: true })
  assert.equal(primeraVez.galleta, null)

  const creada = await llamar('POST', '/google', { credencial, nombre: 'Gugle' })
  assert.equal(creada.estado, 201)
  assert.deepEqual(creada.datos.usuario, { nombre: 'Gugle', google: true })
  assert.match(creada.galleta, /HttpOnly; SameSite=Lax/)
  assert.deepEqual((await llamar('GET', '/yo')).datos.usuario, { nombre: 'Gugle', google: true })

  const [fila] = await db.query(`select * from usuarios where nombre = 'Gugle'`)
  assert.equal(fila.google_sub, '1234567890')
  assert.equal(fila.clave_cifrada, null)
  assert.ok(!JSON.stringify(fila).includes('alguien'), 'no se guarda ni el correo ni el nombre de Google')

  const otroDispositivo = cliente()
  const deNuevo = await otroDispositivo('POST', '/google', { credencial: await tokenDeGoogle() })
  assert.deepEqual(deNuevo.datos.usuario, { nombre: 'Gugle', google: true })
  assert.ok(deNuevo.galleta)

  const conClave = await cliente()('POST', '/entrar', { nombre: 'Gugle', clave: '' })
  assert.equal(conClave.estado, 401, 'una cuenta sin clave no se abre con nombre y clave vacía')
})

test('con Google no se puede tomar un nombre ocupado', async () => {
  await registrado('Ana')
  const respuesta = await cliente()('POST', '/google', { credencial: await tokenDeGoogle(), nombre: 'ana' })
  assert.equal(respuesta.estado, 409)
  assert.equal(respuesta.datos.error, 'nombre_en_uso')
})

test('se rechazan los tokens de Google falsos, vencidos o para otra app', async () => {
  const otraLlave = (await generarLlaves()).privateKey
  const malos = [
    await tokenDeGoogle({}, otraLlave),
    await tokenDeGoogle({ aud: 'otra-app.apps.googleusercontent.com' }),
    await tokenDeGoogle({ iss: 'https://evil.example' }),
    await tokenDeGoogle({ exp: Math.floor(Date.now() / 1000) - 3600 }),
    await tokenDeGoogle({ sub: '' }),
    'no.es.un-token',
    'nada',
    undefined,
  ]
  for (const credencial of malos) {
    const respuesta = await cliente()('POST', '/google', { credencial, nombre: 'Intruso' })
    assert.equal(respuesta.estado, 401, String(credencial).slice(0, 40))
    assert.equal(respuesta.datos.error, 'google_invalido')
  }
  assert.equal((await db.query(`select * from usuarios`)).length, 0)
})

test('una cuenta con clave se vincula con Google solo con la sesión iniciada', async () => {
  const credencial = await tokenDeGoogle({ sub: 'sub-de-ana' })
  assert.equal((await cliente()('POST', '/google/vincular', { credencial })).estado, 401)

  const { llamar: ana } = await registrado('Ana')
  const vinculada = await ana('POST', '/google/vincular', { credencial })
  assert.deepEqual(vinculada.datos.usuario, { nombre: 'Ana', google: true })

  const desdeGoogle = await cliente()('POST', '/google', { credencial })
  assert.deepEqual(desdeGoogle.datos.usuario, { nombre: 'Ana', google: true })
  assert.equal((await cliente()('POST', '/entrar', { nombre: 'Ana', clave: 'secreto1' })).estado, 200)

  const { llamar: beto } = await registrado('Beto')
  const robo = await beto('POST', '/google/vincular', { credencial })
  assert.equal(robo.estado, 409)
  assert.equal(robo.datos.error, 'google_en_uso')
  const otroGoogle = await ana('POST', '/google/vincular', {
    credencial: await tokenDeGoogle({ sub: 'otro' }),
  })
  assert.equal(otroGoogle.datos.error, 'ya_vinculada')
})

test('los desafíos diarios cuentan una sola vez por día, solo de hoy o de ayer, y tienen su propio ranking por fecha', async () => {
  const hoy = fechaDeHoyEnChile()
  const { llamar } = await registrado('Seba')
  const otro = await registrado('Otra')
  const calles = (aciertos, ms, categoria = hoy) => ronda('dd-calles', aciertos, ms, 10, categoria)
  assert.equal((await llamar('POST', '/puntajes', calles(7, 60000))).estado, 201)
  const repetido = await llamar('POST', '/puntajes', calles(10, 50000))
  assert.equal(repetido.estado, 409)
  assert.equal(repetido.datos.error, 'ya_jugado')
  assert.equal(
    (await llamar('POST', '/puntajes', calles(7, 60000, '2020-01-01'))).datos.error,
    'puntaje_invalido',
  )
  assert.equal((await llamar('POST', '/puntajes', calles(7, 60000, 'hoy'))).datos.error, 'puntaje_invalido')
  assert.equal(
    (await llamar('POST', '/puntajes', ronda('dd-calles', 7, 60000, 20, hoy))).datos.error,
    'puntaje_invalido',
  )
  assert.equal((await llamar('POST', '/puntajes', calles(5, 60000, fechaDeAyerEnChile()))).estado, 201)
  assert.equal((await otro.llamar('POST', '/puntajes', calles(9, 70000))).estado, 201)
  assert.equal((await llamar('POST', '/puntajes', ronda('dd-ruta', 80, 300000, 100, hoy))).estado, 201)

  const tabla = await llamar('GET', `/tabla?modo=dd-calles&categoria=${hoy}`)
  assert.equal(tabla.estado, 200)
  assert.deepEqual(
    tabla.datos.filas.map(fila => [fila.nombre, fila.aciertos]),
    [
      ['Otra', 9],
      ['Seba', 7],
    ],
  )
  const deAyer = await llamar('GET', `/tabla?modo=dd-calles&categoria=${fechaDeAyerEnChile()}`)
  assert.equal(deAyer.datos.filas.length, 1)
  assert.equal((await llamar('GET', '/tabla?modo=dd-calles&categoria=hoy')).estado, 400)
})
