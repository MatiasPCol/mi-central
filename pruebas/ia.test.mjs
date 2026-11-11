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
