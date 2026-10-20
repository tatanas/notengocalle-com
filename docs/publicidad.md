# Publicidad (AdSense, octubre 2026)

Leer solo si la tarea toca anuncios.

- Cuenta `ca-pub-4475367095699323`, sitio `notengocalle.com` (alojado en Netlify). Ya están el script en el `<head>` de `index.html`, `public/ads.txt` y la página `public/privacidad.html` (enlazada en el pie del menú; AdSense exige que mencione sus cookies). Falta: aprobación de Google.
- Recomendado: **anuncios automáticos apagados** (o al menos sin anclados ni viñetas): un aviso anclado abajo tapa el panel del juego en el celular.
- Espacios listos en `src/interfaz/anuncios.js` (`ESPACIOS`): banner chico arriba del menú, uno al terminar una ronda (bajo los botones) y uno al final del ranking y de Mi progreso. Están vacíos: cuando aprueben el sitio, crear en AdSense una unidad de display por espacio y poner su número (`data-ad-slot`). Solo se muestran en notengocalle.com (ni en local ni en las pruebas).
- Plan del dueño, aún sin hacer: un anuncio a pantalla completa la primera vez en 30 minutos y luego cada 5 rondas. Necesita la API de juegos de AdSense (`adBreak()`, se pide aparte). Mostrarlo al terminar una ronda (pantalla de resultado), nunca en medio de una ronda oficial.
- Las pruebas ignoran los errores de red de los dominios de anuncios (`EXTERNOS` en `pruebas/apoyo.js`).
