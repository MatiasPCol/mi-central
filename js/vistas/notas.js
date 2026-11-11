// Notas: rejilla con buscador y un editor a pantalla completa que guarda solo.

import { html } from '../nucleo/html.js';
import { E, filas, fila, guardar, borrar, restaurar, pintar } from '../datos/estado.js';
import { registrar, volver, avisar } from '../nucleo/acciones.js';
import { cabecera, icono, vacio, opciones } from './comun.js';
import { plano, hace, nuevoId, conPausa } from '../nucleo/util.js';

const COLORES = ['', 'amarillo', 'verde', 'azul', 'rosa', 'morado'];

/** @param {Record<string, any>} n */
function tarjeta(n) {
  const primera = n.contenido.split('\n').find((/** @type {string} */ l) => l.trim()) ?? '';
  return html`<a class="nota c-${n.color}" href="#/notas/${n.id}" data-k="n-${n.id}">
    <b>${n.fijada ? icono('pin') : ''}${n.titulo || primera.slice(0, 60) || 'Nota vacía'}</b>
    <p>${n.titulo ? n.contenido.slice(0, 220) : n.contenido.slice(primera.length).trim().slice(0, 220)}</p>
  </a>`;
}

function guardarBorrador() {
  const b = E.ui.borrador;
  // El borrador puede ser de otra pantalla si el guardado con pausa llega tarde.
  if (!b || E.ui.ruta?.vista !== 'notas' || typeof b.contenido !== 'string') return;
  if (!b.titulo.trim() && !b.contenido.trim() && !fila('notas', b.id)) return;
  guardar('notas', { id: b.id, titulo: b.titulo, contenido: b.contenido, fijada: b.fijada, color: b.color, materia_id: b.materia_id || null });
}
const guardarLuego = conPausa(guardarBorrador, 1200);

function editor() {
  const b = E.ui.borrador;
  const existe = fila('notas', b.id);
  const materias = filas('materias').sort((x, y) => x.nombre.localeCompare(y.nombre)).map((m) => ({ valor: m.id, texto: m.nombre }));
  return html`<div class="editor" data-k="editor">
    <div class="barra-editor">
      <button class="boton-icono" data-a="nota-cerrar" aria-label="Volver">${icono('atras')}</button>
      <span class="hueco">${existe ? `Guardada ${hace(existe.actualizado_en)}` : 'Nota nueva'}</span>
      <button class="boton-icono" data-a="nota-fijar" aria-label="Fijar" style="${b.fijada ? 'color:var(--acento)' : ''}">${icono('pin')}</button>
      <button class="boton-icono" data-a="nota-borrar" aria-label="Borrar">${icono('basura')}</button>
    </div>
    <div class="cuerpo-editor">
      <input class="titulo-nota" data-campo="titulo" data-i="nota-auto" value="${b.titulo}" placeholder="Título" maxlength="300" autocomplete="off">
      <textarea data-campo="contenido" data-i="nota-auto" placeholder="Escribe aquí…" maxlength="200000">${b.contenido}</textarea>
    </div>
    <div class="pie-editor">
      ${COLORES.map((c) => html`<button class="color c-${c} ${b.color === c ? 'activo' : ''}" data-a="nota-color" data-c="${c}" aria-label="Color ${c || 'normal'}"></button>`)}
      <select class="entrada" data-campo="materia_id" data-i="nota-auto" style="min-width:150px;min-height:38px;padding:6px 10px" aria-label="Materia">
        ${opciones([{ valor: '', texto: 'Sin materia' }, ...materias], b.materia_id)}
      </select>
    </div>
  </div>`;
}

export const vistaNotas = {
  /** @param {{ id: string | null }} ruta */
  alEntrar(ruta) {
    if (!ruta.id) { E.ui.borrador = null; return; }
    const n = ruta.id === 'nueva' ? null : fila('notas', ruta.id);
    if (ruta.id !== 'nueva' && !n) { E.ui.borrador = null; return; }
    E.ui.borrador = n
      ? { id: n.id, titulo: n.titulo, contenido: n.contenido, fijada: n.fijada, color: n.color, materia_id: n.materia_id }
      : { id: nuevoId(), titulo: E.ui.semilla?.titulo ?? '', contenido: E.ui.semilla?.contenido ?? '', fijada: false, color: '', materia_id: E.ui.semilla?.materia_id ?? null };
    if (!n && E.ui.semilla) guardarLuego();
    E.ui.semilla = null;
  },
  pintar() {
    if (E.ui.borrador) return editor();
    const q = plano(E.ui.buscarNotas ?? '');
    const lista = filas('notas')
      .filter((n) => !q || plano(`${n.titulo} ${n.contenido}`).includes(q))
      .sort((a, b) => Number(b.fijada) - Number(a.fijada) || b.actualizado_en.localeCompare(a.actualizado_en));
    return html`${cabecera('Notas')}
      <main class="contenido">
        <input class="entrada" type="search" data-campo-libre="buscar" data-i="notas-buscar" value="${E.ui.buscarNotas ?? ''}" placeholder="Buscar en tus notas" aria-label="Buscar en tus notas">
        <div class="seccion">
          ${lista.length ? html`<div class="rejilla">${lista.map(tarjeta)}</div>`
            : q ? vacio('Sin resultados', 'Ninguna nota tiene ese texto.') : vacio('Aún no hay notas', 'Toca + y escribe la primera.')}
        </div>
      </main>
      <a class="fab" href="#/notas/nueva" aria-label="Nueva nota">${icono('suma')}</a>`;
  },
};

registrar({
  'notas-buscar': (el) => { E.ui.buscarNotas = /** @type {HTMLInputElement} */ (el).value; pintar(); },
  'nota-auto': () => guardarLuego(),
  'nota-cerrar': () => { guardarBorrador(); volver('#/notas'); },
  'nota-fijar': () => { E.ui.borrador.fijada = !E.ui.borrador.fijada; guardarBorrador(); pintar(); },
  'nota-color': (el) => { E.ui.borrador.color = el.dataset.c ?? ''; guardarBorrador(); pintar(); },
  'nota-borrar': () => {
    const id = E.ui.borrador.id;
    const existia = !!fila('notas', id);
    E.ui.borrador.titulo = '';
    E.ui.borrador.contenido = '';
    if (existia) borrar('notas', id);
    volver('#/notas');
    if (existia) avisar('Nota borrada', { etiqueta: 'Deshacer', accion: () => restaurar('notas', id) });
  },
});

/** Guarda lo que haya en el editor antes de cambiar de pantalla o cerrar la app. */
export function guardarNotaAbierta() {
  if (E.ui.ruta?.vista === 'notas') guardarBorrador();
}
