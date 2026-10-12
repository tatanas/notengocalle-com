# NoTengoCalle — contexto para continuar el proyecto

Juego web para aprender la geografía de Santiago: comunas, calles, lugares, metro, rutas, y regiones/ciudades/parques de Chile. Tiene cuentas (usuario y clave, sin correo) y ranking por juego; también se puede jugar sin cuenta. El dueño vive en el sector oriente (Lo Barnechea / Las Condes / Vitacura) y estudia en el Campus San Joaquín UC; quiere que sirva sobre todo para el oriente, pero está pensando en generalizarla (por eso se están sacando cosas demasiado específicas y se quiere que cada usuario pueda agregar las suyas).
"NoTengoCalle" es solo el **nombre mostrado**; el dominio lo define Netlify.

**La estructura del código, el servidor, la base de datos, el pipeline de datos, las pruebas y el despliegue están explicados en [ARQUITECTURA.md](ARQUITECTURA.md). Léelo antes de tocar código y mantenlo al día.** Este archivo solo guarda lo que no está ahí: cómo trabajar y las decisiones de contenido.

## Cómo hablar y trabajar con el usuario

- Español de Chile, directo y conciso. Reportar con honestidad: si algo no se probó o falló, decirlo.
- Verificar con las pruebas automáticas antes de decir "listo"; revisar visualmente las capturas de `tests/shots/` lo que se pueda.
- **Pruebas: no correr la suite completa por costumbre** (`npm run test:full` tarda más de 10 minutos). `npm test` = lint + unitarias + solo las suites de navegador que corresponden a los archivos modificados (`tests/selection.js`; sin cambios sin confirmar usa el último commit). La completa solo cuando el cambio es amplio (motor de rondas, datos, ranking/servidor, `package.json`, el propio arnés de pruebas, más de 30 archivos) o antes de un despliegue grande; `tests/run.js` ya la elige sola con `--changed` en esos casos.
- Para **sacar** cosas (calles, lugares) el usuario prefiere que se le liste primero y decida una a una.
- Todo gratis, sin API keys. Nada de imágenes de Google. Fotos: solo Wikimedia Commons (con autor y licencia visibles) y Panoramax. Mapillary se probó y se **eliminó** (las fotos eran inútiles).
- Preguntas deben ser "justas": el nombre no debe delatar la comuna ni la ubicación (campo `obvious` para los inevitables, como "Plaza de Maipú").
- Que el juego siga siendo instantáneo: nada de frameworks ni de esperar al servidor para jugar.

## Estilo de código

- El código debe leerse solo: nombres descriptivos y funciones cortas en vez de comentarios. Un comentario solo cuando explica un porqué que el código no puede decir.
- Prettier (`npm run format`) y ESLint (`npm run lint`) mandan; no discutir formato a mano.
- Los archivos de `src/quiz/modes/` y `src/ui/explore.js`, `src/ui/myStreets.js`, `src/quiz/steps.js` se migraron del antiguo `js/app.js` casi tal cual (solo reformateados y con imports): todavía usan nombres cortos (`f`, `l`, `s`, `q`). Al tocarlos, mejorar los nombres de lo que se toque.

## Modos actuales (ids)

Comunas: `com-name`, `com-all` (siempre con todas las comunas: no tienen largo ni categorías de ranking) · Lugares emblemáticos (antes "Landmarks"): `lm-loc`, `lm-com` (incluye barrios con perímetro, 17 cerros y los 6 ríos y canales —categoría "Ríos y canales", se aciertan tocando a menos de 400 m del cauce; no entran en "¿en qué comuna?"—; las estaciones de metro **ya no son lugares emblemáticos**) · Street View (necesita la llave de Google): `sv-ubicar` ("¿Dónde estás?": te deja en un punto visto desde la calle, se puede mirar 360° pero no caminar, y se toca en el mapa dónde estás; **de 0 a 5 puntos por pregunta**: menos de 50 m 5, hasta 100 m 4, 300 m 3, 600 m 2, 1 km 1, más 0; con 3 o más cuenta como acierto; **tiene ronda oficial y ranking por puntos** (máximo 5 × preguntas); botón "Reportar túnel" que descarta el punto en ese dispositivo, lo cambia por otra pregunta y lo guarda en el servidor (`node servidor/admin.js reportes`); al responder se marcan las calles sobre las que estabas; en el celular se alterna entre panorama y mapa; los letreros de las calles no se pueden censurar con la API de Google). Las preguntas están en `src/datos/lugaresStreetView.json`, generadas con `node tools/streetview_lugares.mjs` (necesita la llave en `.env.local`): lugares emblemáticos importantes con un punto fijo y las 156 calles con hasta 3 puntos cada una (sale uno al azar), solo panoramas oficiales de Google y descartando los que quedan a menos de 100 m de un túnel de OpenStreetMap o dentro de las zonas de `ZONAS_EXCLUIDAS` (túneles que OSM no marca) · Metro: `mt-find` (tocar dónde está la estación, sin dibujarlas), `mt-name` (alternativas), filtrables por línea · Calles: `st-name`, `st-find` (acierta quien toca sobre la calle: margen de unos 14 píxeles, entre 80 y 250 m según el zoom, y la calle pedida debe ser la más cercana; con landmarks cercanos al responder, tramos con nombre, bordes de comunas/metro activables) · Ruteo: `rs-any-car`, `rs-any-tp` (paso a paso, GTFS de Red) · Chile: `ch-find`, `ch-city`, `ch-cityreg`, `ch-all` · Parques nacionales: `pn-reg`, `pn-photo` · Conexiones: `cx` (13 tipos de preguntas, selección múltiple). Los 18 tienen ronda oficial 🏆 con ranking. Más: Explorar (capas activables), "Mis calles" (el usuario busca una calle en Nominatim y se guarda en su navegador), cronómetro + récord personal por juego.
Los juegos que se retiraron del menú (fronteras, metro, cerros, fotos, barrios, rutas desde casa, etc.) se **borraron del código**; su historia está en git (commits anteriores a "Quita los juegos retirados").

## Trampas conocidas

- **Overpass**: overpass-api.de suele dar 504/timeout (probar espejos kumi.systems, private.coffee, mandar `User-Agent` descriptivo); **no sirve desde el navegador** (CORS). Para la búsqueda de "Mis calles" se usa Nominatim, que sí funciona desde el navegador.
- **Wikimedia**: con User-Agent genérico responde 429; usar uno descriptivo con contacto. Nominatim: máx. 1 req/s.
- OSRM público (router.project-osrm.org) es solo para uso liviano.
- En Bash, escribir scripts Python/JS a archivos en vez de en línea (las comillas y las barras invertidas se rompen).
- Los landmarks de cerros, zonas y ríos/canales se **agregan en runtime** a `DATA.landmarks` en `src/data/dataset.js` (ids `k`, `z`, `w`), no están en landmarks.json. Los ríos y canales siguen en `DATA.streets` (kind `agua`, para Explorar y Conexiones) pero no entran a los juegos de calles.
- Calles con el mismo nombre en distintas comunas llevan sufijo ("Av. Condell (Renca)", "Av. Padre Hurtado (sur)").
- ESLint no revisa que un `import { x }` exista en el archivo de origen; eso lo detecta `npm run build`.
- En producción la base es Neon con su driver HTTP; en local y en las pruebas es PGlite. El SQL es el mismo, pero **el camino con Neon real no se ha probado todavía** (a la fecha de este cambio no había base creada).
- El límite de solicitudes por IP declarado en `netlify/functions/api.js` (`rateLimit`) tampoco se ha visto funcionar: verificarlo en el primer despliegue.

- **Llave de Google Maps** (modo de Street View, en preparación): variable `GOOGLE_MAPS_KEY` (Netlify, o `.env.local` en tu computador; ver `.env.example`). Vite la deja en el código como `__LLAVE_DE_GOOGLE_MAPS__`. Es pública pero restringida por dominio y por API en Google Cloud; si Netlify frena el despliegue por "secrets scanning", agregar `SECRETS_SCAN_OMIT_KEYS=GOOGLE_MAPS_KEY`.

## Estado y decisiones de contenido (resumen)

- Largos de ronda: solo 20 o todas (las regiones y las comunas siempre van completas). Las marcas antiguas de 10, 20 y 30 siguen en la base pero ya no salen en el ranking.
- La práctica es siempre "modo fácil" (bordes de comunas y líneas del metro dibujados); la ronda oficial, siempre difícil. No hay botón para cambiarlo.
- 167 calles jugables (156 calles y 11 autopistas; los 6 ríos/canales y las líneas de tren solo salen en Explorar y Conexiones), 238 landmarks en landmarks.json y **264 lugares en el juego** contando barrios con perímetro, 17 cerros y 6 ríos/canales; 93 ciudades, 46 parques nacionales y 29 recorridos de micro en Explorar.
- Sacados por irrelevantes (no volver a agregar sin preguntar): El Cortijo, Av. Lo Barnechea, Las Nieves, Río Tajo, Av. El Mirador, Alexander Fleming, calles "Cerro El Plomo/Cerro Colorado", San Damián como calle (sigue como barrio), muchos colegios específicos del oriente, clubes de golf/polo/Stade Français, varios restaurantes. Quedan bares Liguria y Nacional (el usuario puede querer sacarlos). También (por decisión del dueño): Embajada de EE.UU., Plaza Las Lilas y San Enrique, los colegios Craighouse, Verbo Divino, Villa María, Lycée Saint-Exupéry, Nido de Águilas y The Grange (los colegios que quedan son los históricos), Prince of Wales, Teleférico Bicentenario (proyecto aparte; el Teleférico del San Cristóbal queda con perímetro), la mayoría de las sedes repetidas de universidades y CFT (se dejaron las más concurridas y repartidas por la ciudad), Av. Pintor Benito Rebolledo, Santos Dumont, Chesterton, Charles Hamilton, Juan XXIII, Bicentenario, Pedro Montt, Condell (Renca), Domingo Santa María, Eduardo Castillo Velasco, Walker Martínez y Camino Lo Boza. Se dejó Av. Miraflores (Renca) por ser la que llega al aeropuerto.
- Pendientes de confirmar con el usuario: Estadio Español (club de socios, sigue), Colegio SEK de Las Condes (no se encontró; el que había estaba en Peñalolén y se sacó), "Av. Pedro Aguirre Cerda" se tomó la de Cerrillos, "Las Flores" se tomó Camino Las Flores de Las Condes, falta la Gerónimo de Alderete de La Florida.
- Secciones retiradas de la UI pero con datos disponibles: Barrios (ahora dentro de Lugares emblemáticos), Fotos, Cerros (solo 17 pasaron a landmarks; los 44 siguen en la capa Cerros de Explorar). Fronteras está retirada y hoy **sin datos** en data.js (`borders` vacío; el cálculo sigue en `tools/border.js`).
- Los juegos "desde tu casa o el campus" (`rs-home-*`, `mt-route`) se borraron; sus datos personales (Los Trapenses, Campus San Joaquín) siguen en `src/quiz/steps.js` y en `transit` de data.js.

- Las calles que siguen fuera de Santiago (Ruta 5, 68, 78, 57, Camino a Melipilla) llevan una prolongación punteada (`ext`); ver `tools/extensions.js`.

## Ideas pendientes

0. **Más modos difíciles de calles** (ideas del dueño, aún sin hacer):
   - _Sin mapa_: **probado y descartado** (juego `st-text`, ya borrado; está en git). Las pistas salían de los cruces de `inter`, que están mal detectados (cruces que caen todos juntos o en el lugar equivocado) y no alcanzan para separar calles paralelas. Solo se rehace si antes se arregla la detección de cruces (`tools/relations.js`).
   - _Wordle diario_: una calle por día que parte con la pista más amplia (región, comuna) y baja a pistas más específicas con cada intento.
   - _Con vista de calle_ (probado: **Panoramax no alcanza**; de 424 puntos repartidos en 53 calles, solo 5 tenían una foto a menos de 30 m, o sea ~1 %; las zonas con foto son Vitacura, Andrés Bello, Colón y Pedro de Valdivia. Volver a medir si la cobertura crece): encontrar la calle en el mapa a partir de cómo se ve, pudiendo moverse un poco y con la calle pedida marcada en el piso. **Choca con "nada de imágenes de Google"**: Street View exige API key y es de pago; las alternativas libres son Panoramax (ya se usa para fotos sueltas, tiene visor propio) y Mapillary (descartado antes). Hay que ver cobertura de Panoramax en Santiago.
   - _Modo extremo_: preguntar por **cualquier** calle de Santiago, no solo las anotadas, y encontrarla en el mapa (sin callejones ni cosas muy chicas). Requiere un conjunto de calles de OSM por comuna (descarga pesada: el pipeline actual solo guarda las anotadas) y decidir qué tamaño mínimo cuenta.

1. **Sincronizar el progreso de práctica** entre dispositivos (hoy solo las rondas oficiales llegan al servidor; `stats` y `best` son locales).
2. **Lugares propios** del usuario (como "Mis calles"), para poder sacar lo hiperlocal del juego base.
3. Seguir recortando lo demasiado específico si se generaliza la app.
4. Ranking: tabla general que combine todos los juegos, e historial personal de rondas (los datos ya se guardan).
5. Ordenar `tools/` (unas 100 piezas sueltas en una sola carpeta). No se hizo junto con la reestructuración porque la mayoría de los scripts descargan datos y no se pueden volver a correr para verificar que sigan funcionando.
6. Si el juego se abre a desconocidos: validar los puntajes en el servidor (hoy los calcula el navegador) y moderar nombres de usuario.
