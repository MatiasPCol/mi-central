// Acciones de la pantalla. En el HTML se escribe data-a="nombre" y aquí está qué hace cada una.

import { E, pintar } from '../datos/estado.js';

/** @type {Record<string, (el: HTMLElement, ev: Event) => void>} */
export const acciones = {};

/** @param {Record<string, (el: HTMLElement, ev: Event) => void>} nuevas */
export function registrar(nuevas) {
  Object.assign(acciones, nuevas);
}

/** Cambia de pantalla. @param {string} destino por ejemplo "#/tareas" */
export function ir(destino) {
  if (location.hash === destino) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = destino;
}

/** Vuelve atrás; si no hay historial, va al destino dado. @param {string} destino */
export function volver(destino) {
  if (E.ui.pasos > 0) history.back();
  else location.replace(destino);
}

let relojToast = 0;
/** Mensaje corto abajo, con botón opcional. @param {string} texto @param {{ etiqueta: string, accion: () => void }} [boton] */
export function avisar(texto, boton) {
  E.ui.toast = { texto, etiqueta: boton?.etiqueta ?? '' };
  acciones['toast-boton'] = () => {
    boton?.accion();
    E.ui.toast = null;
    pintar();
  };
  clearTimeout(relojToast);
  relojToast = setTimeout(() => { E.ui.toast = null; pintar(); }, boton ? 6000 : 3000);
  pintar();
}
