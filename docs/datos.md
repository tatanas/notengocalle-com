# Datos: fuentes y pipeline (tools/)

Leer solo si la tarea agrega o quita contenido (calles, lugares, barrios, fotos, rutas) o regenera `public/data/data.js`.

**No abrir** `public/data/data.js` (2 MB en 2 líneas) ni los `tools/*.json`: están bloqueados para Read/Grep en `.claude/settings.json`. Los datos del juego se consultan con `npm run datos -- "<expresión sobre D>"` (ejemplos en [siguiente-sesion.md](siguiente-sesion.md)); un `.json` de `tools/`, con un `node -e` corto.

## Fuentes

| Qué | De dónde |
|---|---|
| Comunas, calles, metro, lugares, barrios, cerros | OpenStreetMap (ODbL), vía Overpass y Nominatim |
| Rutas en auto | Valhalla (valhalla1.openstreetmap.de, FOSSGIS): ruta, traza con nombres y cruces |
| Rutas en micro y metro, recorridos | GTFS de Red (DTPM) |
| Regiones, ciudades y parques nacionales | OpenStreetMap; población de las ciudades |
| Fotos | Wikimedia Commons y Panoramax, siempre con autor y licencia visibles |
| Mapa base y relieve (en vivo, no en data.js) | OpenFreeMap / OpenMapTiles y AWS Terrain Tiles |

Casi todo es gratis y sin API keys; la excepción es Street View (llave de Google Maps, restringida por dominio: ver [streetview.md](streetview.md)). No se usan imágenes de Google fuera de Street View.

## Qué trae `DATA`

`comunas` (GeoJSON, las 52 de la RM), `comunasChile` (índice de las 345 comunas de Chile; sus polígonos van aparte en `public/data/comunas-chile.js`, que se baja al jugarlas), `metro` (`lines`, `stations`), `streets`, `landmarks`, `cerros`, `zones` (barrios con perímetro), `photos` (por clave `l:` lugar, `s:` calle, `c:` cerro, `p:` parque), `inter` y `para` (cruces y paralelas entre calles), `steps` (rutas en auto), `salidas` (salidas numeradas de las autopistas), `transit` (rutas en transporte público), `micros`, `metroAlong`, `rotondas`, `chile` (`regions`, `cities`, `parks`) y `built` (fecha).

`src/datos/datos.js` lo lee de `window.DATA`, arma los índices y **agrega en runtime** los landmarks de cerros, zonas y ríos/canales (ids `k`, `z`, `w`; no están en `landmarks.json`) y las calles propias del usuario.

## Pipeline

Vive en `tools/`, con sus propias dependencias (`cd tools && npm install`) y **se ejecuta desde `tools/`**. Los datos crudos pesados están ignorados por git (`btiles/`, `gtfs/`, `*_raw*.json`, cachés…); las salidas curadas sí se versionan (`streets.json`, `landmarks.json`, `zones.json`, `chile.json`, `photos_*.json`, `steproutes.json`, `transit.json`…).

Regenerar el archivo final (minutos): `npm run build` dentro de `tools/` (equivale a `node build_data.js ../public/data/data.js`). `tools/package.json` también cae en el bloqueo de lectura de `tools/*.json`: si hace falta verlo, usa `cat`.

- **Agregar o quitar una calle**: editar `streetlist.js` → `node streets.js` → `node cruces.js` → `node merge_st.js` → `npm run build`. Cada entrada es `[nombre_mostrado, regex_OSM, pista, ancla[lon,lat]|null, {bt:1, kind, gap, trMin}]`: `bt:1` busca en `btiles/` (descarga completa de la RM); `kind` es `calle|autopista|agua|tren`; `box:[lonMín,latMín,lonMáx,latMáx]` limita a las vías dentro de esa caja (para dos calles con el mismo nombre en OSM); `gap` es la distancia en km para unir tramos separados; `trMin` el largo mínimo para mostrar "tramos con nombre". Para ver cómo figura una calle en OSM: `nameidx.json`, `ways_named.json`, `node cross.js "<nombre OSM>" lat|lon`. Después, los puntos de Street View con `SV_CALLES="…"` y `niveles_streetview.mjs` (ver [streetview.md](streetview.md)).
- **Agregar o quitar un landmark**: editar `lmlist.js` (`[nombre, categoría, consulta Nominatim, comuna esperada, descripción]`) → `cp landmarks.json landmarks.prev.json` → `node geocode.js` (1 consulta por segundo) → `node finalize_lm.js` (ajustes en el objeto `F`: coordenadas `ll`, renombres, `obvious`, foto prestada `pk`, `alt`; lista `DROP`; carreras en `careers.js`) → **`node remap_routes.js`** (los ids `l0, l1…` se corren; esto reasigna las rutas) → `node merge_st.js` → `npm run build`.
- **Barrios con perímetro**: `zones.js` (esquinas como cruces de calles por regex, o `axis`/`at` para zonas aproximadas) → `zones.json`. Si el barrio ya existe como landmark con otro nombre, se enlazan en `NOMBRE_DE_LUGAR_DE_ZONA` (`src/datos/datos.js`).
- **Fotos**: `photos.js` (landmarks), `photos_streets*.js` (calles; las numeradas son tandas sucesivas), `parkphotos.js`. Revisar siempre a ojo con `sheets.py` (arma mosaicos). La selección revisada está fijada **por índice** en `merge_st.js` (`BAD`/`KEEP` por tanda) y en `build_data.js` (`BADP`): si se regenera un JSON de fotos, los índices cambian y hay que revisar de nuevo.
- **Prolongaciones de rutas**: `extensions.js` (→ `extensions.json`) agrega a algunas calles (`ext`, en data.js) lo que siguen fuera de la zona descargada: Ruta 5 hacia el norte y el sur, Ruta 68 a Valparaíso, Ruta 78 a San Antonio, Ruta 57 a Los Andes y el Camino a Melipilla. El juego las dibuja en línea segmentada. Descarga las rutas numeradas de toda la RM una vez (`ruta_raw.json`, ignorado por git) y se queda con lo que está a más de 400 m de la línea ya dibujada. Para prolongar otra calle, se agrega a la lista `ROADS` de ese archivo y se corre `node extensions.js` y luego `npm run build`.
- **Otros**: `metro.js`, `cerros.js`, `chile.js`/`chile2.js`, `extras.js` (rotondas, calles por línea de metro), `cruces.js` (cruces según OpenStreetMap: calles que comparten un nodo, o cuyo extremo queda a menos de 20 m de la otra; los que pasan uno sobre otro, aparte → `cruces.json`), `relations.js` (comunas de cada calle, paralelas, cruces y pares dudosos que el juego no debe preguntar), `steproutes.js` (Valhalla, con `compartido/rutaEnAuto.js`; ver [ruteo.md](ruteo.md)), `salidas.js` (salidas numeradas de las autopistas con a dónde llevan: nodos `motorway_junction` y rampas de OpenStreetMap → `salidas.json`; las descargas quedan en `salidas_raw.json` y `rampas_raw.json`), `comunas_chile.js` (polígonos simplificados de las comunas de Chile fuera de la RM: Overpass para la lista y Nominatim para cada polígono → `comunas_chile.json`; `build_data.js` lo parte en el índice de data.js y `public/data/comunas-chile.js`), `transit.js` (GTFS → itinerarios), `micros.js`.
- **Descargas crudas**: consultas Overpass en `q*.txt`. GTFS: el enlace vigente está en https://www.dtpm.cl/index.php/noticias/gtfs-vigente

Los juegos de "completa el mapa" recorren siempre todo su conjunto (hoy 34 comunas del Gran Santiago y 16 regiones) y caen en la categoría "todas"; no hay nada que actualizar si ese tamaño cambia.

## Trampas del pipeline

- **Overpass**: overpass-api.de suele dar 504/timeout (probar espejos kumi.systems, private.coffee, mandar `User-Agent` descriptivo); **no sirve desde el navegador** (CORS). Para la búsqueda de "Mis calles" se usa Nominatim, que sí funciona desde el navegador.
- **Wikimedia**: con User-Agent genérico responde 429; usar uno descriptivo con contacto. Nominatim: máx. 1 req/s.
- **Rutas en auto: Valhalla** (valhalla1.openstreetmap.de, de FOSSGIS; solo uso liviano). Se dejó OSRM porque su servidor público evitaba la Costanera Norte por el centro. Aun así, desde La Dehesa al aeropuerto prefiere Vespucio Norte (sin taco es más rápido): no se puede forzar.
- `tools/remap_routes.js` reconoce los lugares por sus coordenadas exactas: si solo se **mueve** un lugar (sin agregar ni quitar), no correrlo, o tomará el lugar movido como eliminado y botará sus rutas.
- Calles con el mismo nombre en distintas comunas llevan sufijo ("Av. Condell (Renca)", "Av. Padre Hurtado (sur)").
- Los ríos y canales siguen en `DATA.streets` (kind `agua`, para Explorar y Conexiones) pero no entran a los juegos de calles.
- Las calles que siguen fuera de Santiago (Ruta 5, 68, 78, 57, Camino a Melipilla) llevan una prolongación punteada (`ext`).
- `tools/` es un solo directorio con ~100 piezas sueltas; no se ordenó porque la mayoría de los scripts descargan datos y no se pueden volver a correr para verificar que sigan funcionando.
