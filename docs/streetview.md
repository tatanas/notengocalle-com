# Street View ("¿Dónde estás?", `sv-ubicar`) y recorrer calles

Todo lo de Street View en un solo lugar. Para el resto del proyecto: `ARQUITECTURA.md`.

## Qué es y cómo se juega
- Te deja en un panorama de Google Street View (se mira 360°, **no se camina**); se toca en el mapa dónde estás.
- **0 a 5 puntos por pregunta** (`src/dominio/streetView.js`): ≤100 m 5, ≤500 m 4, ≤1 km 3, ≤1,5 km 2, ≤2 km 1, más 0. Con 3 o más cuenta como acierto.
- **Rondas siempre de 10 preguntas** (no hay "todas": `tieneRondaDeTodas` en `compartido/oficial.js`). Ranking por puntos (máximo 5 × 10), categoría `10`.
- **4 niveles en la práctica** (`ajustes.nivelStreetView`: `facil|medio|dificil|extremo`, campo `nivel` 1–4 de cada pregunta en el JSON,
  calculado por `node tools/niveles_streetview.mjs`; ahí están las listas editables). Fácil ≈ 24 preguntas (lo más conocido, sobre todo del centro,
  sin autopistas), medio ≈ 67, difícil ≈ 162, extremo = todas. **La ronda oficial siempre es extremo** (`REGLAS_OFICIALES`).
- Al responder se describe dónde estabas (`src/dominio/ubicacion.js`: calle, esquina, lugar cercano, barrio, metro, comuna) y se marcan las calles bajo el punto.
- **Cerros grandes** (`src/datos/recintos.json`, polígonos): si el punto está dentro del polígono de su lugar (hoy Cerro San Cristóbal y Santa Lucía),
  vale cualquier toque dentro del cerro (distancia 0).
- **Pistas**: algunos puntos de calles llevan `pista` ("cerca del Zanjón de la Aguada", "muchas automotoras a los lados"…); se muestra al responder.
- Botón **"Reportar túnel"**: descarta ese punto en el dispositivo, lo cambia por otra pregunta y lo guarda en el servidor (`node servidor/admin.js reportes`).
- En el celular se alterna entre panorama y mapa. Los letreros de calles de Google no se pueden ocultar (la API no deja); por eso se evitan los puntos cerca de cruces.

## Recorrer la calle (juegos de calles)
Tras responder en `st-name` y `st-find` aparece "🚶 Recorrer la calle en Street View" (`src/interfaz/recorrerCalle.js`): abre el mismo visor
en modo `caminable: true` (se puede caminar, con nombres de calles), empezando en un punto de esa calle del JSON (en `st-find`, el más cercano a donde tocaste).
Se cierra con "✖ Cerrar Street View" o al pasar a la siguiente pregunta. Solo aparece si hay llave de Google.

## Los datos y cómo regenerarlos
- `src/datos/lugaresStreetView.json`: lista de preguntas `{ nombre, tipo: 'calle'|'lugar', referencia?, comuna, nivel, puntos: [{ lat, lon, rumbo, pista? }] }`.
  El juego elige un punto al azar de la pregunta cada vez. **Calles**: un punto cada ~1,2 km (3 a 14) repartidos por todo el largo, para que la foto cambie;
  **lugares**: hasta 3 puntos por lados distintos (en la calle más cercana, nunca dentro del recinto), salvo cerros con recinto (6 puntos dentro).
- Generador: `node tools/streetview_lugares.mjs` (desde la raíz; necesita `GOOGLE_MAPS_KEY` en `.env.local`; ~1 hora completo). Modo parcial (se mezcla con lo existente):
  `SV_CALLES="Calle A|Calle B"` (solo esas calles), `SV_LUGARES="Plaza de Armas|…"` (solo esos lugares emblemáticos), `SV_EXTRAS=1` (puntos manuales de `EXTRAS`).
  Después SIEMPRE: `node tools/niveles_streetview.mjs` (reasigna niveles y avisa de lo que falte).
- Filtros del generador: solo panoramas **oficiales de Google y al aire libre** (mismo panorama en las búsquedas `google` y `outdoor`: así no hay interiores ni fotos de usuarios),
  a menos de 15 m de una calle pública de OSM, **lejos de túneles** (OSM `tunnel=yes` + `ZONAS_EXCLUIDAS` a mano) y, en lo posible, **a más de 40 m de un cruce** entre calles con nombre
  (ahí cuelgan los letreros; se exige en los primeros intentos y después se acepta cualquiera para no quedar sin puntos).
- Pistas: `node tools/pistas_calles.mjs` → `src/datos/pistasCalles.json`. Busca por calle: río/canal al lado, ≥4 automotoras, feria, estadio, mall/parque/lugar emblemático.
  Automotoras/ferias/estadios vienen de OSM (Overpass, cacheado en `tools/pistas_osm.json`). **Para agregar a mano** (bandejón ancho, árboles al medio, etc.): `PISTAS_MANUALES` en ese script
  (`{ 'Av. X': [{ lat, lon, pista: 'texto' }] }`) y volver a generar esa calle con `SV_CALLES`.
- Recintos: `src/datos/recintos.json` = `{ 'nombre del lugar emblemático': [[lat, lon], …] }` (polígono de Nominatim `polygon_geojson=1`). Para sumar otro cerro/parque: agregarlo ahí y correr el generador con `SV_LUGARES` (solo nombres que empiezan con "Cerro" generan puntos dentro).
- La llave: variable `GOOGLE_MAPS_KEY` (Netlify o `.env.local`; ver `.env.example`); Vite la deja en el código como `__LLAVE_DE_GOOGLE_MAPS__`. Es pública pero restringida por dominio y API en Google Cloud
  (incluir `localhost:*/*`; Google rechaza `127.0.0.1` con comodín de puerto). Si Netlify frena por "secrets scanning": `SECRETS_SCAN_OMIT_KEYS=GOOGLE_MAPS_KEY`.
  Las pruebas automáticas **no** juegan Street View (cargaría Google y gastaría cuota): se prueba a mano.

## Trampas aprendidas
- **Un solo `StreetViewPanorama` reutilizado** (`src/mapa/streetView.js`): crear uno por pregunta abría otro contexto WebGL y el celular le quitaba el suyo al mapa (quedaba gris). Hay respaldo con teselas OSM (`repararMapaBase`).
- Túneles que OSM no marca: se descubren jugando; agregarlos a `ZONAS_EXCLUIDAS` y regenerar esa calle.
- Los puntos reportados como túnel se guardan en el navegador y en el servidor, pero **regenerar el JSON cambia los puntos**: los reportes viejos dejan de aplicar (revisar `servidor/admin.js reportes` antes de regenerar todo).
- Peatonales y calles cortas del centro (Paseo Ahumada, Nueva York, Paseo Estado, Pío Nono…) tienen poca cobertura: quedan con 1 a 2 puntos.
- El Templo Bahá'í no tiene Street View a menos de 800 m: sin pregunta.
