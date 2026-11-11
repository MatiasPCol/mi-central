-- Mi Central · 007 · rutinas: actividades fijas por día de la semana, con los días en que se cumplieron

create table if not exists central.rutinas (
  id uuid primary key,
  nombre text not null default '',
  color text not null default '',
  dias smallint[] not null default '{0,1,2,3,4,5,6}',
  hora time,
  hechos date[] not null default '{}',
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  rev bigint not null default 0
);
create index if not exists rutinas_rev on central.rutinas (rev);
alter table central.rutinas enable row level security;
drop trigger if exists marcar on central.rutinas;
drop trigger if exists registrar on central.rutinas;
create trigger marcar before insert or update on central.rutinas for each row execute function central.tg_marcar();
create trigger registrar after insert or update on central.rutinas for each row execute function central.tg_registrar();

select central.parchar('tg_registrar',
  $a$when 'movimientos' then v_tipo := 'movimiento';$a$,
  $a$when 'rutinas' then v_tipo := 'rutina'; v_url := '/#/rutinas';
    when 'movimientos' then v_tipo := 'movimiento';$a$);
-- Marcar una rutina cada día no debe avisar ni llenar la actividad: solo cuenta crear, renombrar o borrar.
select central.parchar('tg_registrar',
  $a$v_ignorar text[] := array['rev', 'actualizado_en', 'evento_id'];$a$,
  $a$v_ignorar text[] := array['rev', 'actualizado_en', 'evento_id', 'hechos'];$a$);

select central.parchar('guardar_fila',
  $a$  elsif p_tabla = 'movimientos' then$a$,
  $a$  elsif p_tabla = 'rutinas' then
    insert into rutinas as t (id, nombre, color, dias, hora, hechos, orden)
    select p_id, left(coalesce(d.nombre, ''), 120), left(coalesce(d.color, ''), 20),
           coalesce((select array_agg(distinct x order by x) from unnest(d.dias) x where x between 0 and 6), '{}'),
           d.hora,
           coalesce((select (array_agg(distinct x order by x desc))[1:400] from unnest(d.hechos) x where x is not null), '{}'),
           coalesce(d.orden, 0)
    from jsonb_populate_record(null::central.rutinas, p_datos) d
    on conflict (id) do update set
      nombre = excluded.nombre, color = excluded.color, dias = excluded.dias, hora = excluded.hora,
      hechos = excluded.hechos, orden = excluded.orden, eliminado_en = null
    where (t.nombre, t.color, t.dias, t.hora, t.hechos, t.orden, t.eliminado_en)
          is distinct from
          (excluded.nombre, excluded.color, excluded.dias, excluded.hora, excluded.hechos, excluded.orden, null::timestamptz);

  elsif p_tabla = 'movimientos' then$a$);

select central.parchar('borrar_fila', $a$'movimientos', 'fotos')$a$, $a$'movimientos', 'fotos', 'rutinas')$a$);
select central.parchar('sincronizar', $a$'movimientos', 'fotos', 'preferencias']$a$, $a$'movimientos', 'fotos', 'rutinas', 'preferencias']$a$);
select central.parchar('limpiar', $a$'movimientos', 'fotos']$a$, $a$'movimientos', 'fotos', 'rutinas']$a$);
select central.parchar('exportar',
  $a$'movimientos', (select$a$,
  $a$'rutinas', (select coalesce(jsonb_agg(to_jsonb(t) - array['rev', 'eliminado_en'] order by t.orden), '[]'::jsonb) from rutinas t where t.eliminado_en is null),
    'movimientos', (select$a$);
