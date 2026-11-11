-- Mi Central · 001 · tablas
-- Todo vive en el esquema "central". Nadie entra por la API pública de Supabase:
-- solo el servidor (la función "central") y Claude por SQL.

create schema if not exists central;
revoke all on schema central from public;
revoke all on schema central from anon, authenticated;

create sequence if not exists central.rev_seq;

-- ---------- Tablas que se sincronizan con la app ----------

create table central.tareas (
  id uuid primary key,
  titulo text not null default '',
  detalle text not null default '',
  fecha date,
  hora time,
  prioridad smallint not null default 2 check (prioridad between 1 and 3),
  hecha boolean not null default false,
  hecha_en timestamptz,
  materia_id uuid,
  meta_id uuid,
  proyecto_id uuid,
  avisos integer[] not null default '{}',
  evento_id text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);

create table central.notas (
  id uuid primary key,
  titulo text not null default '',
  contenido text not null default '',
  fijada boolean not null default false,
  color text not null default '',
  materia_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);

create table central.materias (
  id uuid primary key,
  nombre text not null default '',
  profesor text not null default '',
  color text not null default '',
  calificaciones numeric(5,2)[] not null default '{}',
  horario jsonb not null default '[]',
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);

create table central.metas (
  id uuid primary key,
  titulo text not null default '',
  descripcion text not null default '',
  plazo text not null default 'mediano' check (plazo in ('corto', 'mediano', 'largo')),
  fecha_objetivo date,
  estado text not null default 'activa' check (estado in ('activa', 'lograda', 'pausada')),
  pasos jsonb not null default '[]',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);

create table central.proyectos (
  id uuid primary key,
  nombre text not null default '',
  descripcion text not null default '',
  tecnologias text not null default '',
  enlace text not null default '',
  tipo text not null default 'real' check (tipo in ('real', 'practica')),
  estado text not null default 'activo',
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);

create table central.datos (
  id uuid primary key,
  grupo text not null default 'General',
  titulo text not null default '',
  contenido text not null default '',
  enlace text not null default '',
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);

-- Una sola fila con los ajustes que se ven en la app.
create table central.preferencias (
  id uuid primary key,
  valores jsonb not null default '{}',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);

create index tareas_rev on central.tareas (rev);
create index notas_rev on central.notas (rev);
create index materias_rev on central.materias (rev);
create index metas_rev on central.metas (rev);
create index proyectos_rev on central.proyectos (rev);
create index datos_rev on central.datos (rev);
create index preferencias_rev on central.preferencias (rev);

-- ---------- Tablas solo del servidor ----------

create table central.dispositivos (
  id uuid primary key,
  nombre text not null,
  clave_publica jsonb not null,
  agente text not null default '',
  con_huella boolean not null default false,
  creado_en timestamptz not null default now(),
  ultimo_uso timestamptz not null default now(),
  revocado_en timestamptz
);

create table central.credenciales (
  id text primary key,
  dispositivo_id uuid not null references central.dispositivos (id),
  clave_publica jsonb not null,
  algoritmo integer not null,
  contador bigint not null default 0,
  rp_id text not null,
  transportes jsonb not null default '[]',
  creado_en timestamptz not null default now(),
  ultimo_uso timestamptz
);

create table central.sesiones (
  id uuid primary key,
  token_hash bytea not null unique,
  dispositivo_id uuid not null references central.dispositivos (id),
  creado_en timestamptz not null default now(),
  usado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  revocada_en timestamptz
);
create index sesiones_dispositivo on central.sesiones (dispositivo_id);

create table central.retos (
  id uuid primary key,
  reto bytea not null,
  tipo text not null,
  dispositivo_id uuid,
  datos jsonb not null default '{}',
  usado boolean not null default false,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null
);
create index retos_dispositivo on central.retos (dispositivo_id, creado_en);

create table central.codigos_vinculo (
  id uuid primary key,
  codigo_hash bytea not null unique,
  creado_por text not null default '',
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  usado_en timestamptz
);

create table central.intentos (
  id bigint generated always as identity primary key,
  tipo text not null,
  creado_en timestamptz not null default now()
);
create index intentos_tipo on central.intentos (tipo, creado_en);

create table central.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null references central.dispositivos (id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now(),
  ultimo_ok timestamptz,
  fallos integer not null default 0,
  ultimo_estado integer
);

-- Registro de todo lo que cambia (la pantalla "Actividad").
create table central.cambios (
  id bigint generated always as identity primary key,
  tabla text not null,
  fila_id uuid,
  accion text not null,
  resumen text not null,
  origen text not null default 'Claude',
  dispositivo_id uuid,
  creado_en timestamptz not null default now()
);

-- Cola de notificaciones al celular.
create table central.avisos (
  id bigint generated always as identity primary key,
  tipo text not null,
  accion text,
  titulo text not null,
  cuerpo text not null default '',
  url text not null default '/',
  clave text,
  excluir_dispositivo uuid,
  solo_dispositivo uuid,
  creado_en timestamptz not null default now(),
  enviar_en timestamptz not null default now(),
  tomado_en timestamptz,
  enviado_en timestamptz,
  resultado jsonb
);
create unique index avisos_clave_pendiente on central.avisos (clave)
  where (clave is not null and tomado_en is null and enviado_en is null);
create index avisos_pendientes on central.avisos (enviar_en) where (enviado_en is null);

create table central.recordatorios (
  id bigint generated always as identity primary key,
  tarea_id uuid not null,
  minutos integer not null,
  enviar_en timestamptz not null,
  enviado_en timestamptz,
  unique (tarea_id, minutos, enviar_en)
);
create index recordatorios_pendientes on central.recordatorios (enviar_en) where (enviado_en is null);

-- Cola de trabajos para el puente de Google (correo y calendario).
create table central.cola_google (
  id bigint generated always as identity primary key,
  tipo text not null,
  clave text,
  datos jsonb not null default '{}',
  creado_en timestamptz not null default now(),
  tomado_en timestamptz,
  hecho_en timestamptz,
  intentos integer not null default 0,
  resultado jsonb
);
create unique index cola_google_clave_pendiente on central.cola_google (clave)
  where (clave is not null and tomado_en is null and hecho_en is null);
create index cola_google_pendientes on central.cola_google (id) where (hecho_en is null);

create table central.config (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);

create table central.secretos (
  clave text primary key,
  valor text not null,
  creado_en timestamptz not null default now()
);

-- Seguro extra: RLS encendido y sin políticas. Aunque alguien expusiera el esquema,
-- las llaves públicas del proyecto no podrían leer nada.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'central' loop
    execute format('alter table central.%I enable row level security', t);
  end loop;
end $$;
