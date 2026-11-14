// Pantalla "Hoy": lo que toca, lo atrasado, las clases y la meta en foco.

import { html } from '../nucleo/html.js';
import { E, filas, fila, guardar, prefs, pintar } from '../datos/estado.js';
import { registrar, avisar } from '../nucleo/acciones.js';
import { cabecera, vacio } from './comun.js';
import { filaTarea } from './tareas.js';
import { progresoMeta } from './metas.js';
import { tarjetaDinero } from './dinero.js';
import { rutinasDeHoy, tarjetaRutina } from './rutinas.js';
import { icono } from './comun.js';
import { fechaISO, sumarDias, fechaLarga, saludo, horaCorta, nuevoId } from '../nucleo/util.js';

export const vistaHoy = {
  pintar() {
    const hoy = fechaISO();
    const pend = filas('tareas').filter((t) => !t.hecha);
    const deHoy = pend.filter((t) => t.fecha === hoy).sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99') || a.prioridad - b.prioridad);
    const atrasadas = pend.filter((t) => t.fecha && t.fecha < hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const manana = sumarDias(hoy, 1);
    const deManana = pend.filter((t) => t.fecha === manana).sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99') || a.prioridad - b.prioridad);
    const proximas = pend.filter((t) => t.fecha && t.fecha > manana && t.fecha <= sumarDias(hoy, 7)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const paraManana = E.ui.rapidaManana === true;
    const diasHechos = new Set(filas('tareas').filter((t) => t.hecha && t.hecha_en).map((t) => fechaISO(new Date(t.hecha_en))));
    const hechasHoy = filas('tareas').filter((t) => t.hecha && t.hecha_en && fechaISO(new Date(t.hecha_en)) === hoy).length;
    // Racha: días seguidos con al menos una tarea hecha. Hoy no la rompe si aún no has hecho nada.
    let racha = 0;
    for (let d = diasHechos.has(hoy) ? hoy : sumarDias(hoy, -1); diasHechos.has(d); d = sumarDias(d, -1)) racha++;
    const semana = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6));
    const hechasSemana = filas('tareas').filter((t) => t.hecha && t.hecha_en && fechaISO(new Date(t.hecha_en)) >= semana[0]).length;
    const dia = new Date().getDay();
    const clases = filas('materias')
      .flatMap((m) => (m.horario ?? []).filter((/** @type {any} */ h) => Number(h.dia) === dia).map((/** @type {any} */ h) => ({ ...h, nombre: m.nombre })))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const meta = filas('metas').filter((m) => m.estado === 'activa')
      .sort((a, b) => (a.fecha_objetivo ?? '9999').localeCompare(b.fecha_objetivo ?? '9999'))[0];
    const p = meta ? progresoMeta(meta) : null;

    return html`${cabecera('Mi Central')}
      <main class="contenido">
        <div class="saludo"><h2>${saludo()}, <span class="brillo">Matias</span><i class="cursor"></i></h2><p>${fechaLarga()}</p></div>
        <div class="cifras">
          <div class="cifra"><b>${deHoy.length}</b><span>para hoy</span></div>
          <div class="cifra ${atrasadas.length ? 'mal' : ''}"><b>${atrasadas.length}</b><span>${atrasadas.length === 1 ? 'atrasada' : 'atrasadas'}</span></div>
          <div class="cifra"><b>${hechasHoy}</b><span>${hechasHoy === 1 ? 'hecha hoy' : 'hechas hoy'}</span></div>
        </div>
        ${tarjetaDinero()}
        <form class="rapida" data-envio="hoy-rapida">
          <input class="entrada" placeholder="${paraManana ? 'Tarea rápida para mañana' : 'Tarea rápida para hoy'}" maxlength="300" autocomplete="off" aria-label="Escribe una tarea rápida">
          <button class="boton primario">Añadir</button>
        </form>
        <div class="segmento cuando">
          <button type="button" class="${paraManana ? '' : 'activo'}" data-a="hoy-cuando" data-v="hoy">Para hoy</button>
          <button type="button" class="${paraManana ? 'activo' : ''}" data-a="hoy-cuando" data-v="manana">Para mañana</button>
        </div>

        <div class="tarjeta racha">
          <span class="llama ${racha ? 'viva' : ''}">${icono('fuego')}</span>
          <div class="cuerpo"><b>${racha ? `${racha} ${racha === 1 ? 'día seguido' : 'días seguidos'}` : 'Empieza tu racha hoy'}</b>
            <span>${hechasSemana} ${hechasSemana === 1 ? 'tarea hecha' : 'tareas hechas'} en 7 días</span></div>
          <div class="semana">${semana.map((d) => html`<i class="${diasHechos.has(d) ? 'si' : ''} ${d === hoy ? 'hoy' : ''}"></i>`)}</div>
        </div>
        <a class="tarjeta ia-tarjeta" href="#/ia">
          <span class="redondo">${icono('chispa')}</span>
          <div class="cuerpo"><b>Pregúntale a tu asistente</b><span>Conoce tus tareas, tu plata, tus metas y tus notas</span></div>
          ${icono('flecha')}
        </a>

        ${rutinasDeHoy().length ? html`<section class="seccion"><h2>Rutinas de hoy <a href="#/rutinas">Ver todas</a></h2>${rutinasDeHoy().map(tarjetaRutina)}</section>` : ''}
        ${atrasadas.length ? html`<section class="seccion"><h2>Atrasadas <button data-a="hoy-pasar-manana">Pasar a mañana</button></h2><div class="lista">${atrasadas.map(filaTarea)}</div></section>` : ''}
        <section class="seccion"><h2>Para hoy <a href="#/tareas">Ver todas</a></h2>
          ${deHoy.length ? html`<div class="lista">${deHoy.map(filaTarea)}</div>`
            : html`<div class="tarjeta">${vacio(atrasadas.length ? 'Nada más para hoy' : 'Día libre', 'No tienes tareas con fecha de hoy.')}</div>`}
        </section>
        <section class="seccion"><h2>Mañana <a href="#/tareas">Ver todas</a></h2>
          ${deManana.length ? html`<div class="lista">${deManana.map(filaTarea)}</div>`
            : html`<div class="tarjeta">${vacio('Mañana está libre', 'Deja listo lo de mañana desde hoy.')}</div>`}
        </section>
        ${clases.length ? html`<section class="seccion"><h2>Clases de hoy</h2><div class="lista">
          ${clases.map((c) => html`<div class="fila"><div class="cuerpo"><div class="titulo">${c.nombre}</div></div><span class="derecha">${horaCorta(c.inicio)} a ${horaCorta(c.fin)}</span></div>`)}
        </div></section>` : ''}
        ${proximas.length ? html`<section class="seccion"><h2>Esta semana</h2><div class="lista">${proximas.slice(0, 6).map(filaTarea)}</div></section>` : ''}
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
  'hoy-cuando': (el) => { E.ui.rapidaManana = el.dataset.v === 'manana'; pintar(); },
  'hoy-rapida': (el) => {
    const campo = /** @type {HTMLInputElement | null} */ (el.querySelector('input'));
    const titulo = campo?.value.trim() ?? '';
    if (!titulo) return;
    const manana = E.ui.rapidaManana === true;
    guardar('tareas', { id: nuevoId(), titulo, detalle: '', fecha: manana ? sumarDias(fechaISO(), 1) : fechaISO(), hora: null,
      prioridad: 2, hecha: false, repetir: '', materia_id: null, meta_id: null, proyecto_id: null, avisos: [] });
    if (campo) campo.value = '';
    avisar(manana ? 'Tarea añadida para mañana' : 'Tarea añadida para hoy');
  },
  // Las atrasadas se pasan a mañana de una vez, sin tocarlas una por una.
  'hoy-pasar-manana': () => {
    const hoy = fechaISO();
    const lista = filas('tareas').filter((t) => !t.hecha && t.fecha && t.fecha < hoy);
    const antes = lista.map((t) => ({ id: t.id, fecha: t.fecha }));
    for (const t of lista) guardar('tareas', { ...t, fecha: sumarDias(hoy, 1) });
    avisar(`${lista.length} ${lista.length === 1 ? 'tarea pasada' : 'tareas pasadas'} a mañana`, {
      etiqueta: 'Deshacer',
      accion: () => { for (const a of antes) { const t = fila('tareas', a.id); if (t) guardar('tareas', { ...t, fecha: a.fecha }); } },
    });
  },
});

export { E, prefs };
