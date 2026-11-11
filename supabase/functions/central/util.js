// Utilidades de bytes. Funcionan igual en el servidor (Deno), en Node y en el navegador.

export const codificador = new TextEncoder();
export const decodificador = new TextDecoder();

/** @param {Uint8Array | ArrayBuffer} datos */
export function aB64u(datos) {
  const b = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} texto */
export function deB64u(texto) {
  if (typeof texto !== 'string' || !/^[A-Za-z0-9_-]*$/.test(texto)) throw new Error('base64url inválido');
  const s = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

/** @param {...Uint8Array} partes */
export function unir(...partes) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const r = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    r.set(p, pos);
    pos += p.length;
  }
  return r;
}

/** @param {Uint8Array} datos */
export async function sha256(datos) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', datos));
}

/** @param {Uint8Array} a @param {Uint8Array} b */
export function iguales(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
