// Servidor de Mi Central. Recibe las peticiones de la app, comprueba quién es y habla con la base.
// Toda la lógica de datos vive en funciones SQL del esquema "central".

import { aB64u, codificador, sha256 } from './util.js';
import { verificarRegistro, verificarAfirmacion, mensajeDispositivo, verificarFirmaDispositivo } from './webauthn.js';
import { generarVapid, enviarPush, endpointPermitido } from './push.js';

const COOKIE_SEGURA = '__Host-mc_s';
const COOKIE_LOCAL = 'mc_s';
const DURACION_COOKIE = 60 * 24 * 3600;
const MAX_CUERPO = 3_000_000;
const MAX_TURNOS_IA = 30;
const MAX_TEXTO_IA = 8000;
const MAX_CONTEXTO_IA = 200_000;

/**
 * @param {{
 *   bd: { consulta: (texto: string, parametros?: any[]) => Promise<any[]> },
 *   prefijo: string,
 *   enSegundoPlano?: (p: Promise<any>) => void,
 *   mantenerVivo?: () => Promise<void>,
 *   ia?: (p: { mensajes: { rol: 'yo' | 'ia', texto: string }[], contexto: string }) => Promise<{ texto: string }>,
 * }} deps
 */
export function crearServidor(deps) {
  const { bd, prefijo } = deps;
  const enSegundoPlano = deps.enSegundoPlano ?? ((p) => { p.catch(() => {}); });

  /** Llama una función SQL que devuelve JSON. @param {string} expresion @param {any[]} [parametros] */
  async function json(expresion, parametros = []) {
    const filas = await bd.consulta(`select ${expresion} as r`, parametros);
    const r = filas[0]?.r;
    return typeof r === 'string' ? JSON.parse(r) : r;
  }
  /** @param {string} expresion @param {any[]} [parametros] @returns {Promise<string | null>} */
  async function texto(expresion, parametros = []) {
    const filas = await bd.consulta(`select (${expresion})::text as r`, parametros);
    return filas[0]?.r ?? null;
  }

  let cacheOrigenes = { hasta: 0, /** @type {string[]} */ lista: [] };
  async function leerOrigenes() {
    if (Date.now() < cacheOrigenes.hasta) return cacheOrigenes.lista;
    const lista = await json(`central.config_leer('origenes')`);
    cacheOrigenes = { hasta: Date.now() + 30000, lista: Array.isArray(lista) ? lista : [] };
    return cacheOrigenes.lista;
  }

  /** @type {{ publica: string, privada: any } | null} */
  let vapid = null;
  async function leerVapid() {
    if (vapid) return vapid;
    let guardado = await texto(`central.secreto_leer('vapid')`);
    if (!guardado) guardado = await texto(`central.secreto_crear('vapid', $1)`, [JSON.stringify(await generarVapid())]);
    vapid = JSON.parse(/** @type {string} */ (guardado));
    return /** @type {{ publica: string, privada: any }} */ (vapid);
  }

  /** @param {any} cuerpo @param {{ estado?: number, cookie?: string | null, nombreCookie?: string, segura?: boolean }} [op] */
  function responder(cuerpo, op = {}) {
    const cabeceras = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    if (op.cookie !== undefined) {
      const nombre = op.nombreCookie ?? COOKIE_SEGURA;
      const segura = nombre === COOKIE_SEGURA ? '; Secure' : '';
      cabeceras.append('set-cookie', op.cookie === null
        ? `${nombre}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${segura}`
        : `${nombre}=${op.cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DURACION_COOKIE}${segura}`);
    }
    return new Response(JSON.stringify(cuerpo), { status: op.estado ?? 200, headers: cabeceras });
  }
  /** @param {number} estado @param {string} codigo @param {object} [extra] */
  const fallo = (estado, codigo, extra = {}) => responder({ ok: false, error: codigo }, { estado, ...extra });

  /** @param {Request} req */
  function leerCookie(req) {
    const cruda = req.headers.get('cookie') ?? '';
    /** @type {{ nombre: string, valor: string } | null} */
    let hallada = null;
    for (const parte of cruda.split(';')) {
      const i = parte.indexOf('=');
      if (i < 0) continue;
      const nombre = parte.slice(0, i).trim();
      if (nombre === COOKIE_SEGURA || (nombre === COOKIE_LOCAL && !hallada)) hallada = { nombre, valor: parte.slice(i + 1).trim() };
    }
    return hallada;
  }

  // ---------- Envío de notificaciones ----------

  /** @param {any} aviso @param {any} s @param {string} sujeto */
  async function enviarUno(aviso, s, sujeto) {
    let tema;
    if (aviso.clave) tema = aB64u(await sha256(codificador.encode(aviso.clave))).slice(0, 24);
    const estado = await enviarPush(s, { t: aviso.titulo, c: aviso.cuerpo, u: aviso.url, k: aviso.tipo, i: aviso.id }, {
      vapid: await leerVapid(), sujeto, tema,
      urgencia: aviso.tipo === 'recordatorio' || aviso.tipo === 'seguridad' || aviso.tipo === 'prueba' ? 'high' : 'normal',
    }).catch(() => 0);
    await bd.consulta('select central.marcar_suscripcion($1::uuid, $2::int)', [s.id, estado]);
    return estado;
  }

  async function despachar() {
    const origenes = await leerOrigenes();
    const sujeto = origenes.find((o) => o.startsWith('https://')) ?? 'https://mi-central.vercel.app';
    let enviados = 0;
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const avisos = await json('central.tomar_avisos(20)');
      if (!Array.isArray(avisos) || avisos.length === 0) break;
      for (const aviso of avisos) {
        const estados = await Promise.all((aviso.suscripciones ?? []).map((/** @type {any} */ s) => enviarUno(aviso, s, sujeto)));
        await bd.consulta('select central.cerrar_aviso($1::bigint, $2::text::jsonb)', [aviso.id, JSON.stringify({ estados })]);
        enviados++;
      }
    }
    return enviados;
  }

  // ---------- Peticiones ----------

  /** @param {Request} req */
  async function atender(req) {
    const url = new URL(req.url);
    let ruta = url.pathname;
    if (ruta.startsWith(prefijo)) ruta = ruta.slice(prefijo.length);
    ruta = ruta.replace(/\/+$/, '') || '/';
    const metodo = req.method;
    if (metodo !== 'GET' && metodo !== 'POST') return fallo(405, 'metodo_no_permitido');

    /** @type {any} */
    let cuerpo = {};
    if (metodo === 'POST') {
      const crudo = await req.text();
      if (crudo.length > MAX_CUERPO) return fallo(413, 'muy_grande');
      try {
        cuerpo = crudo ? JSON.parse(crudo) : {};
      } catch {
        return fallo(400, 'json_invalido');
      }
      if (cuerpo === null || typeof cuerpo !== 'object') return fallo(400, 'json_invalido');
    }

    // El reloj de la base pide enviar los avisos pendientes.
    if (ruta === '/interno/despachar' && metodo === 'POST') {
      const secreto = await texto(`central.secreto_leer('interno')`);
      if (!secreto || req.headers.get('x-mc-interno') !== secreto) return fallo(403, 'prohibido');
      const enviados = await despachar();
      if (deps.mantenerVivo) await deps.mantenerVivo().catch(() => {});
      return responder({ ok: true, enviados });
    }

    // El puente de Google (Apps Script) pide trabajos y entrega resultados.
    if (ruta === '/api/puente' && metodo === 'POST') {
      const valido = await texto('central.puente_validar($1)', [typeof cuerpo.secreto === 'string' ? cuerpo.secreto : null]);
      if (valido !== 'true') return fallo(403, 'prohibido');
      if (cuerpo.accion === 'resultados') {
        await bd.consulta('select central.puente_resultados($1::text::jsonb)', [JSON.stringify(cuerpo.resultados ?? [])]);
        return responder({ ok: true });
      }
      const trabajos = await json('central.puente_pendientes(10)');
      return responder({ ok: true, trabajos, zona: await texto('central.zona()') });
    }

    if (!ruta.startsWith('/api/')) return fallo(404, 'no_existe');

    const origenes = await leerOrigenes();
    const origen = req.headers.get('origin');
    if (metodo === 'POST') {
      if (req.headers.get('x-mc') !== '1') return fallo(403, 'peticion_invalida');
      if (!origen || !origenes.includes(origen)) return fallo(403, 'origen_no_permitido');
    }
    const rpId = origen && origenes.includes(origen) ? new URL(origen).hostname : '';
    const nombreCookie = origen && origen.startsWith('http://') ? COOKIE_LOCAL : COOKIE_SEGURA;
    const agente = (req.headers.get('user-agent') ?? '').slice(0, 300);

    // ----- Sin sesión: vincular y entrar -----

    if (ruta === '/api/vincular/iniciar' && metodo === 'POST') {
      const r = await json('central.iniciar_vinculo($1, $2, $3::text::jsonb, $4, $5)',
        [String(cuerpo.codigo ?? ''), String(cuerpo.nombre ?? ''), JSON.stringify(cuerpo.clave ?? {}), agente, rpId]);
      return r.ok ? responder({ ...r, rp_id: rpId }) : fallo(r.error === 'demasiados_intentos' ? 429 : 400, r.error);
    }

    if (ruta === '/api/vincular/terminar' && metodo === 'POST') {
      const retoId = String(cuerpo.reto_id ?? '');
      const reto = await json('central.leer_reto($1::uuid, $2)', [retoId, 'vincular']).catch(() => ({ ok: false }));
      if (!reto?.ok) return fallo(400, 'reto_invalido');
      const firmaOk = await verificarFirmaDispositivo(reto.clave, String(cuerpo.firma ?? ''), mensajeDispositivo('vincular', retoId, reto.reto)).catch(() => false);
      if (!firmaOk) return fallo(400, 'firma_invalida');
      let credencial = null;
      if (cuerpo.huella) {
        try {
          credencial = await verificarRegistro(cuerpo.huella, { reto: reto.reto, origenes });
        } catch {
          return fallo(400, 'huella_invalida');
        }
      }
      const r = await json('central.terminar_vinculo($1::uuid, $2::text::jsonb, $3::boolean)',
        [retoId, credencial ? JSON.stringify(credencial) : null, credencial !== null || cuerpo.ya_tenia_huella === true]);
      if (!r.ok) return fallo(400, r.error);
      enSegundoPlano(despachar());
      return responder({ ok: true, dispositivo: r.dispositivo }, { cookie: r.token, nombreCookie });
    }

    if (ruta === '/api/entrar/iniciar' && metodo === 'POST') {
      const r = await json('central.iniciar_entrada($1::uuid, $2)', [String(cuerpo.dispositivo ?? ''), rpId]).catch(() => ({ ok: false, error: 'no_vinculado' }));
      if (r.ok) return responder({ ...r, rp_id: rpId });
      return fallo(r.error === 'demasiados_intentos' ? 429 : 401, r.error);
    }

    if (ruta === '/api/entrar/terminar' && metodo === 'POST') {
      const retoId = String(cuerpo.reto_id ?? '');
      const reto = await json('central.leer_reto($1::uuid, $2)', [retoId, 'entrar']).catch(() => ({ ok: false }));
      if (!reto?.ok) return fallo(400, 'reto_invalido');
      const firmaOk = await verificarFirmaDispositivo(reto.clave, String(cuerpo.firma ?? ''), mensajeDispositivo('entrar', retoId, reto.reto)).catch(() => false);
      if (!firmaOk) return fallo(401, 'firma_invalida');
      let idCredencial = null;
      let contador = null;
      if (reto.con_huella) {
        if (!cuerpo.huella) return fallo(401, 'falta_huella');
        const c = await json('central.leer_credencial($1, $2)', [String(cuerpo.huella.id ?? ''), rpId]);
        if (!c.ok) return fallo(401, 'huella_invalida');
        try {
          const v = await verificarAfirmacion(cuerpo.huella, { reto: reto.reto, origenes, clave: c.clave, algoritmo: c.algoritmo, contador: Number(c.contador) });
          idCredencial = c.id;
          contador = v.contador;
        } catch {
          return fallo(401, 'huella_invalida');
        }
      }
      const r = await json('central.terminar_entrada($1::uuid, $2, $3::bigint)', [retoId, idCredencial, contador]);
      if (!r.ok) return fallo(401, r.error);
      return responder({ ok: true, dispositivo: r.dispositivo }, { cookie: r.token, nombreCookie });
    }

    // ----- Con sesión -----

    const cookie = leerCookie(req);
    const sesion = cookie ? await json('central.sesion($1)', [cookie.valor]) : { ok: false, error: 'sin_sesion' };
    if (!sesion.ok) return fallo(401, sesion.error, cookie ? { cookie: null, nombreCookie: cookie.nombre } : {});
    const yo = /** @type {string} */ (sesion.dispositivo_id);
    const renovar = sesion.renovar && cookie ? { cookie: cookie.valor, nombreCookie: cookie.nombre } : {};

    if (ruta === '/api/estado' && metodo === 'GET') {
      return responder({ ok: true, dispositivo: { id: yo, nombre: sesion.nombre, con_huella: sesion.con_huella } }, renovar);
    }

    if (ruta === '/api/sincronizar' && metodo === 'POST') {
      const cambios = Array.isArray(cuerpo.cambios) ? cuerpo.cambios : [];
      const r = await json('central.sincronizar($1::uuid, $2::bigint, $3::text::jsonb)',
        [yo, Number.isFinite(Number(cuerpo.cursor)) ? Math.trunc(Number(cuerpo.cursor)) : 0, JSON.stringify(cambios)]);
      if (!r.ok) return fallo(400, r.error);
      if (cambios.length > 0) enSegundoPlano(despachar());
      return responder(r, renovar);
    }

    // El asistente: la app manda la conversación y un resumen de sus datos; aquí solo se valida y se reenvía.
    if (ruta === '/api/ia' && metodo === 'POST') {
      if (!deps.ia) return fallo(503, 'ia_sin_configurar');
      const mensajes = Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes : [];
      const contexto = typeof cuerpo.contexto === 'string' ? cuerpo.contexto : '';
      const validos = mensajes.length > 0 && mensajes.length <= MAX_TURNOS_IA && contexto.length <= MAX_CONTEXTO_IA
        && mensajes.every((/** @type {any} */ m) => (m?.rol === 'yo' || m?.rol === 'ia') && typeof m.texto === 'string' && m.texto.trim() && m.texto.length <= MAX_TEXTO_IA)
        && mensajes[0].rol === 'yo' && mensajes[mensajes.length - 1].rol === 'yo';
      if (!validos) return fallo(400, 'ia_pregunta_invalida');
      try {
        const r = await deps.ia({ mensajes: mensajes.map((/** @type {any} */ m) => ({ rol: m.rol, texto: m.texto })), contexto });
        return responder({ ok: true, texto: r.texto }, renovar);
      } catch (e) {
        const codigo = /** @type {any} */ (e)?.codigo;
        if (typeof codigo !== 'string' || !codigo.startsWith('ia_')) throw e;
        return fallo(/** @type {any} */ (e).estado ?? 502, codigo);
      }
    }

    if (ruta === '/api/actividad' && metodo === 'GET') {
      const antes = Number(url.searchParams.get('antes'));
      return responder({ ok: true, cambios: await json('central.actividad($1::bigint, 60)', [antes > 0 ? Math.trunc(antes) : null]) });
    }

    if (ruta === '/api/exportar' && metodo === 'GET') {
      return responder(await json('central.exportar()'));
    }

    if (ruta === '/api/dispositivos' && metodo === 'GET') {
      return responder({ ok: true, dispositivos: await json('central.listar_dispositivos($1::uuid)', [yo]) });
    }
    if (ruta === '/api/dispositivos/renombrar' && metodo === 'POST') {
      const r = await json('central.renombrar_dispositivo($1::uuid, $2)', [String(cuerpo.id ?? ''), String(cuerpo.nombre ?? '')]);
      return r.ok ? responder(r) : fallo(400, r.error);
    }
    if (ruta === '/api/dispositivos/revocar' && metodo === 'POST') {
      const r = await json('central.revocar_dispositivo($1::uuid, $2::uuid)', [String(cuerpo.id ?? ''), yo]);
      if (!r.ok) return fallo(400, r.error);
      enSegundoPlano(despachar());
      return responder(r, cuerpo.id === yo && cookie ? { cookie: null, nombreCookie: cookie.nombre } : {});
    }
    if (ruta === '/api/vincular/codigo' && metodo === 'POST') {
      const codigo = await texto('central.crear_codigo_vinculo($1, 10)', [sesion.nombre]);
      return responder({ ok: true, codigo, minutos: 10 });
    }

    if (ruta === '/api/huella/iniciar' && metodo === 'POST') {
      return responder({ ...(await json('central.iniciar_huella($1::uuid, $2)', [yo, rpId])), rp_id: rpId });
    }
    if (ruta === '/api/huella/terminar' && metodo === 'POST') {
      const retoId = String(cuerpo.reto_id ?? '');
      const reto = await json('central.leer_reto($1::uuid, $2)', [retoId, 'huella']).catch(() => ({ ok: false }));
      if (!reto?.ok || reto.dispositivo_id !== yo) return fallo(400, 'reto_invalido');
      let credencial = null;
      if (cuerpo.huella) {
        try {
          credencial = await verificarRegistro(cuerpo.huella, { reto: reto.reto, origenes });
        } catch {
          return fallo(400, 'huella_invalida');
        }
      } else if (cuerpo.ya_tenia_huella !== true) {
        return fallo(400, 'falta_huella');
      }
      const r = await json('central.terminar_huella($1::uuid, $2::text::jsonb)', [retoId, credencial ? JSON.stringify(credencial) : null]);
      return r.ok ? responder(r) : fallo(400, r.error);
    }

    if (ruta === '/api/push/clave' && metodo === 'GET') {
      return responder({ ok: true, clave: (await leerVapid()).publica });
    }
    if (ruta === '/api/push/suscribir' && metodo === 'POST') {
      const s = cuerpo.suscripcion ?? {};
      const p256dh = String(s.keys?.p256dh ?? '');
      const auth = String(s.keys?.auth ?? '');
      if (!endpointPermitido(String(s.endpoint ?? '')) || p256dh.length !== 87 || auth.length !== 22) return fallo(400, 'suscripcion_invalida');
      await bd.consulta('select central.guardar_suscripcion($1::uuid, $2, $3, $4)', [yo, s.endpoint, p256dh, auth]);
      return responder({ ok: true });
    }
    if (ruta === '/api/push/quitar' && metodo === 'POST') {
      await bd.consulta('select central.quitar_suscripcion($1::uuid, $2)', [yo, typeof cuerpo.endpoint === 'string' ? cuerpo.endpoint : null]);
      return responder({ ok: true });
    }
    if (ruta === '/api/push/probar' && metodo === 'POST') {
      const subs = await bd.consulta('select id, endpoint, p256dh, auth from central.suscripciones_push where dispositivo_id = $1::uuid', [yo]);
      const sujeto = origenes.find((o) => o.startsWith('https://')) ?? 'https://mi-central.vercel.app';
      const aviso = { id: 0, tipo: 'prueba', titulo: 'Mi Central', cuerpo: 'Las notificaciones funcionan en este dispositivo.', url: '/#/ajustes', clave: null };
      const estados = await Promise.all(subs.map((s) => enviarUno(aviso, s, sujeto)));
      return responder({ ok: true, estados });
    }

    if (ruta === '/api/puente/estado' && metodo === 'GET') {
      return responder({ ok: true, ...(await json('central.puente_estado()')) });
    }
    if (ruta === '/api/puente/secreto' && metodo === 'POST') {
      const secreto = await texto('central.puente_crear_secreto()');
      const base = await texto(`central.config_leer('funcion_url') #>> '{}'`);
      return responder({ ok: true, secreto, url: `${base}/api/puente` });
    }
    if (ruta === '/api/puente/desconectar' && metodo === 'POST') {
      await bd.consulta('select central.puente_desconectar()');
      return responder({ ok: true });
    }

    if (ruta === '/api/salir' && metodo === 'POST') {
      if (cookie) await bd.consulta('select central.cerrar_sesion($1)', [cookie.valor]);
      return responder({ ok: true }, cookie ? { cookie: null, nombreCookie: cookie.nombre } : {});
    }

    return fallo(404, 'no_existe');
  }

  /** @param {Request} req */
  return async function manejar(req) {
    try {
      return await atender(req);
    } catch (e) {
      console.error('error del servidor:', e instanceof Error ? e.message : e);
      return fallo(500, 'error_interno');
    }
  };
}
