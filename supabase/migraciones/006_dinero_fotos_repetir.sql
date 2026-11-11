-- Mi Central · 006 · movimientos de dinero, fotos en notas y tareas que se repiten

alter table central.tareas add column if not exists repetir text not null default ''
  check (repetir in ('', 'diaria', 'semanal', 'mensual'));

create table if not exists central.movimientos (
  id uuid primary key,
  tipo text not null default 'gasto' check (tipo in ('ingreso', 'gasto')),
  monto numeric(14,2) not null default 0,
  categoria text not null default '',
  nota text not null default '',
  fecha date not null default current_date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);

-- Fotos de las notas, ya achicadas por la app, guardadas como texto.
create table if not exists central.fotos (
  id uuid primary key,
  nota_id uuid,
  datos text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);

create index if not exists movimientos_rev on central.movimientos (rev);
create index if not exists fotos_rev on central.fotos (rev);
alter table central.movimientos enable row level security;
alter table central.fotos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['movimientos', 'fotos'] loop
    execute format('drop trigger if exists marcar on central.%I', t);
    execute format('drop trigger if exists registrar on central.%I', t);
    execute format('create trigger marcar before insert or update on central.%I for each row execute function central.tg_marcar()', t);
    execute format('create trigger registrar after insert or update on central.%I for each row execute function central.tg_registrar()', t);
  end loop;
end $$;

-- Las funciones existentes se amplían cambiando solo el trozo necesario de su definición.
create or replace function central.parchar(p_funcion text, p_viejo text, p_nuevo text) returns void
language plpgsql set search_path = central, pg_temp as $$
declare v text := pg_get_functiondef(('central.' || p_funcion)::regproc);
begin
  if position(p_nuevo in v) > 0 then return; end if;
  if position(p_viejo in v) = 0 then raise exception 'parche: no se encontró el trozo en %', p_funcion; end if;
  execute replace(v, p_viejo, p_nuevo);
end $$;

select central.parchar('tg_registrar',
  $a$when 'datos' then v_tipo := 'dato'; v_fem := false; v_url := '/#/datos';$a$,
  $a$when 'datos' then v_tipo := 'dato'; v_fem := false; v_url := '/#/datos';
    when 'movimientos' then v_tipo := 'movimiento'; v_fem := false; v_url := '/#/dinero';
    when 'fotos' then v_tipo := 'foto'; v_url := '/#/notas/' || coalesce(v_n ->> 'nota_id', '');$a$);
select central.parchar('tg_registrar',
  $a$    '(sin título)');$a$,
  $a$    case when v_tabla = 'movimientos' then concat_ws(' ', nullif(v_n ->> 'categoria', ''), '$' || (v_n ->> 'monto')) end,
    case when v_tabla = 'fotos' then 'Foto en una nota' end,
    '(sin título)');$a$);

select central.parchar('guardar_fila',
  $a$from jsonb_populate_record(null::central.tareas, p_datos) d$a$,
  $a$, case when d.repetir in ('diaria', 'semanal', 'mensual') then d.repetir else '' end
    from jsonb_populate_record(null::central.tareas, p_datos) d$a$);
select central.parchar('guardar_fila',
  $a$proyecto_id, avisos)
    select$a$,
  $a$proyecto_id, avisos, repetir)
    select$a$);
select central.parchar('guardar_fila',
  $a$avisos = excluded.avisos, eliminado_en = null$a$,
  $a$avisos = excluded.avisos, repetir = excluded.repetir, eliminado_en = null$a$);
select central.parchar('guardar_fila',
  $a$t.avisos, t.eliminado_en)$a$, $a$t.avisos, t.repetir, t.eliminado_en)$a$);
select central.parchar('guardar_fila',
  $a$excluded.avisos, null::timestamptz)$a$, $a$excluded.avisos, excluded.repetir, null::timestamptz)$a$);
select central.parchar('guardar_fila',
  $a$  elsif p_tabla = 'preferencias' then$a$,
  $a$  elsif p_tabla = 'movimientos' then
    insert into movimientos as t (id, tipo, monto, categoria, nota, fecha)
    select p_id, coalesce(d.tipo, 'gasto'), least(greatest(coalesce(d.monto, 0), 0), 999999999999),
           left(coalesce(d.categoria, ''), 60), left(coalesce(d.nota, ''), 500), coalesce(d.fecha, current_date)
    from jsonb_populate_record(null::central.movimientos, p_datos) d
    on conflict (id) do update set
      tipo = excluded.tipo, monto = excluded.monto, categoria = excluded.categoria,
      nota = excluded.nota, fecha = excluded.fecha, eliminado_en = null
    where (t.tipo, t.monto, t.categoria, t.nota, t.fecha, t.eliminado_en)
          is distinct from
          (excluded.tipo, excluded.monto, excluded.categoria, excluded.nota, excluded.fecha, null::timestamptz);

  elsif p_tabla = 'fotos' then
    if length(coalesce(p_datos ->> 'datos', '')) not between 100 and 700000
       or (p_datos ->> 'datos') not like 'data:image/%' then
      raise exception 'foto_invalida';
    end if;
    insert into fotos as t (id, nota_id, datos)
    select p_id, d.nota_id, d.datos from jsonb_populate_record(null::central.fotos, p_datos) d
    on conflict (id) do update set eliminado_en = null where t.eliminado_en is not null;

  elsif p_tabla = 'preferencias' then$a$);

select central.parchar('borrar_fila', $a$'proyectos', 'datos')$a$, $a$'proyectos', 'datos', 'movimientos', 'fotos')$a$);
select central.parchar('sincronizar', $a$'datos', 'preferencias']$a$, $a$'datos', 'movimientos', 'fotos', 'preferencias']$a$);
select central.parchar('limpiar', $a$'proyectos', 'datos']$a$, $a$'proyectos', 'datos', 'movimientos', 'fotos']$a$);
select central.parchar('exportar',
  $a$'preferencias', (select valores$a$,
  $a$'movimientos', (select coalesce(jsonb_agg(to_jsonb(t) - array['rev', 'eliminado_en'] order by t.fecha), '[]'::jsonb) from movimientos t where t.eliminado_en is null),
    'preferencias', (select valores$a$);
