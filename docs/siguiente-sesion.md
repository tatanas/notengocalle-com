# Para retomar el desarrollo (leer esto primero)

Pensado para una sesión nueva de Claude (o de cualquiera) que quiera avanzar **sin gastar tokens en redescubrir el proyecto**.
Orden de lectura: este archivo → `CLAUDE.md` (decisiones de contenido y forma de trabajar) → solo lo que necesites de `ARQUITECTURA.md` y `docs/streetview.md`.

## Estado (octubre 2026)
- 21 juegos (20 con ronda oficial y ranking); cuentas y ranking con Neon (producción) o PGlite (local). `npm test` pasa.
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
| Preguntas y alternativas del ruteo en auto (ver "Ruteo en auto") | construcción de la ruta: `compartido/rutaEnAuto.js`; mapa: `src/dominio/decisionesEnAuto.js`; Street View: `src/dominio/decisionesConStreetView.js`; cruces: `src/dominio/cruceDeRuta.js`; salidas de autopista: `src/dominio/salidas.js` y `node salidas.js` (en `tools/`) |
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
- Espacios listos en `src/interfaz/anuncios.js` (`ESPACIOS`): banner chico arriba del menú, uno al terminar una ronda (bajo los botones) y uno al final del ranking y de Mi progreso. Están vacíos: cuando aprueben el sitio, crear en AdSense una unidad de display por espacio y poner su número (data-ad-slot). Solo se muestran en notengocalle.com (ni en local ni en las pruebas).
- Plan del dueño, aún sin hacer: un anuncio a pantalla completa la primera vez en 30 minutos y luego cada 5 rondas (necesita la API de juegos de AdSense, que se pide aparte).
  Sugerido: mostrarlo al terminar una ronda (pantalla de resultado), nunca en medio de una ronda oficial, con la API de juegos de AdSense (`adBreak()`, se pide aparte).
- Las pruebas ignoran los errores de red de los dominios de anuncios (`EXTERNOS` en `pruebas/apoyo.js`).

## Ideas y pendientes (por valor)
1. **Más pistas para aprender cada calle** (idea del dueño): bandejón muy ancho, árboles al medio, ferias, automotoras, estadios, malls, ríos/canales. Hoy 107 de 174 calles tienen alguna
   (automáticas: agua, automotoras, feria, estadio, lugares emblemáticos cercanos). Falta lo que OSM no dice (bandejones, arbolado): cargarlo a mano en `PISTAS_MANUALES` (`tools/pistas_calles.mjs`).
2. **Autopistas en Street View**: son muy amplias; el dueño dijo "dejémoslo" por ahora. Idea: ponerlas solo en puntos cercanos a un lugar relevante (Costanera Norte junto al Costanera Center, Vespucio junto a un mall…).
3. **Salidas de Costanera Norte y Vespucio** como guía para decidir qué calles agregar: el dueño pidió solo la lista (no agregar); no hay una fuente oficial limpia (TAG, `tag.cl/mapa`, o los mapas de cada concesionaria). Ya están en `tools/salidas.json` (con número, sin destino).
4. Tabla general de ranking; historial de rondas; sincronizar también los récords personales (ver `CLAUDE.md`, "Ideas pendientes").
5. **Volver a poner Conexiones** con los datos de cruces nuevos (ver "Conexiones" al final). Ranking para el ruteo con Street View, si gusta.
5. Verificar en el primer despliegue real: camino con Neon real y el `rateLimit` por IP de `netlify/functions/api.js` (nunca se han visto funcionar). **Hacerlo antes de sacar "Continuar con Google" del modo Testing** en Google Cloud (el dueño pidió que se lo recuerden).
6. `tools/` está desordenado (~100 archivos); ordenar solo si se puede volver a correr cada script.

## Decisiones recientes del dueño (para no discutirlas de nuevo)
- Street View: **sí se camina** durante la pregunta (hasta 500 m, sin nombres en el panorama ni en el mapa; el puntaje se mide desde el punto de partida; antes no se podía y al dueño le parecía demasiado difícil); ronda siempre de 10; sin "todas"; un botón por nivel, **todos ronda oficial** (sin práctica: sin ayudas no tenía sentido; ídem Comunas); el fácil es chico (~24) y céntrico; priorizar calles y lugares históricos sobre recintos.
- Street View en cerros grandes: vale cualquier toque dentro del cerro. Evitar letreros (cruces) en lo posible.
- El punto de la pregunta debe cambiar entre partidas: nadie debe ganar memorizando una foto.
- Calles agregadas: Agustinas y Monjitas (para ubicarse cerca de La Moneda), Rolando Petersen, Camino a Lonquén (se tomó éste porque no hay "Av. Lonquén"), Isabel La Católica, Candelaria Goyenechea, Luis Carrera, Alonso de Camargo, Presidente Errázuriz y Alexander Fleming (de vuelta).

## Ruteo en auto (`rs-sv-car` con Street View y `rs-any-car` sobre el mapa, oct. 2026)
Los dos juegos comparten las rutas y las reglas; solo cambia cómo se pregunta. **Si hay que corregir algo del ruteo, empezar por aquí.**

**Diferencias entre los dos juegos** (por si se quiere dejar solo uno): Los tres juegos de ruteo van de a 10 rutas por ronda, con ranking (una sola categoría, "10") y práctica (con el punto fijo del jugador en auto). "Rutas en auto" (mapa) no usa Google y responde al instante; elige el *nombre* de la calle siguiente. "Rutas en auto · con Street View" (`rs-sv-car`, con ranking desde oct. 2026) necesita la llave de Google (cuota) y carga un panorama por decisión; las instrucciones son de navegador ("dobla a la izquierda") y trae lado, y "Abrir mapa" muestra dónde se está. Comparten rutas, alternativas y salidas. Las marcas antiguas de 20 preguntas de las rutas siguen en la base pero ya no salen en el ranking.

**Cómo se arma una ruta** (`compartido/rutaEnAuto.js`; lo usan el navegador y `tools/steproutes.js`). Valhalla (servidor público de FOSSGIS), tres consultas:
`/route` (el camino) → `/trace_attributes` (cada tramo de calle con su nombre, su clase y las calles que salen de cada cruce, sin nombre) →
`/locate` (los nombres de esas calles, en un solo pedido por ruta). Se arman los pasos desde la **traza**, no desde las maniobras de la ruta: las
maniobras juntan los tramos que comparten el nombre de un recorrido (p. ej. "Villa Norte - Av. Central - Cerro Alto" sería la ruta G-99, no una calle; en una ruta real unía tres calles distintas en un solo paso)
y escondían decisiones. Un tramo sin nombre propio queda como "Ruta G-99". Cada paso: `n`, `km`, `g`, `fin` (donde de verdad se deja la calle), `c` (calles chicas
por las que se pasa hasta la siguiente), `salida` (la que dice Valhalla al dejar una autopista), `x` (el cruce donde se decide entrar al paso: si la calle anterior
se deja por una rampa sin nombre, es donde se la deja) y `ent` (las calles que salen de ese cruce: `n` nombre, `h` rumbo, `k` clase 0 autopista … 6 residencial,
`f` si es una bifurcación). Las que `/locate` no logra nombrar se descartan: no se ofrece lo que no se sabe cómo se llama.
En el navegador son 3 pedidos por ruta (la caché guarda 40 rutas, `rutasEnAutoV2`); sin `/locate` la ruta sirve igual, con menos alternativas.
**Bifurcaciones**: una calle igual de importante que sale casi derecho (±60°) parte el paso en dos aunque el nombre siga (el puente de Tabancura vs. la rampa a la
Costanera); si después no se logra nombrar a dónde lleva la otra, se vuelve a juntar. En autopistas no se parte (ahí mandan las salidas).

**Reglas del dueño (no discutirlas de nuevo)**
- Solo alternativas **posibles**: calles que salen del cruce de verdad (con el lado que de verdad tienen) y "seguir derecho" si la calle continúa. Nada de calles
  al azar ni de lados imposibles; el lado solo se dice si la calle sale hacia los dos lados (en una salida o entrada de autopista hay una sola rampa).
  Lo que los datos no saben: prohibiciones de giro, calles de un solo sentido y bandejones (reportarlas si aparecen).
- **Nunca una pregunta con una sola opción**: sin alternativas, la calle se dibuja junto con la respuesta anterior (mapa) o se pasa de largo (Street View).
- Al dejar una autopista nunca se dice "sigue derecho" (aunque la salida salga derecho): "Toma la salida 8 hacia X". "Seguir derecho" en una autopista = quedarse.
- Cada salida dice a dónde lleva, como los carteles ("Salida 30 · Tabancura").

**Salidas de autopista** (`src/dominio/salidas.js`, datos de `tools/salidas.js`): se pregunta de a **tres salidas en orden + "Seguir derecho"** (puede que ninguna sirva
y lo correcto sea seguir; entonces viene la ventana siguiente). Solo las **3 últimas ventanas** antes de la salida se preguntan: lo anterior se recorre sin preguntar.
En la ventana de la salida correcta también hay salidas que vienen después, para que no sea siempre la última. En Street View la cámara se pone sobre la autopista
antes de cada ventana; en el mapa se marcan las salidas con pines. Los datos salen de OpenStreetMap: los nodos `motorway_junction` con número (`salidas_raw.json`) y las
rampas (`rampas_raw.json`, ambos ignorados por git): el destino es el `destination` de la rampa, si no la calle a la que llega siguiéndola, si no la calle del juego más
cercana y, a falta de todo, la comuna. Costanera Norte, Vespucio, Autopista Central (con sentido N/S) y algo del Nororiente tienen número; Ruta 68, 78, 5 y Acceso Sur no
(esas salidas siguen como una pregunta normal). Un nodo del que no sale una rampa es una entrada, no una salida, y se descarta.

**Street View** (`src/juego/modos/rutasStreetView.js`, preguntas en `src/dominio/decisionesConStreetView.js`): cámara 50 m antes de donde se deja la calle. Sin calles chicas:
"Vas hacia el oriente por X. ¿Qué haces en el cruce que viene?". Con calles chicas: "Ibas por X y doblaste a la izquierda por Y. Ahora llegas a Z: ¿qué haces?".
"Sigue derecho" solo si la calle cambia de nombre sin doblar (<20°); 20°–60° "Mantente a la derecha hacia…"; más "Dobla". "🗺️ Abrir mapa" muestra A, B, lo ya recorrido,
las salidas de la pregunta y una flecha que gira con la vista. **La pista**: `mostrarPanorama(…, { enLaPista: true })` (`src/mapa/streetView.js`) descarta el panorama tomado en el
sentido contrario (`tiles.originHeading`) y prueba corriéndose 4, 8 y 12 m a la derecha; **sin probar a mano** (no se puede automatizar sin la llave).

**Mapa** (`src/juego/pasos.js` + `src/dominio/decisionesEnAuto.js`): "¿a qué calle sigues?" con las calles que salen del cruce y "Seguir derecho por X"; si la calle sigue con el
mismo nombre pero hay que elegir (bifurcación), lo correcto es "Seguir derecho por X". La primera pregunta ("¿por qué calle partes?") ofrece las calles por las que ya se salió
del mismo lugar en otras rutas (`salidasDelPunto` en el navegador; para las rutas entre lugares, las otras rutas del mismo origen) y las que salen del primer cruce; al principio
puede no haber ninguna (entonces no hay primera pregunta). El transporte público usa el mismo `preguntarPasos`.

**Datos**: `node steproutes.js` (en `tools/`) rehace las rutas entre lugares (1 consulta por segundo; la caché `valhallacache.json` guarda ruta, traza y cruces; ~5 min sin caché)
y después `npm run build` en `tools/`. Las rutas precalculadas ya no traen las alternativas fijas `x` de antes.
- Las rutas son de **Valhalla**; el aeropuerto se movió a los terminales (antes estaba en la zona de carga y las rutas daban la vuelta por Lo Boza).
- Pendiente de probar jugando: autopistas y túneles (sin imagen se pregunta igual, con un aviso), la pista de Street View y la primera pregunta con el punto fijo recién puesto.

## Conexiones (retirado por mientras)
- Se sacó del menú y del ranking porque las preguntas de cruces y de "¿pasa por esta comuna?" tenían errores. Para volver: `import './conexiones.js'`
  en `src/juego/modos/index.js` y `'cx'` en `MODOS_OFICIALES`.
- Ya está hecha la base del arreglo: los cruces salen de OpenStreetMap (`tools/cruces.js`, nodos compartidos) y `relations.js` deja en los datos
  `cl` (metros de cada calle dentro de cada comuna, sin margen), `cc` (comunas que la calle roza a 60 m) y `dudosos` (pares que pasan uno sobre
  otro o se acercan a menos de 80 m sin cruzarse). Falta usarlos en `conexiones.js`: "pasa por" solo con al menos 800 m (o la mitad de una calle
  corta) dentro de la comuna; "no pasa" solo si ni la roza (`cc`); y nunca ofrecer un par `dudoso` como respuesta ni como distractor.
