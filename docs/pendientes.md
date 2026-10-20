# Ideas y pendientes

Leer solo al elegir qué hacer a continuación o al retomar una idea. Por valor, de más a menos.

## Sin probar a mano
Las pruebas automáticas no juegan Street View: recorrer la calle en celular y escritorio, que "Cerrar Street View" devuelva bien el mapa, el recinto del San Cristóbal y que las pistas se lean bien al responder. También del ruteo (ver [ruteo.md](ruteo.md), "Datos").

## Verificar en el primer despliegue real
El camino con Neon real y el `rateLimit` por IP de `netlify/functions/api.js` nunca se han visto funcionar. **Hacerlo antes de sacar "Continuar con Google" del modo Testing** en Google Cloud (el dueño pidió que se lo recuerden). Ver [publicar.md](publicar.md).

## Ideas
1. **Más pistas para aprender cada calle** (idea del dueño): bandejón muy ancho, árboles al medio, ferias, automotoras, estadios, malls, ríos/canales. Hoy 107 de 174 calles tienen alguna (automáticas: agua, automotoras, feria, estadio, lugares emblemáticos cercanos). Falta lo que OSM no dice (bandejones, arbolado): cargarlo a mano en `PISTAS_MANUALES` (`tools/pistas_calles.mjs`).
2. **Autopistas en Street View**: son muy amplias; el dueño dijo "dejémoslo" por ahora. Idea: ponerlas solo en puntos cercanos a un lugar relevante (Costanera Norte junto al Costanera Center, Vespucio junto a un mall…).
3. **Salidas de Costanera Norte y Vespucio** como guía para decidir qué calles agregar: el dueño pidió solo la lista (no agregar); no hay una fuente oficial limpia (TAG, `tag.cl/mapa`, o los mapas de cada concesionaria). Ya están en `tools/salidas.json` (con número, sin destino).
4. Ranking: tabla general que combine todos los juegos e historial personal de rondas (los datos ya se guardan).
5. Sincronizar también los récords personales (`best`) entre dispositivos (el progreso de práctica ya se sincroniza).
6. **Lugares propios** del usuario (como "Mis calles"), para poder sacar lo hiperlocal del juego base. Seguir recortando lo demasiado específico si se generaliza la app.
7. Si el juego se abre a desconocidos: validar los puntajes en el servidor (hoy los calcula el navegador) y moderar nombres de usuario.
8. Ordenar `tools/` (~100 piezas sueltas en una carpeta); solo si se puede volver a correr cada script.

### Más modos difíciles de calles (ideas del dueño, sin hacer)
- _Sin mapa_: **probado y descartado** (juego `st-text`, ya borrado; está en git). Las pistas salían de los cruces de `inter`, que están mal detectados (cruces que caen todos juntos o en el lugar equivocado) y no alcanzan para separar calles paralelas. Solo se rehace si antes se arregla la detección de cruces (`tools/relations.js`).
- _Wordle diario_: una calle por día que parte con la pista más amplia (región, comuna) y baja a pistas más específicas con cada intento.
- _Con vista de calle_ (probado: **Panoramax no alcanza**; de 424 puntos repartidos en 53 calles, solo 5 tenían una foto a menos de 30 m, o sea ~1 %; las zonas con foto son Vitacura, Andrés Bello, Colón y Pedro de Valdivia. Volver a medir si la cobertura crece): encontrar la calle en el mapa a partir de cómo se ve, pudiendo moverse un poco y con la calle pedida marcada en el piso. **Choca con "nada de imágenes de Google"** fuera de Street View; las alternativas libres son Panoramax y Mapillary (descartado antes).
- _Modo extremo_: preguntar por **cualquier** calle de Santiago, no solo las anotadas, y encontrarla en el mapa (sin callejones ni cosas muy chicas). Requiere un conjunto de calles de OSM por comuna (descarga pesada: el pipeline actual solo guarda las anotadas) y decidir qué tamaño mínimo cuenta.

## Conexiones (`cx`, retirado por mientras)
- Se sacó del menú y del ranking porque las preguntas de cruces y de "¿pasa por esta comuna?" tenían errores. El código sigue en `src/juego/modos/conexiones.js`, sin cargar. Para volver: `import './conexiones.js'` en `src/juego/modos/index.js` y `'cx'` en `MODOS_OFICIALES`.
- Ya está hecha la base del arreglo: los cruces salen de OpenStreetMap (`tools/cruces.js`, nodos compartidos) y `relations.js` deja en los datos `cl` (metros de cada calle dentro de cada comuna, sin margen), `cc` (comunas que la calle roza a 60 m) y `dudosos` (pares que pasan uno sobre otro o se acercan a menos de 80 m sin cruzarse). Falta usarlos en `conexiones.js`: "pasa por" solo con al menos 800 m (o la mitad de una calle corta) dentro de la comuna; "no pasa" solo si ni la roza (`cc`); y nunca ofrecer un par `dudoso` como respuesta ni como distractor.
