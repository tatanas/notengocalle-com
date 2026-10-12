// Tareas de administración contra la base de producción. Necesita DATABASE_URL en el entorno:
//   node servidor/admin.js usuarios
//   node servidor/admin.js clave <nombre> <nueva>   cambia la clave de alguien y cierra sus sesiones
//   node servidor/admin.js borrar <nombre>      borra la cuenta con sus puntajes
import { llaveDeUsuario } from '../compartido/cuentas.js'
import { restablecerClave } from './autenticacion.js'
import { conectarBaseDeProduccion } from './baseDeDatos.js'

const TAREAS = {
  async usuarios(db) {
    const usuarios = await db.query(
      `select usuarios.nombre, usuarios.creado_en::date as desde, count(puntajes.id)::int as rondas
       from usuarios left join puntajes on puntajes.usuario_id = usuarios.id
       group by usuarios.id order by usuarios.creado_en`,
    )
    console.table(usuarios)
  },

  async clave(db, nombre, claveNueva) {
    const restablecer = await restablecerClave(db, nombre, claveNueva)
    console.log(restablecer ? `Clave de ${restablecer} cambiada.` : 'No existe ese usuario.')
  },

  async borrar(db, nombre) {
    const borrados = await db.query(`delete from usuarios where llave_de_nombre = $1 returning nombre`, [
      llaveDeUsuario(nombre),
    ])
    console.log(borrados.length ? `Cuenta ${borrados[0].nombre} borrada.` : 'No existe ese usuario.')
  },
}

const [tarea, nombre, extra] = process.argv.slice(2)
const db = conectarBaseDeProduccion()
if (!db) throw new Error('Falta DATABASE_URL (la cadena de conexión de Neon).')
if (!TAREAS[tarea] || (tarea !== 'usuarios' && !nombre) || (tarea === 'clave' && !extra))
  throw new Error('Uso: node servidor/admin.js usuarios | clave <nombre> <nueva> | borrar <nombre>')
await TAREAS[tarea](db, nombre, extra)
