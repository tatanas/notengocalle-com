# Servidor: cuentas, ranking y base de datos

Leer solo si la tarea toca `servidor/`, `compartido/`, `src/cuenta/` o el ranking. El mapa general está en [ARQUITECTURA.md](../ARQUITECTURA.md).

Es una sola Function de Netlify. `servidor/api.js` recibe un `Request` y devuelve un `Response` (el estándar web), así que el mismo código corre en Netlify y en el servidor local de desarrollo (`desarrollo/apiLocal.js`). El juego nunca espera al servidor para funcionar.

## Rutas (`ROUTES` en `servidor/api.js`)

| Ruta | Qué hace |
|---|---|
| `POST /api/registrarse` | crea la cuenta e inicia sesión |
| `POST /api/entrar` | inicia sesión |
| `POST /api/salir` | cierra la sesión |
| `GET /api/yo` | usuario de la sesión, o `null` |
| `POST /api/google`, `POST /api/google/vincular` | entrar con Google / vincular Google a una cuenta con clave |
| `POST /api/puntajes` | guarda una ronda oficial; responde puesto y mejor marca |
| `GET /api/tabla?modo=&categoria=&periodo=` | los 50 mejores de un juego en esa categoría, la fila del usuario y cuántos jugadores hay en cada categoría |
| `GET /api/lideres?categoria=&periodo=` | el líder de cada juego en esa categoría y el puesto del usuario en cada uno |
| `POST /api/reportes` | puntos de Street View que un jugador marca como túnel |
| `GET /api/progreso`, `POST /api/progreso` | lee / sube el progreso de práctica (`stats`); de cada pregunta queda la más reciente |
| `POST /api/progreso/borrar` | borra el progreso de práctica de la cuenta |

Los errores salen como `{ "error": "código", "mensaje": "texto para mostrar" }` (`servidor/errores.js`). Los `POST` que vienen de otro sitio se rechazan (cabecera `Origin`). Para una ruta nueva: función en `servidor/`, una línea en `ROUTES` y prueba en `pruebas/api.test.js`.

## Cuentas

Nombre de usuario y clave, sin correo, o "Continuar con Google". Decisiones:

- **Google** (`servidor/google.js`, `src/cuenta/google.js`): el navegador carga Google Identity Services recién al abrir el diálogo de cuenta y recibe un ID token; `POST /api/google` lo verifica con las llaves públicas de Google (WebCrypto, sin dependencias; firma RS256, `aud` = `ID_DE_CLIENTE_DE_GOOGLE` de `compartido/configuracion.js`, `iss` de Google, no vencido) y guarda **solo `sub`** (columna `usuarios.google_sub`); nombre, correo y foto se descartan. La primera vez responde `necesitaNombre` y el navegador reenvía el token con el nombre elegido (no se usa el de Google). Esas cuentas no tienen clave (`clave_cifrada` nula). Una cuenta con clave se vincula con `POST /api/google/vincular`, solo con la sesión iniciada; nunca se juntan cuentas por el nombre. En Google Cloud la app está en modo Testing: solo entran los usuarios de prueba hasta publicarla.
- **Claves** con scrypt (`servidor/claves.js`); nunca se guardan en claro. El costo (hoy 64 MB por intento) va dentro de cada hash: al subirlo, las claves antiguas se recalculan solas la próxima vez que la persona entra. Mínimo 8 caracteres, distinta del nombre de usuario y **que no aparezca en filtraciones públicas**: al registrarse se consulta Pwned Passwords (Have I Been Pwned) enviando solo 5 caracteres del SHA-1, nunca la clave. Si ese servicio no responde, el registro sigue.
- **Sesión** en una cookie `HttpOnly` (el JavaScript de la página no puede leerla), `SameSite=Lax`, de 180 días. En la base solo queda la huella del token.
- **No hay recuperación de clave.** Sin correo no hay a dónde mandar nada, y se descartó un código de recuperación. "Olvidé mi clave" solo muestra un aviso. Si alguien pierde la clave, el administrador puede ponerle otra (ver "Administrar") o puede crear una cuenta nueva.
- **Nombres**: 3 a 20 letras, números, `.`, `_` o `-`. "Ñandú" y "nandu" cuentan como el mismo nombre.
- **Freno a fuerza bruta**: 10 intentos fallidos por nombre en 15 minutos bloquean ese nombre por un rato. Además hay un límite de solicitudes por IP (`rateLimit` en `netlify/functions/api.js`), que nunca se ha visto funcionar en producción.

## Ranking

- Un ranking por juego **y por categoría**: el largo de la ronda (`10`, `20` o `todas`) y, en algunos juegos, el nivel o alcance (Street View por nivel, comunas por alcance). Las reglas de qué categorías existen para cada juego viven en `compartido/oficial.js` (`categoriasValidasDe`, `categoriaEnElResumen`, `ajusteDeCategoria`), que usan el navegador y el servidor. Ordena por aciertos y, a igual número, por menor tiempo.
- De cada jugador cuenta su mejor ronda; todas las rondas quedan guardadas (permite el ranking "últimos 7 días" y, a futuro, historial).
- **El puntaje lo calcula el navegador.** El servidor solo descarta lo imposible (`problemaDelPuntaje` en `compartido/oficial.js`: modo desconocido, largo distinto al oficial, tiempo inhumano). Alguien con ganas puede hacer trampa; es un riesgo aceptado para un juego entre amigos. Para borrar una marca tramposa, ver "Administrar".

## Base de datos

Postgres. El esquema completo está en `servidor/esquema.sql` y se aplica solo en cada build (`servidor/migrar.js`); cada sentencia es repetible (`create … if not exists`). Para cambiarlo, se agregan sentencias repetibles al final (por ejemplo `alter table … add column if not exists …`).

| Tabla | Para qué |
|---|---|
| `usuarios` | nombre, clave (hash) y `google_sub` |
| `sesiones` | sesiones abiertas |
| `puntajes` | cada ronda oficial jugada: usuario, modo, categoría, aciertos, total, milisegundos, fecha |
| `intentos_fallidos` | intentos fallidos recientes (freno a fuerza bruta) |
| `reportes_de_puntos` | puntos de Street View reportados como túnel |
| `progreso` | progreso de práctica de la cuenta, una fila por pregunta |

En producción la base es **Neon** (Postgres serverless, plan gratis, driver HTTP): se duerme sin uso y despierta sola con la primera consulta, que por eso puede tardar cerca de un segundo. En local y en las pruebas es **PGlite** (un Postgres real dentro de Node, en `.local/db/`). El SQL es el mismo, pero el camino con Neon real no se ha probado todavía.

## Administrar

Con la cadena de conexión de Neon en la variable `DATABASE_URL`:

```
node servidor/admin.js usuarios                 lista de cuentas con cuántas rondas tiene cada una
node servidor/admin.js reportes                 túneles reportados por los jugadores
node servidor/admin.js clave <nombre> <nueva>   cambia la clave de alguien y cierra sus sesiones
node servidor/admin.js borrar <nombre>          borra la cuenta y sus puntajes
```

Para todo lo demás, el editor SQL de la consola de Neon. Por ejemplo, las últimas rondas guardadas:

```sql
select puntajes.id, usuarios.nombre, modo, aciertos, total, ms, puntajes.creado_en
from puntajes join usuarios on usuarios.id = puntajes.usuario_id
order by puntajes.creado_en desc limit 50;

delete from puntajes where id = 123;   -- borrar una marca
```
