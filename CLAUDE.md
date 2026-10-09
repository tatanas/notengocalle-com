# NoTengoCalle.com — contexto para continuar el proyecto

Juego web (HTML + JS, sin servidor) para aprender la geografía de Santiago: comunas, calles, lugares, metro, rutas, y regiones/ciudades/parques de Chile. El dueño vive en el sector oriente (Lo Barnechea / Las Condes / Vitacura) y estudia en el Campus San Joaquín UC; quiere que sirva sobre todo para el oriente, pero está pensando en generalizarla (por eso se están sacando cosas demasiado específicas y se quiere que cada usuario pueda agregar las suyas).
"NoTengoCalle.com" es solo el **nombre mostrado**; el dominio lo define Netlify.

## Cómo hablar y trabajar con el usuario
- Español de Chile, directo y conciso. Reportar con honestidad: si algo no se probó o falló, decirlo.
- Verificar con las pruebas automáticas antes de decir "listo"; revisar visualmente (capturas) lo que se pueda.
- Para **sacar** cosas (calles, lugares) el usuario prefiere que se le liste primero y decida una a una.
- Todo gratis, sin API keys. Nada de imágenes de Google. Fotos: solo Wikimedia Commons (con autor y licencia visibles) y Panoramax. Mapillary se probó y se **eliminó** (las fotos eran inútiles).
- Preguntas deben ser "justas": el nombre no debe delatar la comuna ni la ubicación (campo `obvious` para los inevitables, como "Plaza de Maipú").

## Estructura
```
index.html, manifest.webmanifest, sw.js   app (PWA; sw.js tiene CACHE='ubicate-vNN' → subir el número en cada despliegue)
css/style.css
js/app.js            toda la lógica (~1700 líneas, un solo IIFE). Modos = MODES.push({...}). Los retirados se ocultan en el Set OFF (cerca del final del bloque de modos), no se borra el código.
data/data.js         GENERADO (window.DATA). No editar a mano.
vendor/              Leaflet, MapLibre GL, leaflet-maplibre-gl (copias locales)
icons/
tools/               pipeline que genera data.js + pruebas (ver abajo)
dist/                GENERADO por tools/make_dist.js; es lo que se sube a Netlify (ignorado por git)
```
- Mapa base: OpenFreeMap (vectorial, sin key) vía MapLibre; los nombres del mapa se ocultan en los quizzes (`setTiles('plain'|'labels'|'streets')`). Relieve: AWS Terrain Tiles.
- Progreso en `localStorage` con prefijo `ubicate:` (se dejó así al renombrar para no perder datos). Claves: `settings`, `stats`, `best` (récords/tiempos), `explore`, `myStreets` (calles propias), `conf`.
- Despliegue: `cd tools && node make_dist.js`, luego arrastrar `dist/` a Netlify → Deploys. Antes, subir `CACHE` en sw.js.

## Modos actuales (ids)
Comunas: `com-name`, `com-all` · Landmarks: `lm-loc`, `lm-com` (incluye barrios con perímetro, estaciones de metro como categoría "Metro" filtrable por línea, 17 cerros) · Calles: `st-name`, `st-find` (con landmarks cercanos al responder, tramos con nombre, bordes de comunas/metro activables) · Ruteo: `rs-any-car`, `rs-any-tp` (paso a paso, GTFS de Red) · Chile: `ch-find`, `ch-city`, `ch-cityreg`, `ch-all` · Parques nacionales: `pn-reg`, `pn-photo` · Conexiones: `cx` (11+ tipos de preguntas, selección múltiple). Más: Explorar (capas activables: metro, calles, lugares, barrios, cerros, tren, micros, regiones, ciudades, parques, relieve), "Mis calles" (el usuario busca una calle en Nominatim y se guarda en su navegador), cronómetro + récord personal por juego.
Todos los juegos usan `weightedSample` (lo fallado sale más) y `balance` por comuna para que Santiago Centro no domine.

## Pipeline de datos (todo en tools/, ejecutar DESDE tools/)
Instalar: `cd tools && npm install` (turf, mapshaper, osmtogeojson, puppeteer-core). Los datos crudos pesados están **ignorados por git** (btiles/, gtfs/, *_raw*.json, ways_named.json, majors.json, nameidx.json, *cache*.json…); sí se versionan las salidas curadas (streets.json, landmarks.json, zones.json, chile.json, photos_*.json, steproutes.json, transit.json…).

Regenerar `data.js` completo: `node build_data.js ../data/data.js` (~minutos). Se verificó que da un resultado idéntico al actual.

Recetas:
- **Agregar/quitar una calle**: editar `streetlist.js` → `node streets.js` (→ streets.json) → `node merge_st.js` → `node build_data.js ../data/data.js`.
  Cada entrada: `[nombre_mostrado, regex_OSM, pista, ancla[lon,lat]|null, {bt:1, kind:'calle|autopista|agua|tren', gap:km, trMin:km}]`. `bt:1` = busca en `btiles/` (descarga completa de la RM); `gap` = distancia para unir tramos separados; `trMin` = largo mínimo para mostrar "tramos con nombre" (calles que cambian de nombre se muestran como una sola con sus subtramos). Para ver cómo figura una calle en OSM: `nameidx.json`, `ways_named.json`, `node cross.js "<nombre OSM>" lat|lon`.
- **Agregar/quitar un landmark**: editar `lmlist.js` (`[nombre, categoría, consulta Nominatim, comuna esperada, descripción]`) → `cp landmarks.json landmarks.prev.json` → `node geocode.js` (1 req/s a Nominatim) → `node finalize_lm.js` (overrides en el objeto `F`: coordenadas `ll`, renombres, `obvious`, `pk` foto prestada, `alt`; lista `DROP`; carreras en `careers.js`) → **`node remap_routes.js`** (los ids l0,l1… se corren; esto reasigna las rutas y descarta las que apuntaban a lugares eliminados) → `node merge_st.js` → `node build_data.js ../data/data.js`.
- **Barrios con perímetro**: `zones.js` (esquinas = cruces de calles por regex, o `axis`/`at` para zonas aproximadas) → zones.json. El nombre debe coincidir con un landmark (mapa `ZMAP` al inicio del bloque en app.js).
- **Fotos**: `photos.js` (landmarks), `photos_streets*.js` (calles; las numeradas son tandas incrementales), `parkphotos.js`. Siempre revisar a ojo con `sheets.py` (arma mosaicos) antes de aceptar. La selección revisada está **hardcodeada por índice** en `merge_st.js` (conjuntos `BAD`/`KEEP` por tanda) y en `build_data.js` (`BADP` para parques): si se regenera un JSON de fotos, los índices cambian y hay que revisar de nuevo.
- Otros: `metro.js`, `cerros.js`, `chile.js`/`chile2.js` (regiones, ciudades con población, parques), `extras.js` (rotondas, calles por línea de metro), `relations.js` (cruces/paralelas entre calles; cuenta "termina en" con margen de 80 m y rotondas), `steproutes.js` (OSRM), `transit.js` (GTFS→itinerarios), `micros.js`, `border.js` (fronteras entre comunas; la sección se retiró pero el cálculo sigue disponible).
- Descargas crudas: consultas en `q*.txt` (Overpass). Feed GTFS: `https://www.dtpm.cl/descargas/gtfs/GTFS_AAAAMMDD.zip` (la fecha cambia; el enlace vigente está en https://www.dtpm.cl/index.php/noticias/gtfs-vigente).

## Trampas conocidas
- **Overpass**: overpass-api.de suele dar 504/timeout (probar espejos kumi.systems, private.coffee, mandar `User-Agent` descriptivo); **no sirve desde el navegador** (CORS). Para la búsqueda de "Mis calles" se usa Nominatim, que sí funciona desde el navegador.
- **Wikimedia**: con User-Agent genérico responde 429; usar uno descriptivo con contacto. Nominatim: máx. 1 req/s.
- OSRM público (router.project-osrm.org) es solo para uso liviano.
- En Bash, escribir scripts Python/JS a archivos en vez de en línea (las comillas se rompen).
- Los landmarks de metro, cerros y zonas se **agregan en runtime** a `D.landmarks` en app.js (ids `m:`, `k`, `z`), no están en landmarks.json.
- Calles con el mismo nombre en distintas comunas llevan sufijo ("Av. Condell (Renca)", "Av. Padre Hurtado (sur)").

## Pruebas (tools/tests)
Servidor local desde la raíz: `python -m http.server 8765 --bind 127.0.0.1`. Luego, desde tools/: `node tests/test.js` (escritorio) y `node tests/test.js m` (celular). Recorren todos los modos y reportan errores de consola; usa Chrome en `C:/Program Files/Google/Chrome/Application/chrome.exe` y `puppeteer-core`. Otras: `t_trace.js` (detecta recargas inesperadas), `t_my.js` (Mis calles), `t_nb.js`/`t_st.js` (juegos de calles), `t_time.js` (cronómetro).
Pendiente raro: dos veces una corrida de escritorio se cortó con "detached Frame" (la página se recargó sola) justo tras reconstruir datos; no se pudo reproducir en 5 repeticiones con rastreo.

## Estado y decisiones de contenido (resumen)
- 179 calles (109 con foto), 279 landmarks en landmarks.json (+126 estaciones, 17 cerros, 41 barrios con perímetro; categorías incluyen Religión y Gobierno y justicia), 93 ciudades y 46 parques nacionales, 29 recorridos de micro en Explorar.
- Sacados por irrelevantes (no volver a agregar sin preguntar): El Cortijo, Av. Lo Barnechea, Las Nieves, Río Tajo, Av. El Mirador, Alexander Fleming, calles "Cerro El Plomo/Cerro Colorado", San Damián como calle (sigue como barrio), muchos colegios específicos del oriente, clubes de golf/polo/Stade Français, varios restaurantes. Quedan bares Liguria y Nacional (el usuario puede querer sacarlos).
- Pendientes de confirmar con el usuario: Estadio Español (club de socios, sigue), Colegio SEK de Las Condes (no se encontró; el que había estaba en Peñalolén y se sacó), "Av. Pedro Aguirre Cerda" se tomó la de Cerrillos, "Las Flores" se tomó Camino Las Flores de Las Condes, falta la Gerónimo de Alderete de La Florida.
- Secciones retiradas de la UI pero con datos disponibles: Fronteras, Barrios (ahora dentro de Landmarks), Fotos, Cerros (solo 17 pasaron a landmarks; los 44 siguen en la capa Cerros de Explorar).

## Ideas pendientes
1. **Leaderboard con usuarios**: propuesto Supabase (plan gratis), usuario = apodo + token secreto guardado en el navegador (sin correo ni clave), código de recuperación; "rondas oficiales" con configuración fija para que los puntajes sean comparables; el puntaje lo calcula el cliente (se puede hacer trampa; aceptable entre amigos). Los tiempos y récords personales ya existen y servirían de base.
2. **Lugares propios** del usuario (como "Mis calles"), para poder sacar lo hiperlocal del juego base.
3. Seguir recortando lo demasiado específico si se generaliza la app.
