-- Mi Central · 005 · puente de Google (correo y calendario), resumen diario y reloj

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------- Puente de Google ----------

create or replace function central.resincronizar_calendario() returns void
language sql set search_path = central, pg_temp as $$
  insert into cola_google (tipo, clave, datos)
  select 'evento', 'evento:' || t.id, jsonb_build_object('tarea_id', t.id)
  from tareas t
  where t.eliminado_en is null and t.fecha is not null and not t.hecha and t.fecha >= current_date - 7
  on conflict (clave) where (clave is not null and tomado_en is null and hecho_en is null) do nothing
$$;

-- Crea (o cambia) el secreto del puente. Se muestra una sola vez; aquí queda solo su huella digital.
create or replace function central.puente_crear_secreto() returns text
language plpgsql set search_path = central, extensions, pg_temp as $$
declare v text := encode(gen_random_bytes(32), 'hex');
begin
  perform central.config_guardar('puente', jsonb_build_object(
    'hash', encode(central.sha(v), 'hex'), 'creado_en', now(), 'visto_en', null));
  return v;
end $$;

create or replace function central.puente_validar(p_secreto text) returns boolean
language plpgsql set search_path = central, pg_temp as $$
declare v jsonb := central.config_leer('puente');
begin
  if v is null or (v ->> 'hash') is null or p_secreto is null or length(p_secreto) <> 64 then return false; end if;
  if (v ->> 'hash') <> encode(central.sha(p_secreto), 'hex') then return false; end if;
  if (v ->> 'visto_en') is null then
    perform central.config_guardar('puente', v || jsonb_build_object('visto_en', now()));
    perform central.resincronizar_calendario();
  elsif (v ->> 'visto_en')::timestamptz < now() - interval '2 minutes' then
    perform central.config_guardar('puente', v || jsonb_build_object('visto_en', now()));
  end if;
  return true;
end $$;

create or replace function central.puente_estado() returns jsonb
language sql stable set search_path = central, pg_temp as $$
  select jsonb_build_object(
    'conectado', central.puente_activo(),
    'creado_en', (select valor ->> 'creado_en' from config where clave = 'puente'),
    'visto_en', (select valor ->> 'visto_en' from config where clave = 'puente'),
    'pendientes', (select count(*) from cola_google where hecho_en is null))
$$;

create or replace function central.puente_desconectar() returns void
language plpgsql set search_path = central, pg_temp as $$
begin
  delete from config where clave = 'puente';
  delete from cola_google where hecho_en is null;
end $$;

-- Entrega trabajos al puente. Los eventos se arman con el estado actual de la tarea.
create or replace function central.puente_pendientes(p_limite integer default 10) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
declare
  v jsonb := '[]'::jsonb;
  r record;
  t central.tareas;
  v_trabajo jsonb;
begin
  for r in
    update cola_google c set tomado_en = now(), intentos = c.intentos + 1
    where c.id in (
      select id from cola_google
      where hecho_en is null and (tomado_en is null or tomado_en < now() - interval '10 minutes') and intentos < 6
      order by id limit p_limite for update skip locked)
    returning c.*
  loop
    if r.tipo = 'evento' then
      select * into t from tareas where id = (r.datos ->> 'tarea_id')::uuid;
      if t.id is null or t.eliminado_en is not null or t.fecha is null then
        if t.id is null or t.evento_id is null then
          update cola_google set hecho_en = now(), resultado = '{"ok": true, "nada": true}' where id = r.id;
          continue;
        end if;
        v_trabajo := jsonb_build_object('id', r.id, 'tipo', 'evento', 'accion', 'borrar', 'evento_id', t.evento_id);
      else
        v_trabajo := jsonb_build_object('id', r.id, 'tipo', 'evento', 'accion', 'guardar', 'evento_id', t.evento_id,
          'titulo', (case when t.hecha then '✅ ' else '' end) || t.titulo,
          'descripcion', left(t.detalle, 4000), 'fecha', t.fecha, 'hora', to_char(t.hora, 'HH24:MI'));
      end if;
    elsif r.tipo = 'correo' then
      v_trabajo := jsonb_build_object('id', r.id, 'tipo', 'correo',
        'asunto', r.datos ->> 'asunto', 'html', r.datos ->> 'html');
      if (r.datos ->> 'adjunto') = 'respaldo' then
        v_trabajo := v_trabajo || jsonb_build_object('adjunto', jsonb_build_object(
          'nombre', 'mi-central-respaldo-' || to_char(now() at time zone central.zona(), 'YYYY-MM-DD') || '.json',
          'texto', jsonb_pretty(central.exportar())));
      end if;
    else
      update cola_google set hecho_en = now(), resultado = '{"ok": false, "error": "tipo"}' where id = r.id;
      continue;
    end if;
    v := v || v_trabajo;
  end loop;
  return v;
end $$;

create or replace function central.puente_resultados(p_resultados jsonb) returns void
language plpgsql set search_path = central, pg_temp as $$
declare
  x jsonb;
  r central.cola_google;
begin
  if jsonb_typeof(p_resultados) is distinct from 'array' then return; end if;
  for x in select * from jsonb_array_elements(p_resultados) loop
    select * into r from cola_google where id = (x ->> 'id')::bigint and hecho_en is null;
    if not found then continue; end if;
    if coalesce((x ->> 'ok')::boolean, false) then
      update cola_google set hecho_en = now(), resultado = x where id = r.id;
      if r.tipo = 'evento' then
        perform set_config('central.silencio', '1', true);
        update tareas set evento_id = nullif(x ->> 'evento_id', '')
        where id = (r.datos ->> 'tarea_id')::uuid and evento_id is distinct from nullif(x ->> 'evento_id', '');
        perform set_config('central.silencio', '', true);
      end if;
    elsif r.intentos >= 6 then
      update cola_google set hecho_en = now(), resultado = x where id = r.id;
    else
      begin
        update cola_google set tomado_en = null, resultado = x where id = r.id;
      exception when unique_violation then
        update cola_google set hecho_en = now(), resultado = x where id = r.id;
      end;
    end if;
  end loop;
end $$;

-- ---------- Resumen diario ----------

create or replace function central.lista_tareas_html(p_desde date, p_hasta date) returns text
language sql stable set search_path = central, pg_temp as $$
  select string_agg('<li><b>' || central.esc(t.titulo) || '</b>'
      || ' · ' || to_char(t.fecha, 'DD/MM') || coalesce(' ' || to_char(t.hora, 'HH24:MI'), '')
      || coalesce(' · ' || central.esc(m.nombre), '') || '</li>', ''
    order by t.fecha, t.hora nulls last, t.prioridad)
  from tareas t left join materias m on m.id = t.materia_id and m.eliminado_en is null
  where t.eliminado_en is null and not t.hecha and t.fecha between p_desde and p_hasta
$$;

create or replace function central.resumen_diario() returns jsonb
language plpgsql stable set search_path = central, pg_temp as $$
declare
  v_hoy date := (now() at time zone central.zona())::date;
  v_n_hoy integer; v_n_atras integer; v_n_man integer; v_n_sem integer;
  v_cuerpo text; v_html text;
begin
  select count(*) filter (where fecha = v_hoy), count(*) filter (where fecha < v_hoy),
         count(*) filter (where fecha = v_hoy + 1), count(*) filter (where fecha between v_hoy + 2 and v_hoy + 7)
    into v_n_hoy, v_n_atras, v_n_man, v_n_sem
  from tareas where eliminado_en is null and not hecha and fecha is not null;

  v_cuerpo := concat_ws(' · ',
    case when v_n_hoy > 0 then v_n_hoy || (case when v_n_hoy = 1 then ' tarea para hoy' else ' tareas para hoy' end) end,
    case when v_n_atras > 0 then v_n_atras || (case when v_n_atras = 1 then ' atrasada' else ' atrasadas' end) end,
    case when v_n_man > 0 then v_n_man || ' para mañana' end);

  v_html := '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1c2330">'
    || '<h2 style="margin:0 0 8px">Tu día en Mi Central</h2>'
    || coalesce('<h3>Para hoy</h3><ul>' || central.lista_tareas_html(v_hoy, v_hoy) || '</ul>', '')
    || coalesce('<h3>Atrasadas</h3><ul>' || central.lista_tareas_html(date '2000-01-01', v_hoy - 1) || '</ul>', '')
    || coalesce('<h3>Mañana</h3><ul>' || central.lista_tareas_html(v_hoy + 1, v_hoy + 1) || '</ul>', '')
    || coalesce('<h3>Próximos 7 días</h3><ul>' || central.lista_tareas_html(v_hoy + 2, v_hoy + 7) || '</ul>', '')
    || '<p style="color:#667">Enviado por Mi Central.</p></div>';

  return jsonb_build_object(
    'vacio', (v_n_hoy + v_n_atras + v_n_man + v_n_sem) = 0,
    'titulo', 'Tu día', 'cuerpo', coalesce(nullif(v_cuerpo, ''), 'Sin tareas para hoy. Tienes ' || v_n_sem || ' esta semana.'),
    'asunto', 'Mi Central · ' || to_char(v_hoy, 'DD/MM') || ' · ' || coalesce(nullif(v_cuerpo, ''), 'tu semana'),
    'html', v_html);
end $$;

create or replace function central.texto_falta(p_minutos integer, p_con_hora boolean) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_minutos = 0 and p_con_hora then 'Tarea para ahora'
    when p_minutos = 0 then 'Tarea para hoy'
    when p_minutos < 60 then 'Tarea en ' || p_minutos || ' min'
    when p_minutos < 1440 then 'Tarea en ' || round(p_minutos / 60.0) || ' h'
    when p_minutos = 1440 then 'Tarea para mañana'
    else 'Tarea en ' || round(p_minutos / 1440.0) || ' días'
  end
$$;

-- ---------- Reloj: corre cada minuto ----------

create or replace function central.llamar_servidor(p_ruta text) returns void
language plpgsql set search_path = central, extensions, pg_temp as $$
declare
  v_url text := central.config_leer('funcion_url') #>> '{}';
  v_secreto text := central.secreto_leer('interno');
begin
  if v_url is null or v_secreto is null then return; end if;
  perform net.http_post(
    url := v_url || p_ruta,
    body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-mc-interno', v_secreto),
    timeout_milliseconds := 25000);
end $$;

create or replace function central.limpiar() returns void
language plpgsql set search_path = central, pg_temp as $$
declare
  t text;
  v_max bigint;
  v_purga bigint := coalesce((central.config_leer('purga_rev') #>> '{}')::bigint, 0);
begin
  delete from retos where expira_en < now() - interval '1 hour';
  delete from intentos where creado_en < now() - interval '1 day';
  delete from codigos_vinculo where expira_en < now() - interval '7 days';
  delete from sesiones where expira_en < now() - interval '7 days' or revocada_en < now() - interval '30 days';
  delete from avisos where enviado_en < now() - interval '30 days';
  delete from recordatorios where enviado_en < now() - interval '30 days';
  delete from cola_google where hecho_en < now() - interval '30 days';
  delete from cambios where creado_en < now() - interval '365 days';
  foreach t in array array['tareas', 'notas', 'materias', 'metas', 'proyectos', 'datos'] loop
    execute format('with b as (delete from central.%I where eliminado_en < now() - interval ''90 days'' returning rev) select max(rev) from b', t)
      into v_max;
    v_purga := greatest(v_purga, coalesce(v_max, 0));
  end loop;
  perform central.config_guardar('purga_rev', to_jsonb(v_purga));
  begin
    delete from cron.job_run_details where end_time < now() - interval '2 days';
  exception when others then null;
  end;
end $$;

create or replace function central.tic() returns void
language plpgsql set search_path = central, pg_temp as $$
declare
  v_zona text := central.zona();
  v_local timestamp := now() at time zone v_zona;
  v_hoy date := v_local::date;
  v_hora time := '07:00';
  v_ultimo date;
  v_res jsonb;
  r record;
begin
  -- 1) Recordatorios de tareas
  for r in
    select rc.id as rid, rc.minutos, rc.enviar_en, t.id, t.titulo, t.hora, t.hecha, t.eliminado_en
    from recordatorios rc left join tareas t on t.id = rc.tarea_id
    where rc.enviado_en is null and rc.enviar_en <= now()
    order by rc.enviar_en limit 50
  loop
    update recordatorios set enviado_en = now() where id = r.rid;
    if r.id is null or r.hecha or r.eliminado_en is not null or r.enviar_en < now() - interval '6 hours' then continue; end if;
    perform central.encolar_aviso('recordatorio', central.texto_falta(r.minutos, r.hora is not null),
      r.titulo || coalesce(' · ' || to_char(r.hora, 'HH24:MI'), ''), '/#/tareas/' || r.id, null, null, 0, null, null);
  end loop;

  -- 2) Resumen diario y respaldo semanal
  begin
    v_hora := central.pref_texto('resumen_hora', '07:00')::time;
  exception when others then
    v_hora := '07:00';
  end;
  v_ultimo := coalesce((central.config_leer('resumen_ultimo') #>> '{}')::date, date '2000-01-01');
  if v_ultimo < v_hoy and v_local >= (v_hoy + v_hora) then
    perform central.config_guardar('resumen_ultimo', to_jsonb(v_hoy::text));
    if v_local < (v_hoy + v_hora) + interval '3 hours' then
      v_res := central.resumen_diario();
      if not (v_res ->> 'vacio')::boolean then
        if central.pref_bool('resumen_push', true) then
          perform central.encolar_aviso('resumen', v_res ->> 'titulo', v_res ->> 'cuerpo', '/#/hoy', null, null, 0, null, null);
        end if;
        if central.pref_bool('resumen_correo', true) then
          perform central.encolar_correo(v_res ->> 'asunto', v_res ->> 'html', null, 'resumen:' || v_hoy);
        end if;
      end if;
      if extract(dow from v_hoy) = 0 and central.pref_bool('respaldo_semanal', true) then
        perform central.encolar_correo('Mi Central · respaldo semanal',
          '<p>Aquí va la copia de todos tus datos de Mi Central. Guárdala por si acaso.</p>', 'respaldo', 'respaldo:' || v_hoy);
      end if;
    end if;
  end if;

  -- 3) Limpieza, una vez por hora
  if extract(minute from now())::integer = 17 then perform central.limpiar(); end if;

  -- 4) Enviar avisos pendientes. Una vez al día llama igual, para mantener vivo el proyecto.
  if exists (select 1 from avisos where enviado_en is null and enviar_en <= now()
             and (tomado_en is null or tomado_en < now() - interval '3 minutes'))
     or (extract(hour from now())::integer = 11 and extract(minute from now())::integer = 3) then
    begin
      perform central.llamar_servidor('/interno/despachar');
    exception when others then null;
    end;
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'central-tic';
select cron.schedule('central-tic', '* * * * *', 'select central.tic()');
