// Fotos de notas y de tareas.
// Cada foto tiene una miniatura, que se sincroniza y se ve al instante, y la imagen completa,
// que se guarda en el dispositivo y en el servidor y solo se trae cuando se abre.

import { html } from '../nucleo/html.js';
import { E, filas, guardar, borrar, pintar } from '../datos/estado.js';
import * as almacen from '../datos/almacen.js';
import { pedir } from '../datos/api.js';
import { registrar } from '../nucleo/acciones.js';
import { icono } from './comun.js';
import { nuevoId } from '../nucleo/util.js';

/** @typedef {{ id?: string, mini: string, datos: string }} FotoNueva */

/** @param {File} archivo @returns {Promise<HTMLImageElement>} */
function cargar(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer esa foto.')); };
    img.src = url;
  });
}

/** Dibuja la imagen achicada y la devuelve como JPEG en texto. @param {HTMLImageElement} img @param {number} lado @param {number} calidad */
function dibujar(img, lado, calidad) {
  const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
  lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = /** @type {CanvasRenderingContext2D} */ (lienzo.getContext('2d'));
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL('image/jpeg', calidad);
}

/** Achica una foto del celular: una versión liviana y una miniatura. @param {File} archivo @returns {Promise<FotoNueva>} */
export async function achicar(archivo) {
  const img = await cargar(archivo);
  let lado = 1280;
  let calidad = 0.62;
  let datos = '';
  for (let intento = 0; intento < 5; intento++) {
    datos = dibujar(img, lado, calidad);
    if (datos.length < 420000) break;
    lado = Math.round(lado * 0.82);
    calidad -= 0.07;
  }
  if (datos.length < 100 || datos.length > 650000) throw new Error('La foto es demasiado grande.');
  return { datos, mini: dibujar(img, 220, 0.5) };
}

/** Fotos de una nota o de una tarea, de la más vieja a la más nueva. @param {'nota_id' | 'tarea_id'} campo @param {string} id */
export function fotosDe(campo, id) {
  return filas('fotos').filter((f) => f[campo] === id).sort((a, b) => (a.creado_en ?? '').localeCompare(b.creado_en ?? ''));
}

/**
 * Guarda una foto nueva en una nota o en una tarea.
 * @param {{ nota_id?: string, tarea_id?: string }} de @param {FotoNueva} foto @param {string} [id]
 */
export function guardarFoto(de, foto, id = nuevoId()) {
  if (!E.demo) almacen.escribir(`foto:${id}`, foto.datos).catch(() => {});
  guardar('fotos', { id, nota_id: de.nota_id ?? null, tarea_id: de.tarea_id ?? null, mini: foto.mini, datos: foto.datos });
  return id;
}

/** La foto completa: de la memoria, del dispositivo o, si hace falta, del servidor. @param {string} id @returns {Promise<string | null>} */
export async function leerFoto(id) {
  const f = E.tablas.fotos.get(id);
  if (f?.datos) return f.datos;
  if (E.demo) return f?.mini ?? null;
  const local = await almacen.leer(`foto:${id}`).catch(() => null);
  if (local) return local;
  const r = await pedir('/sincronizar', { cursor: E.cursor, cambios: [{ tabla: 'fotos', id, leer: true }] });
  const datos = r.fotos_completas?.[0]?.datos ?? null;
  if (datos) almacen.escribir(`foto:${id}`, datos).catch(() => {});
  return datos;
}

/** Cuadrícula de miniaturas. Tocar una la abre en grande. @param {Record<string, any>[]} fotos */
export function galeria(fotos) {
  if (!fotos.length) return '';
  return html`<div class="fotos">${fotos.map((f) => html`<button type="button" data-a="foto-ver" data-id="${f.id}" data-k="f-${f.id}" aria-label="Ver foto">
    <img src="${f.mini || f.datos}" alt="Foto"></button>`)}</div>`;
}

/** La foto abierta en grande, con el botón para borrarla. */
export function visor() {
  const v = E.ui.foto;
  if (!v) return '';
  return html`<div class="visor" data-a="foto-cerrar" data-k="visor">
    <img src="${v.datos || v.mini}" alt="Foto en grande" class="${v.datos ? '' : 'borrosa'}">
    ${v.cargando ? html`<span class="rotulo">Cargando la foto…</span>` : v.aviso ? html`<span class="rotulo">${v.aviso}</span>` : ''}
    <button type="button" class="boton peligro" data-a="foto-borrar" data-id="${v.id}">${icono('basura')} Borrar foto</button>
  </div>`;
}

registrar({
  'foto-ver': (el) => {
    const id = /** @type {string} */ (el.dataset.id);
    const sinGuardar = (E.ui.borrador?.fotosNuevas ?? []).find((/** @type {any} */ x) => x.id === id);
    const f = sinGuardar ?? E.tablas.fotos.get(id);
    if (!f) return;
    const v = { id, mini: f.mini || f.datos || '', datos: f.datos ?? null, cargando: !f.datos, aviso: '' };
    E.ui.foto = v;
    pintar();
    if (v.datos) return;
    leerFoto(id)
      .then((d) => { if (d) v.datos = d; else v.aviso = 'No se encontró la foto completa.'; })
      .catch(() => { v.aviso = 'Sin conexión: se ve en baja calidad.'; })
      .finally(() => { v.cargando = false; if (E.ui.foto === v) pintar(); });
  },
  'foto-cerrar': () => { E.ui.foto = null; pintar(); },
  'foto-borrar': (el) => {
    const id = /** @type {string} */ (el.dataset.id);
    const b = E.ui.borrador;
    if (b?.fotosNuevas?.some((/** @type {any} */ x) => x.id === id)) {
      b.fotosNuevas = b.fotosNuevas.filter((/** @type {any} */ x) => x.id !== id);
    } else {
      borrar('fotos', id);
      if (!E.demo) almacen.quitar(`foto:${id}`).catch(() => {});
    }
    E.ui.foto = null;
    pintar();
  },
});
