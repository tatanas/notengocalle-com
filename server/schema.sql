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

create index if not exists scores_by_mode on scores (mode, created_at);

create index if not exists scores_by_user on scores (user_id, created_at);

create table if not exists failed_logins (
  name_key text not null,
  at       timestamptz not null default now()
);

create index if not exists failed_logins_by_name on failed_logins (name_key, at);
