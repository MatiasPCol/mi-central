// Pantalla "Hoy": lo que toca, lo atrasado, las clases y la meta en foco.

import { html } from '../nucleo/html.js';
import { E, filas, guardar, prefs } from '../datos/estado.js';
import { registrar, avisar } from '../nucleo/acciones.js';
import { cabecera, vacio } from './comun.js';
import { filaTarea } from './tareas.js';
import { progresoMeta } from './metas.js';
import { resumenMes, pesos } from './dinero.js';
import { icono } from './comun.js';
import { fechaISO, sumarDias, fechaLarga, saludo, horaCorta, nuevoId } from '../nucleo/util.js';

export const vistaHoy = {
  pintar() {
    const hoy = fechaISO();
    const pend = filas('tareas').filter((t) => !t.hecha);
    const deHoy = pend.filter((t) => t.fecha === hoy).sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99') || a.prioridad - b.prioridad);
    const atrasadas = pend.filter((t) => t.fecha && t.fecha < hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const proximas = pend.filter((t) => t.fecha && t.fecha > hoy && t.fecha <= sumarDias(hoy, 7)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const diasHechos = new Set(filas('tareas').filter((t) => t.hecha && t.hecha_en).map((t) => fechaISO(new Date(t.hecha_en))));
    const hechasHoy = filas('tareas').filter((t) => t.hecha && t.hecha_en && fechaISO(new Date(t.hecha_en)) === hoy).length;
    // Racha: días seguidos con al menos una tarea hecha. Hoy no la rompe si aún no has hecho nada.
    let racha = 0;
    for (let d = diasHechos.has(hoy) ? hoy : sumarDias(hoy, -1); diasHechos.has(d); d = sumarDias(d, -1)) racha++;
    const semana = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6));
    const hechasSemana = filas('tareas').filter((t) => t.hecha && t.hecha_en && fechaISO(new Date(t.hecha_en)) >= semana[0]).length;
    const dinero = resumenMes(hoy.slice(0, 7));
    const dia = new Date().getDay();
    const clases = filas('materias')
      .flatMap((m) => (m.horario ?? []).filter((/** @type {any} */ h) => Number(h.dia) === dia).map((/** @type {any} */ h) => ({ ...h, nombre: m.nombre })))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const meta = filas('metas').filter((m) => m.estado === 'activa')
      .sort((a, b) => (a.fecha_objetivo ?? '9999').localeCompare(b.fecha_objetivo ?? '9999'))[0];
    const p = meta ? progresoMeta(meta) : null;

    return html`${cabecera('Mi Central')}
      <main class="contenido">
        <div class="saludo"><h2>${saludo()}, Matias</h2><p>${fechaLarga()}</p></div>
        <div class="cifras">
          <div class="cifra"><b>${deHoy.length}</b><span>para hoy</span></div>
          <div class="cifra ${atrasadas.length ? 'mal' : ''}"><b>${atrasadas.length}</b><span>${atrasadas.length === 1 ? 'atrasada' : 'atrasadas'}</span></div>
          <div class="cifra"><b>${hechasHoy}</b><span>${hechasHoy === 1 ? 'hecha hoy' : 'hechas hoy'}</span></div>
        </div>
        <form class="rapida" data-envio="hoy-rapida">
          <input class="entrada" data-campo-libre="rapida" placeholder="Tarea rápida para hoy" maxlength="300" autocomplete="off" aria-label="Tarea rápida para hoy">
          <button class="boton primario">Añadir</button>
        </form>

        <div class="tarjeta racha">
          <span class="llama ${racha ? 'viva' : ''}">${icono('fuego')}</span>
          <div class="cuerpo"><b>${racha ? `${racha} ${racha === 1 ? 'día seguido' : 'días seguidos'}` : 'Empieza tu racha hoy'}</b>
            <span>${hechasSemana} ${hechasSemana === 1 ? 'tarea hecha' : 'tareas hechas'} en 7 días</span></div>
          <div class="semana">${semana.map((d) => html`<i class="${diasHechos.has(d) ? 'si' : ''} ${d === hoy ? 'hoy' : ''}"></i>`)}</div>
        </div>
        ${dinero.lista.length ? html`<a class="tarjeta dinero-mini" href="#/dinero">
          <span>Balance del mes</span><b class="${dinero.balance < 0 ? 'rojo' : 'verde'}">${pesos(dinero.balance)}</b>
        </a>` : ''}

        ${atrasadas.length ? html`<section class="seccion"><h2>Atrasadas</h2><div class="lista">${atrasadas.map(filaTarea)}</div></section>` : ''}
        <section class="seccion"><h2>Para hoy <a href="#/tareas">Ver todas</a></h2>
          ${deHoy.length ? html`<div class="lista">${deHoy.map(filaTarea)}</div>`
            : html`<div class="tarjeta">${vacio(atrasadas.length ? 'Nada más para hoy' : 'Día libre', 'No tienes tareas con fecha de hoy.')}</div>`}
        </section>
        ${clases.length ? html`<section class="seccion"><h2>Clases de hoy</h2><div class="lista">
          ${clases.map((c) => html`<div class="fila"><div class="cuerpo"><div class="titulo">${c.nombre}</div></div><span class="derecha">${horaCorta(c.inicio)} a ${horaCorta(c.fin)}</span></div>`)}
        </div></section>` : ''}
        ${proximas.length ? html`<section class="seccion"><h2>Próximos 7 días</h2><div class="lista">${proximas.slice(0, 6).map(filaTarea)}</div></section>` : ''}
        ${meta && p ? html`<section class="seccion"><h2>Meta en foco <a href="#/metas">Ver metas</a></h2>
          <a class="tarjeta" href="#/metas/${meta.id}" style="display:block;color:inherit">
            <b>${meta.titulo}</b>
            <div class="barra" style="margin:10px 0 6px"><i style="width:${p.porciento}%"></i></div>
            <span class="detalle" style="font-size:13px;color:var(--suave)">${p.texto}</span>
          </a></section>` : ''}
      </main>`;
  },
};

registrar({
  'hoy-rapida': (el) => {
    const campo = /** @type {HTMLInputElement | null} */ (el.querySelector('input'));
    const titulo = campo?.value.trim() ?? '';
    if (!titulo) return;
    guardar('tareas', { id: nuevoId(), titulo, detalle: '', fecha: fechaISO(), hora: null, prioridad: 2, hecha: false,
      materia_id: null, meta_id: null, proyecto_id: null, avisos: [] });
    if (campo) campo.value = '';
    avisar('Tarea añadida para hoy');
  },
});

export { E, prefs };
