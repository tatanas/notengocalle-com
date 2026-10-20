# NoTengoCalle — contexto para continuar el proyecto

Juego web para aprender la geografía de Santiago (comunas, calles, lugares, metro, rutas) y de Chile (regiones, ciudades, parques). Tiene cuentas (usuario y clave, sin correo, o "Continuar con Google") y ranking por juego; también se puede jugar sin cuenta. Partió pensado para el sector oriente y se está generalizando a todo Santiago: se saca lo demasiado específico de un sector y cada usuario puede agregar lo suyo (Mis calles, punto fijo del ruteo). **No guardar en el repo nada que ubique al dueño** (dónde vive o estudia): el repo es público. "NoTengoCalle" es solo el **nombre mostrado**; el dominio lo define Netlify.

## Qué leer

Este archivo se carga siempre; lo demás, **solo el documento que la tarea toque** (no leer por si acaso).

| Si la tarea… | Leer |
|---|---|
| toca código (mapa de carpetas y "dónde tocar cada cosa") | [ARQUITECTURA.md](ARQUITECTURA.md) |
| retoma el trabajo (estado, comandos, ahorro de tokens) | [docs/siguiente-sesion.md](docs/siguiente-sesion.md) |
| agrega, cambia o retira un juego; toca el menú, rondas o ranking | [docs/modos.md](docs/modos.md) |
| agrega o quita calles, lugares o barrios | [docs/decisiones-contenido.md](docs/decisiones-contenido.md) (lo ya descartado) y [docs/datos.md](docs/datos.md) (pipeline) |
| toca el ruteo (`rs-*`) | [docs/ruteo.md](docs/ruteo.md) |
| toca Street View | [docs/streetview.md](docs/streetview.md) |
| toca cuentas, ranking o la base de datos | [docs/servidor.md](docs/servidor.md) |
| publica o configura Netlify/Neon | [docs/publicar.md](docs/publicar.md) |
| toca anuncios | [docs/publicidad.md](docs/publicidad.md) |
| busca qué hacer después | [docs/pendientes.md](docs/pendientes.md) |
| revisa qué calles sacar (25 KB: buscar con grep) | [docs/revision-calles.md](docs/revision-calles.md) |

## Cómo hablar y trabajar con el usuario

- Español de Chile, directo y conciso. Reportar con honestidad: si algo no se probó o falló, decirlo.
- Verificar con las pruebas automáticas antes de decir "listo"; revisar visualmente las capturas de `pruebas/capturas/` lo que se pueda.
- **Pruebas: no correr la suite completa por costumbre** (`npm run test:full` tarda más de 10 minutos). `npm test` = lint + unitarias + solo las suites de navegador que corresponden a los archivos modificados (`pruebas/seleccion.js`; sin cambios sin confirmar usa el último commit). La completa solo cuando el cambio es amplio (motor de rondas, datos, ranking/servidor, `package.json`, el propio arnés de pruebas, más de 30 archivos) o antes de un despliegue grande; `pruebas/ejecutar.js` ya la elige sola con `--cambios` en esos casos. Las pruebas imprimen solo lo que falla (`--verboso` para ver todo).
- Para **sacar** cosas (calles, lugares) el usuario prefiere que se le liste primero y decida una a una.
- El usuario hace los `git push`; commit solo cuando se lo piden.

## Reglas del producto (decisiones del dueño; no re-discutir)

- Preguntas "justas": el nombre no debe delatar la comuna ni la ubicación (campo `obvious` para los inevitables, como "Plaza de Maipú").
- El juego es instantáneo: nada de frameworks ni de esperar al servidor para jugar.
- **No se dice "ronda oficial" en la interfaz**: hay rondas (cuentan para el ranking, 🏆) y **práctica** (🏋️). En el código sigue siendo `ranked`/`oficial`/`MODOS_OFICIALES`. La práctica es siempre "modo fácil"; la ronda, siempre difícil.
- Se prefiere lo gratis, pero ya no rige "sin API keys". Llaves e IDs públicos en uso: Google Maps (Street View) y el ID de cliente OAuth de Google (`compartido/configuracion.js`); publicidad con AdSense. **Nada de imágenes de Google fuera de Street View.** Fotos: solo Wikimedia Commons (con autor y licencia visibles) y Panoramax (Mapillary se eliminó).
- Tipografía: gobCL (Kit Digital del Gobierno de Chile), **en prueba** (`public/fuentes/gobcl/`, `@font-face` al comienzo de `estilos.css`); el zip no trae licencia: confirmar si se puede usar fuera del Estado antes de dejarla.
- Conexiones (`cx`) está retirado por mientras (`docs/pendientes.md`). Lo que ya se sacó del juego y no vuelve sin preguntar: `docs/decisiones-contenido.md`.

## Estilo de código

- El código debe leerse solo: nombres descriptivos y funciones cortas en vez de comentarios. Un comentario solo cuando explica un porqué que el código no puede decir.
- Prettier (`npm run format`) y ESLint (`npm run lint`) mandan; no discutir formato a mano.
- Los archivos de `src/juego/modos/` y `src/interfaz/explorar.js`, `src/interfaz/misCalles.js`, `src/juego/pasos.js` se migraron del antiguo `js/app.js` casi tal cual (solo reformateados y con imports): todavía usan nombres cortos (`f`, `l`, `s`, `q`). Al tocarlos, mejorar los nombres de lo que se toque.

## Ahorro de tokens

- `.claude/settings.json` bloquea Read/Grep sobre lo pesado o generado: `public/data/` (`data.js` son 2 MB en 2 líneas), `public/vendor/`, `tools/*.json`, `src/datos/lugaresStreetView.json` y `pistasCalles.json`, `dist/`, `node_modules/`, `package-lock.json`. Consultar los datos del juego con `npm run datos -- "<expresión sobre D>"` (corta la salida); `tools/package.json` cae en el bloqueo de `tools/*.json`: usar `cat`.
- Buscar con grep antes de leer; los archivos de `src/juego/modos/` llegan a 22 KB: leerlos por rango.
- Escribir scripts Python/JS a archivos (`.local/`, ignorado por git) y no en línea en Bash: las comillas y las barras invertidas se rompen.

## Trampas conocidas

- ESLint no revisa que un `import { x }` exista en el archivo de origen; eso lo detecta `npm run build`.
- Los landmarks de cerros, zonas y ríos/canales se **agregan en runtime** a `DATA.landmarks` en `src/datos/datos.js` (ids `k`, `z`, `w`); no están en `landmarks.json`.
- En producción la base es Neon (driver HTTP); en local y en las pruebas, PGlite. **El camino con Neon real y el `rateLimit` por IP de `netlify/functions/api.js` nunca se han visto funcionar**: verificarlos en el primer despliegue.
- **Llave de Google Maps** (Street View): `GOOGLE_MAPS_KEY` en Netlify o `.env.local`; detalles y restricciones en [docs/streetview.md](docs/streetview.md).
- Trampas del pipeline de datos (Overpass, Wikimedia, Valhalla, `remap_routes.js`, nombres repetidos de calles): [docs/datos.md](docs/datos.md#trampas-del-pipeline).
