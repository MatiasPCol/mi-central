// Rutinas: actividades fijas que se repiten ciertos días de la semana.
// Cada día se marcan y al otro día vuelven a estar pendientes. Cada una lleva su racha.

import { html } from '../nucleo/html.js';
import { E, filas, fila, guardar, borrar, restaurar, pintar } from '../datos/estado.js';
import { registrar, volver, avisar } from '../nucleo/acciones.js';
import { cabecera, hoja, icono, vacio } from './comun.js';
import { fechaISO, sumarDias, aFecha, horaCorta, nuevoId } from '../nucleo/util.js';

const LETRAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const COLORES = ['', 'amarillo', 'verde', 'azul', 'rosa', 'morado'];

/** @param {Record<string, any>} r @param {string} fecha */
const toca = (r, fecha) => (r.dias ?? []).map(Number).includes(aFecha(fecha).getDay());
/** @param {Record<string, any>} r @param {string} fecha */
const hecha = (r, fecha) => (r.hechos ?? []).includes(fecha);

/** Días seguidos (de los que tocaba) cumplidos. Hoy no la rompe si aún no se ha hecho. @param {Record<string, any>} r */
export function rachaRutina(r) {
  let racha = 0;
  let d = fechaISO();
  if (toca(r, d) && !hecha(r, d)) d = sumarDias(d, -1);
  for (let i = 0; i < 400; i++, d = sumarDias(d, -1)) {
    if (!toca(r, d)) continue;
    if (!hecha(r, d)) break;
    racha++;
  }
  return racha;
}

/** Rutinas que tocan hoy, ordenadas por hora. */
export function rutinasDeHoy() {
  const hoy = fechaISO();
  return filas('rutinas').filter((r) => toca(r, hoy))
    .sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99') || a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

/** Una rutina como tarjeta que se marca con un toque. @param {Record<string, any>} r */
export function tarjetaRutina(r) {
  const hoy = fechaISO();
  const lista = hecha(r, hoy);
  const racha = rachaRutina(r);
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6));
  return html`<div class="rutina c-${r.color} ${lista ? 'lista-ya' : ''}" data-k="ru-${r.id}">
    <button class="check grande-c ${lista ? 'si' : ''}" data-a="rutina-marcar" data-id="${r.id}" aria-label="${lista ? 'Desmarcar' : 'Marcar como hecha'}">${icono('si')}</button>
    <a class="cuerpo" href="#/rutinas/${r.id}">
      <b>${r.nombre || '(sin nombre)'}</b>
      <span>${r.hora ? `${horaCorta(r.hora)} · ` : ''}${racha ? `${racha} ${racha === 1 ? 'día seguido' : 'días seguidos'}` : 'Empieza hoy'}</span>
    </a>
    <div class="puntos">${semana.map((d) => html`<i class="${hecha(r, d) ? 'si' : toca(r, d) ? 'toca' : ''}"></i>`)}</div>
  </div>`;
}

function hojaRutina() {
  const b = E.ui.borrador;
  if (!b) return '';
  return hoja(b.nueva ? 'Nueva rutina' : 'Rutina', html`
    <form data-envio="rutina-guardar">
      <label class="campo"><span>Qué haces siempre</span>
        <input class="entrada" data-campo="nombre" value="${b.nombre}" placeholder="Ej: Estudiar inglés 20 minutos" maxlength="120" autocomplete="off" ${b.nueva ? 'autofocus' : ''}></label>
      <div class="campo"><span>Qué días</span><div class="dias-semana">
        ${ORDEN_DIAS.map((d) => html`<button type="button" class="${b.dias.includes(d) ? 'activo' : ''}" data-a="rutina-dia" data-d="${d}" aria-label="Día ${d}">${LETRAS[d]}</button>`)}
      </div></div>
      <div class="chips" style="margin-top:10px">
        <button type="button" class="chip" data-a="rutina-dias" data-v="todos">Todos los días</button>
        <button type="button" class="chip" data-a="rutina-dias" data-v="semana">Lunes a viernes</button>
      </div>
      <label class="campo"><span>Hora (opcional)</span><input class="entrada" type="time" data-campo="hora" value="${(b.hora ?? '').slice(0, 5)}"></label>
      <div class="campo"><span>Color</span><div class="chips">
        ${COLORES.map((c) => html`<button type="button" class="color c-${c} ${b.color === c ? 'activo' : ''}" data-a="rutina-color" data-c="${c}" aria-label="Color ${c || 'normal'}"></button>`)}
      </div></div>
      <div class="pie">
        ${b.nueva ? '' : html`<button type="button" class="boton peligro" data-a="rutina-borrar">${icono('basura')}</button>`}
        <button class="boton primario">Guardar</button>
      </div>
    </form>`);
}

export const vistaRutinas = {
  /** @param {{ id: string | null }} ruta */
  alEntrar(ruta) {
    E.ui.borrador = null;
    if (!ruta.id) return;
    const r = ruta.id === 'nueva' ? null : fila('rutinas', ruta.id);
    if (r) E.ui.borrador = { ...r, dias: (r.dias ?? []).map(Number) };
    else if (ruta.id === 'nueva') E.ui.borrador = { id: nuevoId(), nueva: true, nombre: '', color: '', dias: [0, 1, 2, 3, 4, 5, 6], hora: null, hechos: [], orden: filas('rutinas').length + 1 };
  },
  pintar() {
    const hoy = fechaISO();
    const deHoy = rutinasDeHoy();
    const otras = filas('rutinas').filter((r) => !toca(r, hoy)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const hechas = deHoy.filter((r) => hecha(r, hoy)).length;
    const pct = deHoy.length ? Math.round((hechas / deHoy.length) * 100) : 0;
    return html`${cabecera('Rutinas')}
      <main class="contenido">
        ${deHoy.length ? html`<div class="tarjeta destacada progreso-dia">
          <div class="anillo" style="--p:${pct}"><b>${pct}%</b></div>
          <div><span class="rotulo">Hoy llevas</span><b class="grande" style="font-size:28px;margin:0">${hechas} de ${deHoy.length}</b>
            <span class="rotulo">${hechas === deHoy.length ? 'Día completo. Bien ahí.' : 'Sigue, vas bien.'}</span></div>
        </div>` : ''}
        ${!filas('rutinas').length ? vacio('Arma tu rutina', 'Agrega lo que haces siempre: estudiar, entrenar, leer. Cada día lo marcas y llevas tu racha.') : ''}
        ${deHoy.length ? html`<section class="seccion"><h2>Hoy toca</h2>${deHoy.map(tarjetaRutina)}</section>` : ''}
        ${filas('rutinas').length && !deHoy.length ? vacio('Hoy no toca ninguna', 'Descansa o agrega una rutina para hoy.') : ''}
        ${otras.length ? html`<section class="seccion"><h2>Otros días</h2><div class="lista">
          ${otras.map((r) => html`<a class="fila" href="#/rutinas/${r.id}" data-k="ro-${r.id}"><i class="punto-materia c-${r.color}"></i>
            <div class="cuerpo"><div class="titulo">${r.nombre}</div><div class="detalle">${ORDEN_DIAS.filter((d) => r.dias.map(Number).includes(d)).map((d) => ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d]).join(', ')}</div></div></a>`)}
        </div></section>` : ''}
      </main>
      <a class="fab" href="#/rutinas/nueva" aria-label="Nueva rutina">${icono('suma')}</a>
      ${hojaRutina()}`;
  },
};

registrar({
  'rutina-marcar': (el) => {
    const r = fila('rutinas', el.dataset.id);
    if (!r) return;
    const hoy = fechaISO();
    const hechos = hecha(r, hoy) ? r.hechos.filter((/** @type {string} */ d) => d !== hoy) : [...(r.hechos ?? []), hoy];
    guardar('rutinas', { ...r, hechos });
    if (hechos.includes(hoy) && rutinasDeHoy().every((x) => hecha(x, hoy))) avisar('Rutina del día completa');
  },
  'rutina-dia': (el) => {
    const b = E.ui.borrador;
    const d = Number(el.dataset.d);
    b.dias = b.dias.includes(d) ? b.dias.filter((/** @type {number} */ x) => x !== d) : [...b.dias, d];
    pintar();
  },
  'rutina-dias': (el) => { E.ui.borrador.dias = el.dataset.v === 'todos' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]; pintar(); },
  'rutina-color': (el) => { E.ui.borrador.color = el.dataset.c ?? ''; pintar(); },
  'rutina-guardar': () => {
    const { nueva, ...b } = E.ui.borrador;
    if (!b.nombre.trim()) { avisar('Escribe qué haces en esta rutina.'); return; }
    if (!b.dias.length) { avisar('Elige al menos un día.'); return; }
    guardar('rutinas', { ...b, nombre: b.nombre.trim(), hora: b.hora || null });
    volver('#/rutinas');
  },
  'rutina-borrar': () => {
    const id = E.ui.borrador.id;
    borrar('rutinas', id);
    volver('#/rutinas');
    avisar('Rutina borrada', { etiqueta: 'Deshacer', accion: () => restaurar('rutinas', id) });
  },
});
