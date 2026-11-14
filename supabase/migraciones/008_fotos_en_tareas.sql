-- Mi Central · 008 · fotos también en tareas, con miniatura
-- En la sincronización viaja solo la miniatura. La foto completa se pide cuando se abre.

alter table central.fotos add column if not exists tarea_id uuid;
alter table central.fotos add column if not exists mini text not null default '';

-- Una foto que ya existe solo se recupera (deshacer un borrado): la imagen no se vuelve a enviar.
select central.parchar('guardar_fila',
  $a$    if length(coalesce(p_datos ->> 'datos', '')) not between 100 and 700000$a$,
  $a$    if exists (select 1 from fotos where id = p_id) then
      update fotos set eliminado_en = null where id = p_id and eliminado_en is not null;
      return;
    end if;
    if length(coalesce(p_datos ->> 'datos', '')) not between 100 and 700000$a$);
select central.parchar('guardar_fila',
  $a$insert into fotos as t (id, nota_id, datos)$a$,
  $a$insert into fotos as t (id, nota_id, tarea_id, mini, datos)$a$);
select central.parchar('guardar_fila',
  $a$select p_id, d.nota_id, d.datos from jsonb_populate_record(null::central.fotos, p_datos) d$a$,
  $a$select p_id, d.nota_id, d.tarea_id, case when length(coalesce(d.mini, '')) between 100 and 60000 and d.mini like 'data:image/%' then d.mini else '' end, d.datos from jsonb_populate_record(null::central.fotos, p_datos) d$a$);

select central.parchar('tg_registrar',
  $a$when 'fotos' then v_tipo := 'foto'; v_url := '/#/notas/' || coalesce(v_n ->> 'nota_id', '');$a$,
  $a$when 'fotos' then v_tipo := 'foto'; v_url := case when (v_n ->> 'tarea_id') is not null then '/#/tareas/' || (v_n ->> 'tarea_id') else '/#/notas/' || coalesce(v_n ->> 'nota_id', '') end;$a$);
select central.parchar('tg_registrar',
  $a$case when v_tabla = 'fotos' then 'Foto en una nota' end,$a$,
  $a$case when v_tabla = 'fotos' then (case when (v_n ->> 'tarea_id') is not null then 'Foto en una tarea' else 'Foto en una nota' end) end,$a$);

-- Sincronización: igual que antes, pero las fotos van sin la imagen completa,
-- y la app puede pedir una foto completa con { "tabla": "fotos", "id": ..., "leer": true }.
create or replace function central.sincronizar(p_dispositivo uuid, p_cursor bigint, p_cambios jsonb) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
declare
  c jsonb;
  v_errores jsonb := '[]'::jsonb;
  v_leidas jsonb := '[]'::jsonb;
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
        if coalesce((c ->> 'leer')::boolean, false) then
          if (c ->> 'tabla') = 'fotos' then
            v_json := (select jsonb_build_object('id', f.id, 'datos', f.datos)
                       from fotos f where f.id = (c ->> 'id')::uuid and f.eliminado_en is null);
            if v_json is not null then v_leidas := v_leidas || v_json; end if;
          end if;
        elsif coalesce((c ->> 'borrar')::boolean, false) then
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

  foreach v_tabla in array array['tareas', 'notas', 'materias', 'metas', 'proyectos', 'datos', 'movimientos', 'rutinas', 'preferencias'] loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by t.rev), ''[]''::jsonb) from central.%I t where t.rev > $1 and ($1 > 0 or t.eliminado_en is null)',
      v_tabla) into v_json using v_cursor;
    v_filas := v_filas || jsonb_build_object(v_tabla, v_json);
  end loop;

  -- Las fotos antiguas, guardadas sin miniatura, viajan completas en el campo "mini".
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nota_id', f.nota_id, 'tarea_id', f.tarea_id,
      'mini', case when f.eliminado_en is not null then '' when f.mini = '' then f.datos else f.mini end,
      'creado_en', f.creado_en, 'actualizado_en', f.actualizado_en, 'eliminado_en', f.eliminado_en, 'rev', f.rev
    ) order by f.rev), '[]'::jsonb) into v_json
  from fotos f where f.rev > v_cursor and (v_cursor > 0 or f.eliminado_en is null);
  v_filas := v_filas || jsonb_build_object('fotos', v_json);

  return jsonb_build_object('ok', true, 'cursor', v_nuevo, 'reiniciar', v_reiniciar,
    'filas', v_filas, 'errores', v_errores, 'fotos_completas', v_leidas, 'hora', now());
end $$;
