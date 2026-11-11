// "Mis datos": todo lo que la app sabe de Matias, por grupos, más sus proyectos.

import { html } from '../nucleo/html.js';
import { E, filas, fila, guardar, borrar, restaurar, pintar } from '../datos/estado.js';
import { registrar, volver, avisar } from '../nucleo/acciones.js';
import { cabecera, hoja, icono, vacio } from './comun.js';
import { nuevoId } from '../nucleo/util.js';

/** Solo se enlazan direcciones web normales. @param {string} url */
const enlaceSeguro = (url) => (/^https?:\/\//i.test(url) ? url : '');

function hojaDato() {
  const b = E.ui.borrador;
  if (!b) return '';
  const grupos = Array.from(new Set(filas('datos').map((d) => d.grupo))).sort();
  if (b.tipo === 'proyecto') {
    return hoja(b.nueva ? 'Nuevo proyecto' : 'Proyecto', html`
      <form data-envio="dato-guardar">
        <label class="campo"><span>Nombre</span><input class="entrada" data-campo="nombre" value="${b.nombre}" maxlength="200" autocomplete="off"></label>
        <label class="campo"><span>Qué es</span><textarea class="entrada" data-campo="descripcion" maxlength="5000">${b.descripcion}</textarea></label>
        <label class="campo"><span>Tecnologías</span><input class="entrada" data-campo="tecnologias" value="${b.tecnologias}" maxlength="500" autocomplete="off"></label>
        <label class="campo"><span>Enlace</span><input class="entrada" type="url" data-campo="enlace" value="${b.enlace}" placeholder="https://" maxlength="500" autocomplete="off"></label>
        <div class="dos">
          <div class="campo"><span>Tipo</span><div class="chips">
            ${[['real', 'Real'], ['practica', 'Práctica']].map(([v, t]) => html`<button type="button" class="chip ${b.clase === v ? 'activo' : ''}" data-a="dato-clase" data-v="${v}">${t}</button>`)}
          </div></div>
          <label class="campo"><span>Estado</span><input class="entrada" data-campo="estado" value="${b.estado}" maxlength="40" autocomplete="off"></label>
        </div>
        <div class="pie">
          ${b.nueva ? '' : html`<button type="button" class="boton peligro" data-a="dato-borrar">${icono('basura')}</button>`}
          <button class="boton primario">Guardar</button>
        </div>
      </form>`);
  }
  return hoja(b.nueva ? 'Nuevo dato' : 'Dato', html`
    <form data-envio="dato-guardar">
      <label class="campo"><span>Grupo</span><input class="entrada" data-campo="grupo" value="${b.grupo}" list="grupos" placeholder="Ej: Perfil, Contacto, Salud" maxlength="60" autocomplete="off">
        <datalist id="grupos">${grupos.map((g) => html`<option value="${g}"></option>`)}</datalist></label>
      <label class="campo"><span>Título</span><input class="entrada" data-campo="titulo" value="${b.titulo}" maxlength="200" autocomplete="off"></label>
      <label class="campo"><span>Contenido</span><textarea class="entrada" data-campo="contenido" maxlength="20000">${b.contenido}</textarea></label>
      <label class="campo"><span>Enlace</span><input class="entrada" type="url" data-campo="enlace" value="${b.enlace}" placeholder="https:// (opcional)" maxlength="500" autocomplete="off"></label>
      <div class="pie">
        ${b.nueva ? '' : html`<button type="button" class="boton peligro" data-a="dato-borrar">${icono('basura')}</button>`}
        <button class="boton primario">Guardar</button>
      </div>
    </form>`);
}

export const vistaDatos = {
  /** @param {{ id: string | null, extra: string | null }} ruta */
  alEntrar(ruta) {
    E.ui.borrador = null;
    if (!ruta.id) return;
    if (ruta.id === 'proyecto') {
      const p = ruta.extra === 'nuevo' ? null : fila('proyectos', ruta.extra);
      if (p) E.ui.borrador = { ...p, clase: p.tipo, tipo: 'proyecto' };
      else if (ruta.extra === 'nuevo') E.ui.borrador = { id: nuevoId(), nueva: true, tipo: 'proyecto', clase: 'real', nombre: '', descripcion: '', tecnologias: '', enlace: '', estado: 'activo', orden: filas('proyectos').length + 1 };
      return;
    }
    const d = ruta.id === 'nuevo' ? null : fila('datos', ruta.id);
    if (d) E.ui.borrador = { ...d, tipo: 'dato' };
    else if (ruta.id === 'nuevo') E.ui.borrador = { id: nuevoId(), nueva: true, tipo: 'dato', grupo: '', titulo: '', contenido: '', enlace: '', orden: 0 };
  },
  pintar() {
    const datos = filas('datos').sort((a, b) => a.grupo.localeCompare(b.grupo) || a.orden - b.orden || a.titulo.localeCompare(b.titulo));
    const grupos = Array.from(new Set(datos.map((d) => d.grupo)));
    const preferidos = ['Perfil', 'Contacto', 'Formación', 'Habilidades', 'Idiomas'];
    grupos.sort((a, b) => (preferidos.indexOf(a) + 1 || 99) - (preferidos.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const proyectos = filas('proyectos').sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
    return html`${cabecera('Mis datos', { atras: '#/mas' })}
      <main class="contenido">
        ${!datos.length && !proyectos.length ? vacio('Aún no hay datos', 'Guarda aquí lo que quieras tener a la mano.') : ''}
        ${grupos.map((g) => html`<section class="seccion"><h2>${g}</h2><div class="lista">
          ${datos.filter((d) => d.grupo === g).map((d) => html`<a class="fila" href="#/datos/${d.id}" data-k="d-${d.id}">
            <div class="cuerpo"><div class="detalle">${d.titulo}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${d.contenido || '—'}</div></div>
          </a>`)}
        </div></section>`)}
        <section class="seccion"><h2>Proyectos <a href="#/datos/proyecto/nuevo">Agregar</a></h2>
          ${proyectos.length ? html`<div class="lista">${proyectos.map((p) => html`<div class="fila" data-k="p-${p.id}">
            <a class="cuerpo" href="#/datos/proyecto/${p.id}" style="color:inherit">
              <div class="titulo">${p.nombre}</div>
              <div class="detalle">${p.tecnologias || p.descripcion}</div>
            </a>
            <span class="etiqueta ${p.tipo === 'real' ? 'bien' : ''}">${p.tipo === 'real' ? 'Real' : 'Práctica'}</span>
            ${enlaceSeguro(p.enlace) ? html`<a class="boton-icono" href="${enlaceSeguro(p.enlace)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${p.nombre}">${icono('flecha')}</a>` : ''}
          </div>`)}</div>` : html`<p class="nota-pie">Sin proyectos todavía.</p>`}
        </section>
      </main>
      <a class="fab" href="#/datos/nuevo" aria-label="Nuevo dato">${icono('suma')}</a>
      ${hojaDato()}`;
  },
};

registrar({
  'dato-clase': (el) => { E.ui.borrador.clase = el.dataset.v; pintar(); },
  'dato-guardar': () => {
    const { nueva, tipo, clase, ...b } = E.ui.borrador;
    if (tipo === 'proyecto') {
      if (!b.nombre.trim()) { avisar('Escribe el nombre del proyecto.'); return; }
      guardar('proyectos', { ...b, nombre: b.nombre.trim(), tipo: clase });
    } else {
      if (!b.titulo.trim() && !b.contenido.trim()) { avisar('Escribe un título o un contenido.'); return; }
      guardar('datos', { ...b, grupo: b.grupo.trim() || 'General', titulo: b.titulo.trim() });
    }
    volver('#/datos');
  },
  'dato-borrar': () => {
    const { id, tipo } = E.ui.borrador;
    const tabla = tipo === 'proyecto' ? 'proyectos' : 'datos';
    borrar(tabla, id);
    volver('#/datos');
    avisar('Borrado', { etiqueta: 'Deshacer', accion: () => restaurar(tabla, id) });
  },
});
