-- Se aplica completo en cada despliegue (server/migrate.js): cada sentencia debe poder repetirse sin daño.

create table if not exists users (
  id            integer generated always as identity primary key,
  name          text not null,
  name_key      text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    integer not null references users (id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists scores (
  id         integer generated always as identity primary key,
  user_id    integer not null references users (id) on delete cascade,
  mode       text not null,
  correct    integer not null,
  total      integer not null,
  ms         integer not null,
  created_at timestamptz not null default now()
);

-- Categoría de ranking según el largo de la ronda: '10', '15', '20', '30' o 'all' (todas las preguntas del juego).
-- Las rondas guardadas antes de que existiera se clasifican por su largo, sin perder ninguna.
alter table scores add column if not exists category text;

update scores
set category = case when mode like '%-all' or total > 30 then 'all' else total::text end
where category is null;

alter table scores alter column category set not null;

create index if not exists scores_by_category on scores (mode, category, created_at);

create index if not exists scores_by_user on scores (user_id, created_at);

create table if not exists failed_logins (
  name_key text not null,
  at       timestamptz not null default now()
);

create index if not exists failed_logins_by_name on failed_logins (name_key, at);
