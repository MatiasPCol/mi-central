// Piezas que usan varias pantallas: iconos, cabecera, hoja inferior.

import { html } from '../nucleo/html.js';
import { E } from '../datos/estado.js';

/** @type {Record<string, string>} */
const TRAZOS = {
  casa: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  tareas: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10"/>',
  nota: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  meta: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  mas: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  suma: '<path d="M12 5v14M5 12h14"/>',
  si: '<path d="M5 12l5 5 9-10"/>',
  atras: '<path d="M15 5l-7 7 7 7"/>',
  basura: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  pin: '<path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z"/>',
  flecha: '<path d="M9 5l7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};

class Marca { /** @param {string} s */ constructor(s) { this.s = s; } toString() { return this.s; } }

/** @param {string} nombre */
export function icono(nombre) {
  // Se arma con trazos fijos de este archivo, nunca con texto del usuario.
  return html([`<svg viewBox="0 0 24 24" aria-hidden="true">${TRAZOS[nombre] ?? ''}</svg>`]);
}

/** @param {string} titulo @param {{ atras?: string, sub?: string }} [op] */
export function cabecera(titulo, op = {}) {
  const pendientes = E.pendientes.size;
  const clase = !E.enLinea ? 'mal' : pendientes > 0 || E.sincronizando ? 'espera' : '';
  const texto = E.demo ? 'Demostración' : !E.enLinea ? 'Sin conexión' : pendientes > 0 ? `${pendientes} por subir` : 'Al día';
  return html`<header class="cabecera">
    ${op.atras ? html`<a class="boton-icono" href="${op.atras}" aria-label="Volver">${icono('atras')}</a>` : ''}
    <h1>${titulo}${op.sub ? html` <span class="sub">${op.sub}</span>` : ''}</h1>
    <span class="estado-sync"><i class="punto ${clase}"></i>${texto}</span>
  </header>`;
}

/** Hoja que sube desde abajo. Tocar fuera la cierra. @param {string} titulo @param {unknown} cuerpo */
export function hoja(titulo, cuerpo) {
  return html`<div class="velo" data-a="cerrar-hoja" data-k="velo">
    <section class="hoja" role="dialog" aria-label="${titulo}">
      <h2>${titulo}<button class="boton-icono" data-a="cerrar-hoja" aria-label="Cerrar">${icono('x')}</button></h2>
      ${cuerpo}
    </section>
  </div>`;
}

/** @param {string} titulo @param {string} texto */
export function vacio(titulo, texto) {
  return html`<div class="vacio"><b>${titulo}</b>${texto}</div>`;
}

/** Opciones de un <select>. @param {{ valor: string, texto: string }[]} opciones @param {string | null | undefined} elegido */
export function opciones(opciones, elegido) {
  return opciones.map((o) => (o.valor === (elegido ?? '')
    ? html`<option value="${o.valor}" selected>${o.texto}</option>`
    : html`<option value="${o.valor}">${o.texto}</option>`));
}

export { Marca };
