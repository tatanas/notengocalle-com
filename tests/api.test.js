// Pruebas del servidor contra un Postgres en memoria (PGlite): node --test tests/api.test.js
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { openLocalDatabase } from '../dev/localDatabase.js'
import { createApi } from '../server/api.js'
import { issueRecoveryCode } from '../server/auth.js'

let db, handle

beforeEach(async () => {
  db = await openLocalDatabase()
  handle = createApi(db)
})

// Un "navegador" mínimo: recuerda la cookie de sesión entre llamadas.
function client() {
  let cookie = ''
  return async function call(method, path, body, headers = {}) {
    const response = await handle(
      new Request('https://juego.test/api' + path, {
        method,
        headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      }),
    )
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    return { status: response.status, data: await response.json(), setCookie }
  }
}

const round = (mode, correct, ms, total = 15) => ({ mode, correct, total, ms })

async function signedUp(name, password = 'secreto1') {
  const call = client()
  const { data } = await call('POST', '/register', { name, password })
  return { call, recoveryCode: data.recoveryCode }
}

test('registrarse deja la sesión iniciada y entrega un código de recuperación', async () => {
  const call = client()
  const created = await call('POST', '/register', { name: 'Seba', password: 'secreto1' })
  assert.equal(created.status, 201)
  assert.deepEqual(created.data.user, { name: 'Seba' })
  assert.match(created.data.recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.match(created.setCookie, /HttpOnly; SameSite=Lax/)
  assert.match(created.setCookie, /Secure/)
  assert.deepEqual((await call('GET', '/me')).data.user, { name: 'Seba' })
})

test('sin sesión, /me responde usuario nulo', async () => {
  assert.deepEqual((await client()('GET', '/me')).data, { user: null })
})

test('la clave y el código no se guardan en claro', async () => {
  const { recoveryCode } = await signedUp('Seba', 'secreto1')
  const [user] = await db.query('select * from users')
  const [session] = await db.query('select * from sessions')
  const stored = JSON.stringify([user, session])
  assert.ok(!stored.includes('secreto1'))
  assert.ok(!stored.includes(recoveryCode))
  assert.match(user.password_hash, /^scrypt\$/)
})

test('rechaza nombres y claves no válidos', async () => {
  const call = client()
  for (const name of ['ab', 'con espacio', 'x'.repeat(21), '<script>', ''])
    assert.equal(
      (await call('POST', '/register', { name, password: 'secreto1' })).data.error,
      'invalid_name',
      name,
    )
  assert.equal(
    (await call('POST', '/register', { name: 'valido', password: '12345' })).data.error,
    'invalid_password',
  )
  assert.equal((await call('POST', '/register', { name: 'valido' })).data.error, 'invalid_password')
})

test('un nombre no se puede repetir, ni cambiando mayúsculas o tildes', async () => {
  await signedUp('Ñandú')
  for (const name of ['Ñandú', 'ñandu', 'NANDU'])
    assert.equal((await client()('POST', '/register', { name, password: 'secreto1' })).status, 409, name)
})

test('entrar: clave correcta sí, clave incorrecta o usuario inexistente no', async () => {
  await signedUp('Seba', 'secreto1')
  const call = client()
  assert.equal((await call('POST', '/login', { name: 'seba', password: 'otra-clave' })).status, 401)
  assert.equal((await call('POST', '/login', { name: 'nadie', password: 'secreto1' })).status, 401)
  assert.deepEqual((await call('GET', '/me')).data.user, null)
  assert.equal((await call('POST', '/login', { name: 'SEBA', password: 'secreto1' })).status, 200)
  assert.deepEqual((await call('GET', '/me')).data.user, { name: 'Seba' })
})

test('cerrar sesión invalida la cookie', async () => {
  const { call } = await signedUp('Seba')
  await call('POST', '/logout')
  assert.deepEqual((await call('GET', '/me')).data.user, null)
  assert.equal((await db.query('select * from sessions')).length, 0)
})

test('tras muchos intentos fallidos se bloquea ese nombre por un rato', async () => {
  await signedUp('Seba', 'secreto1')
  const call = client()
  for (let i = 0; i < 10; i++)
    assert.equal((await call('POST', '/login', { name: 'Seba', password: 'mala' })).status, 401)
  assert.equal((await call('POST', '/login', { name: 'Seba', password: 'secreto1' })).status, 429)
})

test('recuperar con el código cambia la clave, cierra las otras sesiones y entrega un código nuevo', async () => {
  const { call: oldDevice, recoveryCode } = await signedUp('Seba', 'secreto1')
  const call = client()
  const wrong = await call('POST', '/recover', {
    name: 'Seba',
    recoveryCode: 'AAAA-BBBB-CCCC',
    newPassword: 'nueva-clave',
  })
  assert.equal(wrong.status, 401)

  const typedByHand = recoveryCode.toLowerCase().replaceAll('-', ' ')
  const recovered = await call('POST', '/recover', {
    name: 'seba',
    recoveryCode: typedByHand,
    newPassword: 'nueva-clave',
  })
  assert.equal(recovered.status, 200)
  assert.notEqual(recovered.data.recoveryCode, recoveryCode)
  assert.deepEqual((await call('GET', '/me')).data.user, { name: 'Seba' })
  assert.deepEqual((await oldDevice('GET', '/me')).data.user, null)

  assert.equal((await client()('POST', '/login', { name: 'Seba', password: 'secreto1' })).status, 401)
  assert.equal((await client()('POST', '/login', { name: 'Seba', password: 'nueva-clave' })).status, 200)
  const reused = await client()('POST', '/recover', { name: 'Seba', recoveryCode, newPassword: 'otra-mas' })
  assert.equal(reused.status, 401)
})

test('solo se guardan puntajes con sesión y con forma de ronda oficial', async () => {
  assert.equal((await client()('POST', '/scores', round('com-name', 10, 60000))).status, 401)
  const { call } = await signedUp('Seba')
  const rejected = [
    round('no-existe', 10, 60000),
    round('com-name', 10, 60000, 20),
    round('com-name', 16, 60000),
    round('com-name', -1, 60000),
    round('com-name', 10.5, 60000),
    round('com-name', 10, 100),
    round('com-name', 10, '60000'),
    round('com-all', 15, 60000),
  ]
  for (const bad of rejected)
    assert.equal((await call('POST', '/scores', bad)).data.error, 'invalid_score', JSON.stringify(bad))
  assert.equal((await call('POST', '/scores', round('com-all', 34, 90000, 34))).status, 201)
  assert.equal((await db.query('select * from scores')).length, 1)
})

test('el ranking ordena por aciertos y luego por tiempo, con la mejor ronda de cada jugador', async () => {
  const ana = await signedUp('Ana')
  const beto = await signedUp('Beto')
  const caro = await signedUp('Caro')

  const first = await ana.call('POST', '/scores', round('com-name', 12, 50000))
  assert.deepEqual(first.data, {
    rank: 1,
    players: 1,
    improved: true,
    best: { correct: 12, total: 15, ms: 50000 },
  })

  await beto.call('POST', '/scores', round('com-name', 14, 90000))
  await caro.call('POST', '/scores', round('com-name', 14, 70000))
  const worse = await ana.call('POST', '/scores', round('com-name', 9, 20000))
  assert.deepEqual(worse.data, {
    rank: 3,
    players: 3,
    improved: false,
    best: { correct: 12, total: 15, ms: 50000 },
  })
  const better = await ana.call('POST', '/scores', round('com-name', 14, 60000))
  assert.equal(better.data.rank, 1)
  assert.equal(better.data.improved, true)

  const board = (await beto.call('GET', '/leaderboard?mode=com-name')).data
  assert.deepEqual(
    board.rows.map(row => [row.rank, row.name, row.correct, row.ms]),
    [
      [1, 'Ana', 14, 60000],
      [2, 'Caro', 14, 70000],
      [3, 'Beto', 14, 90000],
    ],
  )
  assert.equal(board.players, 3)
  assert.equal(board.me.rank, 3)
  assert.equal((await client()('GET', '/leaderboard?mode=com-name')).data.me, null)
})

test('cada juego tiene su propio ranking y el resumen muestra al líder de cada uno', async () => {
  const ana = await signedUp('Ana')
  const beto = await signedUp('Beto')
  await ana.call('POST', '/scores', round('com-name', 10, 50000))
  await beto.call('POST', '/scores', round('com-name', 12, 50000))
  await ana.call('POST', '/scores', round('st-name', 8, 40000))

  const { modes } = (await ana.call('GET', '/leaders')).data
  assert.deepEqual(Object.keys(modes).sort(), ['com-name', 'st-name'])
  assert.equal(modes['com-name'].leader.name, 'Beto')
  assert.equal(modes['com-name'].players, 2)
  assert.equal(modes['com-name'].me.rank, 2)
  assert.equal(modes['st-name'].leader.name, 'Ana')
  assert.equal(modes['st-name'].me.rank, 1)
  assert.equal((await client()('GET', '/leaders')).data.modes['com-name'].me, null)
})

test('el período "week" solo cuenta los últimos 7 días', async () => {
  const ana = await signedUp('Ana')
  const beto = await signedUp('Beto')
  await ana.call('POST', '/scores', round('com-name', 15, 30000))
  await beto.call('POST', '/scores', round('com-name', 10, 50000))
  await db.query(`update scores set created_at = now() - interval '10 days' where correct = 15`)

  const names = async period =>
    (await ana.call('GET', `/leaderboard?mode=com-name&period=${period}`)).data.rows.map(row => row.name)
  assert.deepEqual(await names('all'), ['Ana', 'Beto'])
  assert.deepEqual(await names('week'), ['Beto'])
  assert.equal((await ana.call('GET', '/leaderboard?mode=com-name&period=siempre')).status, 400)
  assert.equal((await ana.call('GET', '/leaderboard?mode=inventado')).status, 400)
})

test('un POST desde otro sitio se rechaza', async () => {
  const { call } = await signedUp('Seba')
  const foreign = await call('POST', '/scores', round('com-name', 10, 60000), {
    origin: 'https://otro-sitio.test',
  })
  assert.equal(foreign.status, 403)
  const own = await call('POST', '/scores', round('com-name', 10, 60000), { origin: 'https://juego.test' })
  assert.equal(own.status, 201)
})

test('solicitudes mal formadas responden error en JSON, no una caída', async () => {
  const send = (path, init) => handle(new Request('https://juego.test/api' + path, init))
  const garbage = await send('/login', { method: 'POST', body: '{no es json' })
  assert.equal(garbage.status, 400)
  assert.equal((await garbage.json()).error, 'invalid_json')
  assert.equal((await send('/no-existe', { method: 'GET' })).status, 404)
  assert.equal((await send('/login', { method: 'GET' })).status, 404)
})

test('sin base de datos el API avisa que las cuentas no están disponibles', async () => {
  const response = await createApi(null)(new Request('https://juego.test/api/me'))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error, 'unavailable')
})

test('el administrador puede entregar un código de recuperación nuevo', async () => {
  const { recoveryCode: original } = await signedUp('Seba', 'secreto1')
  const issued = await issueRecoveryCode(db, 'seba')
  assert.equal(issued.name, 'Seba')
  assert.equal(await issueRecoveryCode(db, 'nadie'), null)

  const withOld = await client()('POST', '/recover', {
    name: 'Seba',
    recoveryCode: original,
    newPassword: 'nueva-clave',
  })
  assert.equal(withOld.status, 401)
  const withNew = await client()('POST', '/recover', {
    name: 'Seba',
    recoveryCode: issued.recoveryCode,
    newPassword: 'nueva-clave',
  })
  assert.equal(withNew.status, 200)
})
