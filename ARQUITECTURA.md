# Cómo está hecho NoTengoCalle.com

Este archivo explica el programa completo: qué hay en cada carpeta, cómo se conectan las partes, de dónde
salen los datos y cómo se prueba y se publica. Si cambias la estructura, actualízalo.

## En un minuto

Es un solo repositorio que se publica como un solo sitio en Netlify (un monolito):

```
Navegador                                   Netlify
┌───────────────────────────────┐           ┌──────────────────────────────────────┐
│ index.html                    │  archivos │ dist/  (lo construye `npm run build`) │
│  ├ Leaflet + MapLibre (mapa)  │◄──────────┤   index.html, assets/, data/, vendor/ │
│  ├ data.js (todos los datos)  │           │                                      │
│  └ src/ (el juego)            │   /api/*  │ Function "api"  ──►  Postgres (Neon) │
│      progreso en localStorage │◄─────────►│   server/  cuentas y ranking         │
└───────────────────────────────┘           └──────────────────────────────────────┘
```

- **El juego corre entero en el navegador.** No hay framework: es JavaScript en módulos, empaquetado con
  Vite. Todas las preguntas se generan localmente a partir de `data.js`; por eso responde al instante.
- **El servidor solo existe para cuentas y ranking.** Son ocho rutas bajo `/api`. El juego nunca espera al
  servidor para funcionar: sin cuenta, sin conexión o sin base de datos configurada se juega igual.
- **Los datos del juego son un archivo generado** (`public/data/data.js`) por el pipeline de `tools/`, que
  se corre a mano cuando se agrega o quita contenido.

## Carpetas

```
index.html              página única; carga las librerías del mapa, los datos y src/main.js
src/                    el juego (navegador)
  main.js                 punto de entrada: carga los modos y las pantallas, abre el menú
  core/                   piezas sin dependencias: utilidades, geometría, localStorage, progreso
  data/dataset.js         lee window.DATA y arma los índices que usa todo lo demás
  map/                    el mapa Leaflet (map.js) y cómo se dibuja cada cosa sobre él (draw.js)
  domain/                 ayudas por tema (comunas, landmarks, calles, metro, cerros, barrios, Chile)
  quiz/                   el motor de las rondas y los juegos
    engine.js               ciclo de una ronda: sortear, preguntar, corregir, cronometrar, resultado
    options.js              botones de alternativas (selección única y múltiple)
    steps.js                juegos "paso a paso" (rutas en auto y en transporte público)
    registry.js             lista de juegos registrados
    modes/                  un archivo por tema; cada juego es un registerMode({...})
    modes/retired/          juegos retirados del menú (se conservan; ver "Juegos retirados")
  ui/                     pantallas: menú, Explorar, ranking, cuenta, Mis calles, fotos
  account/                cliente del servidor: sesión y envío de puntajes
  styles/style.css        todos los estilos
  service-worker.js       caché para abrir rápido y sin conexión
shared/                 reglas que usan el navegador y el servidor (rondas oficiales, nombres de usuario)
server/                 el API: cuentas, sesiones, puntajes, ranking, esquema de la base
netlify/functions/      api.js: publica server/ como una Function de Netlify
dev/                    solo para trabajar en local: API sobre base local y generación del service worker
public/                 archivos que se publican tal cual
  data/data.js            GENERADO por tools/ — no editar a mano
  vendor/                 Leaflet 1.9.4, MapLibre GL 4.7.1 y leaflet-maplibre-gl (copias fijas)
  icons/, manifest.webmanifest
tools/                  pipeline de datos (se corre a mano, desde tools/; tiene su propio package.json)
tests/                  pruebas unitarias, del servidor y de navegador
netlify.toml            cómo construye y publica Netlify
vite.config.js, eslint.config.js, .prettierrc.json, package.json
```

Cómo dependen entre sí dentro de `src/`: `core` y `data` son la base y no conocen al resto; `map` dibuja;
`domain` combina datos y mapa por tema; `quiz` usa todo eso para hacer preguntas; las pantallas de `ui` van
encima, y `account` solo depende de `core`. Tres piezas pequeñas de `ui` son de uso común para cualquier
capa: `panel.js` (el panel y la barra), `photos.js` y `navigation.js`. Las pantallas (menú, Explorar,
ranking) no se importan entre sí: se abren por nombre con `navigate('home' | 'explore' | 'ranking')`.

## Trabajar en local

```
npm install          una vez
npm run dev          juego + API en http://localhost:5173 (recarga sola al guardar)
npm test             lint + pruebas unitarias y del servidor + pruebas de navegador
npm run build        genera dist/ igual que lo hará Netlify
npm run preview      sirve dist/ en http://127.0.0.1:8765 con el API local
npm run format       Prettier sobre todo el código
```

En local el API usa **PGlite**: un Postgres real que corre dentro de Node y guarda en `.local/db/` (ignorado
por git). No hay que instalar ni configurar nada; para partir de cero se borra esa carpeta.

## El juego (src/)

### Arranque

`index.html` carga, en orden: Leaflet y MapLibre (definen las globales `L` y `maplibregl`), `data.js` (define
`window.DATA`) y `src/main.js`. `main.js` importa los modos (`quiz/modes/index.js`) y las pantallas, abre el
menú y, en paralelo, pregunta al servidor si hay sesión (`restoreSession`). El menú no espera esa respuesta.

### Datos en memoria (`data/dataset.js`)

Expone `DATA` (el objeto generado) más índices derivados: `comunaByName`, `streetByName`, `stationByName`,
`landmarkById`, `CATEGORIES`, etc. También **completa los landmarks** con lo que no viene en `landmarks.json`:
barrios con perímetro (ids `z…`), 17 cerros destacados (`k…`) y las estaciones de metro (`m:…`). Y agrega a
`DATA.streets` las calles propias del usuario ("Mis calles", guardadas en su navegador, marcadas `custom`).

`roads()` y `quizStreets()` son funciones y no listas porque dependen de la ronda: en una ronda oficial
excluyen las calles propias.

### Mapa (`map/`)

`map.js` crea el mapa y concentra su estado: qué nombres muestra el mapa base (`setLabelMode('plain' |
'streets' | 'labels')`: durante las preguntas se ocultan), el relieve, el paso entre "solo Región
Metropolitana" y "todo Chile" (`setChile`) y los encuadres que respetan el panel (`fit`, `fitCity`). Todo lo
que dibuja la pregunta en curso va a `layer`, que se vacía con `clearLayer()`.

`draw.js` sabe dibujar cada cosa: comunas y regiones (`comunaLayer`), metro, calles, tramos con nombre,
barrios, etiquetas y marcadores.

Mapa base: OpenFreeMap (vectorial, sin API key) mediante MapLibre; relieve: AWS Terrain Tiles.

### Una ronda (`quiz/engine.js`)

Un **modo** es un objeto registrado con `registerMode`:

```js
registerMode({
  id: 'com-name',                 // también es la clave de sus estadísticas y de su ranking
  group: 'Comunas',               // tarjeta del menú donde aparece
  name: '¿Qué comuna es?',
  desc: 'Te marco una comuna y eliges su nombre.',
  pool: () => scopeComunas(),     // todos los ítems preguntables, según los ajustes vigentes
  key: f => f.properties.name,    // identificador estable del ítem (para estadísticas)
  ask(item, quiz) { ... },        // dibuja la pregunta y, cuando el jugador responde, llama a answer()
})
```

Opcionales: `label(item)`, `balance(item)` (grupo para que ninguna comuna domine la ronda), `setup(quiz)`,
`all` (pregunta el conjunto entero), `keepLayer`, `noHint`, `relief`, `chile`, `tall`.

`startQuiz(mode)` sortea los ítems, y por cada uno llama a `mode.ask`. El modo termina la pregunta con
`answer(ok, htmlDeExplicación, { points, partial })`, que registra el resultado, detiene el reloj y muestra
el botón "Siguiente". El cronómetro solo cuenta el tiempo de pensar: se detiene mientras se lee la respuesta.

El sorteo (`core/progress.js`) es ponderado: lo nuevo y lo fallado pesa más, lo dominado pesa menos.

### Práctica y rondas oficiales

Hay dos formas de jugar el mismo modo:

| | Práctica | Ronda oficial 🏆 |
|---|---|---|
| Ajustes | los del jugador (comunas, largo, categorías, líneas, modo estricto) | fijos: `OFFICIAL_RULES` en `shared/ranked.js` |
| Sorteo | ponderado por lo que el jugador falla | parejo para todos |
| Calles propias | incluidas | excluidas |
| Largo | el elegido | fijo por modo: `OFFICIAL_ROUNDS` |
| Va al ranking | no | sí, si hay cuenta |

Las reglas fijas se imponen en un solo lugar: `settings` (`core/store.js`) devuelve las preferencias del
jugador, salvo durante una ronda oficial, donde devuelve las de la ronda. Por eso los modos no necesitan
saber qué tipo de ronda es: siguen leyendo `settings.scope`, `settings.cats`, etc.

Al terminar una ronda oficial (`ui/officialOutcome.js` → `account/scores.js`):
- con sesión, el puntaje se envía y se muestra el puesto;
- sin sesión, queda en una cola local y se sube al entrar o crear cuenta;
- sin conexión, queda en la misma cola y se sube solo la próxima vez.

### Lo que se guarda en el navegador

`localStorage`, con prefijo `ntc:`:

| Clave | Contenido |
|---|---|
| `settings` | preferencias de práctica |
| `stats` | por cada `modo:ítem`: respuestas, aciertos y racha |
| `best` | récord personal por `modo:largo` |
| `conf` | pares de calles que el jugador ha confundido |
| `myStreets` | calles agregadas por el usuario |
| `explore`, `ranking` | última vista de esas pantallas |
| `user` | nombre de la sesión (solo para pintar el botón al instante) |
| `outbox` | rondas oficiales pendientes de enviar |

El progreso de práctica es local a cada navegador. Al servidor solo llegan las rondas oficiales.

### Juegos retirados

Los juegos que se sacaron del menú viven en `quiz/modes/retired/`. No se cargan en el sitio normal; con
`?retirados` en la URL sí aparecen, y las pruebas los recorren para que no se pudran. Para reactivar uno,
se mueve su `registerMode({...})` al archivo del tema en `quiz/modes/`. Algunos no tienen datos hoy
(`route`, `rs-home-car` y los de fronteras: `DATA.routes` y `DATA.borders` vienen vacíos).

### Service worker

`src/service-worker.js` guarda el sitio para abrir sin conexión. Al construir, `dev/serviceWorkerPlugin.js`
le antepone la lista de archivos y una versión calculada de su contenido: **ya no hay que subir un número a
mano** en cada despliegue. Nunca intercepta `/api/` ni las teselas del mapa.

## El servidor (server/)

Es una sola Function de Netlify. `server/api.js` recibe un `Request` y devuelve un `Response` (el estándar
web), así que el mismo código corre en Netlify y en el servidor local de desarrollo.

| Ruta | Qué hace |
|---|---|
| `POST /api/register` | crea la cuenta, inicia sesión y entrega el código de recuperación |
| `POST /api/login` | inicia sesión |
| `POST /api/logout` | cierra la sesión |
| `POST /api/recover` | cambia la clave usando el código de recuperación (y entrega uno nuevo) |
| `GET /api/me` | usuario de la sesión, o `null` |
| `POST /api/scores` | guarda una ronda oficial; responde puesto y mejor marca |
| `GET /api/leaderboard?mode=&period=` | los 50 mejores de un juego, más la fila del usuario |
| `GET /api/leaders?period=` | el líder de cada juego y el puesto del usuario en cada uno |

Los errores siempre salen como `{ "error": "código", "message": "texto para mostrar" }`.

### Cuentas

Nombre de usuario y clave, sin correo. Decisiones:

- **Claves** con scrypt (`server/passwords.js`); nunca se guardan en claro.
- **Sesión** en una cookie `HttpOnly` (el JavaScript de la página no puede leerla), `SameSite=Lax`, de 180
  días. En la base solo queda la huella del token.
- **Sin correo no hay "recuperar por mail"**: al registrarse se muestra una vez un código de recuperación
  (`ABCD-EFGH-JKMN`). Si alguien pierde clave y código, el administrador puede darle otro (ver abajo).
- **Nombres**: 3 a 20 letras, números, `.`, `_` o `-`. "Ñandú" y "nandu" cuentan como el mismo nombre.
- **Freno a fuerza bruta**: 10 intentos fallidos por nombre en 15 minutos bloquean ese nombre por un rato.
- Los `POST` que vienen de otro sitio se rechazan (cabecera `Origin`).

### Ranking

- Un ranking por juego. Ordena por aciertos y, a igual número, por menor tiempo.
- De cada jugador cuenta su mejor ronda; todas las rondas quedan guardadas (permite el ranking "últimos 7
  días" y, a futuro, historial).
- **El puntaje lo calcula el navegador.** El servidor solo descarta lo imposible (`scoreProblem` en
  `shared/ranked.js`: modo desconocido, largo distinto al oficial, tiempo inhumano). Alguien con ganas puede
  hacer trampa; es un riesgo aceptado para un juego entre amigos. Para borrar una marca tramposa, ver
  "Administrar".

### Base de datos

Postgres. El esquema completo está en `server/schema.sql` y se aplica solo en cada build
(`server/migrate.js`); cada sentencia es repetible (`create … if not exists`). Para cambiarlo, se agregan
sentencias repetibles al final (por ejemplo `alter table … add column if not exists …`).

| Tabla | Para qué |
|---|---|
| `users` | nombre, clave (hash), código de recuperación (hash) |
| `sessions` | sesiones abiertas |
| `scores` | cada ronda oficial jugada: usuario, modo, aciertos, total, milisegundos, fecha |
| `failed_logins` | intentos fallidos recientes (freno a fuerza bruta) |

En producción la base es **Neon** (Postgres serverless, plan gratis): se duerme sin uso y despierta sola con
la primera consulta, que por eso puede tardar cerca de un segundo.

### Administrar

Con la cadena de conexión de Neon en la variable `DATABASE_URL`:

```
node server/admin.js usuarios            lista de cuentas con cuántas rondas tiene cada una
node server/admin.js codigo <nombre>     código de recuperación nuevo para ese usuario
node server/admin.js borrar <nombre>     borra la cuenta y sus puntajes
```

Para todo lo demás, el editor SQL de la consola de Neon. Por ejemplo, las últimas rondas guardadas:

```sql
select scores.id, users.name, mode, correct, total, ms, scores.created_at
from scores join users on users.id = scores.user_id
order by scores.created_at desc limit 50;

delete from scores where id = 123;   -- borrar una marca
```

## Publicar (Netlify + GitHub)

Netlify construye el sitio desde GitHub: cada push a la rama de producción publica, y las demás ramas pueden
tener su propia vista previa. La configuración está en `netlify.toml`.

**Una vez, para conectar el repositorio** (en el sitio que ya existe, para conservar la dirección):
1. Netlify → el sitio → *Project configuration* → *Build & deploy* → *Continuous deployment* → *Link
   repository* → GitHub → `tatanas/notengocalle-com`.
2. Rama de producción: `main`. El comando y la carpeta se leen de `netlify.toml`; no hay que escribirlos.
3. En *Branches and deploy contexts*, activar los *branch deploys* para ver ramas como esta en una dirección
   propia antes de pasarlas a `main`.

**Una vez, para activar cuentas y ranking** (sin esto el sitio funciona igual, solo sin cuentas):
- Opción A, dentro de Netlify: agregar una base con **Netlify DB** (extensión de Neon). Crea la variable
  `NETLIFY_DATABASE_URL` sola. Hay que "reclamar" la base con una cuenta de Neon para que no caduque.
- Opción B, directo en Neon: crear un proyecto gratis en neon.tech, copiar la cadena de conexión y guardarla
  en Netlify como variable de entorno `DATABASE_URL` (disponible para *Builds* y *Functions*).

Después, volver a desplegar. En el registro del build debe aparecer `Base de datos: esquema al día.`

Los nombres exactos de los menús de Netlify y Neon cambian con el tiempo; si no calzan, la idea es la misma:
enlazar el repositorio y dejar la cadena de conexión en una variable de entorno.

Ojo: mientras producción y las vistas previas compartan la misma variable, comparten también la base. Para
separarlas, Netlify permite dar a cada contexto de despliegue un valor distinto de la variable.

## Datos: fuentes y pipeline (tools/)

### Fuentes

| Qué | De dónde |
|---|---|
| Comunas, calles, metro, lugares, barrios, cerros | OpenStreetMap (ODbL), vía Overpass y Nominatim |
| Rutas en auto | OSRM (router.project-osrm.org) |
| Rutas en micro y metro, recorridos | GTFS de Red (DTPM) |
| Regiones, ciudades y parques nacionales | OpenStreetMap; población de las ciudades |
| Fotos | Wikimedia Commons y Panoramax, siempre con autor y licencia visibles |
| Mapa base y relieve (en vivo, no en data.js) | OpenFreeMap / OpenMapTiles y AWS Terrain Tiles |

Todo es gratis y sin API keys. No se usan imágenes de Google.

### Qué trae `DATA`

`comunas` (GeoJSON), `metro` (`lines`, `stations`), `streets`, `landmarks`, `cerros`, `zones` (barrios con
perímetro), `photos` (por clave `l:` lugar, `s:` calle, `c:` cerro, `p:` parque), `inter` y `para` (cruces y
paralelas entre calles), `steps` (rutas en auto), `transit` (rutas en transporte público), `micros`,
`metroAlong`, `rotondas`, `chile` (`regions`, `cities`, `parks`) y `built` (fecha).

### Pipeline

Vive en `tools/`, con sus propias dependencias (`cd tools && npm install`) y **se ejecuta desde `tools/`**.
Los datos crudos pesados están ignorados por git (`btiles/`, `gtfs/`, `*_raw*.json`, cachés…); las salidas
curadas sí se versionan (`streets.json`, `landmarks.json`, `zones.json`, `chile.json`, `photos_*.json`,
`steproutes.json`, `transit.json`…).

Regenerar el archivo final (minutos): `npm run build` dentro de `tools/`
(equivale a `node build_data.js ../public/data/data.js`).

- **Agregar o quitar una calle**: editar `streetlist.js` → `node streets.js` → `node merge_st.js` →
  `npm run build`.
  Cada entrada es `[nombre_mostrado, regex_OSM, pista, ancla[lon,lat]|null, {bt:1, kind, gap, trMin}]`:
  `bt:1` busca en `btiles/` (descarga completa de la RM); `kind` es `calle|autopista|agua|tren`; `gap` es la
  distancia en km para unir tramos separados; `trMin` el largo mínimo para mostrar "tramos con nombre".
  Para ver cómo figura una calle en OSM: `nameidx.json`, `ways_named.json`,
  `node cross.js "<nombre OSM>" lat|lon`.
- **Agregar o quitar un landmark**: editar `lmlist.js` (`[nombre, categoría, consulta Nominatim, comuna
  esperada, descripción]`) → `cp landmarks.json landmarks.prev.json` → `node geocode.js` (1 consulta por
  segundo) → `node finalize_lm.js` (ajustes en el objeto `F`: coordenadas `ll`, renombres, `obvious`, foto
  prestada `pk`, `alt`; lista `DROP`; carreras en `careers.js`) → **`node remap_routes.js`** (los ids `l0,
  l1…` se corren; esto reasigna las rutas) → `node merge_st.js` → `npm run build`.
- **Barrios con perímetro**: `zones.js` (esquinas como cruces de calles por regex, o `axis`/`at` para zonas
  aproximadas) → `zones.json`. Si el barrio ya existe como landmark con otro nombre, se enlazan en
  `LANDMARK_NAME_OF_ZONE` (`src/data/dataset.js`).
- **Fotos**: `photos.js` (landmarks), `photos_streets*.js` (calles; las numeradas son tandas sucesivas),
  `parkphotos.js`. Revisar siempre a ojo con `sheets.py` (arma mosaicos). La selección revisada está fijada
  **por índice** en `merge_st.js` (`BAD`/`KEEP` por tanda) y en `build_data.js` (`BADP`): si se regenera un
  JSON de fotos, los índices cambian y hay que revisar de nuevo.
- **Otros**: `metro.js`, `cerros.js`, `chile.js`/`chile2.js`, `extras.js` (rotondas, calles por línea de
  metro), `relations.js` (cruces y paralelas), `steproutes.js` (OSRM), `transit.js` (GTFS → itinerarios),
  `micros.js`, `border.js` (fronteras entre comunas; la sección se retiró, el cálculo sigue disponible).
- **Descargas crudas**: consultas Overpass en `q*.txt`. GTFS: el enlace vigente está en
  https://www.dtpm.cl/index.php/noticias/gtfs-vigente

Si cambia el tamaño de algún conjunto que se pregunta completo (hoy 34 comunas del Gran Santiago y 16
regiones), hay que actualizar `OFFICIAL_ROUNDS` en `shared/ranked.js`.

## Pruebas (tests/)

| Comando | Qué cubre |
|---|---|
| `npm run lint` | nombres no definidos, imports sobrantes |
| `npm run test:unit` | `unit.test.js` (geometría, sorteo, reglas compartidas) y `api.test.js` (el servidor completo contra un Postgres en memoria) |
| `npm run test:e2e` | Chrome real sobre el build: recorre todos los juegos en escritorio y celular, los retirados, el cronómetro, las calles propias, el inicio de las 15 rondas oficiales, las fotos y el flujo completo de cuentas y ranking |

`node tests/run.js smoke accounts` corre solo algunas suites; `--no-build` reutiliza `dist/`; `--dev` sirve el
código sin empaquetar, para que un error apunte al archivo y la línea reales. Las capturas quedan en
`tests/shots/`. Chrome se busca en las rutas habituales o en la variable `CHROME_PATH`.

## Decisiones y sus razones

- **Sin React ni otro framework.** La interfaz es un mapa y un panel; el estado vive en el mapa de Leaflet,
  que es imperativo. Un framework agregaría peso y una reescritura sin dar nada a cambio. Lo que el juego
  necesitaba era orden (módulos) y eso lo da Vite sin costo en el navegador: el código propio pesa unos
  33 KB comprimidos.
- **Librerías del mapa y datos fuera del bundle** (`public/`). Son grandes y cambian poco: así el navegador
  las guarda aparte y un cambio en el juego no obliga a bajarlas de nuevo. Además Leaflet y sus plugins
  funcionan mejor como globales que empaquetados.
- **API propio en vez de un servicio de autenticación.** Usuario y clave sin correo no calza con los
  servicios listos (piden correo o teléfono), y son pocas rutas. Todo queda en un repositorio y un despliegue.
- **Postgres (Neon).** Un ranking es una consulta ordenada; SQL lo resuelve directo. Neon no exige mantener
  nada encendido y no se pausa de forma que requiera intervención manual.
- **Sin "entrar con Google".** Obliga a registrar una aplicación en Google Cloud y mantenerla; para un
  apodo y una clave no se justifica. Se puede agregar después sin tocar el ranking.

## Cambios frecuentes

- **Nuevo juego**: `registerMode({...})` en el archivo del tema dentro de `src/quiz/modes/`. Si debe tener
  ranking, agregar su id y largo a `OFFICIAL_ROUNDS` (`shared/ranked.js`).
- **Retirar un juego**: mover su `registerMode` a `src/quiz/modes/retired/` y quitarlo de `OFFICIAL_ROUNDS`.
- **Nuevo ajuste de práctica**: valor por defecto en `core/store.js`, control en `ui/home.js` y, si afecta la
  dificultad, su valor fijo en `OFFICIAL_RULES`.
- **Nueva ruta del API**: función en `server/` y una línea en `ROUTES` (`server/api.js`); prueba en
  `tests/api.test.js`.
