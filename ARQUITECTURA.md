# Cómo está hecho NoTengoCalle

Mapa del código: qué hay en cada carpeta y cómo se conectan las partes. Es corto a propósito; el detalle de cada tema está en `docs/` (tabla al final). Si cambias la estructura, actualízalo.

## En un minuto

Un solo repositorio que se publica como un solo sitio en Netlify (monolito):

```
Navegador                                   Netlify
┌───────────────────────────────┐           ┌──────────────────────────────────────┐
│ index.html                    │  archivos │ dist/  (lo construye `npm run build`) │
│  ├ Leaflet + MapLibre (mapa)  │◄──────────┤   index.html, assets/, data/, vendor/ │
│  ├ data.js (todos los datos)  │           │                                      │
│  └ src/ (el juego)            │   /api/*  │ Function "api"  ──►  Postgres (Neon) │
│      progreso en localStorage │◄─────────►│   servidor/ cuentas y ranking        │
└───────────────────────────────┘           └──────────────────────────────────────┘
```

- **El juego corre entero en el navegador.** Sin framework: JavaScript en módulos empaquetado con Vite. Las preguntas se generan localmente a partir de `data.js`; por eso responde al instante.
- **El servidor solo existe para cuentas y ranking.** El juego nunca espera al servidor: sin cuenta, sin conexión o sin base de datos se juega igual.
- **Los datos son un archivo generado** (`public/data/data.js`) por el pipeline de `tools/`, que se corre a mano cuando se agrega o quita contenido.

## Carpetas

```
index.html              página única; carga las librerías del mapa, los datos y src/main.js
src/                    el juego (navegador)
  main.js                 punto de entrada: carga los modos y las pantallas, abre el menú
  nucleo/                 sin dependencias: utilidades, geografia, almacen.js (localStorage y `ajustes`), progreso (sorteo), parecido entre calles
  datos/                  datos.js lee window.DATA y arma los índices; lugaresStreetView.json, pistasCalles.json, recintos.json
  mapa/                   mapa.js (el mapa Leaflet y su estado), dibujo.js (cómo se dibuja cada cosa), ayudas.js, streetView.js (visor)
  dominio/                lógica por tema: calles, comunas, lugares, metro, cerros, zonas, chile, streetView (puntaje), ubicacion,
                          compartir; ruteo en auto: decisionesEnAuto, decisionesConStreetView, cruceDeRuta, salidas, maniobras, rutaEnAuto
  juego/                  el motor de las rondas y los juegos
    engine.js               ciclo de una ronda: sortear, preguntar, corregir, cronometrar, resultado (arriba, el contrato de un modo)
    options.js              botones de alternativas      pasos.js   juegos "paso a paso" (ruteo)      registry.js   registrarModo
    modos/                  un archivo por tema; cada juego es un registrarModo({...}); index.js los carga
  interfaz/               pantallas: inicio.js (menú), explorar, ranking, progreso, cuenta, misCalles, fotos, recorrerCalle,
                          resultadoOficial, compartir, anuncios, pie, panel.js (panel y barra), navegacion.js, confirmar.js
  cuenta/                 cliente del servidor: sesión, puntajes, progresoCompartido, reportes, google
  estilos/estilos.css     todos los estilos
  service-worker.js       caché para abrir rápido y sin conexión
compartido/             reglas que usan el navegador y el servidor (oficial.js: rondas, largos, categorías; cuentas.js; rutaEnAuto.js)
servidor/               el API: autenticacion, puntajes, progreso, reportes, esquema.sql, admin.js (api.js enruta)
netlify/functions/      api.js: publica servidor/ como una Function de Netlify
desarrollo/             solo para trabajar en local: API sobre base local (PGlite) y generación del service worker
public/                 se publica tal cual: data/ (GENERADO, no editar), vendor/ (Leaflet, MapLibre), fuentes/, icons/
tools/                  pipeline de datos (a mano; su propio package.json; los scripts de Street View se corren desde la raíz)
pruebas/                unitarias, del servidor y de navegador (conjuntos/: las suites; ejecutar.js; seleccion.js elige cuáles correr)
docs/                   detalle por tema (ver el final)
```

Dependencias dentro de `src/`: `nucleo` y `datos` son la base y no conocen al resto; `mapa` dibuja; `dominio` combina datos y mapa por tema; `juego` usa todo eso para hacer preguntas; las pantallas de `interfaz` van encima, y `cuenta` solo depende de `nucleo`. Tres piezas de `interfaz` son de uso común: `panel.js`, `fotos.js` y `navegacion.js`. Las pantallas (menú, Explorar, ranking) no se importan entre sí: se abren por nombre con `navegar('home' | 'explore' | 'ranking' | 'progress')`, que antes de cambiar pregunta a quien tenga algo en curso (el motor pide confirmación con `confirmar.js` si se sale a media ronda).

## Trabajar en local

```
npm install          una vez
npm run dev          juego + API en http://localhost:5173 (recarga sola al guardar)
npm test             lint + unitarias + solo las suites de navegador que corresponden a lo modificado
npm run build        migra la base y genera dist/ igual que Netlify (detecta imports rotos que ESLint no ve)
npm run preview      sirve dist/ en http://127.0.0.1:8766 con el API local
npm run format       Prettier sobre todo el código
```

En local el API usa **PGlite** (un Postgres real dentro de Node) y guarda en `.local/db/` (ignorado por git); para partir de cero se borra esa carpeta.

## El juego (src/)

**Arranque.** `index.html` carga Leaflet y MapLibre (globales `L` y `maplibregl`), `data.js` (`window.DATA`) y `src/main.js`, que importa los modos (`juego/modos/index.js`) y las pantallas, abre el menú y, en paralelo, pregunta al servidor si hay sesión. El menú no espera esa respuesta.

**Datos en memoria.** `src/datos/datos.js` expone los datos más índices derivados y **completa los landmarks** con lo que no viene en `landmarks.json` (barrios con perímetro `z…`, 17 cerros `k…`, ríos y canales `w…`) y las calles propias del usuario ("Mis calles", marcadas `custom`). Qué trae `DATA`: [docs/datos.md](docs/datos.md). Alternativas de "¿Qué calle es?": `dominio/calles.js` (`distractoresDeCalle`) y `nucleo/parecido.js`; cada candidata pesa por cercanía, parecido de orientación, si corre pegada a la pedida y las confusiones previas del jugador (estas se ignoran en rondas oficiales). En una ronda oficial se excluyen las calles propias.

**Mapa.** `mapa/mapa.js` crea el mapa y concentra su estado: nombres del mapa base (`fijarModoDeEtiquetas`: durante las preguntas se ocultan), relieve, paso entre "solo RM" y "todo Chile" (`fijarChile`) y los encuadres (`encuadrar`, `encuadrarCiudad`…; animados). Un encuadre se calcula con el tamaño que tiene el panel en ese momento: los juegos de calles dibujan primero las alternativas y recién entonces encuadran (y en la respuesta, al revés). Esos juegos marcan `roomy: true` (`fijarDesplazamientoAmplio`): sin eso, Leaflet empuja de vuelta el mapa cuando una calle larga queda en el borde y la deja bajo el panel. Todo lo que dibuja la pregunta en curso va a `capa`, que se vacía con `limpiarCapa()`. Mapa base: OpenFreeMap (vectorial, sin API key) con MapLibre; relieve: AWS Terrain Tiles.

**Una ronda** (`juego/engine.js`). Un **modo** es un objeto registrado con `registrarModo` (campos obligatorios y opcionales: comentario al comienzo de `engine.js`). `iniciarPartida(modo, …)` sortea los ítems y por cada uno llama a `modo.ask`; el modo termina la pregunta con `responder(ok, htmlDeExplicación, { points, partial })`, que registra el resultado, detiene el reloj y muestra "Siguiente". El cronómetro solo cuenta el tiempo de pensar. El sorteo (`nucleo/progreso.js`) es ponderado: lo nuevo y lo fallado pesa más, lo dominado menos.

### Práctica y rondas oficiales

|  | Práctica | Ronda oficial (botón grande) |
|---|---|---|
| Ajustes | los del jugador (comunas, largo, categorías, líneas) | fijos: `REGLAS_OFICIALES` en `compartido/oficial.js` |
| Ayudas | siempre modo fácil (bordes de comunas y metro) y "Ver nombres" | ninguna: siempre difícil, sin botones |
| Sorteo | ponderado por lo que el jugador falla | parejo para todos |
| Calles propias | incluidas | excluidas |
| Largo | el elegido (10, 20 o todas) | el elegido; cada largo tiene su ranking |
| Va al ranking | no | sí, si hay cuenta |
| Al empezar | de inmediato | cuenta regresiva de 3 segundos |

El **botón grande** de cada juego es la ronda oficial y el **chico** ("Práctica") la de práctica; los juegos con `soloOficial: true` no tienen práctica. La cuenta regresiva (`correrCuentaRegresiva`) tapa el mapa antes de la primera pregunta; el reloj parte con la pregunta, no con la cuenta, y salir durante la cuenta no pide confirmación. Durante la cuenta el mapa se puede mover: si la persona lo acomodó, el encuadre inicial no lo pisa (`vigilarAjustesDeVista`). Las rondas oficiales tienen un botón de reiniciar en la barra (`#btnRestart`).

Las reglas fijas se imponen en un solo lugar: `ajustes` (`nucleo/almacen.js`) devuelve las preferencias del jugador, salvo durante una ronda oficial, donde devuelve las de la ronda (`aplicarReglasDeRonda`). Los modos no necesitan saber qué tipo de ronda es: siguen leyendo `ajustes.scope`, `ajustes.cats`, etc.

Al terminar una ronda oficial (`interfaz/resultadoOficial.js` → `cuenta/puntajes.js`): con sesión, el puntaje se envía y se muestra el puesto; sin sesión o sin conexión, queda en una cola local (`outbox`) y se sube al entrar o la próxima vez.

### Lo que se guarda en el navegador

`localStorage`, con prefijo `ntc:` (`nucleo/almacen.js`):

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
| `progresoPendiente` | respuestas de práctica aún no subidas (con cuenta, `stats` se comparte entre dispositivos) |
| `salidasDelPunto`, `rutasEnAutoV2` | caché del ruteo en auto: por dónde se sale de cada punto; rutas ya calculadas |
| `puntosReportados` | puntos de Street View que el jugador marcó como túnel |

### Service worker

`src/service-worker.js` guarda el sitio para abrir sin conexión. Al construir, `desarrollo/pluginServiceWorker.js` le antepone la lista de archivos y una versión calculada de su contenido (no hay que subir un número a mano). Nunca intercepta `/api/` ni las teselas del mapa.

## Pruebas (pruebas/)

| Comando | Qué cubre |
|---|---|
| `npm run lint` | nombres no definidos, imports sobrantes |
| `npm run test:unit` | `unitarias.test.js` (geometría, sorteo, reglas compartidas) y `api.test.js` (servidor contra Postgres en memoria; ~3 min) |
| `npm test` | lint + unitarias + las suites de navegador que corresponden a lo modificado (`seleccion.js`; si el cambio es amplio, corre todo) |
| `npm run test:full` | lint + unitarias + todas las suites de navegador (más de 10 minutos) |
| `node pruebas/ejecutar.js humo cuentas` | solo esas suites. `--sin-build` reutiliza `dist/`; `--dev` sirve el código sin empaquetar (errores con archivo y línea reales); `--verboso` lista también lo que pasa |

Las pruebas imprimen **solo lo que falla** más un resumen (unitarias con reporte `dot`; navegador sin las líneas `✓`), para no gastar tokens. Las capturas quedan en `pruebas/capturas/` (ignoradas por git). Chrome se busca en las rutas habituales o en `CHROME_PATH`. Street View no se prueba de forma automática.

## Dónde tocar cada cosa

| Quiero… | Archivo(s) |
|---|---|
| Un juego nuevo | `registrarModo({...})` en `src/juego/modos/<tema>.js`; si tiene ranking, su id en `MODOS_OFICIALES` (`compartido/oficial.js`) |
| Retirar un juego | borrar su `registrarModo` y quitarlo de `MODOS_OFICIALES` (sus marcas quedan en la base) |
| Un ajuste de práctica nuevo | valor por defecto en `nucleo/almacen.js`, control en `interfaz/inicio.js` y, si afecta la dificultad, su valor fijo en `REGLAS_OFICIALES` |
| Una ruta nueva del API | función en `servidor/`, línea en `ROUTES` (`servidor/api.js`), prueba en `pruebas/api.test.js` |
| Agregar/quitar una calle, un lugar o un barrio | [docs/datos.md](docs/datos.md) (pipeline) y antes [docs/decisiones-contenido.md](docs/decisiones-contenido.md) |
| Reglas de "Encuentra la calle" / `st-punto` | `src/juego/modos/calles.js` (constantes arriba de `st-find`); el punto: `puntoParaPreguntar` en `src/dominio/calles.js` |
| Niveles de Street View | listas de `tools/niveles_streetview.mjs`; selector en `src/interfaz/inicio.js`; `NIVEL_MAXIMO` en `src/juego/modos/streetView.js` |
| Visor de Street View | `src/mapa/streetView.js` (un solo panorama reutilizado; ver [docs/streetview.md](docs/streetview.md)) |
| Rankings por ajuste (nivel de Street View, alcance de comunas) | `ajusteDeCategoria` y `COMUNAS_POR_ALCANCE` en `compartido/oficial.js`; el motor lo aplica en `iniciarPartida` |
| Rondas oficiales / largos / categorías | `compartido/oficial.js` (lo comparten navegador y servidor) |
| Puntajes y ranking del servidor | `servidor/puntajes.js`, `servidor/api.js` |
| Menú / barra superior / Mi progreso | `src/interfaz/inicio.js`, `index.html` (pestañas), `src/interfaz/progreso.js` |
| Ruteo en auto | [docs/ruteo.md](docs/ruteo.md): construcción `compartido/rutaEnAuto.js`; mapa `src/dominio/decisionesEnAuto.js`; Street View `src/dominio/decisionesConStreetView.js`; cruces `src/dominio/cruceDeRuta.js`; salidas `src/dominio/salidas.js` |
| Qué suite corre por archivo cambiado | `pruebas/seleccion.js` |

## Decisiones y sus razones

- **Sin React ni otro framework.** La interfaz es un mapa y un panel; el estado vive en el mapa de Leaflet, que es imperativo. Lo que el juego necesitaba era orden (módulos) y eso lo da Vite sin costo en el navegador.
- **Librerías del mapa y datos fuera del bundle** (`public/`). Son grandes y cambian poco: el navegador las guarda aparte y un cambio en el juego no obliga a bajarlas de nuevo. Leaflet y sus plugins funcionan mejor como globales que empaquetados.
- **API propio en vez de un servicio de autenticación.** Usuario y clave sin correo no calza con los servicios listos (piden correo o teléfono), y son pocas rutas. Google se agregó aparte, sin quitar la cuenta con clave (ver `docs/servidor.md`).
- **Postgres (Neon).** Un ranking es una consulta ordenada; SQL lo resuelve directo, y Neon no exige mantener nada encendido.

## Detalle por tema (leer solo el que corresponda)

| Documento | Contenido |
|---|---|
| [docs/siguiente-sesion.md](docs/siguiente-sesion.md) | estado actual, comandos útiles, trucos para gastar pocos tokens |
| [docs/modos.md](docs/modos.md) | ids de los juegos, reglas de cada uno, menú, rondas y ranking |
| [docs/decisiones-contenido.md](docs/decisiones-contenido.md) | qué se sacó del juego y no se vuelve a agregar; pendientes de confirmar |
| [docs/datos.md](docs/datos.md) | fuentes, qué trae `DATA`, pipeline de `tools/`, trampas de Overpass/Wikimedia |
| [docs/ruteo.md](docs/ruteo.md) | rutas en auto y en micro: cómo se arman y las reglas del dueño |
| [docs/streetview.md](docs/streetview.md) | Street View: niveles, puntos, llave de Google |
| [docs/servidor.md](docs/servidor.md) | rutas del API, cuentas, ranking, base de datos, administración |
| [docs/publicar.md](docs/publicar.md) | Netlify, GitHub y Neon |
| [docs/publicidad.md](docs/publicidad.md) | AdSense |
| [docs/pendientes.md](docs/pendientes.md) | ideas, pendientes y juegos retirados que podrían volver |
| [docs/revision-calles.md](docs/revision-calles.md) | calles candidatas a sacar, por sector (25 KB: buscar con grep, no leer entero) |
