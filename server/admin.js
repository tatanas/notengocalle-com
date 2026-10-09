// Tareas de administración contra la base de producción. Necesita DATABASE_URL en el entorno:
//   node server/admin.js usuarios
//   node server/admin.js clave <nombre> <nueva>   cambia la clave de alguien y cierra sus sesiones
//   node server/admin.js borrar <nombre>      borra la cuenta con sus puntajes
import { usernameKey } from '../shared/accounts.js'
import { resetPassword } from './auth.js'
import { connectProductionDatabase } from './database.js'

const TASKS = {
  async usuarios(db) {
    const users = await db.query(
      `select users.name, users.created_at::date as desde, count(scores.id)::int as rondas
       from users left join scores on scores.user_id = users.id
       group by users.id order by users.created_at`,
    )
    console.table(users)
  },

  async clave(db, name, newPassword) {
    const reset = await resetPassword(db, name, newPassword)
    console.log(reset ? `Clave de ${reset} cambiada.` : 'No existe ese usuario.')
  },

  async borrar(db, name) {
    const deleted = await db.query(`delete from users where name_key = $1 returning name`, [
      usernameKey(name),
    ])
    console.log(deleted.length ? `Cuenta ${deleted[0].name} borrada.` : 'No existe ese usuario.')
  },
}

const [task, name, extra] = process.argv.slice(2)
const db = connectProductionDatabase()
if (!db) throw new Error('Falta DATABASE_URL (la cadena de conexión de Neon).')
if (!TASKS[task] || (task !== 'usuarios' && !name) || (task === 'clave' && !extra))
  throw new Error('Uso: node server/admin.js usuarios | clave <nombre> <nueva> | borrar <nombre>')
await TASKS[task](db, name, extra)
