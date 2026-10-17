-- Se aplica completo en cada despliegue (servidor/migrar.js): cada sentencia debe poder repetirse sin daño.

-- Bases creadas cuando las tablas y columnas tenían nombres en inglés: se renombran sin perder ningún dato.
-- En una base nueva o ya renombrada esto no hace nada.
do $$
declare
  cambio text[];
begin
  if to_regclass('public.users') is not null and to_regclass('public.usuarios') is null then
    alter table users rename to usuarios;
  end if;
  if to_regclass('public.sessions') is not null and to_regclass('public.sesiones') is null then
    alter table sessions rename to sesiones;
  end if;
  if to_regclass('public.scores') is not null and to_regclass('public.puntajes') is null then
    alter table scores rename to puntajes;
  end if;
  if to_regclass('public.failed_logins') is not null and to_regclass('public.intentos_fallidos') is null then
    alter table failed_logins rename to intentos_fallidos;
  end if;

  foreach cambio slice 1 in array array[
    ['usuarios', 'name', 'nombre'],
    ['usuarios', 'name_key', 'llave_de_nombre'],
    ['usuarios', 'password_hash', 'clave_cifrada'],
    ['usuarios', 'created_at', 'creado_en'],
    ['sesiones', 'token_hash', 'ficha_cifrada'],
    ['sesiones', 'user_id', 'usuario_id'],
    ['sesiones', 'expires_at', 'expira_en'],
    ['puntajes', 'user_id', 'usuario_id'],
    ['puntajes', 'mode', 'modo'],
    ['puntajes', 'correct', 'aciertos'],
    ['puntajes', 'category', 'categoria'],
    ['puntajes', 'created_at', 'creado_en'],
    ['intentos_fallidos', 'name_key', 'llave_de_nombre'],
    ['intentos_fallidos', 'at', 'en']
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = cambio[1] and column_name = cambio[2]
    ) then
      execute format('alter table %I rename column %I to %I', cambio[1], cambio[2], cambio[3]);
    end if;
  end loop;
end
$$;

alter index if exists scores_by_category rename to puntajes_por_categoria;

alter index if exists scores_by_user rename to puntajes_por_usuario;

alter index if exists failed_logins_by_name rename to intentos_fallidos_por_nombre;

create table if not exists usuarios (
  id              integer generated always as identity primary key,
  nombre          text not null,
  llave_de_nombre text not null unique,
  clave_cifrada   text not null,
  creado_en       timestamptz not null default now()
);

create table if not exists sesiones (
  ficha_cifrada text primary key,
  usuario_id    integer not null references usuarios (id) on delete cascade,
  expira_en     timestamptz not null
);

create table if not exists puntajes (
  id         integer generated always as identity primary key,
  usuario_id integer not null references usuarios (id) on delete cascade,
  modo       text not null,
  aciertos   integer not null,
  total      integer not null,
  ms         integer not null,
  creado_en  timestamptz not null default now()
);

-- Categoría de ranking según el largo de la ronda: '20' o 'todas' (todas las preguntas del juego). Antes también
-- había '10', '15' y '30': esas marcas siguen guardadas pero ya no salen en ningún ranking.
-- Las rondas guardadas antes de que existieran las categorías se clasifican por su largo, sin perder ninguna.
alter table puntajes add column if not exists categoria text;

update puntajes
set categoria = case when modo like '%-all' or total > 30 then 'todas' else total::text end
where categoria is null;

update puntajes set categoria = 'todas' where categoria = 'all';

alter table puntajes alter column categoria set not null;

-- Street View se separa por nivel y no por largo: las rondas de 10 que había eran todas de lo que hoy es el nivel extremo.
update puntajes set categoria = 'extremo' where modo = 'sv-ubicar' and categoria = '10';

-- Los juegos de comunas se separan por alcance (core, peri, all): las rondas de antes eran todas del Gran Santiago.
update puntajes set categoria = 'core' where modo in ('com-name', 'com-all') and categoria = 'todas';

create index if not exists puntajes_por_categoria on puntajes (modo, categoria, creado_en);

create index if not exists puntajes_por_usuario on puntajes (usuario_id, creado_en);

-- Puntos de Street View que los jugadores marcaron como malos (túneles).
create table if not exists reportes_de_puntos (
  id        integer generated always as identity primary key,
  lugar     text not null,
  lat       double precision not null,
  lon       double precision not null,
  motivo    text not null,
  creado_en timestamptz not null default now()
);

create table if not exists intentos_fallidos (
  llave_de_nombre text not null,
  en              timestamptz not null default now()
);

create index if not exists intentos_fallidos_por_nombre on intentos_fallidos (llave_de_nombre, en);

-- Progreso de práctica de cada jugador ("% dominado", puntos débiles), para que sea el mismo en todos sus dispositivos.
-- Una fila por pregunta (llave = "<modo>:<ítem>"); al juntar dos dispositivos gana la respuesta más reciente (ultima, en ms).
create table if not exists progreso (
  usuario_id integer not null references usuarios (id) on delete cascade,
  llave      text not null,
  respuestas integer not null,
  aciertos   integer not null,
  racha      integer not null,
  ultima     bigint not null,
  primary key (usuario_id, llave)
);
