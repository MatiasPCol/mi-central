// Quién puede entrar: solo dispositivos vinculados.
// Cada dispositivo tiene una llave privada que no se puede copiar, y si quiere, la huella encima.

import * as almacen from '../datos/almacen.js';
import { pedir, ErrorApi } from '../datos/api.js';
import { E, pintar, cargarLocal, vaciar, sincronizar } from '../datos/estado.js';

const texto = new TextEncoder();

/** @param {ArrayBuffer | Uint8Array} datos */
function aB64u(datos) {
  const b = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** @param {string} t */
function deB64u(t) {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

/** @type {CryptoKeyPair | null} */
let llaves = null;

/** Firma el reto con la llave del dispositivo. @param {string} tipo @param {string} retoId @param {string} reto */
async function firmar(tipo, retoId, reto) {
  if (!llaves) throw new Error('Este dispositivo no tiene llave.');
  const prefijo = texto.encode(`mi-central:${tipo}:${retoId}:`);
  const r = deB64u(reto);
  const mensaje = new Uint8Array(prefijo.length + r.length);
  mensaje.set(prefijo);
  mensaje.set(r, prefijo.length);
  return aB64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llaves.privateKey, mensaje));
}

export async function hayHuella() {
  try {
    return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Crea la huella (passkey) de este dispositivo.
 * @param {{ reto: string, usuario_id: string, rp_id: string, credenciales: { id: string, transportes: string[] }[] }} d
 * @returns {Promise<{ huella: any, ya_tenia_huella: boolean }>}
 */
async function crearHuella(d) {
  try {
    const c = /** @type {PublicKeyCredential} */ (await navigator.credentials.create({
      publicKey: {
        challenge: deB64u(d.reto),
        rp: { name: 'Mi Central', id: d.rp_id },
        user: { id: deB64u(d.usuario_id), name: 'matias', displayName: 'Matias' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        excludeCredentials: d.credenciales.map((x) => ({ type: 'public-key', id: deB64u(x.id) })),
        attestation: 'none',
        timeout: 120000,
      },
    }));
    const r = /** @type {AuthenticatorAttestationResponse} */ (c.response);
    return {
      ya_tenia_huella: false,
      huella: { id: c.id, clientDataJSON: aB64u(r.clientDataJSON), attestationObject: aB64u(r.attestationObject), transports: r.getTransports?.() ?? [] },
    };
  } catch (e) {
    // El teléfono ya tiene la huella de Mi Central guardada (por ejemplo, sincronizada con tu cuenta).
    if (e instanceof DOMException && e.name === 'InvalidStateError') return { huella: null, ya_tenia_huella: true };
    throw e;
  }
}

/** @param {{ reto: string, rp_id: string, credenciales: { id: string, transportes: string[] }[] }} d */
async function usarHuella(d) {
  const c = /** @type {PublicKeyCredential} */ (await navigator.credentials.get({
    publicKey: {
      challenge: deB64u(d.reto),
      rpId: d.rp_id,
      allowCredentials: d.credenciales.map((x) => ({ type: 'public-key', id: deB64u(x.id), transports: /** @type {any} */ (x.transportes) })),
      userVerification: 'required',
      timeout: 120000,
    },
  }));
  const r = /** @type {AuthenticatorAssertionResponse} */ (c.response);
  return { id: c.id, clientDataJSON: aB64u(r.clientDataJSON), authenticatorData: aB64u(r.authenticatorData), signature: aB64u(r.signature) };
}

/** @param {{ id: string, nombre: string, con_huella: boolean }} dispositivo */
async function recordar(dispositivo) {
  E.dispositivo = dispositivo;
  await almacen.escribir('dispositivo', { ...dispositivo, llaves });
}

/** Arranque: mira si este dispositivo ya está vinculado y si la sesión sigue viva. */
export async function iniciar() {
  const guardado = await almacen.leer('dispositivo').catch(() => null);
  if (!guardado?.id || !guardado.llaves) {
    E.modo = 'vincular';
    pintar();
    return;
  }
  llaves = guardado.llaves;
  E.dispositivo = { id: guardado.id, nombre: guardado.nombre, con_huella: !!guardado.con_huella };
  await cargarLocal();
  E.modo = 'app';
  pintar();
  try {
    const r = await pedir('/estado');
    await recordar(r.dispositivo);
    sincronizar();
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 401) await sinSesion(e.codigo);
    else if (e instanceof ErrorApi && e.estado === 0) { E.enLinea = false; pintar(); }
  }
}

/** El servidor dice que no hay sesión. @param {string} codigo */
export async function sinSesion(codigo) {
  if (E.demo) return;
  if (codigo === 'revocado' || codigo === 'no_vinculado') {
    await olvidar();
    E.ui.aviso = 'Este dispositivo fue desvinculado. Sus datos locales se borraron.';
    pintar();
    return;
  }
  // Sin huella, el dispositivo vuelve a entrar solo con su llave. Con huella, pide tocar el botón.
  if (E.dispositivo && !E.dispositivo.con_huella) {
    try {
      await entrar();
      return;
    } catch (e) {
      if (e instanceof ErrorApi && (e.codigo === 'revocado' || e.codigo === 'no_vinculado')) return sinSesion(e.codigo);
    }
  }
  E.modo = 'bloqueada';
  pintar();
}

/** Vuelve a entrar con la llave del dispositivo (y la huella si la tiene). */
export async function entrar() {
  if (!E.dispositivo) throw new Error('Dispositivo sin vincular.');
  const d = await pedir('/entrar/iniciar', { dispositivo: E.dispositivo.id });
  const cuerpo = { reto_id: d.reto_id, firma: await firmar('entrar', d.reto_id, d.reto), huella: /** @type {any} */ (null) };
  if (d.con_huella) cuerpo.huella = await usarHuella(d);
  const r = await pedir('/entrar/terminar', cuerpo);
  await recordar(r.dispositivo);
  E.modo = 'app';
  pintar();
  sincronizar();
}

/** Vincula este dispositivo con un código. @param {string} codigo @param {string} nombre @param {boolean} conHuella */
export async function vincular(codigo, nombre, conHuella) {
  llaves = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', llaves.publicKey);
  const d = await pedir('/vincular/iniciar', { codigo, nombre, clave: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } });
  const h = conHuella ? await crearHuella(d) : { huella: null, ya_tenia_huella: false };
  const r = await pedir('/vincular/terminar', { reto_id: d.reto_id, firma: await firmar('vincular', d.reto_id, d.reto), ...h });
  vaciar();
  await recordar(r.dispositivo);
  E.modo = 'app';
  E.ui = {};
  pintar();
  sincronizar();
}

/** Activa la huella en un dispositivo que entró sin ella. */
export async function activarHuella() {
  const d = await pedir('/huella/iniciar', {});
  const h = await crearHuella(d);
  await pedir('/huella/terminar', { reto_id: d.reto_id, ...h });
  if (E.dispositivo) await recordar({ ...E.dispositivo, con_huella: true });
  pintar();
}

/** Borra todo lo de Mi Central en este dispositivo. */
export async function olvidar() {
  llaves = null;
  E.dispositivo = null;
  vaciar();
  await almacen.borrarTodo().catch(() => {});
  E.modo = 'vincular';
  E.ui = {};
  pintar();
}

/** Desvincula este dispositivo: el servidor lo revoca y aquí se borra todo. */
export async function desvincularEste() {
  if (E.dispositivo) await pedir('/dispositivos/revocar', { id: E.dispositivo.id }).catch(() => {});
  await olvidar();
}
