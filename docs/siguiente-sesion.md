# Para retomar el desarrollo

Estado, comandos y trucos para avanzar **sin gastar tokens en redescubrir el proyecto**. Lo que se carga siempre es `CLAUDE.md`; de lo demás, leer solo lo que la tarea toque (índice en `CLAUDE.md` y al final de `ARQUITECTURA.md`).

## Estado (octubre 2026)

- 22 juegos con ronda oficial y ranking; cuentas y ranking con Neon (producción) o PGlite (local). `npm test` pasa.
- Street View ("¿Dónde estás?") completo: 4 niveles, rondas de 10, puntos repartidos por calle, cerros con recinto, pistas. Ver [streetview.md](streetview.md).
- Juegos de calles: `st-find` perdona los cruces; `st-punto` es la versión "difícil" de `st-name`; los tres permiten recorrer la calle en Street View al responder.
- Ruteo en auto sobre la red real de Valhalla, con alternativas posibles y salidas de autopista: [ruteo.md](ruteo.md).
- **Desafíos diarios** (primera tarjeta del menú): ruteo en auto, 10 calles y 10 comunas de la RM, iguales para todos, una vez al día, con ranking por fecha (reinicio a la medianoche de Chile): [modos.md](modos.md#desafíos-diarios-dd-ruta-dd-calles-dd-comunas-oct-2026).
- **Ruteo en auto** (primer juego de la tarjeta Ruteo, `rs-sv-ruta`): una ruta A→B por ronda entre lugares emblemáticos, conduciendo por el grafo vial de OpenStreetMap con Street View; práctica con mapa, ronda real sin mapa, ranking "Una ruta". Probado con la llave real. Faltan los datos del Gran Santiago completo (hoy ~35 % del rectángulo), las huellas de ~90 lugares y el juego diario: [conduccion-libre.md](conduccion-libre.md). El modo libre es la pestaña 🚗 (solo con `npm run dev`).
- **Sin probar a mano** (las pruebas no juegan Street View): ver [pendientes.md](pendientes.md). Es lo primero que conviene mirar jugando.

## Comandos útiles

```
npm run dev                         juego + API local en http://localhost:5173
npm test                            lint + unitarias + SOLO las suites de navegador que tocan lo modificado (rápido)
node pruebas/ejecutar.js <suite>    una suite concreta (p. ej. punto-en-calle, diseno-menu, cuentas); --sin-build reutiliza dist/
npm run test:full                   TODO (más de 10 min): solo para cambios amplios o antes de desplegar
npm run lint / npm run format       ESLint / Prettier (mandan ellos, no discutir formato)
npm run build                       migra la base y construye dist/ (detecta imports rotos que ESLint no ve)
node tools/niveles_streetview.mjs   reasigna niveles de Street View (siempre después de regenerar puntos)
node tools/pistas_calles.mjs        recalcula pistas por calle (src/datos/pistasCalles.json)
node tools/streetview_lugares.mjs   genera los puntos de Street View (necesita llave en .env.local; ver streetview.md)
node servidor/admin.js reportes     túneles reportados por los jugadores
```

## Cómo ahorrar tokens

- **Archivos bloqueados**: `.claude/settings.json` impide Read/Grep sobre lo pesado o generado (`public/data/`, `public/vendor/`, `tools/*.json`, `src/datos/lugaresStreetView.json` y `pistasCalles.json`, `dist/`, `node_modules/`, `package-lock.json`, fuentes). `data.js` son 2 MB en 2 líneas: un grep ahí devolvería todo. Para los datos del juego:
  ```
  npm run datos -- "Object.keys(D)"
  npm run datos -- "D.streets.filter(c => /Apoquindo/.test(c.name)).map(c => c.name)"
  ```
  (`desarrollo/consultarDatos.js`: evalúa la expresión con `D` = `window.DATA` y corta la salida a 6000 caracteres). Para un `.json` de `tools/` o `src/datos/`: `node -e "const d=require('./tools/streets.json'); console.log(...)"`.
- Escribe scripts de edición en archivos (`.local/algo.cjs`, ignorado por git) y no en línea: las comillas y barras se rompen en el shell.
- Busca con grep antes de leer; los archivos de `src/juego/modos/` son largos (hasta 22 KB): léelos por rango (`offset`/`limit`).
- Corre solo la suite que corresponde. Las pruebas ya imprimen solo lo que falla (`--verboso` para ver todo).
- Los documentos de `docs/` son por tema: no los leas "por si acaso".
- Código en español, nombres descriptivos en vez de comentarios (ver `CLAUDE.md`). El usuario revisa en el celular: probar también el ancho angosto.
- El usuario hace los `git push`; Claude solo hace commit cuando se lo piden (con la línea `Co-Authored-By` que indique el entorno).
