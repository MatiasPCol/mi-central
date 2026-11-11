// Materias y calificaciones, con el cálculo de "¿gano el año?".

import { html } from '../nucleo/html.js';
import { E, filas, fila, guardar, borrar, restaurar, prefs, pintar } from '../datos/estado.js';
import { registrar, volver, avisar } from '../nucleo/acciones.js';
import { cabecera, hoja, icono, vacio, opciones } from './comun.js';
import { estadoMateria, promedio, promedioGeneral } from '../calculo/notas.js';
import { nuevoId, DIAS_CORTOS } from '../nucleo/util.js';

const COLORES = ['', 'amarillo', 'verde', 'azul', 'rosa', 'morado'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((texto, i) => ({ valor: String(i), texto }));

/** @param {Record<string, any>} m */
const notasDe = (m) => (m.calificaciones ?? []).map(Number).filter((n) => Number.isFinite(n));

/** @param {ReturnType<typeof estadoMateria>} e */
function etiqueta(e) {
  if (e.estado === 'aprobada') return html`<span class="etiqueta bien">Aprobada</span>`;
  if (e.estado === 'reprobada') return html`<span class="etiqueta mal">No alcanza</span>`;
  return html`<span class="etiqueta ojo">Necesitas ${e.necesita?.toFixed(2)}</span>`;
}

/** Lee las casillas de notas del borrador: solo números válidos, en orden. @param {string[]} textos */
function leerNotas(textos) {
  const c = prefs().notas;
  const lista = [];
  for (const t of textos) {
    const n = Number(String(t).replace(',', '.'));
    if (String(t).trim() === '' || !Number.isFinite(n)) break;
    lista.push(Math.min(c.maxima, Math.max(c.minima, Math.round(n * 100) / 100)));
  }
  return lista;
}

function hojaMateria() {
  const b = E.ui.borrador;
  if (!b) return '';
  const c = prefs().notas;
  const notas = leerNotas(b.notasTxt);
  const e = estadoMateria(notas, c);
  return hoja(b.nueva ? 'Nueva materia' : 'Materia', html`
    <form data-envio="materia-guardar">
      <div class="dos">
        <label class="campo"><span>Materia</span><input class="entrada" data-campo="nombre" value="${b.nombre}" placeholder="Ej: Matemáticas" maxlength="120" autocomplete="off"></label>
        <label class="campo"><span>Profesor</span><input class="entrada" data-campo="profesor" value="${b.profesor}" placeholder="Opcional" maxlength="120" autocomplete="off"></label>
      </div>
      <div class="campo"><span>Notas por periodo (de ${c.minima} a ${c.maxima})</span>
        <div style="display:grid;grid-template-columns:repeat(${c.periodos},1fr);gap:10px">
          ${b.notasTxt.map((/** @type {string} */ t, /** @type {number} */ i) => html`<input class="entrada" inputmode="decimal" data-ruta="notasTxt.${i}" data-repinta value="${t}" placeholder="P${i + 1}" aria-label="Nota del periodo ${i + 1}" style="text-align:center;font-weight:700">`)}
        </div>
      </div>
      <div class="tarjeta" style="margin-top:12px;background:var(--capa-2)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span>Promedio <b class="promedio">${promedio(notas)?.toFixed(2) ?? '—'}</b></span>${notas.length ? etiqueta(e) : ''}
        </div>
        ${notas.length ? html`<p class="nota-pie" style="margin:8px 0 0">${e.mensaje}</p>` : ''}
      </div>
      <div class="campo"><span>Color</span><div class="chips">
        ${COLORES.map((x) => html`<button type="button" class="color c-${x} ${b.color === x ? 'activo' : ''}" data-a="materia-color" data-c="${x}" aria-label="Color ${x || 'normal'}"></button>`)}
      </div></div>
      <div class="campo"><span>Horario de clase</span>
        ${b.horario.map((/** @type {any} */ h, /** @type {number} */ i) => html`<div class="paso">
          <select class="entrada" data-ruta="horario.${i}.dia" aria-label="Día" style="min-height:40px;padding:8px">${opciones(DIAS, String(h.dia))}</select>
          <input class="entrada" type="time" data-ruta="horario.${i}.inicio" value="${h.inicio}" aria-label="Empieza">
          <input class="entrada" type="time" data-ruta="horario.${i}.fin" value="${h.fin}" aria-label="Termina">
          <button type="button" class="boton-icono" data-a="materia-hora-quitar" data-i="${i}" aria-label="Quitar">${icono('x')}</button>
        </div>`)}
        <button type="button" class="boton ancho" data-a="materia-hora-nueva" style="margin-top:6px">${icono('suma')} Agregar clase</button>
      </div>
      <div class="pie">
        ${b.nueva ? '' : html`<button type="button" class="boton peligro" data-a="materia-borrar">${icono('basura')}</button>`}
        <button class="boton primario">Guardar</button>
      </div>
    </form>`);
}

export const vistaMaterias = {
  /** @param {{ id: string | null }} ruta */
  alEntrar(ruta) {
    if (!ruta.id) { E.ui.borrador = null; return; }
    const m = ruta.id === 'nueva' ? null : fila('materias', ruta.id);
    if (ruta.id !== 'nueva' && !m) { E.ui.borrador = null; return; }
    const periodos = prefs().notas.periodos;
    const base = m ?? { id: nuevoId(), nueva: true, nombre: '', profesor: '', color: '', calificaciones: [], horario: [], orden: filas('materias').length + 1 };
    const notas = notasDe(base);
    E.ui.borrador = { ...base, horario: (base.horario ?? []).map((/** @type {any} */ h) => ({ ...h })),
      notasTxt: Array.from({ length: periodos }, (_, i) => (notas[i] !== undefined ? String(notas[i]) : '')) };
  },
  pintar() {
    const c = prefs().notas;
    const lista = filas('materias').sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
    const estados = lista.map((m) => estadoMateria(notasDe(m), c));
    const general = promedioGeneral(lista.map(notasDe), c);
    const perdidas = estados.filter((e) => e.estado === 'reprobada').length;
    const enJuego = estados.filter((e) => e.estado === 'pendiente').length;
    return html`${cabecera('Materias', { atras: '#/mas' })}
      <main class="contenido">
        ${lista.length ? html`<div class="tarjeta">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div><div style="font-size:13px;color:var(--suave);font-weight:600">Promedio general</div><b class="promedio" style="font-size:32px">${general?.toFixed(2) ?? '—'}</b></div>
            <span class="etiqueta ${perdidas ? 'mal' : enJuego ? 'ojo' : 'bien'}">${perdidas ? `${perdidas} sin salvar` : enJuego ? `${enJuego} por asegurar` : 'Año ganado'}</span>
          </div>
          <p class="nota-pie" style="margin:8px 0 0">Cada nota que falta cuenta como ${c.minima} en este promedio. Para aprobar una materia necesitas promedio de ${c.aprobacion}.</p>
        </div>` : vacio('Sin materias', 'Agrega tus materias y sus notas para saber si ganas el año.')}
        ${lista.length ? html`<section class="seccion"><div class="lista">
          ${lista.map((m, i) => {
            const notas = notasDe(m);
            return html`<a class="fila" href="#/materias/${m.id}" data-k="ma-${m.id}">
              <i class="punto-materia c-${m.color}"></i>
              <div class="cuerpo">
                <div class="titulo">${m.nombre || '(sin nombre)'}</div>
                <div class="detalle">${notas.length ? notas.map((n, j) => `P${j + 1} ${n}`).join(' · ') : 'Sin notas todavía'}${(m.horario ?? []).length ? ` · ${m.horario.map((/** @type {any} */ h) => DIAS_CORTOS[Number(h.dia)]).join(', ')}` : ''}</div>
              </div>
              ${notas.length ? etiqueta(estados[i]) : ''}
              <b>${promedio(notas)?.toFixed(2) ?? ''}</b>
            </a>`;
          })}
        </div></section>` : ''}
      </main>
      <a class="fab" href="#/materias/nueva" aria-label="Nueva materia">${icono('suma')}</a>
      ${hojaMateria()}`;
  },
};

registrar({
  'materia-color': (el) => { E.ui.borrador.color = el.dataset.c ?? ''; pintar(); },
  'materia-hora-nueva': () => { E.ui.borrador.horario.push({ dia: 1, inicio: '07:00', fin: '08:00' }); pintar(); },
  'materia-hora-quitar': (el) => { E.ui.borrador.horario.splice(Number(el.dataset.i), 1); pintar(); },
  'materia-guardar': () => {
    const { nueva, notasTxt, ...b } = E.ui.borrador;
    if (!b.nombre.trim()) { avisar('Escribe el nombre de la materia.'); return; }
    guardar('materias', { ...b, nombre: b.nombre.trim(), profesor: b.profesor.trim(), calificaciones: leerNotas(notasTxt),
      horario: b.horario.filter((/** @type {any} */ h) => h.inicio && h.fin).map((/** @type {any} */ h) => ({ dia: Number(h.dia), inicio: h.inicio, fin: h.fin })) });
    volver('#/materias');
  },
  'materia-borrar': () => {
    const id = E.ui.borrador.id;
    borrar('materias', id);
    volver('#/materias');
    avisar('Materia borrada', { etiqueta: 'Deshacer', accion: () => restaurar('materias', id) });
  },
});
