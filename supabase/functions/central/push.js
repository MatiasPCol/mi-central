// Notificaciones Web Push: llaves VAPID, cifrado del mensaje (RFC 8291) y envío.
// Solo usa WebCrypto y fetch.

import { aB64u, deB64u, unir, codificador } from './util.js';

const SERVICIOS_PERMITIDOS = [
  /^fcm\.googleapis\.com$/,
  /\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
  /\.push\.apple\.com$/,
];

/** Solo se envía a servicios de notificaciones conocidos. @param {string} endpoint */
export function endpointPermitido(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && SERVICIOS_PERMITIDOS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

/** Crea el par de llaves del servidor. La privada se guarda en la base, nunca sale de ahí. */
export async function generarVapid() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const privada = await crypto.subtle.exportKey('jwk', par.privateKey);
  return { publica: aB64u(publica), privada };
}

/** @param {Uint8Array} sal @param {Uint8Array} material @param {Uint8Array} info @param {number} bytes */
async function hkdf(sal, material, info, bytes) {
  const llave = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, llave, bytes * 8));
}

/**
 * Cifra el mensaje para un navegador (aes128gcm).
 * @param {Uint8Array} publicaNavegador 65 bytes @param {Uint8Array} secretoAuth 16 bytes @param {Uint8Array} texto
 */
export async function cifrar(publicaNavegador, secretoAuth, texto) {
  if (publicaNavegador.length !== 65 || secretoAuth.length !== 16) throw new Error('suscripción inválida');
  if (texto.length > 3900) throw new Error('mensaje muy largo');
  const efimera = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicaServidor = new Uint8Array(await crypto.subtle.exportKey('raw', efimera.publicKey));
  const llaveNavegador = await crypto.subtle.importKey('raw', publicaNavegador, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: llaveNavegador }, efimera.privateKey, 256));

  const infoLlave = unir(codificador.encode('WebPush: info\0'), publicaNavegador, publicaServidor);
  const ikm = await hkdf(secretoAuth, compartido, infoLlave, 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, codificador.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, codificador.encode('Content-Encoding: nonce\0'), 12);

  const llaveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, llaveAes, unir(texto, new Uint8Array([2]))));

  const cabecera = new Uint8Array(16 + 4 + 1 + 65);
  cabecera.set(sal, 0);
  new DataView(cabecera.buffer).setUint32(16, 4096);
  cabecera[20] = 65;
  cabecera.set(publicaServidor, 21);
  return unir(cabecera, cifrado);
}

/** @param {string} endpoint @param {{ publica: string, privada: any }} vapid @param {string} sujeto */
export async function cabeceraVapid(endpoint, vapid, sujeto) {
  const llave = await crypto.subtle.importKey('jwk', vapid.privada, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cab = aB64u(codificador.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = aB64u(codificador.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: sujeto,
  })));
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llave, codificador.encode(`${cab}.${cuerpo}`)));
  return `vapid t=${cab}.${cuerpo}.${aB64u(firma)}, k=${vapid.publica}`;
}

/**
 * Envía una notificación. Devuelve el código HTTP del servicio (201 es entregado).
 * @param {{ endpoint: string, p256dh: string, auth: string }} suscripcion
 * @param {object} carga
 * @param {{ vapid: { publica: string, privada: any }, sujeto: string, urgencia?: string, tema?: string, ttl?: number }} opciones
 */
export async function enviarPush(suscripcion, carga, opciones) {
  if (!endpointPermitido(suscripcion.endpoint)) return 0;
  const cuerpo = await cifrar(deB64u(suscripcion.p256dh), deB64u(suscripcion.auth), codificador.encode(JSON.stringify(carga)));
  /** @type {Record<string, string>} */
  const cabeceras = {
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opciones.ttl ?? 86400),
    Urgency: opciones.urgencia ?? 'normal',
    Authorization: await cabeceraVapid(suscripcion.endpoint, opciones.vapid, opciones.sujeto),
  };
  if (opciones.tema) cabeceras.Topic = opciones.tema;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 10000);
  try {
    const r = await fetch(suscripcion.endpoint, { method: 'POST', headers: cabeceras, body: cuerpo, signal: control.signal });
    await r.arrayBuffer().catch(() => null);
    return r.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(reloj);
  }
}
