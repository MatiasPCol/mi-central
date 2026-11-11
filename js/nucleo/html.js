// Plantillas HTML seguras y un "pintor" que cambia solo lo que cambió en la página.
// Uso:  html`<p>${texto}</p>`  → el texto siempre se escapa, así no se cuela código.

class Seguro {
  /** @param {string} s */
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

/** @param {unknown} v */
export function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** @param {unknown} v @returns {string} */
function valor(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Seguro) return v.s;
  if (Array.isArray(v)) return v.map(valor).join('');
  return esc(v);
}

/** @param {TemplateStringsArray} partes @param {...unknown} valores */
export function html(partes, ...valores) {
  let s = '';
  for (let i = 0; i < partes.length; i++) {
    s += partes[i];
    if (i < valores.length) s += valor(valores[i]);
  }
  return new Seguro(s);
}

/** @param {Node} n */
function clave(n) {
  return n instanceof Element ? (n.getAttribute('data-k') || n.id || null) : null;
}

/** @param {Element} viejo @param {Element} nuevo */
function atributos(viejo, nuevo) {
  for (const a of Array.from(viejo.attributes)) {
    if (!nuevo.hasAttribute(a.name)) viejo.removeAttribute(a.name);
  }
  for (const a of Array.from(nuevo.attributes)) {
    if (viejo.getAttribute(a.name) !== a.value) viejo.setAttribute(a.name, a.value);
  }
  const activo = document.activeElement === viejo;
  if (viejo instanceof HTMLInputElement && nuevo instanceof HTMLInputElement) {
    if (viejo.type === 'checkbox' || viejo.type === 'radio') viejo.checked = nuevo.hasAttribute('checked');
    else if (!activo && viejo.value !== (nuevo.getAttribute('value') ?? '')) viejo.value = nuevo.getAttribute('value') ?? '';
  } else if (viejo instanceof HTMLOptionElement) {
    viejo.selected = nuevo.hasAttribute('selected');
  }
}

/** @param {Node} viejo @param {Node} nuevo */
function nodo(viejo, nuevo) {
  if (viejo.nodeType !== 1) {
    if (viejo.nodeValue !== nuevo.nodeValue) viejo.nodeValue = nuevo.nodeValue;
    return;
  }
  const v = /** @type {Element} */ (viejo);
  const n = /** @type {Element} */ (nuevo);
  atributos(v, n);
  if (v instanceof HTMLTextAreaElement) {
    if (document.activeElement !== v && v.value !== n.textContent) v.value = n.textContent ?? '';
    return;
  }
  if (v.hasAttribute('data-fijo')) return;
  hijos(v, n);
}

/** @param {Node} viejo @param {Node} nuevo */
function hijos(viejo, nuevo) {
  /** @type {Map<string, Node>} */
  const porClave = new Map();
  for (const h of Array.from(viejo.childNodes)) {
    const k = clave(h);
    if (k) porClave.set(k, h);
  }
  let cursor = viejo.firstChild;
  for (const n of Array.from(nuevo.childNodes)) {
    const k = clave(n);
    /** @type {Node | null} */
    let par = null;
    if (k) {
      par = porClave.get(k) ?? null;
      if (par && par.nodeName !== n.nodeName) par = null;
      if (par) porClave.delete(k);
    } else {
      let c = cursor;
      while (c && clave(c)) c = c.nextSibling;
      if (c && c.nodeType === n.nodeType && c.nodeName === n.nodeName) par = c;
    }
    if (par) {
      if (par === cursor) cursor = cursor.nextSibling;
      else viejo.insertBefore(par, cursor);
      nodo(par, n);
    } else {
      viejo.insertBefore(n, cursor);
    }
  }
  while (cursor) {
    const sig = cursor.nextSibling;
    viejo.removeChild(cursor);
    cursor = sig;
  }
}

/** Deja `raiz` igual al HTML dado, tocando lo mínimo. @param {Element} raiz @param {Seguro | string} contenido */
export function pintarEn(raiz, contenido) {
  const t = document.createElement('template');
  t.innerHTML = String(contenido);
  hijos(raiz, t.content);
}
