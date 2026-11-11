// Metas a futuro: cada una con su plazo, sus pasos y las tareas que la empujan.

import { html } from '../nucleo/html.js';
import { E, filas, fila, guardar, borrar, restaurar, pintar } from '../datos/estado.js';
import { registrar, volver, avisar, ir } from '../nucleo/acciones.js';
import { cabecera, hoja, icono, vacio } from './comun.js';
import { filaTarea } from './tareas.js';
import { fechaCorta, nuevoId } from '../nucleo/util.js';

const PLAZOS = [['corto', 'Corto plazo'], ['mediano', 'Mediano plazo'], ['largo', 'Largo plazo']];
const ESTADOS = [['activa', 'Activa'], ['pausada', 'En pausa'], ['lograda', 'Lograda']];

/** Avance de una meta: por pasos, o por sus tareas si no tiene pasos. @param {Record<string, any>} m */
export function progresoMeta(m) {
  if (m.estado === 'lograda') return { porciento: 100, texto: 'Meta lograda' };
  const pasos = Array.isArray(m.pasos) ? m.pasos : [];
  if (pasos.length) {
    const hechos = pasos.filter((p) => p.hecho).length;
    return { porciento: Math.round((hechos / pasos.length) * 100), texto: `${hechos} de ${pasos.length} pasos` };
  }
  const tareas = filas('tareas').filter((t) => t.meta_id === m.id);
  if (tareas.length) {
    const hechas = tareas.filter((t) => t.hecha).length;
    return { porciento: Math.round((hechas / tareas.length) * 100), texto: `${hechas} de ${tareas.length} tareas` };
  }
  return { porciento: 0, texto: 'Agrega pasos para medir el avance' };
}

/** @param {Record<string, any>} m */
function tarjeta(m) {
  const p = progresoMeta(m);
  const plazo = PLAZOS.find(([v]) => v === m.plazo)?.[1] ?? '';
  return html`<a class="tarjeta" href="#/metas/${m.id}" data-k="m-${m.id}" style="display:block;color:inherit">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:start">
      <b style="font-size:17px">${m.titulo || '(sin título)'}</b>
      <span class="etiqueta ${m.estado === 'lograda' ? 'bien' : m.estado === 'pausada' ? 'ojo' : ''}">${m.estado === 'activa' ? plazo : ESTADOS.find(([v]) => v === m.estado)?.[1]}</span>
    </div>
    <div class="barra" style="margin:12px 0 6px"><i style="width:${p.porciento}%"></i></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--suave)">
      <span>${p.texto}</span><span>${m.fecha_objetivo ? fechaCorta(m.fecha_objetivo) : ''}</span>
    </div>
  </a>`;
}

function hojaMeta() {
  const b = E.ui.borrador;
  if (!b) return '';
  const tareas = b.nueva ? [] : filas('tareas').filter((t) => t.meta_id === b.id).sort((x, y) => Number(x.hecha) - Number(y.hecha));
  return hoja(b.nueva ? 'Nueva meta' : 'Meta', html`
    <form data-envio="meta-guardar">
      <label class="campo"><span>Qué quieres lograr</span>
        <input class="entrada" data-campo="titulo" value="${b.titulo}" placeholder="Ej: Aprender inteligencia artificial" maxlength="300" autocomplete="off"></label>
      <div class="campo"><span>Plazo</span><div class="chips">
        ${PLAZOS.map(([v, t]) => html`<button type="button" class="chip ${b.plazo === v ? 'activo' : ''}" data-a="meta-plazo" data-v="${v}">${t}</button>`)}
      </div></div>
      <div class="dos">
        <label class="campo"><span>Fecha objetivo</span><input class="entrada" type="date" data-campo="fecha_objetivo" value="${b.fecha_objetivo ?? ''}"></label>
        <div class="campo"><span>Estado</span><div class="chips">
          ${ESTADOS.map(([v, t]) => html`<button type="button" class="chip ${b.estado === v ? 'activo' : ''}" data-a="meta-estado" data-v="${v}">${t}</button>`)}
        </div></div>
      </div>
      <label class="campo"><span>Por qué es importante</span><textarea class="entrada" data-campo="descripcion" maxlength="20000" placeholder="Opcional">${b.descripcion}</textarea></label>
      <div class="campo"><span>Pasos para llegar</span>
        ${b.pasos.map((/** @type {any} */ p, /** @type {number} */ i) => html`<div class="paso" data-k="p-${p.id}">
          <button type="button" class="check ${p.hecho ? 'si' : ''}" data-a="meta-paso-marcar" data-i="${i}" aria-label="Marcar paso">${icono('si')}</button>
          <input class="entrada" data-paso="${i}" value="${p.texto}" maxlength="300" aria-label="Paso ${i + 1}">
          <button type="button" class="boton-icono" data-a="meta-paso-quitar" data-i="${i}" aria-label="Quitar paso">${icono('x')}</button>
        </div>`)}
        <button type="button" class="boton ancho" data-a="meta-paso-nuevo" style="margin-top:6px">${icono('suma')} Agregar paso</button>
      </div>
      ${b.nueva ? '' : html`<div class="campo"><span>Tareas de esta meta</span>
        ${tareas.length ? html`<div class="lista">${tareas.map(filaTarea)}</div>` : ''}
        <button type="button" class="boton ancho" data-a="meta-tarea" style="margin-top:8px">${icono('suma')} Nueva tarea para esta meta</button>
      </div>`}
      <div class="pie">
        ${b.nueva ? '' : html`<button type="button" class="boton peligro" data-a="meta-borrar">${icono('basura')}</button>`}
        <button class="boton primario">Guardar</button>
      </div>
    </form>`);
}

function recoger() {
  const { nueva, ...b } = E.ui.borrador;
  return { ...b, titulo: b.titulo.trim(), fecha_objetivo: b.fecha_objetivo || null,
    pasos: b.pasos.filter((/** @type {any} */ p) => p.texto.trim()).map((/** @type {any} */ p) => ({ ...p, texto: p.texto.trim() })) };
}

export const vistaMetas = {
  /** @param {{ id: string | null }} ruta */
  alEntrar(ruta) {
    if (!ruta.id) { E.ui.borrador = null; return; }
    const m = ruta.id === 'nueva' ? null : fila('metas', ruta.id);
    if (ruta.id !== 'nueva' && !m) { E.ui.borrador = null; return; }
    E.ui.borrador = m
      ? { ...m, pasos: (m.pasos ?? []).map((/** @type {any} */ p) => ({ ...p })) }
      : { id: nuevoId(), nueva: true, titulo: '', descripcion: '', plazo: 'mediano', fecha_objetivo: null, estado: 'activa', pasos: [] };
  },
  pintar() {
    const todas = filas('metas').sort((a, b) => (a.fecha_objetivo ?? '9999').localeCompare(b.fecha_objetivo ?? '9999'));
    const activas = todas.filter((m) => m.estado === 'activa');
    const otras = todas.filter((m) => m.estado !== 'activa');
    return html`${cabecera('Metas', { atras: '#/mas' })}
      <main class="contenido">
        ${!todas.length ? vacio('¿A dónde quieres llegar?', 'Escribe tu primera meta a futuro y pártela en pasos.') : ''}
        ${PLAZOS.map(([v, t]) => {
          const g = activas.filter((m) => m.plazo === v);
          return g.length ? html`<section class="seccion"><h2>${t}</h2>${g.map(tarjeta)}</section>` : '';
        })}
        ${otras.length ? html`<section class="seccion"><h2>En pausa y logradas</h2>${otras.map(tarjeta)}</section>` : ''}
      </main>
      <a class="fab" href="#/metas/nueva" aria-label="Nueva meta">${icono('suma')}</a>
      ${hojaMeta()}`;
  },
};

registrar({
  'meta-plazo': (el) => { E.ui.borrador.plazo = el.dataset.v; pintar(); },
  'meta-estado': (el) => { E.ui.borrador.estado = el.dataset.v; pintar(); },
  'meta-paso-nuevo': () => { E.ui.borrador.pasos.push({ id: nuevoId().slice(0, 8), texto: '', hecho: false }); pintar(); },
  'meta-paso-quitar': (el) => { E.ui.borrador.pasos.splice(Number(el.dataset.i), 1); pintar(); },
  'meta-paso-marcar': (el) => {
    const p = E.ui.borrador.pasos[Number(el.dataset.i)];
    p.hecho = !p.hecho;
    if (!E.ui.borrador.nueva && E.ui.borrador.titulo.trim()) guardar('metas', recoger());
    pintar();
  },
  'meta-guardar': () => {
    if (!E.ui.borrador.titulo.trim()) { avisar('Escribe qué quieres lograr.'); return; }
    guardar('metas', recoger());
    volver('#/metas');
  },
  'meta-borrar': () => {
    const id = E.ui.borrador.id;
    borrar('metas', id);
    volver('#/metas');
    avisar('Meta borrada', { etiqueta: 'Deshacer', accion: () => restaurar('metas', id) });
  },
  'meta-tarea': () => {
    if (E.ui.borrador.titulo.trim()) guardar('metas', recoger());
    E.ui.semilla = { meta_id: E.ui.borrador.id };
    ir('#/tareas/nueva');
  },
});
