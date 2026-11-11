// Buscador de todo: tareas, notas, metas, materias, datos, proyectos y movimientos.

import { html } from '../nucleo/html.js';
import { E, filas, pintar } from '../datos/estado.js';
import { registrar } from '../nucleo/acciones.js';
import { cabecera, vacio } from './comun.js';
import { plano, fechaCorta } from '../nucleo/util.js';
import { pesos } from './dinero.js';

/** @type {{ tabla: string, nombre: string, texto: (f: any) => string, titulo: (f: any) => string, detalle: (f: any) => string, enlace: (f: any) => string }[]} */
const FUENTES = [
  { tabla: 'tareas', nombre: 'Tareas', texto: (f) => `${f.titulo} ${f.detalle}`, titulo: (f) => f.titulo, detalle: (f) => (f.hecha ? 'Hecha' : f.fecha ? fechaCorta(f.fecha) : 'Sin fecha'), enlace: (f) => `#/tareas/${f.id}` },
  { tabla: 'notas', nombre: 'Notas', texto: (f) => `${f.titulo} ${f.contenido}`, titulo: (f) => f.titulo || f.contenido.split('\n')[0].slice(0, 60), detalle: (f) => f.contenido.replace(/\s+/g, ' ').slice(0, 80), enlace: (f) => `#/notas/${f.id}` },
  { tabla: 'metas', nombre: 'Metas', texto: (f) => `${f.titulo} ${f.descripcion} ${(f.pasos ?? []).map((/** @type {any} */ p) => p.texto).join(' ')}`, titulo: (f) => f.titulo, detalle: (f) => f.descripcion.slice(0, 80), enlace: (f) => `#/metas/${f.id}` },
  { tabla: 'materias', nombre: 'Materias', texto: (f) => `${f.nombre} ${f.profesor}`, titulo: (f) => f.nombre, detalle: (f) => f.profesor, enlace: (f) => `#/materias/${f.id}` },
  { tabla: 'datos', nombre: 'Mis datos', texto: (f) => `${f.grupo} ${f.titulo} ${f.contenido}`, titulo: (f) => f.titulo, detalle: (f) => f.contenido.slice(0, 80), enlace: (f) => `#/datos/${f.id}` },
  { tabla: 'proyectos', nombre: 'Proyectos', texto: (f) => `${f.nombre} ${f.descripcion} ${f.tecnologias}`, titulo: (f) => f.nombre, detalle: (f) => f.tecnologias, enlace: (f) => `#/datos/proyecto/${f.id}` },
  { tabla: 'movimientos', nombre: 'Dinero', texto: (f) => `${f.categoria} ${f.nota}`, titulo: (f) => `${f.categoria} · ${pesos(f.monto)}`, detalle: (f) => `${fechaCorta(f.fecha)} ${f.nota}`, enlace: (f) => `#/dinero/${f.id}` },
];

export const vistaBuscar = {
  pintar() {
    const q = plano((E.ui.buscar ?? '').trim());
    const grupos = q.length < 2 ? [] : FUENTES
      .map((f) => ({ f, lista: filas(f.tabla).filter((x) => plano(f.texto(x)).includes(q)).slice(0, 12) }))
      .filter((g) => g.lista.length);
    return html`${cabecera('Buscar', { atras: '#/mas' })}
      <main class="contenido">
        <input class="entrada" type="search" data-i="buscar-escribir" value="${E.ui.buscar ?? ''}" placeholder="Busca en todo lo tuyo" aria-label="Buscar en todo" autofocus>
        ${q.length < 2 ? vacio('Escribe al menos dos letras', 'Busca en tareas, notas, metas, materias, datos y dinero.')
          : !grupos.length ? vacio('Sin resultados', 'Nada tiene ese texto.')
          : grupos.map((g) => html`<section class="seccion"><h2>${g.f.nombre} <span>${g.lista.length}</span></h2><div class="lista">
            ${g.lista.map((x) => html`<a class="fila" href="${g.f.enlace(x)}"><div class="cuerpo"><div class="titulo">${g.f.titulo(x) || '(sin título)'}</div><div class="detalle">${g.f.detalle(x)}</div></div></a>`)}
          </div></section>`)}
      </main>`;
  },
};

registrar({
  'buscar-escribir': (el) => { E.ui.buscar = /** @type {HTMLInputElement} */ (el).value; pintar(); },
});
