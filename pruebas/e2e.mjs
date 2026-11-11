// Prueba de punta a punta contra el servidor real, con celulares simulados.
// Uso: herramientas/node.sh pruebas/e2e.mjs <url-base> <codigo-de-vinculacion> [origen]
// Deja datos de prueba: solo se corre antes de usar la app de verdad o contra una copia.

import assert from 'node:assert/strict';
import { aB64u } from '../supabase/functions/central/util.js';
import { mensajeDispositivo } from '../supabase/functions/central/webauthn.js';
import { crearHuellaSimulada, crearDispositivoSimulado } from './simulador.mjs';

const [BASE, CODIGO, ORIGEN = 'https://mi-central.vercel.app'] = process.argv.slice(2);
if (!BASE || !CODIGO) throw new Error('faltan la url y el código');

function cliente() {
  let cookie = '';
  return {
    /** @param {string} ruta @param {any} [cuerpo] @param {Record<string, string>} [extra] */
    async pedir(ruta, cuerpo, extra = {}) {
      /** @type {Record<string, string>} */
      const cabeceras = { origin: ORIGEN, ...extra };
      if (cookie) cabeceras.cookie = cookie;
      if (cuerpo !== undefined) { cabeceras['content-type'] = 'application/json'; cabeceras['x-mc'] = extra['x-mc'] ?? '1'; }
      if (extra['x-mc'] === '') delete cabeceras['x-mc'];
      const r = await fetch(BASE + ruta, { method: cuerpo === undefined ? 'GET' : 'POST', headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
      const puesta = r.headers.getSetCookie?.().find((c) => c.includes('mc_s='));
      if (puesta) cookie = puesta.split(';')[0].endsWith('=') ? '' : puesta.split(';')[0];
      return { estado: r.status, datos: await r.json().catch(() => ({})), cookie: puesta ?? '' };
    },
  };
}

let pasos = 0;
const paso = (/** @type {string} */ t) => console.log(`  ok ${++pasos}. ${t}`);
const id = () => crypto.randomUUID();

const a = cliente();
const dispA = await crearDispositivoSimulado();
const huellaA = await crearHuellaSimulada(ORIGEN);

assert.equal((await a.pedir('/api/estado')).estado, 401);
paso('sin sesión no se entra');

let r = await a.pedir('/api/vincular/iniciar', { codigo: 'AAAAA-AAAAA', nombre: 'Falso', clave: dispA.clave });
assert.equal(r.datos.error, 'codigo_invalido');
paso('un código inventado se rechaza');

r = await a.pedir('/api/vincular/iniciar', { codigo: CODIGO.toLowerCase(), nombre: 'Celular de prueba A', clave: dispA.clave });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
const v1 = r.datos;
r = await a.pedir('/api/vincular/terminar', { reto_id: v1.reto_id, firma: aB64u(new Uint8Array(64)), huella: null });
assert.equal(r.datos.error, 'firma_invalida');
r = await a.pedir('/api/vincular/terminar', {
  reto_id: v1.reto_id,
  firma: await dispA.firmar(mensajeDispositivo('vincular', v1.reto_id, v1.reto)),
  huella: await huellaA.registrar(v1.reto),
});
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.match(r.cookie, /__Host-mc_s=.+HttpOnly; SameSite=Strict.+Secure/);
const idA = r.datos.dispositivo.id;
assert.equal(r.datos.dispositivo.con_huella, true);
paso('vincular con llave del dispositivo y huella, cookie segura');

r = await a.pedir('/api/vincular/iniciar', { codigo: CODIGO, nombre: 'Otra vez', clave: dispA.clave });
assert.equal(r.datos.error, 'codigo_invalido');
paso('el código sirve una sola vez');

r = await a.pedir('/api/estado');
assert.equal(r.datos.dispositivo.nombre, 'Celular de prueba A');
paso('estado con sesión');

assert.equal((await a.pedir('/api/sincronizar', { cursor: 0, cambios: [] }, { 'x-mc': '' })).estado, 403);
assert.equal((await a.pedir('/api/sincronizar', { cursor: 0, cambios: [] }, { origin: 'https://malo.app' })).estado, 403);
paso('peticiones sin cabecera propia o desde otro sitio se rechazan');

const tarea = id(), nota = id();
r = await a.pedir('/api/sincronizar', { cursor: 0, cambios: [
  { tabla: 'tareas', id: tarea, datos: { titulo: 'Tarea e2e', fecha: '2031-05-05', hora: '10:00', avisos: [60] } },
  { tabla: 'notas', id: nota, datos: { titulo: 'Nota e2e', contenido: 'hola' } },
  { tabla: 'tareas', id: id(), datos: { titulo: 'mala', fecha: 'xx' } },
] });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.errores.length, 1);
assert.ok(r.datos.filas.tareas.some((/** @type {any} */ t) => t.id === tarea && t.hora === '10:00:00'));
assert.equal(r.datos.filas.preferencias.length, 1);
let cursorA = r.datos.cursor;
r = await a.pedir('/api/sincronizar', { cursor: cursorA, cambios: [] });
assert.equal(r.datos.filas.tareas.length + r.datos.filas.notas.length, 0);
paso('sincronizar: guarda, devuelve y no repite');

r = await a.pedir('/api/vincular/codigo', {});
assert.match(r.datos.codigo, /^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
const b = cliente();
const dispB = await crearDispositivoSimulado();
r = await b.pedir('/api/vincular/iniciar', { codigo: r.datos.codigo, nombre: 'PC de prueba B', clave: dispB.clave });
const v2 = r.datos;
assert.equal(v2.credenciales.length, 1);
r = await b.pedir('/api/vincular/terminar', { reto_id: v2.reto_id, firma: await dispB.firmar(mensajeDispositivo('vincular', v2.reto_id, v2.reto)), huella: null });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
const idB = r.datos.dispositivo.id;
r = await b.pedir('/api/sincronizar', { cursor: 0, cambios: [{ tabla: 'tareas', id: tarea, datos: { titulo: 'Tarea e2e', fecha: '2031-05-05', hora: '10:00', avisos: [60], hecha: true } }] });
assert.ok(r.datos.filas.notas.some((/** @type {any} */ n) => n.id === nota));
r = await a.pedir('/api/sincronizar', { cursor: cursorA, cambios: [{ tabla: 'notas', id: nota, borrar: true }] });
assert.equal(r.datos.filas.tareas[0].hecha, true);
assert.ok(r.datos.filas.notas[0].eliminado_en);
paso('segundo dispositivo vinculado desde el primero; los cambios cruzan');

r = await a.pedir('/api/dispositivos');
assert.equal(r.datos.dispositivos.length, 2);
assert.equal(r.datos.dispositivos[0].actual, true);
assert.equal((await a.pedir('/api/dispositivos/renombrar', { id: idB, nombre: 'PC B' })).estado, 200);
paso('lista de dispositivos y cambio de nombre');

await a.pedir('/api/salir', {});
assert.equal((await a.pedir('/api/estado')).estado, 401);
r = await a.pedir('/api/entrar/iniciar', { dispositivo: idA });
assert.equal(r.datos.con_huella, true);
let e = r.datos;
r = await a.pedir('/api/entrar/terminar', { reto_id: e.reto_id, firma: await dispA.firmar(mensajeDispositivo('entrar', e.reto_id, e.reto)) });
assert.equal(r.datos.error, 'falta_huella');
const ajena = await crearHuellaSimulada(ORIGEN);
r = await a.pedir('/api/entrar/terminar', { reto_id: e.reto_id, firma: await dispA.firmar(mensajeDispositivo('entrar', e.reto_id, e.reto)), huella: await ajena.usar(e.reto) });
assert.equal(r.datos.error, 'huella_invalida');
r = await a.pedir('/api/entrar/terminar', { reto_id: e.reto_id, firma: await dispB.firmar(mensajeDispositivo('entrar', e.reto_id, e.reto)), huella: await huellaA.usar(e.reto) });
assert.equal(r.datos.error, 'firma_invalida');
r = await a.pedir('/api/entrar/terminar', { reto_id: e.reto_id, firma: await dispA.firmar(mensajeDispositivo('entrar', e.reto_id, e.reto)), huella: await huellaA.usar(e.reto) });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
r = await a.pedir('/api/entrar/terminar', { reto_id: e.reto_id, firma: await dispA.firmar(mensajeDispositivo('entrar', e.reto_id, e.reto)), huella: await huellaA.usar(e.reto) });
assert.equal(r.datos.error, 'reto_invalido');
assert.equal((await a.pedir('/api/estado')).estado, 200);
assert.equal((await a.pedir('/api/entrar/iniciar', { dispositivo: id() })).datos.error, 'no_vinculado');
paso('salir y volver a entrar: exige la llave correcta y la huella correcta, y el reto no se repite');

r = await a.pedir('/api/push/clave');
assert.equal(r.datos.clave.length, 87);
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/prueba-e2e-' + id(), keys: { p256dh: aB64u(new Uint8Array(await crypto.subtle.exportKey('raw', (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])).publicKey))), auth: aB64u(crypto.getRandomValues(new Uint8Array(16))) } };
assert.equal((await a.pedir('/api/push/suscribir', { suscripcion: { ...sub, endpoint: 'https://malo.app/x' } })).estado, 400);
assert.equal((await a.pedir('/api/push/suscribir', { suscripcion: sub })).estado, 200);
r = await a.pedir('/api/push/probar', {});
console.log('     respuesta del servicio de Google a una suscripción inventada:', r.datos.estados);
assert.equal(r.datos.estados.length, 1);
paso('notificaciones: llave pública, suscripción y envío hasta el servicio de Google');

r = await a.pedir('/api/puente/secreto', {});
const secreto = r.datos.secreto;
assert.equal(secreto.length, 64);
assert.equal((await cliente().pedir('/api/puente', { secreto: 'x'.repeat(64), accion: 'pendientes' })).estado, 403);
const t2 = id();
await a.pedir('/api/sincronizar', { cursor: 0, cambios: [{ tabla: 'tareas', id: t2, datos: { titulo: 'Entrega e2e', fecha: '2031-06-01' } }] });
const puente = await fetch(BASE + '/api/puente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secreto, accion: 'pendientes' }) }).then((x) => x.json());
const trabajo = puente.trabajos.find((/** @type {any} */ t) => t.tipo === 'evento' && t.titulo === 'Entrega e2e');
assert.ok(trabajo, JSON.stringify(puente));
assert.equal(trabajo.accion, 'guardar');
await fetch(BASE + '/api/puente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secreto, accion: 'resultados', resultados: puente.trabajos.map((/** @type {any} */ t) => ({ id: t.id, ok: true, evento_id: 'ev-' + t.id })) }) });
r = await a.pedir('/api/sincronizar', { cursor: 0, cambios: [] });
assert.equal(r.datos.filas.tareas.find((/** @type {any} */ t) => t.id === t2).evento_id, 'ev-' + trabajo.id);
assert.equal((await a.pedir('/api/puente/estado')).datos.conectado, true);
await a.pedir('/api/puente/desconectar', {});
paso('puente de Google: secreto, trabajo de calendario y resultado guardado');

r = await a.pedir('/api/exportar');
assert.ok(r.datos.tareas.length >= 2);
r = await a.pedir('/api/actividad');
assert.ok(r.datos.cambios.length >= 4);
paso('respaldo y actividad');

assert.equal((await a.pedir('/api/dispositivos/revocar', { id: idB })).estado, 200);
r = await b.pedir('/api/estado');
assert.equal(r.estado, 401);
assert.equal(r.datos.error, 'revocado');
assert.equal((await b.pedir('/api/entrar/iniciar', { dispositivo: idB })).datos.error, 'revocado');
paso('dispositivo desvinculado: pierde el acceso al instante');

console.log(`\nTodo bien: ${pasos} pasos.`);
