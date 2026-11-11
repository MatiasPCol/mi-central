// Prueba la ruta del asistente con una base y una IA de mentira: quién entra, qué se valida y cómo se explican los fallos.
// Uso: herramientas/node.sh --test pruebas/ia.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearServidor } from '../supabase/functions/central/servidor.js';

const ORIGEN = 'https://mi-central.vercel.app';
const bd = {
  /** @param {string} texto */
  async consulta(texto) {
    if (texto.includes(`config_leer('origenes')`)) return [{ r: [ORIGEN] }];
    if (texto.includes('central.sesion(')) return [{ r: { ok: true, dispositivo_id: 'd1', nombre: 'Prueba', con_huella: false } }];
    return [{ r: null }];
  },
};

/** @param {any} ia @param {any} cuerpo @param {Record<string, string>} [cabeceras] */
async function pedir(ia, cuerpo, cabeceras = { cookie: '__Host-mc_s=abc' }) {
  const manejar = crearServidor({ bd, prefijo: '/central', ia });
  const r = await manejar(new Request('https://x.test/central/api/ia', {
    method: 'POST', headers: { origin: ORIGEN, 'x-mc': '1', 'content-type': 'application/json', ...cabeceras }, body: JSON.stringify(cuerpo),
  }));
  return { estado: r.status, datos: await r.json() };
}

const pregunta = { mensajes: [{ rol: 'yo', texto: '¿Cómo voy?' }], contexto: 'Hoy es lunes.' };

test('sin llave avisa que la IA no está configurada', async () => {
  const r = await pedir(undefined, pregunta);
  assert.equal(r.estado, 503);
  assert.equal(r.datos.error, 'ia_sin_configurar');
});

test('responde y le pasa a la IA la conversación y el resumen', async () => {
  /** @type {any} */
  let recibido;
  const r = await pedir(async (/** @type {any} */ p) => { recibido = p; return { texto: 'Vas bien.' }; }, { ...pregunta, mensajes: [...pregunta.mensajes, { rol: 'ia', texto: 'Bien.' }, { rol: 'yo', texto: '¿Y la plata?', sobra: 1 }] });
  assert.equal(r.estado, 200);
  assert.equal(r.datos.texto, 'Vas bien.');
  assert.equal(recibido.contexto, 'Hoy es lunes.');
  assert.deepEqual(recibido.mensajes[2], { rol: 'yo', texto: '¿Y la plata?' });
});

test('rechaza conversaciones mal armadas', async () => {
  const ia = async () => ({ texto: 'no debería llegar' });
  for (const mensajes of [[], [{ rol: 'ia', texto: 'hola' }], [{ rol: 'yo', texto: '  ' }], [{ rol: 'otro', texto: 'hola' }], [{ rol: 'yo', texto: 'x'.repeat(8001) }]]) {
    const r = await pedir(ia, { mensajes, contexto: '' });
    assert.equal(r.datos.error, 'ia_pregunta_invalida', JSON.stringify(mensajes).slice(0, 60));
  }
});

test('un fallo de la IA llega con su código; cualquier otro es error interno', async () => {
  let r = await pedir(async () => { throw Object.assign(new Error('x'), { codigo: 'ia_ocupada', estado: 503 }); }, pregunta);
  assert.deepEqual([r.estado, r.datos.error], [503, 'ia_ocupada']);
  r = await pedir(async () => { throw new Error('se rompió'); }, pregunta);
  assert.deepEqual([r.estado, r.datos.error], [500, 'error_interno']);
});

test('sin sesión no se pregunta', async () => {
  const r = await pedir(async () => ({ texto: 'no' }), pregunta, {});
  assert.equal(r.estado, 401);
});

// ---------- El paso a Gemini, con un Google de mentira ----------

const { crearIA } = await import('../supabase/functions/central/ia.js');

/** @param {number} estado @param {any} cuerpo */
const google = (estado, cuerpo) => {
  /** @type {any} */
  const visto = {};
  const pedirFalso = async (/** @type {any} */ url, /** @type {any} */ op) => {
    Object.assign(visto, { url, cabeceras: op.headers, cuerpo: JSON.parse(op.body) });
    return new Response(JSON.stringify(cuerpo), { status: estado });
  };
  return { visto, ia: crearIA({ llave: 'llave-falsa', pedir: /** @type {any} */ (pedirFalso) }) };
};
const charla = { mensajes: [{ rol: 'yo', texto: 'hola' }, { rol: 'ia', texto: 'quiubo' }, { rol: 'yo', texto: '¿y la plata?' }], contexto: 'Tiene $ 5.000.' };

test('arma el pedido a Gemini y saca el texto', async () => {
  const g = google(200, { candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: 'Vas ' }, { text: 'bien.' }] }, finishReason: 'STOP' }] });
  assert.deepEqual(await g.ia(/** @type {any} */ (charla)), { texto: 'Vas bien.' });
  assert.match(g.visto.url, /\/v1beta\/models\/gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(g.visto.cabeceras['x-goog-api-key'], 'llave-falsa');
  assert.deepEqual(g.visto.cuerpo.contents.map((/** @type {any} */ c) => c.role), ['user', 'model', 'user']);
  assert.match(g.visto.cuerpo.systemInstruction.parts[0].text, /Tiene \$ 5\.000\.$/);
});

test('explica cada fallo de Gemini con su código', async () => {
  /** @type {[number, any, string][]} */
  const casos = [
    [429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }, 'ia_limite'],
    [400, { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid.' } }, 'ia_llave'],
    [403, { error: { message: 'denied' } }, 'ia_llave'],
    [503, { error: { message: 'overloaded' } }, 'ia_ocupada'],
    [404, { error: { message: 'model not found' } }, 'ia_fallo'],
    [200, { candidates: [] }, 'ia_fallo'],
  ];
  for (const [estado, cuerpo, codigo] of casos) {
    await assert.rejects(google(estado, cuerpo).ia(/** @type {any} */ (charla)), (/** @type {any} */ e) => e.codigo === codigo, `${estado} → ${codigo}`);
  }
});

test('si Google bloquea la pregunta o corta la respuesta, lo dice', async () => {
  let r = await google(200, { promptFeedback: { blockReason: 'SAFETY' } }).ia(/** @type {any} */ (charla));
  assert.match(r.texto, /no te puedo ayudar/);
  r = await google(200, { candidates: [{ content: { parts: [{ text: 'Mitad' }] }, finishReason: 'MAX_TOKENS' }] }).ia(/** @type {any} */ (charla));
  assert.match(r.texto, /^Mitad\n\n\(Se me cortó/);
});
