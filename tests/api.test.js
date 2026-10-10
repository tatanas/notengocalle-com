// Pruebas del servidor contra un Postgres en memoria (PGlite): node --test tests/api.test.js
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { openLocalDatabase } from '../dev/localDatabase.js'
import { PGlite } from '@electric-sql/pglite'
import { createApi } from '../server/api.js'
import { resetPassword } from '../server/auth.js'
import { applySchema } from '../server/schema.js'
import { COST, hashPassword, isBreachedPassword } from '../server/passwords.js'

let db, handle

beforeEach(async () => {
  db = await openLocalDatabase()
  handle = createApi(db, { isBreached: async password => password === 'filtrada123' })
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

const categoryFor = total => (total > 30 ? 'all' : String(total))
const round = (mode, correct, ms, total = 15, category = categoryFor(total)) => ({
  mode,
  category,
  correct,
  total,
  ms,
})

async function signedUp(name, password = 'secreto1') {
  const call = client()
  await call('POST', '/register', { name, password })
  return { call }
}

test('registrarse deja la sesión iniciada', async () => {
  const call = client()
  const created = await call('POST', '/register', { name: 'Seba', password: 'secreto1' })
  assert.equal(created.status, 201)
  assert.deepEqual(created.data.user, { name: 'Seba' })
  assert.match(created.setCookie, /HttpOnly; SameSite=Lax/)
  assert.match(created.setCookie, /Secure/)
  assert.deepEqual((await call('GET', '/me')).data.user, { name: 'Seba' })
})

test('sin sesión, /me responde usuario nulo', async () => {
  assert.deepEqual((await client()('GET', '/me')).data, { user: null })
})

test('la clave no se guarda en claro', async () => {
  await signedUp('Seba', 'secreto1')
  const [user] = await db.query('select * from users')
  const [session] = await db.query('select * from sessions')
  const stored = JSON.stringify([user, session])
  assert.ok(!stored.includes('secreto1'))
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

test('solo se guardan puntajes con sesión y con forma de ronda oficial', async () => {
  assert.equal((await client()('POST', '/scores', round('com-name', 10, 60000))).status, 401)
  const { call } = await signedUp('Seba')
  const rejected = [
    round('no-existe', 10, 60000),
    round('com-name', 10, 60000, 20, '15'),
    round('com-name', 10, 60000, 15, 'cuarenta'),
    round('com-name', 10, 60000, 5, 'all'),
    round('com-name', 16, 60000),
    round('com-name', -1, 60000),
    round('com-name', 10.5, 60000),
    round('com-name', 10, 100),
    round('com-name', 10, '60000'),
  ]
  for (const bad of rejected)
    assert.equal((await call('POST', '/scores', bad)).data.error, 'invalid_score', JSON.stringify(bad))
  assert.equal((await call('POST', '/scores', round('com-all', 34, 90000, 34))).status, 201)
  assert.equal((await call('POST', '/scores', round('st-name', 40, 120000, 179, 'all'))).status, 201)
  assert.equal((await call('POST', '/scores', round('lm-loc', 20, 60000, 30))).status, 201)
  assert.equal((await db.query('select * from scores')).length, 3)
})

test('el ranking ordena por aciertos y luego por tiempo, con la mejor ronda de cada jugador', async () => {
  const ana = await signedUp('Ana')
  const beto = await signedUp('Beto')
  const caro = await signedUp('Caro')

  const first = await ana.call('POST', '/scores', round('com-name', 12, 50000))
  assert.deepEqual(first.data, {
    category: '15',
    rank: 1,
    players: 1,
    improved: true,
    best: { correct: 12, total: 15, ms: 50000 },
  })

  await beto.call('POST', '/scores', round('com-name', 14, 90000))
  await caro.call('POST', '/scores', round('com-name', 14, 70000))
  const worse = await ana.call('POST', '/scores', round('com-name', 9, 20000))
  assert.deepEqual(worse.data, {
    category: '15',
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

test('el administrador puede cambiar una clave, y eso cierra las sesiones abiertas', async () => {
  const { call: oldDevice } = await signedUp('Seba', 'secreto1')
  assert.equal(await resetPassword(db, 'seba', 'nueva-clave'), 'Seba')
  assert.equal(await resetPassword(db, 'nadie', 'nueva-clave'), null)
  assert.deepEqual((await oldDevice('GET', '/me')).data.user, null)
  assert.equal((await client()('POST', '/login', { name: 'Seba', password: 'secreto1' })).status, 401)
  assert.equal((await client()('POST', '/login', { name: 'Seba', password: 'nueva-clave' })).status, 200)
})

test('ya no existe la recuperación por código', async () => {
  const { call } = await signedUp('Seba')
  assert.equal((await call('POST', '/recover', { name: 'Seba' })).status, 404)
})

test('se rechazan claves filtradas, iguales al nombre o muy cortas', async () => {
  const call = client()
  const attempt = (name, password) => call('POST', '/register', { name, password })
  assert.equal((await attempt('seba', 'filtrada123')).data.error, 'breached_password')
  assert.equal((await attempt('sebastian', 'SEBASTIAN')).data.error, 'invalid_password')
  assert.equal((await attempt('seba', '1234567')).data.error, 'invalid_password')
  assert.equal((await attempt('seba', 'otra-clave-1')).status, 201)
})

test('las claves nuevas usan el costo actual y las antiguas se actualizan al entrar', async () => {
  await signedUp('Nueva', 'secreto1')
  const [fresh] = await db.query("select password_hash from users where name = 'Nueva'")
  assert.equal(+fresh.password_hash.split('$')[1], COST)

  await db.query('insert into users (name, name_key, password_hash) values ($1, $2, $3)', [
    'Vieja',
    'vieja',
    await hashPassword('secreto1', 16384),
  ])
  assert.equal((await client()('POST', '/login', { name: 'Vieja', password: 'secreto1' })).status, 200)
  const [upgraded] = await db.query("select password_hash from users where name = 'Vieja'")
  assert.equal(+upgraded.password_hash.split('$')[1], COST)
  assert.equal((await client()('POST', '/login', { name: 'Vieja', password: 'secreto1' })).status, 200)
  assert.equal((await client()('POST', '/login', { name: 'Vieja', password: 'incorrecta1' })).status, 401)
})

test('la consulta de claves filtradas manda solo 5 caracteres del hash y falla hacia "permitir"', async () => {
  const sent = []
  const fake = body => async url => {
    sent.push(url)
    return { ok: true, text: async () => body }
  }
  // SHA-1 de "password" = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  const hit = fake('0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n')
  assert.equal(await isBreachedPassword('password', hit), true)
  assert.deepEqual(sent, ['https://api.pwnedpasswords.com/range/5BAA6'])
  assert.equal(await isBreachedPassword('password', fake('0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n')), false)
  assert.equal(await isBreachedPassword('password', fake('1E4C9B93F3F0682250B6CF8331B7EE68FD8:0\r\n')), false)
  assert.equal(
    await isBreachedPassword('password', async () => {
      throw new Error('sin red')
    }),
    false,
  )
  assert.equal(await isBreachedPassword('password', async () => ({ ok: false })), false)
})

test('cada largo de ronda tiene su propio ranking, y se avisa qué largos tienen marcas', async () => {
  const ana = await signedUp('Ana')
  const beto = await signedUp('Beto')
  await ana.call('POST', '/scores', round('st-name', 12, 50000, 15))
  await ana.call('POST', '/scores', round('st-name', 25, 150000, 30))
  await beto.call('POST', '/scores', round('st-name', 150, 900000, 179, 'all'))
  const saved = await beto.call('POST', '/scores', round('st-name', 28, 160000, 30))
  assert.equal(saved.data.category, '30')
  assert.equal(saved.data.rank, 1)

  const board = async category =>
    (await ana.call('GET', `/leaderboard?mode=st-name&category=${category}`)).data
  const fifteen = await board('15')
  assert.deepEqual(
    fifteen.rows.map(row => [row.name, row.correct]),
    [['Ana', 12]],
  )
  const thirty = await board('30')
  assert.deepEqual(
    thirty.rows.map(row => [row.name, row.correct]),
    [
      ['Beto', 28],
      ['Ana', 25],
    ],
  )
  const everything = await board('all')
  assert.deepEqual(
    everything.rows.map(row => [row.name, row.total]),
    [['Beto', 179]],
  )
  assert.deepEqual(thirty.played, { 15: 1, 30: 2, all: 1 })
  assert.equal((await board('20')).rows.length, 0)

  const leaders = (await ana.call('GET', '/leaders?category=30')).data.modes
  assert.equal(leaders['st-name'].leader.name, 'Beto')
  assert.equal(leaders['st-name'].me.rank, 2)
  assert.equal((await ana.call('GET', '/leaderboard?mode=st-name&category=7')).status, 400)
})

test('las rondas de una categoría no se mezclan con las de otra al comparar la mejor marca', async () => {
  const { call } = await signedUp('Ana')
  assert.equal((await call('POST', '/scores', round('com-name', 14, 60000, 15))).data.improved, true)
  const other = await call('POST', '/scores', round('com-name', 5, 60000, 10))
  assert.equal(
    other.data.improved,
    true,
    'la primera de 10 preguntas es marca propia aunque sea peor que la de 15',
  )
  assert.equal(other.data.rank, 1)
})

test('un puntaje sin categoría (de antes de que existiera) se clasifica por su largo', async () => {
  const { call } = await signedUp('Ana')
  const legacy = ({ mode, correct, total, ms }) => ({ mode, correct, total, ms })
  assert.equal((await call('POST', '/scores', legacy(round('com-name', 10, 60000)))).data.category, '15')
  assert.equal((await call('POST', '/scores', legacy(round('com-all', 30, 90000, 34)))).data.category, 'all')
  assert.equal((await call('POST', '/scores', legacy(round('ch-all', 12, 60000, 16)))).data.category, 'all')
})

test('al actualizar la base no se pierde ninguna marca: las anteriores quedan en su categoría', async () => {
  // Una base creada antes de las categorías, con rondas ya guardadas.
  const old = new PGlite()
  const query = async (text, params = []) => (await old.query(text, params)).rows
  await query(
    'create table users (id integer generated always as identity primary key, name text not null, name_key text not null unique, password_hash text not null, created_at timestamptz not null default now())',
  )
  await query(
    'create table sessions (token_hash text primary key, user_id integer not null references users (id) on delete cascade, expires_at timestamptz not null)',
  )
  await query(
    'create table scores (id integer generated always as identity primary key, user_id integer not null references users (id) on delete cascade, mode text not null, correct integer not null, total integer not null, ms integer not null, created_at timestamptz not null default now())',
  )
  await query('create table failed_logins (name_key text not null, at timestamptz not null default now())')
  await query("insert into users (name, name_key, password_hash) values ('Ana', 'ana', 'x')")
  const before = [
    ['com-all', 33, 34, 70000],
    ['com-name', 12, 15, 55000],
    ['ch-all', 16, 16, 40000],
    ['lm-loc', 20, 30, 120000],
  ]
  for (const [mode, correct, total, ms] of before)
    await query('insert into scores (user_id, mode, correct, total, ms) values (1, $1, $2, $3, $4)', [
      mode,
      correct,
      total,
      ms,
    ])

  const upgraded = { query }
  await applySchema(upgraded)
  await applySchema(upgraded) // cada despliegue lo vuelve a aplicar: tiene que poder repetirse

  const rows = await query('select mode, category, correct, total, ms from scores order by id')
  assert.deepEqual(
    rows.map(row => [row.mode, row.category, row.correct, row.total, row.ms]),
    [
      ['com-all', 'all', 33, 34, 70000],
      ['com-name', '15', 12, 15, 55000],
      ['ch-all', 'all', 16, 16, 40000],
      ['lm-loc', '30', 20, 30, 120000],
    ],
  )

  // y siguen apareciendo en el ranking
  const api = createApi(upgraded, { isBreached: async () => false })
  const response = await api(new Request('https://juego.test/api/leaderboard?mode=com-all&category=all'))
  const board = await response.json()
  assert.deepEqual(
    board.rows.map(row => [row.name, row.correct, row.total]),
    [['Ana', 33, 34]],
  )
})
