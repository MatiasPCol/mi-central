-- Mi Central · 002 · funciones base, registro de cambios y cola de avisos

create index if not exists cambios_fila on central.cambios (fila_id, id);

-- ---------- Utilidades ----------

create or replace function central.b64url(b bytea) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select translate(rtrim(replace(encode(b, 'base64'), E'\n', ''), '='), '+/', '-_')
$$;

create or replace function central.sha(t text) returns bytea
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select sha256(convert_to(t, 'UTF8'))
$$;

create or replace function central.esc(t text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function central.pref(p_clave text) returns jsonb
language sql stable set search_path = central, pg_temp as $$
  select valores -> p_clave from preferencias
  where id = '00000000-0000-4000-8000-000000000001' and eliminado_en is null
$$;

create or replace function central.pref_bool(p_clave text, p_defecto boolean) returns boolean
language plpgsql stable set search_path = central, pg_temp as $$
declare v jsonb := central.pref(p_clave);
begin
  if jsonb_typeof(v) = 'boolean' then return v::boolean; end if;
  return p_defecto;
end $$;

create or replace function central.pref_texto(p_clave text, p_defecto text) returns text
language plpgsql stable set search_path = central, pg_temp as $$
declare v jsonb := central.pref(p_clave);
begin
  if jsonb_typeof(v) = 'string' and (v #>> '{}') <> '' then return v #>> '{}'; end if;
  return p_defecto;
end $$;

-- Zona horaria de Matias. Si alguien guarda una que no existe, vuelve a Bogotá.
create or replace function central.zona() returns text
language plpgsql stable set search_path = central, pg_temp as $$
declare z text := central.pref_texto('zona', 'America/Bogota');
begin
  perform now() at time zone z;
  return z;
exception when others then
  return 'America/Bogota';
end $$;

create or replace function central.config_leer(p_clave text) returns jsonb
language sql stable set search_path = central, pg_temp as $$
  select valor from config where clave = p_clave
$$;

create or replace function central.config_guardar(p_clave text, p_valor jsonb) returns void
language sql set search_path = central, pg_temp as $$
  insert into config (clave, valor) values (p_clave, p_valor)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now()
$$;

-- ---------- Cola de avisos (notificaciones push) ----------

-- Varias ediciones seguidas de lo mismo se juntan en un solo aviso.
-- Dos acciones que se anulan (borrar y deshacer, marcar y desmarcar) no avisan nada.
create or replace function central.encolar_aviso(
  p_tipo text, p_titulo text, p_cuerpo text, p_url text,
  p_clave text default null, p_accion text default null, p_retraso_seg integer default 0,
  p_excluir uuid default null, p_solo uuid default null
) returns void
language plpgsql set search_path = central, pg_temp as $$
declare
  v record;
  v_enviar timestamptz := now() + make_interval(secs => greatest(coalesce(p_retraso_seg, 0), 0));
begin
  if p_clave is not null then
    select id, accion, titulo, creado_en into v from avisos
      where clave = p_clave and tomado_en is null and enviado_en is null
      for update;
    if found then
      if (v.accion, p_accion) in (('borrar', 'restaurar'), ('completar', 'reabrir'), ('reabrir', 'completar'), ('crear', 'borrar')) then
        delete from avisos where id = v.id;
        return;
      end if;
      update avisos set
        tipo = p_tipo,
        accion = case when v.accion = 'crear' and p_accion = 'editar' then 'crear' else p_accion end,
        titulo = case when v.accion = 'crear' and p_accion = 'editar' then v.titulo else left(p_titulo, 120) end,
        cuerpo = left(p_cuerpo, 400),
        url = p_url,
        enviar_en = least(v_enviar, v.creado_en + interval '5 minutes'),
        excluir_dispositivo = p_excluir,
        solo_dispositivo = p_solo
      where id = v.id;
      return;
    end if;
  end if;
  begin
    insert into avisos (tipo, accion, titulo, cuerpo, url, clave, enviar_en, excluir_dispositivo, solo_dispositivo)
    values (p_tipo, p_accion, left(p_titulo, 120), left(p_cuerpo, 400), p_url, p_clave, v_enviar, p_excluir, p_solo);
  exception when unique_violation then
    null;
  end;
end $$;

-- ---------- Puente de Google: encolar trabajos ----------

create or replace function central.puente_activo() returns boolean
language sql stable set search_path = central, pg_temp as $$
  select coalesce((select (valor ->> 'hash') is not null from config where clave = 'puente'), false)
$$;

create or replace function central.encolar_evento(p_tarea uuid) returns void
language plpgsql set search_path = central, pg_temp as $$
begin
  if not central.puente_activo() or not central.pref_bool('calendario', true) then return; end if;
  insert into cola_google (tipo, clave, datos)
  values ('evento', 'evento:' || p_tarea, jsonb_build_object('tarea_id', p_tarea))
  on conflict (clave) where (clave is not null and tomado_en is null and hecho_en is null) do nothing;
end $$;

create or replace function central.encolar_correo(p_asunto text, p_html text, p_adjunto text default null, p_clave text default null) returns void
language plpgsql set search_path = central, pg_temp as $$
begin
  if not central.puente_activo() then return; end if;
  insert into cola_google (tipo, clave, datos)
  values ('correo', p_clave, jsonb_build_object('asunto', p_asunto, 'html', p_html, 'adjunto', p_adjunto))
  on conflict (clave) where (clave is not null and tomado_en is null and hecho_en is null) do nothing;
end $$;

-- ---------- Recordatorios de tareas ----------

-- Una tarea sin hora usa las 08:00 como referencia.
create or replace function central.recalcular_recordatorios(p_tarea uuid) returns void
language plpgsql set search_path = central, pg_temp as $$
declare
  t central.tareas;
  v_ancla timestamptz;
  v_momento timestamptz;
  m integer;
begin
  delete from recordatorios where tarea_id = p_tarea and enviado_en is null;
  select * into t from tareas where id = p_tarea;
  if t.id is null or t.eliminado_en is not null or t.hecha or t.fecha is null then return; end if;
  v_ancla := (t.fecha + coalesce(t.hora, time '08:00')) at time zone central.zona();
  foreach m in array t.avisos loop
    v_momento := v_ancla - make_interval(mins => m);
    if v_momento > now() - interval '2 minutes' then
      insert into recordatorios (tarea_id, minutos, enviar_en) values (p_tarea, m, v_momento)
      on conflict (tarea_id, minutos, enviar_en) do nothing;
    end if;
  end loop;
end $$;

-- ---------- Disparadores de las tablas sincronizadas ----------

-- Antes de guardar: número de revisión en orden y hora del servidor.
create or replace function central.tg_marcar() returns trigger
language plpgsql set search_path = central, pg_temp as $$
begin
  perform pg_advisory_xact_lock(7203901);
  new.rev := nextval('central.rev_seq');
  new.actualizado_en := clock_timestamp();
  if tg_op = 'INSERT' then
    new.creado_en := coalesce(new.creado_en, clock_timestamp());
  else
    new.creado_en := old.creado_en;
  end if;
  return new;
end $$;

-- Después de guardar: registro de actividad, aviso al celular, recordatorios y calendario.
create or replace function central.tg_registrar() returns trigger
language plpgsql set search_path = central, pg_temp as $$
declare
  v_tabla text := tg_table_name;
  v_n jsonb := to_jsonb(new);
  v_o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_id uuid := (to_jsonb(new) ->> 'id')::uuid;
  v_accion text;
  v_tipo text;
  v_fem boolean := true;
  v_url text;
  v_nombre text;
  v_titulo text;
  v_origen text := coalesce(nullif(current_setting('central.origen', true), ''), 'Claude');
  v_disp uuid := nullif(current_setting('central.dispositivo', true), '')::uuid;
  v_ignorar text[] := array['rev', 'actualizado_en', 'evento_id'];
  v_previo bigint;
begin
  if current_setting('central.silencio', true) = '1' then return null; end if;

  if tg_op = 'INSERT' then
    v_accion := 'crear';
  elsif (v_o - v_ignorar) = (v_n - v_ignorar) then
    return null;
  elsif (v_o ->> 'eliminado_en') is null and (v_n ->> 'eliminado_en') is not null then
    v_accion := 'borrar';
  elsif (v_o ->> 'eliminado_en') is not null and (v_n ->> 'eliminado_en') is null then
    v_accion := 'restaurar';
  elsif v_tabla = 'tareas' and (v_o ->> 'hecha') is distinct from (v_n ->> 'hecha') then
    v_accion := case when (v_n ->> 'hecha')::boolean then 'completar' else 'reabrir' end;
  else
    v_accion := 'editar';
  end if;

  case v_tabla
    when 'tareas' then v_tipo := 'tarea'; v_url := '/#/tareas/' || v_id;
    when 'notas' then v_tipo := 'nota'; v_url := '/#/notas/' || v_id;
    when 'materias' then v_tipo := 'materia'; v_url := '/#/materias/' || v_id;
    when 'metas' then v_tipo := 'meta'; v_url := '/#/metas/' || v_id;
    when 'proyectos' then v_tipo := 'proyecto'; v_fem := false; v_url := '/#/datos';
    when 'datos' then v_tipo := 'dato'; v_fem := false; v_url := '/#/datos';
    else v_tipo := 'ajuste'; v_fem := false; v_url := '/#/ajustes';
  end case;

  v_nombre := coalesce(
    nullif(btrim(v_n ->> 'titulo'), ''),
    nullif(btrim(v_n ->> 'nombre'), ''),
    nullif(btrim(left(split_part(coalesce(v_n ->> 'contenido', ''), E'\n', 1), 80)), ''),
    '(sin título)');

  if v_tabla = 'preferencias' then
    v_titulo := 'Ajustes cambiados';
    v_nombre := 'Preferencias de la app';
  else
    v_titulo := case v_accion
      when 'crear' then (case when v_fem then 'Nueva ' else 'Nuevo ' end) || v_tipo
      when 'editar' then initcap(v_tipo) || (case when v_fem then ' editada' else ' editado' end)
      when 'borrar' then initcap(v_tipo) || (case when v_fem then ' borrada' else ' borrado' end)
      when 'restaurar' then initcap(v_tipo) || (case when v_fem then ' restaurada' else ' restaurado' end)
      when 'completar' then 'Tarea hecha'
      else 'Tarea reabierta'
    end;
  end if;

  -- Registro de actividad. Las ediciones seguidas de lo mismo ocupan una sola línea.
  if v_accion = 'editar' then
    select id into v_previo from cambios
      where fila_id = v_id and tabla = v_tabla and accion = 'editar' and origen = v_origen
        and creado_en > now() - interval '10 minutes'
      order by id desc limit 1;
  end if;
  if v_previo is not null then
    update cambios set creado_en = now(), resumen = v_titulo || ': ' || left(v_nombre, 140) where id = v_previo;
  else
    insert into cambios (tabla, fila_id, accion, resumen, origen, dispositivo_id)
    values (v_tabla, v_id, v_accion, v_titulo || ': ' || left(v_nombre, 140), v_origen, v_disp);
  end if;

  -- Aviso al celular.
  if v_tabla <> 'preferencias' and central.pref_bool('avisar_cambios', true) then
    perform central.encolar_aviso(
      'cambio', v_titulo, left(v_nombre, 140) || ' · ' || v_origen, v_url,
      'cambio:' || v_tabla || ':' || v_id, v_accion,
      case v_accion when 'crear' then 20 when 'editar' then 60 when 'borrar' then 8 else 5 end,
      case when central.pref_bool('avisar_mismo_dispositivo', true) then null else v_disp end,
      null);
  end if;

  -- Tareas: recordatorios y calendario.
  if v_tabla = 'tareas' then
    perform central.recalcular_recordatorios(v_id);
    if tg_op = 'INSERT' then
      if (v_n ->> 'fecha') is not null then perform central.encolar_evento(v_id); end if;
    elsif (v_o ->> 'fecha', v_o ->> 'hora', v_o ->> 'titulo', v_o ->> 'detalle', v_o ->> 'hecha', v_o ->> 'eliminado_en')
          is distinct from
          (v_n ->> 'fecha', v_n ->> 'hora', v_n ->> 'titulo', v_n ->> 'detalle', v_n ->> 'hecha', v_n ->> 'eliminado_en')
       and ((v_n ->> 'fecha') is not null or (v_o ->> 'fecha') is not null) then
      perform central.encolar_evento(v_id);
    end if;
  end if;

  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tareas', 'notas', 'materias', 'metas', 'proyectos', 'datos', 'preferencias'] loop
    execute format('drop trigger if exists marcar on central.%I', t);
    execute format('drop trigger if exists registrar on central.%I', t);
    execute format('create trigger marcar before insert or update on central.%I for each row execute function central.tg_marcar()', t);
    execute format('create trigger registrar after insert or update on central.%I for each row execute function central.tg_registrar()', t);
  end loop;
end $$;

-- ---------- Valores iniciales ----------

do $$
begin
  perform set_config('central.silencio', '1', true);
  insert into central.preferencias (id, valores) values (
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'zona', 'America/Bogota',
      'resumen_hora', '07:00',
      'avisar_cambios', true,
      'avisar_mismo_dispositivo', true,
      'resumen_push', true,
      'resumen_correo', true,
      'respaldo_semanal', true,
      'calendario', true,
      'avisos_predeterminados', jsonb_build_array(1440),
      'notas', jsonb_build_object('periodos', 3, 'minima', 1, 'maxima', 5, 'aprobacion', 3)
    )
  ) on conflict (id) do nothing;

  insert into central.config (clave, valor) values
    ('usuario_id', to_jsonb(central.b64url(extensions.gen_random_bytes(16)))),
    ('origenes', '[]'::jsonb),
    ('funcion_url', to_jsonb('https://qzsyzrjdvdyyqtwhtktn.supabase.co/functions/v1/central'::text))
  on conflict (clave) do nothing;

  insert into central.secretos (clave, valor) values ('interno', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (clave) do nothing;
end $$;
