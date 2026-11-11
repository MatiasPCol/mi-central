-- Mi Central · 003 · seguridad: sesiones, dispositivos vinculados, huella y suscripciones de avisos
-- El servidor comprueba las firmas (llave del dispositivo y huella) y después llama estas funciones.

create or replace function central.err(p_error text) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('ok', false, 'error', p_error)
$$;

create or replace function central.secreto_leer(p_clave text) returns text
language sql stable set search_path = central, pg_temp as $$
  select valor from secretos where clave = p_clave
$$;

-- Guarda un secreto solo si no existía y devuelve el que quedó guardado.
create or replace function central.secreto_crear(p_clave text, p_valor text) returns text
language plpgsql set search_path = central, pg_temp as $$
begin
  insert into secretos (clave, valor) values (p_clave, p_valor) on conflict (clave) do nothing;
  return (select valor from secretos where clave = p_clave);
end $$;

-- ---------- Sesiones ----------

create or replace function central.crear_sesion(p_dispositivo uuid) returns text
language plpgsql set search_path = central, extensions, pg_temp as $$
declare v_token text := central.b64url(gen_random_bytes(32));
begin
  insert into sesiones (id, token_hash, dispositivo_id, expira_en)
  values (gen_random_uuid(), central.sha(v_token), p_dispositivo, now() + interval '60 days');
  update dispositivos set ultimo_uso = now() where id = p_dispositivo;
  return v_token;
end $$;

-- "revocado" significa que el dispositivo fue desvinculado: la app borra sus datos locales.
create or replace function central.sesion(p_token text) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
declare s record;
begin
  if p_token is null or length(p_token) not between 20 and 200 then return central.err('sin_sesion'); end if;
  select se.id, se.dispositivo_id, se.expira_en, se.revocada_en, se.usado_en,
         d.nombre, d.revocado_en as dispositivo_revocado, d.con_huella
    into s
  from sesiones se join dispositivos d on d.id = se.dispositivo_id
  where se.token_hash = central.sha(p_token);
  if not found then return central.err('sin_sesion'); end if;
  if s.dispositivo_revocado is not null then return central.err('revocado'); end if;
  if s.revocada_en is not null or s.expira_en < now() then return central.err('sin_sesion'); end if;
  if s.usado_en < now() - interval '5 minutes' then
    update sesiones set usado_en = now(), expira_en = now() + interval '60 days' where id = s.id;
    update dispositivos set ultimo_uso = now() where id = s.dispositivo_id;
  end if;
  return jsonb_build_object('ok', true, 'sesion_id', s.id, 'dispositivo_id', s.dispositivo_id,
    'nombre', s.nombre, 'con_huella', s.con_huella,
    'renovar', s.usado_en < now() - interval '1 day');
end $$;

create or replace function central.cerrar_sesion(p_token text) returns void
language sql set search_path = central, pg_temp as $$
  update sesiones set revocada_en = now() where token_hash = central.sha(p_token) and revocada_en is null
$$;

-- ---------- Códigos para vincular un dispositivo ----------

-- Devuelve el código una sola vez (formato XXXXX-XXXXX). En la base solo queda su huella digital.
create or replace function central.crear_codigo_vinculo(p_creado_por text default 'Claude', p_minutos integer default 10) returns text
language plpgsql set search_path = central, extensions, pg_temp as $$
declare
  v_alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea := gen_random_bytes(10);
  v_codigo text := '';
  i integer;
begin
  for i in 0..9 loop
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) & 31) + 1, 1);
  end loop;
  insert into codigos_vinculo (id, codigo_hash, creado_por, expira_en)
  values (gen_random_uuid(), central.sha(v_codigo), left(coalesce(p_creado_por, ''), 80),
          now() + make_interval(mins => least(greatest(coalesce(p_minutos, 10), 1), 10080)));
  return substr(v_codigo, 1, 5) || '-' || substr(v_codigo, 6, 5);
end $$;

create or replace function central.iniciar_vinculo(p_codigo text, p_nombre text, p_clave jsonb, p_agente text, p_rp_id text) returns jsonb
language plpgsql set search_path = central, extensions, pg_temp as $$
declare
  v_normal text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_codigo_id uuid;
  v_fallos integer;
  v_reto bytea := gen_random_bytes(32);
  v_id uuid := gen_random_uuid();
begin
  select count(*) into v_fallos from intentos where tipo = 'vincular' and creado_en > now() - interval '15 minutes';
  if v_fallos >= 10 then return central.err('demasiados_intentos'); end if;

  select id into v_codigo_id from codigos_vinculo
  where codigo_hash = central.sha(v_normal) and usado_en is null and expira_en > now();
  if v_codigo_id is null then
    insert into intentos (tipo) values ('vincular');
    if v_fallos = 4 then
      perform central.encolar_aviso('seguridad', 'Intentos fallidos de vincular',
        'Alguien probó varios códigos de vinculación que no sirven.', '/#/ajustes/dispositivos',
        'seguridad:vincular', null, 0, null, null);
    end if;
    return central.err('codigo_invalido');
  end if;

  if coalesce(p_clave ->> 'kty', '') <> 'EC' or coalesce(p_clave ->> 'crv', '') <> 'P-256'
     or length(coalesce(p_clave ->> 'x', '')) <> 43 or length(coalesce(p_clave ->> 'y', '')) <> 43 then
    return central.err('clave_invalida');
  end if;

  insert into retos (id, reto, tipo, datos, expira_en)
  values (v_id, v_reto, 'vincular', jsonb_build_object(
      'codigo_id', v_codigo_id,
      'nombre', left(coalesce(nullif(btrim(p_nombre), ''), 'Dispositivo'), 60),
      'clave', jsonb_build_object('kty', 'EC', 'crv', 'P-256', 'x', p_clave ->> 'x', 'y', p_clave ->> 'y'),
      'agente', left(coalesce(p_agente, ''), 300),
      'rp_id', p_rp_id),
    now() + interval '5 minutes');

  return jsonb_build_object('ok', true, 'reto_id', v_id, 'reto', central.b64url(v_reto),
    'usuario_id', central.config_leer('usuario_id') #>> '{}',
    'credenciales', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'transportes', c.transportes))
                              from credenciales c where c.rp_id = p_rp_id), '[]'::jsonb));
end $$;

-- Devuelve el reto pendiente con la llave pública que debe firmarlo.
create or replace function central.leer_reto(p_reto uuid, p_tipo text) returns jsonb
language plpgsql stable set search_path = central, pg_temp as $$
declare v record;
begin
  select r.reto, r.datos, r.dispositivo_id, d.clave_publica, d.con_huella, d.revocado_en
    into v
  from retos r left join dispositivos d on d.id = r.dispositivo_id
  where r.id = p_reto and r.tipo = p_tipo and not r.usado and r.expira_en > now();
  if not found or v.revocado_en is not null then return central.err('reto_invalido'); end if;
  return jsonb_build_object('ok', true, 'reto', central.b64url(v.reto), 'datos', v.datos,
    'dispositivo_id', v.dispositivo_id,
    'clave', coalesce(v.clave_publica, v.datos -> 'clave'),
    'con_huella', coalesce(v.con_huella, false));
end $$;

create or replace function central.leer_credencial(p_id text, p_rp_id text) returns jsonb
language plpgsql stable set search_path = central, pg_temp as $$
declare c central.credenciales;
begin
  select * into c from credenciales where id = p_id and rp_id = p_rp_id;
  if not found then return central.err('credencial_desconocida'); end if;
  return jsonb_build_object('ok', true, 'id', c.id, 'clave', c.clave_publica, 'algoritmo', c.algoritmo, 'contador', c.contador);
end $$;

create or replace function central.guardar_credencial(p_dispositivo uuid, p_credencial jsonb, p_rp_id text) returns void
language plpgsql set search_path = central, pg_temp as $$
begin
  if p_credencial is null or jsonb_typeof(p_credencial) <> 'object' then return; end if;
  insert into credenciales (id, dispositivo_id, clave_publica, algoritmo, contador, rp_id, transportes)
  values (p_credencial ->> 'id', p_dispositivo, p_credencial -> 'clave', (p_credencial ->> 'algoritmo')::integer,
          coalesce((p_credencial ->> 'contador')::bigint, 0), p_rp_id,
          case when jsonb_typeof(p_credencial -> 'transportes') = 'array' then p_credencial -> 'transportes' else '[]'::jsonb end)
  on conflict (id) do nothing;
end $$;

-- Se llama cuando el servidor ya comprobó la firma del dispositivo (y la huella, si hubo).
create or replace function central.terminar_vinculo(p_reto uuid, p_credencial jsonb, p_con_huella boolean) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
declare
  r central.retos;
  v_dispositivo uuid := gen_random_uuid();
  v_nombre text;
  v_token text;
begin
  update retos set usado = true
  where id = p_reto and tipo = 'vincular' and not usado and expira_en > now()
  returning * into r;
  if not found then return central.err('reto_invalido'); end if;

  update codigos_vinculo set usado_en = now()
  where id = (r.datos ->> 'codigo_id')::uuid and usado_en is null and expira_en > now();
  if not found then return central.err('codigo_invalido'); end if;

  v_nombre := r.datos ->> 'nombre';
  insert into dispositivos (id, nombre, clave_publica, agente, con_huella)
  values (v_dispositivo, v_nombre, r.datos -> 'clave', coalesce(r.datos ->> 'agente', ''), coalesce(p_con_huella, false));
  perform central.guardar_credencial(v_dispositivo, p_credencial, r.datos ->> 'rp_id');
  v_token := central.crear_sesion(v_dispositivo);

  insert into cambios (tabla, fila_id, accion, resumen, origen, dispositivo_id)
  values ('dispositivos', v_dispositivo, 'vincular', 'Dispositivo vinculado: ' || v_nombre, v_nombre, v_dispositivo);
  perform central.encolar_aviso('seguridad', 'Nuevo dispositivo vinculado',
    v_nombre || ' ya puede entrar a Mi Central.', '/#/ajustes/dispositivos', null, 'vincular', 0, v_dispositivo, null);

  return jsonb_build_object('ok', true, 'token', v_token,
    'dispositivo', jsonb_build_object('id', v_dispositivo, 'nombre', v_nombre, 'con_huella', coalesce(p_con_huella, false)));
end $$;

-- ---------- Entrar con un dispositivo ya vinculado ----------

create or replace function central.iniciar_entrada(p_dispositivo uuid, p_rp_id text) returns jsonb
language plpgsql set search_path = central, extensions, pg_temp as $$
declare
  d central.dispositivos;
  v_n integer;
  v_reto bytea := gen_random_bytes(32);
  v_id uuid := gen_random_uuid();
begin
  select * into d from dispositivos where id = p_dispositivo;
  if not found then
    insert into intentos (tipo) values ('entrar');
    return central.err('no_vinculado');
  end if;
  if d.revocado_en is not null then return central.err('revocado'); end if;
  select count(*) into v_n from retos
  where dispositivo_id = p_dispositivo and tipo = 'entrar' and creado_en > now() - interval '15 minutes';
  if v_n >= 30 then return central.err('demasiados_intentos'); end if;

  insert into retos (id, reto, tipo, dispositivo_id, datos, expira_en)
  values (v_id, v_reto, 'entrar', p_dispositivo, jsonb_build_object('rp_id', p_rp_id), now() + interval '5 minutes');

  return jsonb_build_object('ok', true, 'reto_id', v_id, 'reto', central.b64url(v_reto),
    'con_huella', d.con_huella,
    'credenciales', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'transportes', c.transportes))
                              from credenciales c where c.rp_id = p_rp_id), '[]'::jsonb));
end $$;

create or replace function central.terminar_entrada(p_reto uuid, p_credencial_id text, p_contador bigint) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
declare
  r central.retos;
  d central.dispositivos;
  v_token text;
begin
  update retos set usado = true
  where id = p_reto and tipo = 'entrar' and not usado and expira_en > now()
  returning * into r;
  if not found then return central.err('reto_invalido'); end if;

  select * into d from dispositivos where id = r.dispositivo_id and revocado_en is null;
  if not found then return central.err('revocado'); end if;
  if d.con_huella and p_credencial_id is null then return central.err('falta_huella'); end if;

  if p_credencial_id is not null then
    update credenciales set contador = greatest(contador, coalesce(p_contador, 0)), ultimo_uso = now()
    where id = p_credencial_id;
    if not found then return central.err('credencial_desconocida'); end if;
  end if;

  v_token := central.crear_sesion(d.id);
  return jsonb_build_object('ok', true, 'token', v_token,
    'dispositivo', jsonb_build_object('id', d.id, 'nombre', d.nombre, 'con_huella', d.con_huella));
end $$;

-- ---------- Activar la huella en un dispositivo que ya entró ----------

create or replace function central.iniciar_huella(p_dispositivo uuid, p_rp_id text) returns jsonb
language plpgsql set search_path = central, extensions, pg_temp as $$
declare
  v_reto bytea := gen_random_bytes(32);
  v_id uuid := gen_random_uuid();
begin
  insert into retos (id, reto, tipo, dispositivo_id, datos, expira_en)
  values (v_id, v_reto, 'huella', p_dispositivo, jsonb_build_object('rp_id', p_rp_id), now() + interval '5 minutes');
  return jsonb_build_object('ok', true, 'reto_id', v_id, 'reto', central.b64url(v_reto),
    'usuario_id', central.config_leer('usuario_id') #>> '{}',
    'credenciales', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'transportes', c.transportes))
                              from credenciales c where c.rp_id = p_rp_id), '[]'::jsonb));
end $$;

create or replace function central.terminar_huella(p_reto uuid, p_credencial jsonb) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
declare
  r central.retos;
  v_nombre text;
begin
  update retos set usado = true
  where id = p_reto and tipo = 'huella' and not usado and expira_en > now()
  returning * into r;
  if not found then return central.err('reto_invalido'); end if;
  perform central.guardar_credencial(r.dispositivo_id, p_credencial, r.datos ->> 'rp_id');
  update dispositivos set con_huella = true where id = r.dispositivo_id returning nombre into v_nombre;
  insert into cambios (tabla, fila_id, accion, resumen, origen, dispositivo_id)
  values ('dispositivos', r.dispositivo_id, 'huella', 'Huella activada en: ' || v_nombre, v_nombre, r.dispositivo_id);
  perform central.encolar_aviso('seguridad', 'Huella activada',
    v_nombre || ' ahora pide huella para entrar.', '/#/ajustes/dispositivos', null, 'huella', 0, r.dispositivo_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Dispositivos ----------

create or replace function central.listar_dispositivos(p_actual uuid) returns jsonb
language sql stable set search_path = central, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'nombre', d.nombre, 'creado_en', d.creado_en, 'ultimo_uso', d.ultimo_uso,
    'con_huella', d.con_huella, 'actual', d.id = p_actual, 'agente', d.agente,
    'avisos', exists (select 1 from suscripciones_push s where s.dispositivo_id = d.id)
  ) order by (d.id = p_actual) desc, d.ultimo_uso desc), '[]'::jsonb)
  from dispositivos d where d.revocado_en is null
$$;

create or replace function central.renombrar_dispositivo(p_id uuid, p_nombre text) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
begin
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then return central.err('nombre_vacio'); end if;
  update dispositivos set nombre = left(btrim(p_nombre), 60) where id = p_id and revocado_en is null;
  if not found then return central.err('no_existe'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function central.revocar_dispositivo(p_id uuid, p_por uuid) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
declare
  d central.dispositivos;
  v_por text;
begin
  update dispositivos set revocado_en = now() where id = p_id and revocado_en is null returning * into d;
  if not found then return central.err('no_existe'); end if;
  update sesiones set revocada_en = now() where dispositivo_id = p_id and revocada_en is null;
  delete from suscripciones_push where dispositivo_id = p_id;
  select nombre into v_por from dispositivos where id = p_por;
  insert into cambios (tabla, fila_id, accion, resumen, origen, dispositivo_id)
  values ('dispositivos', p_id, 'desvincular', 'Dispositivo desvinculado: ' || d.nombre, coalesce(v_por, 'Claude'), p_por);
  perform central.encolar_aviso('seguridad', 'Dispositivo desvinculado',
    d.nombre || ' ya no puede entrar a Mi Central.', '/#/ajustes/dispositivos', null, 'desvincular', 0, null, null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Suscripciones de notificaciones ----------

create or replace function central.guardar_suscripcion(p_dispositivo uuid, p_endpoint text, p_p256dh text, p_auth text) returns void
language sql set search_path = central, pg_temp as $$
  insert into suscripciones_push (dispositivo_id, endpoint, p256dh, auth)
  values (p_dispositivo, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set dispositivo_id = excluded.dispositivo_id, p256dh = excluded.p256dh,
    auth = excluded.auth, fallos = 0, ultimo_estado = null
$$;

create or replace function central.quitar_suscripcion(p_dispositivo uuid, p_endpoint text) returns void
language sql set search_path = central, pg_temp as $$
  delete from suscripciones_push
  where dispositivo_id = p_dispositivo and (p_endpoint is null or endpoint = p_endpoint)
$$;

-- Toma los avisos que ya toca enviar, cada uno con las suscripciones a las que va.
create or replace function central.tomar_avisos(p_limite integer default 20) returns jsonb
language plpgsql set search_path = central, pg_temp as $$
declare v jsonb;
begin
  with elegidos as (
    select id from avisos
    where enviado_en is null and enviar_en <= now()
      and (tomado_en is null or tomado_en < now() - interval '3 minutes')
    order by id limit p_limite
    for update skip locked
  ), tomados as (
    update avisos a set tomado_en = now() from elegidos e where a.id = e.id returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'tipo', t.tipo, 'titulo', t.titulo, 'cuerpo', t.cuerpo, 'url', t.url, 'clave', t.clave,
    'suscripciones', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from suscripciones_push s join dispositivos d on d.id = s.dispositivo_id
      where d.revocado_en is null
        and (t.excluir_dispositivo is null or s.dispositivo_id <> t.excluir_dispositivo)
        and (t.solo_dispositivo is null or s.dispositivo_id = t.solo_dispositivo)
    ), '[]'::jsonb)) order by t.id), '[]'::jsonb)
  into v from tomados t;
  return v;
end $$;

create or replace function central.cerrar_aviso(p_id bigint, p_resultado jsonb) returns void
language sql set search_path = central, pg_temp as $$
  update avisos set enviado_en = now(), resultado = p_resultado where id = p_id
$$;

-- 404 y 410 significan que el celular ya no tiene esa suscripción: se borra.
create or replace function central.marcar_suscripcion(p_id uuid, p_estado integer) returns void
language plpgsql set search_path = central, pg_temp as $$
begin
  if p_estado in (404, 410) then
    delete from suscripciones_push where id = p_id;
  elsif p_estado between 200 and 299 then
    update suscripciones_push set ultimo_ok = now(), fallos = 0, ultimo_estado = p_estado where id = p_id;
  else
    update suscripciones_push set fallos = fallos + 1, ultimo_estado = p_estado where id = p_id;
  end if;
end $$;
