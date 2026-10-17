# Para retomar el desarrollo (leer esto primero)

Pensado para una sesión nueva de Claude (o de cualquiera) que quiera avanzar **sin gastar tokens en redescubrir el proyecto**.
Orden de lectura: este archivo → `CLAUDE.md` (decisiones de contenido y forma de trabajar) → solo lo que necesites de `ARQUITECTURA.md` y `docs/streetview.md`.

## Estado (octubre 2026)
- 19 juegos, todos con ronda oficial y ranking; cuentas y ranking con Neon (producción) o PGlite (local). `npm test` pasa.
- Street View ("¿Dónde estás?") completo: 4 niveles, rondas de 10, puntos repartidos por calle, cerros con recinto, pistas. Ver `docs/streetview.md`.
- Juegos de calles: `st-find` perdona los cruces; `st-punto` es la versión "difícil" de `st-name` (marca solo un punto); los tres permiten recorrer la calle en Street View al responder.
- **Sin probar a mano** (las pruebas automáticas no juegan Street View): recorrer la calle en celular y escritorio, que "Cerrar Street View" devuelva bien el mapa, el recinto del San Cristóbal
  y que las pistas se lean bien al responder. Es lo primero que conviene mirar jugando.

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
node tools/streetview_lugares.mjs   genera los puntos de Street View (necesita llave en .env.local; ver docs/streetview.md)
node servidor/admin.js reportes     túneles reportados por los jugadores
```

## Dónde tocar cada cosa
| Quiero… | Archivo(s) |
|---|---|
| Agregar/quitar una calle | `tools/streetlist.js` → `node streets.js` → `node merge_st.js` → `npm run build` (en `tools/`); luego puntos de Street View con `SV_CALLES="…"` y `niveles_streetview.mjs` |
| Agregar/quitar un lugar emblemático | `tools/lmlist.js` y el flujo de `ARQUITECTURA.md` (pipeline) |
| Cambiar niveles de Street View | listas de `tools/niveles_streetview.mjs`; selector en `src/interfaz/inicio.js`; `NIVEL_MAXIMO` en `src/juego/modos/streetView.js` |
| Reglas de "Encuentra la calle" | `src/juego/modos/calles.js` (constantes arriba de `st-find`) |
| Juego `st-punto` | `registrarNombreDeCalle` en `src/juego/modos/calles.js`; el punto: `puntoParaPreguntar` en `src/dominio/calles.js` |
| Rankings por ajuste (nivel de Street View, alcance de comunas) | `ajusteDeCategoria` y `COMUNAS_POR_ALCANCE` en `compartido/oficial.js`; el motor lo aplica en `iniciarPartida` (`src/juego/engine.js`) |
| Menú / barra superior / Mi progreso | `src/interfaz/inicio.js`, `index.html` (botones 🏆🔎📊), `src/interfaz/progreso.js` |
| Visor de Street View | `src/mapa/streetView.js` (un solo panorama reutilizado; en las preguntas se camina hasta 500 m sin nombres; `recorrerCalle: true` camina libre y con nombres) |
| Rondas oficiales / largos / categorías | `compartido/oficial.js` (lo comparten navegador y servidor) |
| Puntajes y ranking del servidor | `servidor/puntajes.js`, `servidor/api.js` |
| Pruebas de navegador | `pruebas/conjuntos/*.js`; qué suite corre por archivo cambiado: `pruebas/seleccion.js` |

## Cómo ahorrar tokens
- **No leas** `public/data/data.js` (2,6 MB) ni los `.json` de `src/datos/` ni `tools/*.json`: consúltalos con un `node -e` corto que cargue y filtre (hay ejemplos en este archivo y en `docs/streetview.md`).
- Escribe scripts de edición en archivos (`.local/algo.cjs`, ignorado por git) y no en línea: las comillas y barras se rompen en el shell.
- Busca con grep antes de leer archivos; los de `src/juego/modos/` son largos.
- Corre solo la suite que corresponde. La completa solo si el cambio es amplio.
- Código en español, nombres descriptivos en vez de comentarios (ver `CLAUDE.md`). El usuario revisa en el celular: probar también el ancho angosto.
- El usuario hace los `git push`; Claude solo hace commit (con la línea `Co-Authored-By` que indique el entorno).

## Publicidad (AdSense, octubre 2026)
- Cuenta `ca-pub-4475367095699323`, sitio `notengocalle.com` (alojado en Netlify). Ya están el script en el `<head>` de `index.html`, `public/ads.txt`
  y la página `public/privacidad.html` (enlazada en el pie del menú; AdSense exige que mencione sus cookies). Falta: aprobación de Google.
- Recomendado: **anuncios automáticos apagados** (o al menos sin anclados ni viñetas): un aviso anclado abajo tapa el panel del juego en el celular.
- Plan del dueño, aún sin hacer: un banner chico arriba del menú y un anuncio a pantalla completa la primera vez en 30 minutos y luego cada 5 rondas.
  Sugerido: mostrarlo al terminar una ronda (pantalla de resultado), nunca en medio de una ronda oficial, con la API de juegos de AdSense (`adBreak()`, se pide aparte).
- Las pruebas ignoran los errores de red de los dominios de anuncios (`EXTERNOS` en `pruebas/apoyo.js`).

## Ideas y pendientes (por valor)
1. **Más pistas para aprender cada calle** (idea del dueño): bandejón muy ancho, árboles al medio, ferias, automotoras, estadios, malls, ríos/canales. Hoy 107 de 174 calles tienen alguna
   (automáticas: agua, automotoras, feria, estadio, lugares emblemáticos cercanos). Falta lo que OSM no dice (bandejones, arbolado): cargarlo a mano en `PISTAS_MANUALES` (`tools/pistas_calles.mjs`).
2. **Autopistas en Street View**: son muy amplias; el dueño dijo "dejémoslo" por ahora. Idea: ponerlas solo en puntos cercanos a un lugar relevante (Costanera Norte junto al Costanera Center, Vespucio junto a un mall…).
3. **Salidas de Costanera Norte y Vespucio** como guía para decidir qué calles agregar: el dueño pidió solo la lista (no agregar); no hay una fuente oficial limpia (TAG, `tag.cl/mapa`, o los mapas de cada concesionaria).
4. Tabla general de ranking; historial de rondas; sincronizar también los récords personales (ver `CLAUDE.md`, "Ideas pendientes").
5. **Ruteo por Street View** (idea del dueño, sin hacer): ver la propuesta al final de este archivo.
5. Verificar en el primer despliegue real: camino con Neon real y el `rateLimit` por IP de `netlify/functions/api.js` (nunca se han visto funcionar).
6. `tools/` está desordenado (~100 archivos); ordenar solo si se puede volver a correr cada script.

## Decisiones recientes del dueño (para no discutirlas de nuevo)
- Street View: **sí se camina** durante la pregunta (hasta 500 m, sin nombres en el panorama ni en el mapa; el puntaje se mide desde el punto de partida; antes no se podía y al dueño le parecía demasiado difícil); ronda siempre de 10; sin "todas"; un botón por nivel, **todos ronda oficial** (sin práctica: sin ayudas no tenía sentido; ídem Comunas); el fácil es chico (~24) y céntrico; priorizar calles y lugares históricos sobre recintos.
- Street View en cerros grandes: vale cualquier toque dentro del cerro. Evitar letreros (cruces) en lo posible.
- El punto de la pregunta debe cambiar entre partidas: nadie debe ganar memorizando una foto.
- Calles agregadas: Agustinas y Monjitas (para ubicarse cerca de La Moneda), Rolando Petersen, Camino a Lonquén (se tomó éste porque no hay "Av. Lonquén"), Isabel La Católica, Candelaria Goyenechea, Luis Carrera, Alonso de Camargo, Presidente Errázuriz y Alexander Fleming (de vuelta).

## Propuesta: ruteo por Street View (sin hacer)
Idea del dueño: llegar de A a B mirando Street View en vez del mapa, con instrucciones como las de Google Maps en auto.
- **Caminar libre de A a B no sirve**: cada clic avanza ~10 m (una ruta de 3 km son cientos de clics). Descartado.
- **Lo que sí funciona: saltar de cruce en cruce.** Con las rutas en auto que ya existen (`DATOS.steps`, o las del punto propio de
  `src/dominio/rutaEnAuto.js`), en cada cambio de calle se muestra Street View unos 40 m antes del cruce, mirando hacia donde se avanza
  (rumbo del último tramo de la geometría). Arriba, la instrucción del tramo anterior ("Sigue por Av. Grecia 1,2 km") y la pregunta
  "¿Qué haces en este cruce?" con 3–4 alternativas ("Dobla a la derecha en Av. Macul", "Sigue derecho por Av. Grecia"…). Si se equivoca,
  se corrige al tiro y sigue desde el cruce correcto; al final, el mapa con la ruta completa.
- Detalles: el lado del giro sale de comparar el rumbo antes y después del cruce; para las alternativas incorrectas, del rumbo de la calle
  del juego más cercana al cruce. Reutilizar el único panorama (`src/mapa/streetView.js`). En autopistas y túneles no hay buena imagen:
  esos pasos van solo con texto. Los letreros de los cruces se ven, pero aquí ayudan: es justamente aprender a ubicarse en la calle.
