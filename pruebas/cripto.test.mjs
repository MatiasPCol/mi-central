// Pruebas de la parte criptográfica del servidor con un "celular simulado".
// Correr: herramientas/node.sh --test pruebas/

import test from 'node:test';
import assert from 'node:assert/strict';
import { aB64u, deB64u, unir, sha256, codificador, decodificador } from '../supabase/functions/central/util.js';
import { verificarRegistro, verificarAfirmacion, mensajeDispositivo, verificarFirmaDispositivo } from '../supabase/functions/central/webauthn.js';
import { cifrar, generarVapid, cabeceraVapid, endpointPermitido } from '../supabase/functions/central/push.js';
import { crearHuellaSimulada } from './simulador.mjs';

const ORIGEN = 'https://mi-central.vercel.app';

test('la llave del dispositivo firma y el servidor la reconoce', async () => {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', par.publicKey);
  const reto = aB64u(crypto.getRandomValues(new Uint8Array(32)));
  const mensaje = mensajeDispositivo('entrar', 'abc', reto);
  const firma = aB64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, par.privateKey, mensaje));
  assert.equal(await verificarFirmaDispositivo(jwk, firma, mensaje), true);
  assert.equal(await verificarFirmaDispositivo(jwk, firma, mensajeDispositivo('vincular', 'abc', reto)), false);
});

test('huella: registro y uso correctos, y rechazo de los falsos', async () => {
  const huella = await crearHuellaSimulada(ORIGEN);
  const reto = aB64u(crypto.getRandomValues(new Uint8Array(32)));
  const cred = await verificarRegistro(await huella.registrar(reto), { reto, origenes: [ORIGEN] });
  assert.equal(cred.algoritmo, -7);
  assert.equal(cred.rpId, 'mi-central.vercel.app');

  const reto2 = aB64u(crypto.getRandomValues(new Uint8Array(32)));
  const uso = await huella.usar(reto2);
  const base = { reto: reto2, origenes: [ORIGEN], clave: cred.clave, algoritmo: cred.algoritmo, contador: 0 };
  assert.equal((await verificarAfirmacion(uso, base)).contador, 1);

  await assert.rejects(verificarAfirmacion(uso, { ...base, reto }), /reto/);
  await assert.rejects(verificarAfirmacion(uso, { ...base, origenes: ['https://otro.app'] }), /origen/);
  await assert.rejects(verificarAfirmacion(uso, { ...base, contador: 5 }), /contador/);
  const otra = await crearHuellaSimulada(ORIGEN);
  const credOtra = await verificarRegistro(await otra.registrar(reto), { reto, origenes: [ORIGEN] });
  await assert.rejects(verificarAfirmacion(uso, { ...base, clave: credOtra.clave }), /firma/);
  const falsa = await crearHuellaSimulada('https://sitio-falso.app');
  await assert.rejects(verificarRegistro(await falsa.registrar(reto), { reto, origenes: [ORIGEN] }), /origen/);
});

test('notificación: lo que se cifra lo puede leer solo el celular', async () => {
  const celular = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', celular.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const texto = JSON.stringify({ t: 'Nueva tarea', c: 'Estudiar física · ñandú' });
  const cuerpo = await cifrar(publica, auth, codificador.encode(texto));

  // Descifrado hecho aparte, siguiendo el RFC 8291 desde el lado del celular.
  const sal = cuerpo.slice(0, 16);
  assert.equal(new DataView(cuerpo.buffer).getUint32(16), 4096);
  assert.equal(cuerpo[20], 65);
  const publicaServidor = cuerpo.slice(21, 86);
  const hkdf = async (s, m, info, n) => new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', m, 'HKDF', false, ['deriveBits']), n * 8));
  const llaveServidor = await crypto.subtle.importKey('raw', publicaServidor, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: llaveServidor }, celular.privateKey, 256));
  const ikm = await hkdf(auth, compartido, unir(codificador.encode('WebPush: info\0'), publica, publicaServidor), 32);
  const cek = await hkdf(sal, ikm, codificador.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, codificador.encode('Content-Encoding: nonce\0'), 12);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce },
    await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cuerpo.slice(86)));
  assert.equal(claro[claro.length - 1], 2);
  assert.equal(decodificador.decode(claro.slice(0, -1)), texto);
});

test('VAPID: la firma del servidor es válida y solo se envía a servicios conocidos', async () => {
  const vapid = await generarVapid();
  const cab = await cabeceraVapid('https://fcm.googleapis.com/fcm/send/abc', vapid, ORIGEN);
  const [, jwt, k] = /** @type {RegExpMatchArray} */ (cab.match(/^vapid t=([^,]+), k=(.+)$/));
  const [c, p, f] = jwt.split('.');
  const llave = await crypto.subtle.importKey('raw', deB64u(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, llave, deB64u(f), codificador.encode(`${c}.${p}`)), true);
  assert.equal(JSON.parse(decodificador.decode(deB64u(p))).aud, 'https://fcm.googleapis.com');
  assert.equal(endpointPermitido('https://fcm.googleapis.com/fcm/send/x'), true);
  assert.equal(endpointPermitido('https://updates.push.services.mozilla.com/wpush/v2/x'), true);
  assert.equal(endpointPermitido('https://ejemplo.com/x'), false);
  assert.equal(endpointPermitido('http://fcm.googleapis.com/x'), false);
  assert.equal((await sha256(new Uint8Array(0))).length, 32);
});
