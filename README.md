# NoTengoCalle.com

Juego/mapa para aprender comunas, landmarks, calles, rutas y metro de Santiago.
Es una web estática: no tiene servidor ni base de datos, no necesita API keys y es 100 % gratis.

## Usarla en el computador

- **Lo más simple:** doble clic en `index.html`. Necesita internet para el mapa de fondo.
- **Como servidor local** (recomendado, así también funciona el modo app/offline):
  ```
  cd "C:\Users\tatan\OneDrive\Documents\Webadas\Santiago"
  python -m http.server 8000
  ```
  y abre http://localhost:8000

## Usarla en el celular

**Opción A – misma red WiFi (rápido, para probar):** levanta el servidor local con
`python -m http.server 8000 --bind 0.0.0.0` y en el celular abre `http://<IP-del-PC>:8000`
(la IP sale con `ipconfig`, en "IPv4 Address"; hoy era 192.168.4.69). Windows puede pedir permiso de firewall.

**Opción B – publicarla gratis en GitHub Pages (queda siempre disponible):**
1. Crea una cuenta en https://github.com (gratis).
2. Crea un repositorio nuevo, por ejemplo `ubicate-santiago` (público).
3. Sube todos los archivos de esta carpeta. Lo más fácil: en la página del repo, "Add file → Upload files",
   arrastra todo el contenido de la carpeta (incluidas las subcarpetas) y confirma con "Commit changes".
4. En el repo: Settings → Pages → "Deploy from a branch" → rama `main`, carpeta `/ (root)` → Save.
5. En 1–2 minutos queda en `https://<tu-usuario>.github.io/ubicate-santiago/`.
6. En el celular ábrela y usa "Agregar a pantalla de inicio" (iPhone: botón Compartir; Android: menú ⋮).
   Queda como una app.

(La carpeta `tools/` no hace falta subirla, pero no molesta.)

## Modos de juego

- **Explorar:** mapa con comunas, metro, calles y lugares, con buscador.
- **Comunas:** encuéntrala en el mapa · ¿qué comuna es? · completa el mapa entero.
- **Landmarks (192):** ubícalo en el mapa (correcto a menos de 1,5 km) · ¿en qué comuna está?
- **Calles (75):** ¿qué calle es? · encuentra la calle en el mapa.
- **Ruteo paso a paso:** construye la ruta calle por calle (auto) o tramo por tramo (micro y metro, con los recorridos oficiales de Red/DTPM), desde tu casa o el Campus San Joaquín, o entre puntos cualquiera.
- **Chile:** regiones, capitales, 93 ciudades (con población) y los 46 parques nacionales.
- **Explorar** incluye capas activables: barrios con perímetro, tren, micros importantes, regiones, ciudades y parques nacionales.
- **Metro (126 estaciones, L1–L6; puedes elegir con qué líneas jugar):** línea · comuna · ¿qué estación es? · ubícala.
- **Cerros (44):** ubica el cerro · ¿qué cerro es? · ¿qué cerro es? (foto). Con relieve sombreado.
- **Conexiones:** preguntas que relacionan todo (selección única o múltiple): calles que pasan por una comuna, cruces, calle o metro más cercano a un lugar, comuna de un cruce, comunas vecinas, líneas por comuna, más al norte/sur/oriente/poniente, cerro más cercano.

Lugares, estaciones, cerros y calles que están justo en el límite entre dos comunas aceptan ambas como respuesta correcta.
Las preguntas que fallas aparecen más seguido (el progreso queda guardado en el navegador).
Durante los quizzes el mapa base no muestra nombres; el botón "👁 Ver nombres" los muestra, pero esa respuesta no suma.

## Datos

- Límites comunales, calles, metro y lugares: © OpenStreetMap contributors (ODbL), vía Overpass API y Nominatim.
- Rutas: OSRM (project-osrm.org).
- Mapa base: OpenFreeMap / OpenMapTiles (gratis, sin key). Relieve: AWS Terrain Tiles. Librerías: Leaflet y MapLibre GL.
- Fotos: Wikimedia Commons (cada foto muestra su autor y licencia).

Todo queda en `data/data.js`. Los scripts que lo generan están en `tools/` (Node.js + `npm i osmtogeojson @turf/turf mapshaper`).
Para agregar un lugar, edita `tools/lmlist.js` y vuelve a correr `geocode.js` → `finalize_lm.js` → `build_data.js`.
Puede haber errores puntuales de ubicación (sobre todo en colegios y restaurantes); si ves uno, corrígelo en `finalize_lm.js`.
