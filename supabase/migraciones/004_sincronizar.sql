-- Mi Central · 004 · sincronización con la app, actividad y respaldo
-- La app manda filas completas. Gana lo último que llega. Borrar es marcar "eliminado_en".

create or replace function central.guardar_fila(p_tabla text, p_id uuid, p_datos jsonb) returns void
language plpgsql set search_path = central, pg_temp as $$
declare
  v_valores jsonb;
begin
  if p_id is null or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'datos_invalidos';
  end if;

  if p_tabla = 'tareas' then
    insert into tareas as t (id, titulo, detalle, fecha, hora, prioridad, hecha, hecha_en, materia_id, meta_id, proyecto_id, avisos)
    select p_id, left(coalesce(d.titulo, ''), 300), left(coalesce(d.detalle, ''), 20000),
           d.fecha, case when d.fecha is null then null else d.hora end,
           coalesce(d.prioridad, 2), coalesce(d.hecha, false),
           case when coalesce(d.hecha, false) then coalesce(d.hecha_en, now()) end,
           d.materia_id, d.meta_id, d.proyecto_id,
           coalesce((select (array_agg(distinct x order by x))[1:6] from unnest(d.avisos) x where x between 0 and 43200), '{}')
    from jsonb_populate_record(null::central.tareas, p_datos) d
    on conflict (id) do update set
      titulo = excluded.titulo, detalle = excluded.detalle, fecha = excluded.fecha, hora = excluded.hora,
      prioridad = excluded.prioridad, hecha = excluded.hecha,
      hecha_en = case when excluded.hecha then coalesce(t.hecha_en, excluded.hecha_en) end,
      materia_id = excluded.materia_id, meta_id = excluded.meta_id, proyecto_id = excluded.proyecto_id,
      avisos = excluded.avisos, eliminado_en = null
    where (t.titulo, t.detalle, t.fecha, t.hora, t.prioridad, t.hecha, t.materia_id, t.meta_id, t.proyecto_id, t.avisos, t.eliminado_en)
          is distinct from
          (excluded.titulo, excluded.detalle, excluded.fecha, excluded.hora, excluded.prioridad, excluded.hecha,
           excluded.materia_id, excluded.meta_id, excluded.proyecto_id, excluded.avisos, null::timestamptz);

  elsif p_tabla = 'notas' then
    insert into notas as t (id, titulo, contenido, fijada, color, materia_id)
    select p_id, left(coalesce(d.titulo, ''), 300), left(coalesce(d.contenido, ''), 200000),
           coalesce(d.fijada, false), left(coalesce(d.color, ''), 20), d.materia_id
    from jsonb_populate_record(null::central.notas, p_datos) d
    on conflict (id) do update set
      titulo = excluded.titulo, contenido = excluded.contenido, fijada = excluded.fijada,
      color = excluded.color, materia_id = excluded.materia_id, eliminado_en = null
    where (t.titulo, t.contenido, t.fijada, t.color, t.materia_id, t.eliminado_en)
          is distinct from
          (excluded.titulo, excluded.contenido, excluded.fijada, excluded.color, excluded.materia_id, null::timestamptz);

  elsif p_tabla = 'materias' then
    insert into materias as t (id, nombre, profesor, color, calificaciones, horario, orden)
    select p_id, left(coalesce(d.nombre, ''), 120), left(coalesce(d.profesor, ''), 120), left(coalesce(d.color, ''), 20),
           coalesce((select array_agg(round(u.x, 2) order by u.n)
                     from unnest(d.calificaciones) with ordinality as u(x, n)
                     where u.x is not null and u.x between 0 and 100 and u.n <= 12), '{}'),
           case when jsonb_typeof(d.horario) = 'array' and pg_column_size(d.horario) < 20000 then d.horario else '[]'::jsonb end,
           coalesce(d.orden, 0)
    from jsonb_populate_record(null::central.materias, p_datos) d
    on conflict (id) do update set
      nombre = excluded.nombre, profesor = excluded.profesor, color = excluded.color,
      calificaciones = excluded.calificaciones, horario = excluded.horario, orden = excluded.orden, eliminado_en = null
    where (t.nombre, t.profesor, t.color, t.calificaciones, t.horario, t.orden, t.eliminado_en)
          is distinct from
          (excluded.nombre, excluded.profesor, excluded.color, excluded.calificaciones, excluded.horario, excluded.orden, null::timestamptz);

  elsif p_tabla = 'metas' then
    insert into metas as t (id, titulo, descripcion, plazo, fecha_objetivo, estado, pasos)
    select p_id, left(coalesce(d.titulo, ''), 300), left(coalesce(d.descripcion, ''), 20000),
           coalesce(d.plazo, 'mediano'), d.fecha_objetivo, coalesce(d.estado, 'activa'),
           case when jsonb_typeof(d.pasos) = 'array' and pg_column_size(d.pasos) < 100000 then d.pasos else '[]'::jsonb end
    from jsonb_populate_record(null::central.metas, p_datos) d
    on conflict (id) do update set
      titulo = excluded.titulo, descripcion = excluded.descripcion, plazo = excluded.plazo,
      fecha_objetivo = excluded.fecha_objetivo, estado = excluded.estado, pasos = excluded.pasos, eliminado_en = null
    where (t.titulo, t.descripcion, t.plazo, t.fecha_objetivo, t.estado, t.pasos, t.eliminado_en)
          is distinct from
          (excluded.titulo, excluded.descripcion, excluded.plazo, excluded.fecha_objetivo, excluded.estado, excluded.pasos, null::timestamptz);

  elsif p_tabla = 'proyectos' then
    insert into proyectos as t (id, nombre, descripcion, tecnologias, enlace, tipo, estado, orden)
    select p_id, left(coalesce(d.nombre, ''), 200), left(coalesce(d.descripcion, ''), 5000),
           left(coalesce(d.tecnologias, ''), 500), left(coalesce(d.enlace, ''), 500),
           coalesce(d.tipo, 'real'), left(coalesce(d.estado, 'activo'), 40), coalesce(d.orden, 0)
    from jsonb_populate_record(null::central.proyectos, p_datos) d
    on conflict (id) do update set
      nombre = excluded.nombre, descripcion = excluded.descripcion, tecnologias = excluded.tecnologias,
      enlace = excluded.enlace, tipo = excluded.tipo, estado = excluded.estado, orden = excluded.orden, eliminado_en = null
    where (t.nombre, t.descripcion, t.tecnologias, t.enlace, t.tipo, t.estado, t.orden, t.eliminado_en)
          is distinct from
          (excluded.nombre, excluded.descripcion, excluded.tecnologias, excluded.enlace, excluded.tipo, excluded.estado, excluded.orden, null::timestamptz);

  elsif p_tabla = 'datos' then
    insert into datos as t (id, grupo, titulo, contenido, enlace, orden)
    select p_id, left(coalesce(nullif(btrim(d.grupo), ''), 'General'), 60), left(coalesce(d.titulo, ''), 200),
           left(coalesce(d.contenido, ''), 20000), left(coalesce(d.enlace, ''), 500), coalesce(d.orden, 0)
    from jsonb_populate_record(null::central.datos, p_datos) d
    on conflict (id) do update set
      grupo = excluded.grupo, titulo = excluded.titulo, contenido = excluded.contenido,
      enlace = excluded.enlace, orden = excluded.orden, eliminado_en = null
    where (t.grupo, t.titulo, t.contenido, t.enlace, t.orden, t.eliminado_en)
          is distinct from
          (excluded.grupo, excluded.titulo, excluded.contenido, excluded.enlace, excluded.orden, null::timestamptz);

  elsif p_tabla = 'preferencias' then
    v_valores := p_datos -> 'valores';
    if p_id <> '00000000-0000-4000-8000-000000000001'
       or jsonb_typeof(v_valores) is distinct from 'object' or pg_column_size(v_valores) > 20000 then
      raise exception 'datos_invalidos';
    end if;
    -- Lanzan error si la zona o la hora no existen, y así no se guardan.
    if (v_valores ->> 'zona') is not null then perform now() at time zone (v_valores ->> 'zona'); end if;
    if (v_valores ->> 'resumen_hora') is not null then perform (v_valores ->> 'resumen_hora')::time; end if;
    update preferencias set valores = v_valores
    where id = p_id and valores is distinct from v_valores;

  else
    raise exception 'tabla_desconocida';
  end if;
end $$;

create or replace function central.borrar_fila(p_tabla text, p_id uuid) returns void
language plpgsql set search_path = central, pg_temp as $$
begin
  if p_tabla not in ('tareas', 'notas', 'materias', 'metas', 'proyectos', 'datos') then
    raise exception 'tabla_desconocida';
  end if;
  execute format('update central.%I set eliminado_en = now() where id = $1 and eliminado_en is null', p_tabla) using p_id;
end $$;

-- Aplica los cambios del dispositivo y devuelve todo lo que cambió desde su último cursor.
create or replace function central.sincronizar(p_dispositivo uuid, p_cursor bigint, p_cambios jsonb) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
declare
  c jsonb;
  v_errores jsonb := '[]'::jsonb;
  v_cursor bigint := greatest(coalesce(p_cursor, 0), 0);
  v_purga bigint := coalesce((central.config_leer('purga_rev') #>> '{}')::bigint, 0);
  v_reiniciar boolean := false;
  v_nuevo bigint;
  v_filas jsonb := '{}'::jsonb;
  v_tabla text;
  v_json jsonb;
begin
  perform set_config('central.origen', coalesce((select nombre from dispositivos where id = p_dispositivo), 'Dispositivo'), true);
  perform set_config('central.dispositivo', coalesce(p_dispositivo::text, ''), true);

  if jsonb_typeof(p_cambios) = 'array' then
    if jsonb_array_length(p_cambios) > 1000 then return central.err('demasiados_cambios'); end if;
    for c in select * from jsonb_array_elements(p_cambios) loop
      begin
        if coalesce((c ->> 'borrar')::boolean, false) then
          perform central.borrar_fila(c ->> 'tabla', (c ->> 'id')::uuid);
        else
          perform central.guardar_fila(c ->> 'tabla', (c ->> 'id')::uuid, c -> 'datos');
        end if;
      exception when others then
        v_errores := v_errores || jsonb_build_object('tabla', c ->> 'tabla', 'id', c ->> 'id', 'error', sqlerrm);
      end;
    end loop;
  end if;

  -- Con este candado nadie está a medio guardar: el cursor que devolvemos es exacto.
  perform pg_advisory_xact_lock(7203901);
  select case when is_called then last_value else 0 end into v_nuevo from central.rev_seq;

  if v_cursor > v_nuevo or (v_cursor > 0 and v_cursor < v_purga) then
    v_reiniciar := true;
    v_cursor := 0;
  end if;

  foreach v_tabla in array array['tareas', 'notas', 'materias', 'metas', 'proyectos', 'datos', 'preferencias'] loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by t.rev), ''[]''::jsonb) from central.%I t where t.rev > $1 and ($1 > 0 or t.eliminado_en is null)',
      v_tabla) into v_json using v_cursor;
    v_filas := v_filas || jsonb_build_object(v_tabla, v_json);
  end loop;

  return jsonb_build_object('ok', true, 'cursor', v_nuevo, 'reiniciar', v_reiniciar,
    'filas', v_filas, 'errores', v_errores, 'hora', now());
end $$;

create or replace function central.actividad(p_antes bigint default null, p_limite integer default 50) returns jsonb
language sql stable set search_path = central, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]'::jsonb) from (
    select id, tabla, fila_id, accion, resumen, origen, creado_en from cambios
    where (p_antes is null or id < p_antes)
    order by id desc limit least(greatest(coalesce(p_limite, 50), 1), 200)
  ) x
$$;

-- Copia completa de los datos de Matias (sin borrados ni datos internos).
create or replace function central.exportar() returns jsonb
language sql stable set search_path = central, pg_temp as $$
  select jsonb_build_object(
    'app', 'Mi Central', 'version', 1, 'generado_en', now(),
    'tareas', (select coalesce(jsonb_agg(to_jsonb(t) - array['rev', 'eliminado_en', 'evento_id'] order by t.creado_en), '[]'::jsonb) from tareas t where t.eliminado_en is null),
    'notas', (select coalesce(jsonb_agg(to_jsonb(t) - array['rev', 'eliminado_en'] order by t.creado_en), '[]'::jsonb) from notas t where t.eliminado_en is null),
    'materias', (select coalesce(jsonb_agg(to_jsonb(t) - array['rev', 'eliminado_en'] order by t.orden, t.nombre), '[]'::jsonb) from materias t where t.eliminado_en is null),
    'metas', (select coalesce(jsonb_agg(to_jsonb(t) - array['rev', 'eliminado_en'] order by t.creado_en), '[]'::jsonb) from metas t where t.eliminado_en is null),
    'proyectos', (select coalesce(jsonb_agg(to_jsonb(t) - array['rev', 'eliminado_en'] order by t.orden, t.nombre), '[]'::jsonb) from proyectos t where t.eliminado_en is null),
    'datos', (select coalesce(jsonb_agg(to_jsonb(t) - array['rev', 'eliminado_en'] order by t.grupo, t.orden, t.titulo), '[]'::jsonb) from datos t where t.eliminado_en is null),
    'preferencias', (select valores from preferencias where id = '00000000-0000-4000-8000-000000000001')
  )
$$;
