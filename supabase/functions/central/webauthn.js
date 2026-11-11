// Verificación de la llave del dispositivo y de la huella (WebAuthn / passkeys).
// Solo usa WebCrypto, así que corre igual en el servidor y en las pruebas.

import { aB64u, deB64u, unir, sha256, iguales, codificador, decodificador } from './util.js';

// ---------- CBOR mínimo (lo que usa WebAuthn) ----------

/** @param {Uint8Array} b @param {number} pos @returns {[any, number]} */
export function leerCbor(b, pos = 0) {
  if (pos >= b.length) throw new Error('cbor: fin inesperado');
  const inicial = b[pos++];
  const tipo = inicial >> 5;
  const info = inicial & 31;
  let n = info;
  if (info === 24) n = b[pos++];
  else if (info === 25) { n = (b[pos] << 8) | b[pos + 1]; pos += 2; }
  else if (info === 26) { n = b[pos] * 16777216 + ((b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3]); pos += 4; }
  else if (info === 27) {
    let v = 0;
    for (let i = 0; i < 8; i++) v = v * 256 + b[pos + i];
    n = v; pos += 8;
  } else if (info > 27) throw new Error('cbor: longitud no soportada');

  if (tipo === 0) return [n, pos];
  if (tipo === 1) return [-1 - n, pos];
  if (tipo === 2 || tipo === 3) {
    if (pos + n > b.length) throw new Error('cbor: fin inesperado');
    const trozo = b.slice(pos, pos + n);
    return [tipo === 2 ? trozo : decodificador.decode(trozo), pos + n];
  }
  if (tipo === 4) {
    const lista = [];
    for (let i = 0; i < n; i++) { const [v, p] = leerCbor(b, pos); lista.push(v); pos = p; }
    return [lista, pos];
  }
  if (tipo === 5) {
    const mapa = new Map();
    for (let i = 0; i < n; i++) {
      const [k, p1] = leerCbor(b, pos);
      const [v, p2] = leerCbor(b, p1);
      mapa.set(k, v); pos = p2;
    }
    return [mapa, pos];
  }
  if (tipo === 6) return leerCbor(b, pos);
  if (tipo === 7) {
    if (info === 20) return [false, pos];
    if (info === 21) return [true, pos];
    if (info === 22 || info === 23) return [null, pos];
  }
  throw new Error('cbor: tipo no soportado');
}

// ---------- Piezas de WebAuthn ----------

/** @param {Uint8Array} ad */
function leerDatosAutenticador(ad) {
  if (ad.length < 37) throw new Error('datos del autenticador muy cortos');
  const banderas = ad[32];
  const r = {
    rpIdHash: ad.slice(0, 32),
    presente: (banderas & 0x01) !== 0,
    verificado: (banderas & 0x04) !== 0,
    conCredencial: (banderas & 0x40) !== 0,
    contador: ad[33] * 16777216 + ((ad[34] << 16) | (ad[35] << 8) | ad[36]),
    /** @type {Uint8Array | null} */ idCredencial: null,
    /** @type {Map<number, any> | null} */ cose: null,
  };
  if (r.conCredencial) {
    const largo = (ad[53] << 8) | ad[54];
    r.idCredencial = ad.slice(55, 55 + largo);
    const [cose] = leerCbor(ad, 55 + largo);
    r.cose = cose;
  }
  return r;
}

/** Llave COSE → JWK. Acepta ES256 (celulares) y RS256 (Windows Hello). @param {Map<number, any>} cose */
function coseAJwk(cose) {
  const alg = cose.get(3);
  if (cose.get(1) === 2 && alg === -7 && cose.get(-1) === 1) {
    const x = cose.get(-2), y = cose.get(-3);
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) throw new Error('llave EC inválida');
    return { alg, jwk: { kty: 'EC', crv: 'P-256', x: aB64u(x), y: aB64u(y) } };
  }
  if (cose.get(1) === 3 && alg === -257) {
    const n = cose.get(-1), e = cose.get(-2);
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length < 256) throw new Error('llave RSA inválida');
    return { alg, jwk: { kty: 'RSA', n: aB64u(n), e: aB64u(e) } };
  }
  throw new Error('algoritmo de llave no soportado');
}

/** @param {any} jwk @param {number} alg */
async function importarLlave(jwk, alg) {
  if (alg === -7) {
    return await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  if (alg === -257) {
    return await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256' }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  throw new Error('algoritmo no soportado');
}

/** Firma ECDSA en formato DER → r||s de 64 bytes. @param {Uint8Array} der */
export function derACruda(der) {
  let p = 0;
  if (der[p++] !== 0x30) throw new Error('firma DER inválida');
  if (der[p] & 0x80) p += 1 + (der[p] & 0x7f); else p += 1;
  const leerEntero = () => {
    if (der[p++] !== 0x02) throw new Error('firma DER inválida');
    const largo = der[p++];
    let v = der.slice(p, p + largo);
    p += largo;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) throw new Error('firma DER inválida');
    const salida = new Uint8Array(32);
    salida.set(v, 32 - v.length);
    return salida;
  };
  const r = leerEntero();
  const s = leerEntero();
  return unir(r, s);
}

/**
 * @param {string} clientDataB64 @param {'webauthn.create' | 'webauthn.get'} tipo
 * @param {string} retoB64 @param {string[]} origenes
 */
function revisarDatosCliente(clientDataB64, tipo, retoB64, origenes) {
  const bytes = deB64u(clientDataB64);
  const datos = JSON.parse(decodificador.decode(bytes));
  if (datos.type !== tipo) throw new Error('tipo de operación incorrecto');
  if (datos.challenge !== retoB64) throw new Error('el reto no coincide');
  if (!origenes.includes(datos.origin)) throw new Error('origen no permitido');
  if (datos.crossOrigin === true) throw new Error('origen cruzado no permitido');
  return { bytes, origen: /** @type {string} */ (datos.origin) };
}

/**
 * Revisa una huella recién creada y devuelve la credencial para guardar.
 * @param {{ id: string, clientDataJSON: string, attestationObject: string, transports?: string[] }} huella
 * @param {{ reto: string, origenes: string[] }} esperado
 */
export async function verificarRegistro(huella, esperado) {
  const { origen } = revisarDatosCliente(huella.clientDataJSON, 'webauthn.create', esperado.reto, esperado.origenes);
  const rpId = new URL(origen).hostname;
  const [objeto] = leerCbor(deB64u(huella.attestationObject));
  const datosAut = objeto instanceof Map ? objeto.get('authData') : null;
  if (!(datosAut instanceof Uint8Array)) throw new Error('falta authData');
  const ad = leerDatosAutenticador(datosAut);
  if (!iguales(ad.rpIdHash, await sha256(codificador.encode(rpId)))) throw new Error('sitio incorrecto');
  if (!ad.presente || !ad.verificado) throw new Error('falta verificación del usuario');
  if (!ad.idCredencial || !ad.cose) throw new Error('falta la credencial');
  if (aB64u(ad.idCredencial) !== huella.id) throw new Error('el id de la credencial no coincide');
  const { alg, jwk } = coseAJwk(ad.cose);
  await importarLlave(jwk, alg);
  const transportes = Array.isArray(huella.transports) ? huella.transports.filter((t) => typeof t === 'string').slice(0, 6) : [];
  return { id: huella.id, clave: jwk, algoritmo: alg, contador: ad.contador, transportes, rpId };
}

/**
 * Revisa el uso de una huella ya registrada.
 * @param {{ id: string, clientDataJSON: string, authenticatorData: string, signature: string }} huella
 * @param {{ reto: string, origenes: string[], clave: any, algoritmo: number, contador: number }} esperado
 */
export async function verificarAfirmacion(huella, esperado) {
  const { bytes, origen } = revisarDatosCliente(huella.clientDataJSON, 'webauthn.get', esperado.reto, esperado.origenes);
  const rpId = new URL(origen).hostname;
  const datosAut = deB64u(huella.authenticatorData);
  const ad = leerDatosAutenticador(datosAut);
  if (!iguales(ad.rpIdHash, await sha256(codificador.encode(rpId)))) throw new Error('sitio incorrecto');
  if (!ad.presente || !ad.verificado) throw new Error('falta verificación del usuario');
  const firmado = unir(datosAut, await sha256(bytes));
  const llave = await importarLlave(esperado.clave, esperado.algoritmo);
  const firma = deB64u(huella.signature);
  const ok = esperado.algoritmo === -7
    ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, llave, derACruda(firma), firmado)
    : await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, llave, firma, firmado);
  if (!ok) throw new Error('firma de huella inválida');
  if ((ad.contador > 0 || esperado.contador > 0) && ad.contador <= esperado.contador) throw new Error('contador de huella repetido');
  return { contador: ad.contador };
}

// ---------- Llave del dispositivo ----------

/** Mensaje que firma el dispositivo: contexto + reto. @param {string} tipo @param {string} retoId @param {string} retoB64 */
export function mensajeDispositivo(tipo, retoId, retoB64) {
  return unir(codificador.encode(`mi-central:${tipo}:${retoId}:`), deB64u(retoB64));
}

/** @param {any} jwk @param {string} firmaB64 @param {Uint8Array} mensaje */
export async function verificarFirmaDispositivo(jwk, firmaB64, mensaje) {
  const llave = await importarLlave(jwk, -7);
  const firma = deB64u(firmaB64);
  if (firma.length !== 64) return false;
  return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, llave, firma, mensaje);
}
