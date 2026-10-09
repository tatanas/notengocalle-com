# NoTengoCalle.com — contexto para continuar el proyecto

Juego web para aprender la geografía de Santiago: comunas, calles, lugares, metro, rutas, y regiones/ciudades/parques de Chile. Tiene cuentas (usuario y clave, sin correo) y ranking por juego; también se puede jugar sin cuenta. El dueño vive en el sector oriente (Lo Barnechea / Las Condes / Vitacura) y estudia en el Campus San Joaquín UC; quiere que sirva sobre todo para el oriente, pero está pensando en generalizarla (por eso se están sacando cosas demasiado específicas y se quiere que cada usuario pueda agregar las suyas).
"NoTengoCalle.com" es solo el **nombre mostrado**; el dominio lo define Netlify.

**La estructura del código, el servidor, la base de datos, el pipeline de datos, las pruebas y el despliegue están explicados en [ARQUITECTURA.md](ARQUITECTURA.md). Léelo antes de tocar código y mantenlo al día.** Este archivo solo guarda lo que no está ahí: cómo trabajar y las decisiones de contenido.

## Cómo hablar y trabajar con el usuario
- Español de Chile, directo y conciso. Reportar con honestidad: si algo no se probó o falló, decirlo.
- Verificar con las pruebas automáticas (`npm test`) antes de decir "listo"; revisar visualmente las capturas de `tests/shots/` lo que se pueda.
- Para **sacar** cosas (calles, lugares) el usuario prefiere que se le liste primero y decida una a una.
- Todo gratis, sin API keys. Nada de imágenes de Google. Fotos: solo Wikimedia Commons (con autor y licencia visibles) y Panoramax. Mapillary se probó y se **eliminó** (las fotos eran inútiles).
- Preguntas deben ser "justas": el nombre no debe delatar la comuna ni la ubicación (campo `obvious` para los inevitables, como "Plaza de Maipú").
- Que el juego siga siendo instantáneo: nada de frameworks ni de esperar al servidor para jugar.

## Estilo de código
- El código debe leerse solo: nombres descriptivos y funciones cortas en vez de comentarios. Un comentario solo cuando explica un porqué que el código no puede decir.
- Prettier (`npm run format`) y ESLint (`npm run lint`) mandan; no discutir formato a mano.
- Los archivos de `src/quiz/modes/` y `src/ui/explore.js`, `src/ui/myStreets.js`, `src/quiz/steps.js` se migraron del antiguo `js/app.js` casi tal cual (solo reformateados y con imports): todavía usan nombres cortos (`f`, `l`, `s`, `q`). Al tocarlos, mejorar los nombres de lo que se toque.

## Modos actuales (ids)
Comunas: `com-name`, `com-all` · Landmarks: `lm-loc`, `lm-com` (incluye barrios con perímetro, estaciones de metro como categoría "Metro" filtrable por línea, 17 cerros) · Calles: `st-name`, `st-find` (con landmarks cercanos al responder, tramos con nombre, bordes de comunas/metro activables) · Ruteo: `rs-any-car`, `rs-any-tp` (paso a paso, GTFS de Red) · Chile: `ch-find`, `ch-city`, `ch-cityreg`, `ch-all` · Parques nacionales: `pn-reg`, `pn-photo` · Conexiones: `cx` (13 tipos de preguntas, selección múltiple). Los 15 tienen ronda oficial 🏆 con ranking. Más: Explorar (capas activables), "Mis calles" (el usuario busca una calle en Nominatim y se guarda en su navegador), cronómetro + récord personal por juego.
Los retirados están en `src/quiz/modes/retired/` (se ven con `?retirados` en la URL). No se borra su código.

## Trampas conocidas
- **Overpass**: overpass-api.de suele dar 504/timeout (probar espejos kumi.systems, private.coffee, mandar `User-Agent` descriptivo); **no sirve desde el navegador** (CORS). Para la búsqueda de "Mis calles" se usa Nominatim, que sí funciona desde el navegador.
- **Wikimedia**: con User-Agent genérico responde 429; usar uno descriptivo con contacto. Nominatim: máx. 1 req/s.
- OSRM público (router.project-osrm.org) es solo para uso liviano.
- En Bash, escribir scripts Python/JS a archivos en vez de en línea (las comillas y las barras invertidas se rompen).
- Los landmarks de metro, cerros y zonas se **agregan en runtime** a `DATA.landmarks` en `src/data/dataset.js` (ids `m:`, `k`, `z`), no están en landmarks.json.
- Calles con el mismo nombre en distintas comunas llevan sufijo ("Av. Condell (Renca)", "Av. Padre Hurtado (sur)").
- ESLint no revisa que un `import { x }` exista en el archivo de origen; eso lo detecta `npm run build`.
- En producción la base es Neon con su driver HTTP; en local y en las pruebas es PGlite. El SQL es el mismo, pero **el camino con Neon real no se ha probado todavía** (a la fecha de este cambio no había base creada).
- El límite de solicitudes por IP declarado en `netlify/functions/api.js` (`rateLimit`) tampoco se ha visto funcionar: verificarlo en el primer despliegue.

## Estado y decisiones de contenido (resumen)
- 179 calles (109 con foto), 279 landmarks en landmarks.json (+126 estaciones, 17 cerros, 41 barrios con perímetro; categorías incluyen Religión y Gobierno y justicia), 93 ciudades y 46 parques nacionales, 29 recorridos de micro en Explorar.
- Sacados por irrelevantes (no volver a agregar sin preguntar): El Cortijo, Av. Lo Barnechea, Las Nieves, Río Tajo, Av. El Mirador, Alexander Fleming, calles "Cerro El Plomo/Cerro Colorado", San Damián como calle (sigue como barrio), muchos colegios específicos del oriente, clubes de golf/polo/Stade Français, varios restaurantes. Quedan bares Liguria y Nacional (el usuario puede querer sacarlos).
- Pendientes de confirmar con el usuario: Estadio Español (club de socios, sigue), Colegio SEK de Las Condes (no se encontró; el que había estaba en Peñalolén y se sacó), "Av. Pedro Aguirre Cerda" se tomó la de Cerrillos, "Las Flores" se tomó Camino Las Flores de Las Condes, falta la Gerónimo de Alderete de La Florida.
- Secciones retiradas de la UI pero con datos disponibles: Barrios (ahora dentro de Landmarks), Fotos, Cerros (solo 17 pasaron a landmarks; los 44 siguen en la capa Cerros de Explorar). Fronteras está retirada y hoy **sin datos** en data.js (`borders` vacío; el cálculo sigue en `tools/border.js`).
- Los juegos "desde tu casa o el campus" (`rs-home-*`, `mt-route`) están retirados; sus datos personales (Los Trapenses, Campus San Joaquín) siguen en `src/quiz/steps.js` y en `transit` de data.js.

## Ideas pendientes
1. **Sincronizar el progreso de práctica** entre dispositivos (hoy solo las rondas oficiales llegan al servidor; `stats` y `best` son locales).
2. **Lugares propios** del usuario (como "Mis calles"), para poder sacar lo hiperlocal del juego base.
3. Seguir recortando lo demasiado específico si se generaliza la app.
4. Ranking: tabla general que combine todos los juegos, e historial personal de rondas (los datos ya se guardan).
5. Ordenar `tools/` (unas 100 piezas sueltas en una sola carpeta). No se hizo junto con la reestructuración porque la mayoría de los scripts descargan datos y no se pueden volver a correr para verificar que sigan funcionando.
6. Si el juego se abre a desconocidos: validar los puntajes en el servidor (hoy los calcula el navegador) y moderar nombres de usuario.
