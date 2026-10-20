# Publicar (Netlify + GitHub + Neon)

Leer solo para conectar el repositorio, crear la base de datos o diagnosticar un despliegue.

Netlify construye el sitio desde GitHub: cada push a `main` publica, y las demás ramas pueden tener su propia vista previa. La configuración está en `netlify.toml`; `npm run build` migra la base y construye `dist/`.

**Una vez, para conectar el repositorio** (en el sitio que ya existe, para conservar la dirección):

1. Netlify → el sitio → _Project configuration_ → _Build & deploy_ → _Continuous deployment_ → _Link repository_ → GitHub → `tatanas/notengocalle-com`.
2. Rama de producción: `main`. El comando y la carpeta se leen de `netlify.toml`; no hay que escribirlos.
3. En _Branches and deploy contexts_, activar los _branch deploys_ para ver ramas en una dirección propia antes de pasarlas a `main`.

**Una vez, para activar cuentas y ranking** (sin esto el sitio funciona igual, solo sin cuentas):

- Opción A, dentro de Netlify: agregar una base con **Netlify DB** (extensión de Neon). Crea la variable `NETLIFY_DATABASE_URL` sola. Hay que "reclamar" la base con una cuenta de Neon para que no caduque.
- Opción B, directo en Neon: crear un proyecto gratis en neon.tech, copiar la cadena de conexión y guardarla en Netlify como variable de entorno `DATABASE_URL` (disponible para _Builds_ y _Functions_).

Después, volver a desplegar. En el registro del build debe aparecer `Base de datos: esquema al día.`

Los nombres exactos de los menús de Netlify y Neon cambian con el tiempo; si no calzan, la idea es la misma: enlazar el repositorio y dejar la cadena de conexión en una variable de entorno.

Ojo: mientras producción y las vistas previas compartan la misma variable, comparten también la base. Para separarlas, Netlify permite dar a cada contexto de despliegue un valor distinto de la variable.

Otras variables: `GOOGLE_MAPS_KEY` (Street View; ver [streetview.md](streetview.md)).

**Antes del primer despliegue con base real**: el camino con Neon real y el `rateLimit` por IP de `netlify/functions/api.js` nunca se han visto funcionar. Verificarlos, y hacerlo antes de sacar "Continuar con Google" del modo Testing en Google Cloud (el dueño pidió que se lo recuerden).
