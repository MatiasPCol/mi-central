// Pantalla de tareas y la hoja para crear o editar una.

import { html } from '../nucleo/html.js';
import { E, filas, fila, guardar, borrar, restaurar, prefs, pintar } from '../datos/estado.js';
import { registrar, ir, volver, avisar } from '../nucleo/acciones.js';
import { cabecera, hoja, icono, vacio, opciones } from './comun.js';
import { fechaISO, sumarDias, fechaCorta, horaCorta, nuevoId } from '../nucleo/util.js';

const AVISOS = [{ min: 0, texto: 'A la hora' }, { min: 60, texto: '1 hora antes' }, { min: 1440, texto: '1 día antes' }];
const REPETIR = [['', 'No'], ['diaria', 'Cada día'], ['semanal', 'Cada semana'], ['mensual', 'Cada mes']];

/** Fecha de la siguiente repetición. @param {string} fecha @param {string} repetir */
export function siguienteFecha(fecha, repetir) {
  if (repetir === 'diaria') return sumarDias(fecha, 1);
  if (repetir === 'semanal') return sumarDias(fecha, 7);
  const [a, m, d] = fecha.split('-').map(Number);
  const ultimo = new Date(a, m + 1, 0).getDate();
  return fechaISO(new Date(a, m, Math.min(d, ultimo)));
}

/** @param {Record<string, any>} a @param {Record<string, any>} b */
function orden(a, b) {
  return (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || (a.hora ?? '99').localeCompare(b.hora ?? '99')
    || a.prioridad - b.prioridad || a.titulo.localeCompare(b.titulo);
}

/** Una tarea en una lista. @param {Record<string, any>} t */
export function filaTarea(t) {
  const hoy = fechaISO();
  const atrasada = !t.hecha && t.fecha && t.fecha < hoy;
  const materia = fila('materias', t.materia_id);
  const partes = [];
  if (t.fecha) partes.push(html`${atrasada ? html`<b>${fechaCorta(t.fecha)}</b>` : fechaCorta(t.fecha)}${t.hora ? ` ${horaCorta(t.hora)}` : ''}`);
  if (materia) partes.push(materia.nombre);
  if (t.repetir) partes.push('se repite');
  return html`<div class="fila ${t.hecha ? 'hecha' : ''} ${atrasada ? 'alerta' : ''}" data-k="t-${t.id}">
    <button class="check p${t.prioridad} ${t.hecha ? 'si' : ''}" data-a="tarea-marcar" data-id="${t.id}" aria-label="${t.hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}">${icono('si')}</button>
    <a class="cuerpo" href="#/tareas/${t.id}">
      <div class="titulo">${t.titulo || '(sin título)'}</div>
      ${partes.length ? html`<div class="detalle">${partes.map((p, i) => html`${i ? ' · ' : ''}${p}`)}</div>` : ''}
    </a>
  </div>`;
}

/** @param {string} titulo @param {Record<string, any>[]} lista */
function grupo(titulo, lista) {
  if (!lista.length) return '';
  return html`<section class="seccion"><h2>${titulo} <span>${lista.length}</span></h2><div class="lista">${lista.map(filaTarea)}</div></section>`;
}

function hojaTarea() {
  const b = E.ui.borrador;
  if (!b) return '';
  const materias = filas('materias').sort((x, y) => x.nombre.localeCompare(y.nombre)).map((m) => ({ valor: m.id, texto: m.nombre }));
  const metas = filas('metas').filter((m) => m.estado !== 'lograda').map((m) => ({ valor: m.id, texto: m.titulo }));
  return hoja(b.nueva ? 'Nueva tarea' : 'Tarea', html`
    <form data-envio="tarea-guardar">
      <label class="campo"><span>Qué hay que hacer</span>
        <input class="entrada" data-campo="titulo" value="${b.titulo}" placeholder="Ej: Taller de matemáticas" maxlength="300" autocomplete="off" ${b.nueva ? 'autofocus' : ''}></label>
      <div class="dos">
        <label class="campo"><span>Fecha</span><input class="entrada" type="date" data-campo="fecha" data-repinta value="${b.fecha ?? ''}"></label>
        <label class="campo"><span>Hora</span><input class="entrada" type="time" data-campo="hora" value="${(b.hora ?? '').slice(0, 5)}" ${b.fecha ? '' : 'disabled'}></label>
      </div>
      <div class="chips" style="margin-top:10px">
        <button type="button" class="chip" data-a="tarea-fecha" data-dias="0">Hoy</button>
        <button type="button" class="chip" data-a="tarea-fecha" data-dias="1">Mañana</button>
        <button type="button" class="chip" data-a="tarea-fecha" data-dias="7">En una semana</button>
        ${b.fecha ? html`<button type="button" class="chip" data-a="tarea-fecha" data-dias="">Sin fecha</button>` : ''}
      </div>
      <div class="campo"><span>Prioridad</span><div class="chips">
        ${[[1, 'Alta'], [2, 'Media'], [3, 'Baja']].map(([n, t]) => html`<button type="button" class="chip ${b.prioridad === n ? 'activo' : ''}" data-a="tarea-prioridad" data-n="${n}">${t}</button>`)}
      </div></div>
      ${b.fecha ? html`<div class="campo"><span>Avisarme</span><div class="chips">
        ${AVISOS.map((a) => html`<button type="button" class="chip ${b.avisos.includes(a.min) ? 'activo' : ''}" data-a="tarea-aviso" data-min="${a.min}">${a.texto}</button>`)}
      </div></div>
      <div class="campo"><span>Repetir</span><div class="chips">
        ${REPETIR.map(([v, t]) => html`<button type="button" class="chip ${(b.repetir ?? '') === v ? 'activo' : ''}" data-a="tarea-repetir" data-v="${v}">${t}</button>`)}
      </div></div>` : ''}
      <div class="dos">
        <label class="campo"><span>Materia</span><select class="entrada" data-campo="materia_id">${opciones([{ valor: '', texto: 'Ninguna' }, ...materias], b.materia_id)}</select></label>
        <label class="campo"><span>Meta</span><select class="entrada" data-campo="meta_id">${opciones([{ valor: '', texto: 'Ninguna' }, ...metas], b.meta_id)}</select></label>
      </div>
      <label class="campo"><span>Detalles</span><textarea class="entrada" data-campo="detalle" maxlength="20000" placeholder="Opcional">${b.detalle}</textarea></label>
      <div class="pie">
        ${b.nueva ? '' : html`<button type="button" class="boton peligro" data-a="tarea-borrar">${icono('basura')}</button>`}
        <button class="boton primario">Guardar</button>
      </div>
    </form>`);
}

export const vistaTareas = {
  /** @param {{ id: string | null }} ruta */
  alEntrar(ruta) {
    if (!ruta.id) { E.ui.borrador = null; return; }
    const t = ruta.id === 'nueva' ? null : fila('tareas', ruta.id);
    if (ruta.id !== 'nueva' && !t) { E.ui.borrador = null; return; }
    E.ui.borrador = t
      ? { ...t, avisos: [...(t.avisos ?? [])] }
      : { id: nuevoId(), nueva: true, titulo: E.ui.semilla?.titulo ?? '', detalle: '', fecha: E.ui.semilla?.fecha ?? null, hora: null, prioridad: 2,
          hecha: false, repetir: '', materia_id: E.ui.semilla?.materia_id ?? null, meta_id: E.ui.semilla?.meta_id ?? null, proyecto_id: null,
          avisos: E.ui.semilla?.fecha ? [...prefs().avisos_predeterminados] : [] };
    E.ui.semilla = null;
  },
  pintar() {
    const filtro = E.ui.filtroTareas ?? 'pendientes';
    const hoy = fechaISO();
    const todas = filas('tareas').sort(orden);
    const pend = todas.filter((t) => !t.hecha);
    let cuerpo;
    if (filtro === 'hechas') {
      const hechas = todas.filter((t) => t.hecha).sort((a, b) => (b.hecha_en ?? '').localeCompare(a.hecha_en ?? ''));
      cuerpo = hechas.length ? grupo('Hechas', hechas) : vacio('Nada hecho todavía', 'Aquí aparecen las tareas que marques.');
    } else if (!pend.length) {
      cuerpo = vacio('Todo al día', 'No tienes tareas pendientes. Toca + para crear una.');
    } else {
      const semana = sumarDias(hoy, 7);
      cuerpo = html`
        ${grupo('Atrasadas', pend.filter((t) => t.fecha && t.fecha < hoy))}
        ${grupo('Hoy', pend.filter((t) => t.fecha === hoy))}
        ${grupo('Mañana', pend.filter((t) => t.fecha === sumarDias(hoy, 1)))}
        ${grupo('Esta semana', pend.filter((t) => t.fecha && t.fecha > sumarDias(hoy, 1) && t.fecha <= semana))}
        ${grupo('Después', pend.filter((t) => t.fecha && t.fecha > semana))}
        ${grupo('Sin fecha', pend.filter((t) => !t.fecha))}`;
    }
    return html`${cabecera('Tareas')}
      <main class="contenido">
        <div class="chips">
          <button class="chip ${filtro === 'pendientes' ? 'activo' : ''}" data-a="tareas-filtro" data-f="pendientes">Pendientes ${pend.length || ''}</button>
          <button class="chip ${filtro === 'hechas' ? 'activo' : ''}" data-a="tareas-filtro" data-f="hechas">Hechas</button>
        </div>
        ${cuerpo}
      </main>
      <a class="fab" href="#/tareas/nueva" aria-label="Nueva tarea">${icono('suma')}</a>
      ${hojaTarea()}`;
  },
};

registrar({
  'tareas-filtro': (el) => { E.ui.filtroTareas = el.dataset.f; pintar(); },
  'tarea-marcar': (el) => {
    const t = fila('tareas', el.dataset.id);
    if (!t) return;
    guardar('tareas', { ...t, hecha: !t.hecha, hecha_en: t.hecha ? null : new Date().toISOString(), repetir: t.hecha ? t.repetir : '' });
    // Una tarea que se repite deja lista la siguiente al marcarla.
    if (!t.hecha && t.repetir && t.fecha) {
      const { evento_id, rev, ...copia } = t;
      guardar('tareas', { ...copia, id: nuevoId(), creado_en: new Date().toISOString(), hecha: false, hecha_en: null, fecha: siguienteFecha(t.fecha, t.repetir) });
      avisar('Hecha. La siguiente ya quedó programada.');
    }
  },
  'tarea-repetir': (el) => { E.ui.borrador.repetir = el.dataset.v ?? ''; pintar(); },
  'tarea-fecha': (el) => {
    const b = E.ui.borrador;
    const antes = b.fecha;
    b.fecha = el.dataset.dias === '' ? null : sumarDias(fechaISO(), Number(el.dataset.dias));
    if (!b.fecha) { b.hora = null; b.avisos = []; } else if (!antes && !b.avisos.length) b.avisos = [...prefs().avisos_predeterminados];
    pintar();
  },
  'tarea-prioridad': (el) => { E.ui.borrador.prioridad = Number(el.dataset.n); pintar(); },
  'tarea-aviso': (el) => {
    const b = E.ui.borrador;
    const m = Number(el.dataset.min);
    b.avisos = b.avisos.includes(m) ? b.avisos.filter((/** @type {number} */ x) => x !== m) : [...b.avisos, m];
    pintar();
  },
  'tarea-guardar': () => {
    const { nueva, ...b } = E.ui.borrador;
    if (!b.titulo.trim()) { avisar('Escribe qué hay que hacer.'); return; }
    guardar('tareas', { ...b, titulo: b.titulo.trim(), fecha: b.fecha || null, hora: b.fecha && b.hora ? b.hora : null,
      materia_id: b.materia_id || null, meta_id: b.meta_id || null });
    volver('#/tareas');
  },
  'tarea-borrar': () => {
    const id = E.ui.borrador.id;
    borrar('tareas', id);
    volver('#/tareas');
    avisar('Tarea borrada', { etiqueta: 'Deshacer', accion: () => restaurar('tareas', id) });
  },
});

export { ir };
