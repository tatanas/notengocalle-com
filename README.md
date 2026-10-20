# NoTengoCalle

**Jugar en [notengocalle.com](https://notengocalle.com)**

Juego web para aprender la geografía de Santiago (comunas, calles, lugares, metro, rutas) y de Chile
(regiones, ciudades, parques nacionales). Se puede jugar sin cuenta; con cuenta, las rondas oficiales
(el botón grande de cada juego) entran al ranking.

Todo es gratis y sin API keys. El juego corre en el navegador; un servidor mínimo guarda cuentas y puntajes.

## Empezar

Necesitas Node 22 o superior.

```
npm install
npm run dev        # http://localhost:5173, con cuentas y ranking sobre una base local
npm test           # lint, pruebas unitarias, del servidor y de navegador (usa Chrome)
```

Para probarlo desde el celular en la misma red WiFi: `npx vite --host` y abrir la dirección "Network" que
muestra.

## Publicar

El sitio se publica en Netlify directamente desde este repositorio: cada push a `main` despliega. La puesta
en marcha (conectar el repositorio y crear la base de datos) está en
[docs/publicar.md](docs/publicar.md).

## Documentación

- [ARQUITECTURA.md](ARQUITECTURA.md): cómo está organizado el código, carpeta por carpeta; pruebas; decisiones.
- [docs/](docs/): el detalle por tema (servidor, datos y pipeline, juegos y menú, ruteo, Street View, publicación…).
- [CLAUDE.md](CLAUDE.md): acuerdos de trabajo y reglas del producto.

## Créditos de los datos

- Límites comunales, calles, metro y lugares: © OpenStreetMap contributors (ODbL), vía Overpass y Nominatim.
- Rutas en auto: OSRM. Rutas y recorridos de transporte público: GTFS de Red (DTPM).
- Mapa base: OpenFreeMap / OpenMapTiles. Relieve: AWS Terrain Tiles. Librerías: Leaflet y MapLibre GL.
- Fotos: Wikimedia Commons y Panoramax; cada foto muestra su autor y licencia.
