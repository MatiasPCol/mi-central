// Un "celular simulado" para las pruebas: hace de huella (passkey) y de llave del dispositivo
// sin necesitar un teléfono de verdad.

import { aB64u, unir, sha256, codificador } from '../supabase/functions/central/util.js';

/** @param {Uint8Array} b */
function cborBytes(b) {
  if (b.length < 24) return unir(new Uint8Array([0x40 | b.length]), b);
  if (b.length < 256) return unir(new Uint8Array([0x58, b.length]), b);
  return unir(new Uint8Array([0x59, b.length >> 8, b.length & 255]), b);
}
/** @param {string} t */
function cborTexto(t) {
  const b = codificador.encode(t);
  return unir(new Uint8Array([0x60 | b.length]), b);
}

/** Firma r||s → formato DER, como la entregan los celulares. @param {Uint8Array} cruda */
function crudaADer(cruda) {
  const entero = (/** @type {Uint8Array} */ v) => {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0) i++;
    let x = v.slice(i);
    if (x[0] & 0x80) x = unir(new Uint8Array([0]), x);
    return unir(new Uint8Array([0x02, x.length]), x);
  };
  const cuerpo = unir(entero(cruda.slice(0, 32)), entero(cruda.slice(32)));
  return unir(new Uint8Array([0x30, cuerpo.length]), cuerpo);
}

/** @param {string} origen */
export async function crearHuellaSimulada(origen) {
  const rpId = new URL(origen).hostname;
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const cruda = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const id = crypto.getRandomValues(new Uint8Array(20));
  const hashSitio = await sha256(codificador.encode(rpId));
  let contador = 0;

  const datosCliente = (/** @type {string} */ tipo, /** @type {string} */ reto) =>
    codificador.encode(JSON.stringify({ type: tipo, challenge: reto, origin: origen, crossOrigin: false }));
  const contadorBytes = () => new Uint8Array([0, 0, (contador >> 8) & 255, contador & 255]);

  return {
    id: aB64u(id),
    /** @param {string} reto */
    async registrar(reto) {
      const cose = unir(
        new Uint8Array([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21]), cborBytes(cruda.slice(1, 33)),
        new Uint8Array([0x22]), cborBytes(cruda.slice(33, 65)));
      const authData = unir(hashSitio, new Uint8Array([0x45]), contadorBytes(), new Uint8Array(16),
        new Uint8Array([0, id.length]), id, cose);
      const objeto = unir(new Uint8Array([0xa3]), cborTexto('fmt'), cborTexto('none'),
        cborTexto('attStmt'), new Uint8Array([0xa0]), cborTexto('authData'), cborBytes(authData));
      return {
        id: aB64u(id),
        clientDataJSON: aB64u(datosCliente('webauthn.create', reto)),
        attestationObject: aB64u(objeto),
        transports: ['internal'],
      };
    },
    /** @param {string} reto */
    async usar(reto) {
      contador++;
      const cliente = datosCliente('webauthn.get', reto);
      const authData = unir(hashSitio, new Uint8Array([0x05]), contadorBytes());
      const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, par.privateKey,
        unir(authData, await sha256(cliente))));
      return {
        id: aB64u(id),
        clientDataJSON: aB64u(cliente),
        authenticatorData: aB64u(authData),
        signature: aB64u(crudaADer(firma)),
      };
    },
  };
}

/** Llave del dispositivo simulada. */
export async function crearDispositivoSimulado() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', par.publicKey);
  return {
    clave: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
    /** @param {Uint8Array} mensaje */
    async firmar(mensaje) {
      return aB64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, par.privateKey, mensaje));
    },
  };
}
