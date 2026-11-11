// Notas: rejilla con buscador y un editor a pantalla completa que guarda solo.
// Una nota puede ser texto libre o una lista con casillas, y puede llevar fotos.

import { html } from '../nucleo/html.js';
import { E, filas, fila, guardar, borrar, restaurar, pintar } from '../datos/estado.js';
import { registrar, volver, avisar } from '../nucleo/acciones.js';
import { cabecera, icono, vacio, opciones } from './comun.js';
import { plano, hace, nuevoId, conPausa } from '../nucleo/util.js';

const COLORES = ['', 'amarillo', 'verde', 'azul', 'rosa', 'morado'];
const RENGLON = /^\[( |x)\] ?(.*)$/;

/** Una nota es lista si todos sus renglones con texto empiezan por "[ ]" o "[x]". @param {string} contenido */
export function esLista(contenido) {
  const lineas = contenido.split('\n').filter((l) => l.trim());
  return lineas.length > 0 && lineas.every((l) => RENGLON.test(l));
}

/** @param {string} contenido @returns {{ hecho: boolean, texto: string }[]} */
function renglones(contenido) {
  return contenido.split('\n').filter((l) => RENGLON.test(l)).map((l) => {
    const m = /** @type {RegExpMatchArray} */ (l.match(RENGLON));
    return { hecho: m[1] === 'x', texto: m[2] };
  });
}

/** @param {{ hecho: boolean, texto: string }[]} lista */
const aTexto = (lista) => lista.map((r) => `[${r.hecho ? 'x' : ' '}] ${r.texto}`).join('\n');

/** @param {string} notaId */
const fotosDe = (notaId) => filas('fotos').filter((f) => f.nota_id === notaId).sort((a, b) => a.creado_en.localeCompare(b.creado_en));

/** @param {Record<string, any>} n */
function tarjeta(n) {
  const lista = esLista(n.contenido);
  const primera = lista ? '' : n.contenido.split('\n').find((/** @type {string} */ l) => l.trim()) ?? '';
  const foto = fotosDe(n.id)[0];
  const items = lista ? renglones(n.contenido) : [];
  return html`<a class="nota c-${n.color}" href="#/notas/${n.id}" data-k="n-${n.id}">
    ${foto ? html`<img class="miniatura" src="${foto.datos}" alt="">` : ''}
    <b>${n.fijada ? icono('pin') : ''}${n.titulo || primera.slice(0, 60) || (lista ? 'Lista' : foto ? 'Foto' : 'Nota vacía')}</b>
    ${lista
      ? html`<p>${items.slice(0, 5).map((r) => html`<span class="${r.hecho ? 'tachado' : ''}">${r.hecho ? '☑' : '☐'} ${r.texto}</span><br>`)}${items.length > 5 ? `y ${items.length - 5} más` : ''}</p>`
      : html`<p>${n.titulo ? n.contenido.slice(0, 220) : n.contenido.slice(primera.length).trim().slice(0, 220)}</p>`}
  </a>`;
}

/** @param {boolean} [forzar] guarda aunque la nota esté vacía (para poder colgarle una foto) */
function guardarBorrador(forzar = false) {
  const b = E.ui.borrador;
  // El borrador puede ser de otra pantalla si el guardado con pausa llega tarde.
  if (!b || E.ui.ruta?.vista !== 'notas' || typeof b.contenido !== 'string') return;
  if (!forzar && !b.titulo.trim() && !b.contenido.trim() && !fila('notas', b.id)) return;
  guardar('notas', { id: b.id, titulo: b.titulo, contenido: b.contenido, fijada: b.fijada, color: b.color, materia_id: b.materia_id || null });
}
const guardarLuego = conPausa(guardarBorrador, 1200);

/** Achica la foto para que pese poco. @param {File} archivo @returns {Promise<string>} */
async function achicar(archivo) {
  const mapa = await createImageBitmap(archivo);
  let lado = 1100;
  let calidad = 0.62;
  for (let intento = 0; intento < 4; intento++) {
    const escala = Math.min(1, lado / Math.max(mapa.width, mapa.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(mapa.width * escala);
    lienzo.height = Math.round(mapa.height * escala);
    /** @type {CanvasRenderingContext2D} */ (lienzo.getContext('2d')).drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
    const datos = lienzo.toDataURL('image/jpeg', calidad);
    if (datos.length < 600000) return datos;
    lado *= 0.75;
    calidad -= 0.1;
  }
  throw new Error('La foto es demasiado grande.');
}

function editor() {
  const b = E.ui.borrador;
  const existe = fila('notas', b.id);
  const lista = esLista(b.contenido);
  const fotos = fotosDe(b.id);
  const grande = E.ui.fotoGrande ? fila('fotos', E.ui.fotoGrande) : null;
  const materias = filas('materias').sort((x, y) => x.nombre.localeCompare(y.nombre)).map((m) => ({ valor: m.id, texto: m.nombre }));
  return html`<div class="editor c-${b.color}" data-k="editor">
    <div class="barra-editor">
      <button class="boton-icono" data-a="nota-cerrar" aria-label="Volver">${icono('atras')}</button>
      <span class="hueco">${existe ? `Guardada ${hace(existe.actualizado_en)}` : 'Nota nueva'}</span>
      <button class="boton-icono" data-a="nota-modo" aria-label="${lista ? 'Pasar a texto' : 'Pasar a lista'}" style="${lista ? 'color:var(--acento)' : ''}">${icono('tareas')}</button>
      <label class="boton-icono" aria-label="Agregar foto">${icono('foto')}<input type="file" accept="image/*" data-c="nota-foto" hidden></label>
      <button class="boton-icono" data-a="nota-fijar" aria-label="Fijar" style="${b.fijada ? 'color:var(--acento)' : ''}">${icono('pin')}</button>
      <button class="boton-icono" data-a="nota-borrar" aria-label="Borrar">${icono('basura')}</button>
    </div>
    <div class="cuerpo-editor">
      <input class="titulo-nota" data-campo="titulo" data-i="nota-auto" value="${b.titulo}" placeholder="Título" maxlength="300" autocomplete="off">
      ${lista ? html`<div class="renglones">
          ${renglones(b.contenido).map((r, i) => html`<div class="paso" data-k="r-${i}">
            <button class="check ${r.hecho ? 'si' : ''}" data-a="nota-renglon-marcar" data-n="${i}" aria-label="Marcar">${icono('si')}</button>
            <input class="entrada ${r.hecho ? 'tachado' : ''}" data-i="nota-renglon" data-n="${i}" value="${r.texto}" maxlength="300" aria-label="Renglón ${i + 1}">
            <button class="boton-icono" data-a="nota-renglon-quitar" data-n="${i}" aria-label="Quitar">${icono('x')}</button>
          </div>`)}
          <button class="boton ancho" data-a="nota-renglon-nuevo" style="margin-top:6px">${icono('suma')} Agregar renglón</button>
        </div>`
        : html`<textarea data-campo="contenido" data-i="nota-auto" placeholder="Escribe aquí…" maxlength="200000">${b.contenido}</textarea>`}
      ${fotos.length ? html`<div class="fotos">${fotos.map((f) => html`<button data-a="nota-foto-ver" data-id="${f.id}" data-k="f-${f.id}" aria-label="Ver foto"><img src="${f.datos}" alt="Foto de la nota"></button>`)}</div>` : ''}
    </div>
    <div class="pie-editor">
      ${COLORES.map((c) => html`<button class="color c-${c} ${b.color === c ? 'activo' : ''}" data-a="nota-color" data-c="${c}" aria-label="Color ${c || 'normal'}"></button>`)}
      <select class="entrada" data-campo="materia_id" data-i="nota-auto" style="min-width:150px;min-height:38px;padding:6px 10px" aria-label="Materia">
        ${opciones([{ valor: '', texto: 'Sin materia' }, ...materias], b.materia_id)}
      </select>
    </div>
    ${grande ? html`<div class="visor" data-a="nota-foto-cerrar">
      <img src="${grande.datos}" alt="Foto de la nota">
      <button class="boton peligro" data-a="nota-foto-borrar" data-id="${grande.id}">${icono('basura')} Borrar foto</button>
    </div>` : ''}
  </div>`;
}

export const vistaNotas = {
  /** @param {{ id: string | null }} ruta */
  alEntrar(ruta) {
    E.ui.fotoGrande = null;
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
        <input class="entrada" type="search" data-i="notas-buscar" value="${E.ui.buscarNotas ?? ''}" placeholder="Buscar en tus notas" aria-label="Buscar en tus notas">
        <div class="seccion">
          ${lista.length ? html`<div class="rejilla">${lista.map(tarjeta)}</div>`
            : q ? vacio('Sin resultados', 'Ninguna nota tiene ese texto.') : vacio('Aún no hay notas', 'Toca + y escribe la primera.')}
        </div>
      </main>
      <a class="fab" href="#/notas/nueva" aria-label="Nueva nota">${icono('suma')}</a>`;
  },
};

/** Cambia los renglones de la lista y guarda. @param {(lista: { hecho: boolean, texto: string }[]) => void} fn @param {boolean} [repintar] */
function conRenglones(fn, repintar = true) {
  const lista = renglones(E.ui.borrador.contenido);
  fn(lista);
  E.ui.borrador.contenido = aTexto(lista);
  guardarLuego();
  if (repintar) pintar();
}

registrar({
  'notas-buscar': (el) => { E.ui.buscarNotas = /** @type {HTMLInputElement} */ (el).value; pintar(); },
  'nota-auto': () => guardarLuego(),
  'nota-cerrar': () => { guardarBorrador(); volver('#/notas'); },
  'nota-fijar': () => { E.ui.borrador.fijada = !E.ui.borrador.fijada; guardarBorrador(); pintar(); },
  'nota-color': (el) => { E.ui.borrador.color = el.dataset.c ?? ''; guardarBorrador(); pintar(); },
  'nota-modo': () => {
    const b = E.ui.borrador;
    b.contenido = esLista(b.contenido)
      ? renglones(b.contenido).map((r) => r.texto).join('\n')
      : aTexto((b.contenido.split('\n').filter((/** @type {string} */ l) => l.trim()).map((/** @type {string} */ l) => ({ hecho: false, texto: l.trim() }))).concat(b.contenido.trim() ? [] : [{ hecho: false, texto: '' }]));
    guardarLuego();
    pintar();
  },
  'nota-renglon': (el) => conRenglones((l) => { l[Number(el.dataset.n)].texto = /** @type {HTMLInputElement} */ (el).value.replace(/\n/g, ' '); }, false),
  'nota-renglon-marcar': (el) => conRenglones((l) => { const r = l[Number(el.dataset.n)]; r.hecho = !r.hecho; }),
  'nota-renglon-quitar': (el) => conRenglones((l) => { l.splice(Number(el.dataset.n), 1); if (!l.length) l.push({ hecho: false, texto: '' }); }),
  'nota-renglon-nuevo': () => {
    conRenglones((l) => { l.push({ hecho: false, texto: '' }); });
    setTimeout(() => { const campos = document.querySelectorAll('.renglones input'); /** @type {HTMLElement | undefined} */ (campos[campos.length - 1])?.focus(); }, 120);
  },
  'nota-foto': async (el) => {
    const campo = /** @type {HTMLInputElement} */ (el);
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;
    try {
      const datos = await achicar(archivo);
      guardarBorrador(true);
      guardar('fotos', { id: nuevoId(), nota_id: E.ui.borrador.id, datos });
    } catch (e) {
      avisar(e instanceof Error && e.message.includes('grande') ? e.message : 'No se pudo leer esa foto.');
    }
  },
  'nota-foto-ver': (el) => { E.ui.fotoGrande = el.dataset.id; pintar(); },
  'nota-foto-cerrar': () => { E.ui.fotoGrande = null; pintar(); },
  'nota-foto-borrar': (el) => { borrar('fotos', /** @type {string} */ (el.dataset.id)); E.ui.fotoGrande = null; pintar(); },
  'nota-borrar': () => {
    const id = E.ui.borrador.id;
    const existia = !!fila('notas', id);
    const fotos = fotosDe(id).map((f) => f.id);
    E.ui.borrador.titulo = '';
    E.ui.borrador.contenido = '';
    if (existia) borrar('notas', id);
    fotos.forEach((f) => borrar('fotos', f));
    volver('#/notas');
    if (existia) avisar('Nota borrada', { etiqueta: 'Deshacer', accion: () => { restaurar('notas', id); fotos.forEach((f) => restaurar('fotos', f)); } });
  },
});

/** Guarda lo que haya en el editor antes de cambiar de pantalla o cerrar la app. */
export function guardarNotaAbierta() {
  if (E.ui.ruta?.vista === 'notas') guardarBorrador();
}
