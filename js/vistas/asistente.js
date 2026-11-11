// Asistente: una conversación con la IA, que recibe un resumen de lo que hay en la app para responder con tus datos.

import { html } from '../nucleo/html.js';
import { E, filas, fila, prefs, pintar } from '../datos/estado.js';
import { pedir, mensajeError } from '../datos/api.js';
import { registrar, ir } from '../nucleo/acciones.js';
import { cabecera, icono } from './comun.js';
import { estadoMateria, promedio } from '../calculo/notas.js';
import { progresoMeta } from './metas.js';
import { rachaRutina } from './rutinas.js';
import { resumenMes, saldoTotal, pesos } from './dinero.js';
import { fechaISO, fechaLarga, sumarDias, DIAS_CORTOS } from '../nucleo/util.js';

const SUGERENCIAS = [
  '¿Cómo voy con la plata este mes?',
  '¿Qué hago primero hoy?',
  '¿Voy a ganar el año?',
  'Ármame un plan para esta semana',
];
const MAX_PREGUNTA = 2000;
const MAX_TURNOS = 24;

/** Recorta un texto largo y dice cuánto se quitó. @param {string} t @param {number} n */
const corto = (t, n) => (t.length > n ? `${t.slice(0, n)}… (sigue, ${t.length - n} letras más)` : t);

/** Lista con tope: si hay más, lo dice en vez de callarlo. @param {string[]} lineas @param {number} tope */
function lista(lineas, tope) {
  if (!lineas.length) return '(nada)';
  const extra = lineas.length > tope ? `\n(y ${lineas.length - tope} más que no caben aquí)` : '';
  return lineas.slice(0, tope).join('\n') + extra;
}

/** Todo lo que la IA necesita saber, en texto plano. Las fotos no se envían. */
export function contextoParaIA() {
  const hoy = fechaISO();
  const mes = hoy.slice(0, 7);
  const tareas = filas('tareas');
  const nombreDe = (/** @type {string} */ tabla, /** @type {any} */ id) => fila(tabla, id)?.nombre ?? fila(tabla, id)?.titulo ?? '';
  const pendientes = tareas.filter((t) => !t.hecha)
    .sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || a.prioridad - b.prioridad);
  const hechasSemana = tareas.filter((t) => t.hecha && t.hecha_en && fechaISO(new Date(t.hecha_en)) >= sumarDias(hoy, -6));

  const meses = [0, -1, -2].map((s) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(a, m - 1 + s, 1);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const r = resumenMes(clave);
    /** @type {Record<string, number>} */
    const cat = {};
    for (const x of r.lista.filter((v) => v.tipo === 'gasto')) cat[x.categoria || 'Otro'] = (cat[x.categoria || 'Otro'] ?? 0) + Number(x.monto);
    const porCat = Object.entries(cat).sort((x, y) => y[1] - x[1]).map(([c, v]) => `${c} ${pesos(v)}`).join(', ');
    return `- ${clave}: entró ${pesos(r.ingresos)}, salió ${pesos(r.gastos)}, balance ${pesos(r.balance)}${porCat ? `. Gastos por categoría: ${porCat}` : ''}`;
  });
  const movimientos = filas('movimientos').sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((m) => `- ${m.fecha} ${m.tipo} ${pesos(m.monto)} ${m.categoria || ''}${m.nota ? ` (${m.nota})` : ''}`);

  const c = prefs().notas;
  const materias = filas('materias').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((m) => {
    const notas = (m.calificaciones ?? []).map(Number);
    const p = promedio(notas);
    const horario = (m.horario ?? []).map((/** @type {any} */ h) => `${DIAS_CORTOS[Number(h.dia)]} ${h.inicio}-${h.fin}`).join(', ');
    return `- ${m.nombre}: notas [${notas.join(', ')}]${p === null ? '' : `, promedio ${p.toFixed(2)}`}. ${estadoMateria(notas, c).mensaje}${horario ? ` Horario: ${horario}.` : ''}`;
  });

  const metas = filas('metas').map((m) => {
    const pasos = (m.pasos ?? []).map((/** @type {any} */ p) => `${p.hecho ? '[x]' : '[ ]'} ${p.texto}`).join('; ');
    return `- ${m.titulo} (${m.estado}, plazo ${m.plazo}${m.fecha_objetivo ? `, para ${m.fecha_objetivo}` : ''}): ${progresoMeta(m)?.texto ?? 'sin avance medido'}${m.descripcion ? `. ${corto(m.descripcion, 300)}` : ''}${pasos ? `. Pasos: ${pasos}` : ''}`;
  });

  const rutinas = filas('rutinas').map((r) => `- ${r.nombre}: días ${(r.dias ?? []).map((/** @type {any} */ d) => DIAS_CORTOS[Number(d)]).join(' ')}${r.hora ? `, ${r.hora.slice(0, 5)}` : ''}, racha ${rachaRutina(r)}, ${(r.hechos ?? []).includes(hoy) ? 'hecha hoy' : 'sin hacer hoy'}`);
  const notas = filas('notas').sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en))
    .map((n) => `- ${n.titulo || '(sin título)'}: ${corto(String(n.contenido ?? '').replace(/\s+/g, ' '), 400)}`);
  const datos = filas('datos').map((d) => `- ${d.grupo} · ${d.titulo}: ${corto(String(d.contenido ?? ''), 200)}`);
  const proyectos = filas('proyectos').map((p) => `- ${p.nombre} (${p.estado}): ${corto(String(p.descripcion ?? ''), 200)} [${p.tecnologias ?? ''}]`);

  return [
    `Hoy es ${fechaLarga()} (${hoy}). La moneda es el peso colombiano.`,
    `## Tareas pendientes (${pendientes.length})\n${lista(pendientes.map((t) => `- ${t.titulo}${t.fecha ? ` · ${t.fecha}${t.hora ? ` ${t.hora.slice(0, 5)}` : ''}` : ' · sin fecha'} · prioridad ${t.prioridad}${t.materia_id ? ` · ${nombreDe('materias', t.materia_id)}` : ''}${t.meta_id ? ` · meta: ${nombreDe('metas', t.meta_id)}` : ''}${t.detalle ? ` · ${corto(t.detalle, 200)}` : ''}`), 80)}`,
    `## Tareas hechas en los últimos 7 días (${hechasSemana.length})\n${lista(hechasSemana.map((t) => `- ${t.titulo}`), 40)}`,
    `## Rutinas\n${lista(rutinas, 40)}`,
    `## Dinero\nTiene en total ${pesos(saldoTotal())}.\nÚltimos tres meses:\n${meses.join('\n')}\nMovimientos, del más nuevo al más viejo:\n${lista(movimientos, 80)}`,
    `## Materias (aprueba con ${c.aprobacion}, escala ${c.minima} a ${c.maxima}, ${c.periodos} periodos)\n${lista(materias, 30)}`,
    `## Metas\n${lista(metas, 30)}`,
    `## Notas\n${lista(notas, 30)}`,
    `## Datos personales y proyectos\n${lista([...datos, ...proyectos], 60)}`,
  ].join('\n\n');
}

function charla() {
  E.ui.ia ??= { mensajes: [], espera: false, error: '' };
  return E.ui.ia;
}

function alFinal() {
  setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }), 130);
}

/** @param {string} texto */
async function preguntar(texto) {
  const ch = charla();
  const pregunta = texto.trim().slice(0, MAX_PREGUNTA);
  if (!pregunta || ch.espera) return;
  ch.mensajes.push({ rol: 'yo', texto: pregunta });
  ch.error = '';
  ch.espera = true;
  pintar();
  alFinal();
  try {
    if (E.demo) {
      await new Promise((r) => setTimeout(r, 700));
      ch.mensajes.push({ rol: 'ia', texto: 'En la demostración no hablo con la IA de verdad. En tu app respondo con tus tareas, tu plata, tus metas y tus notas.' });
    } else {
      const r = await pedir('/ia', { mensajes: ch.mensajes.slice(-MAX_TURNOS), contexto: contextoParaIA() });
      ch.mensajes.push({ rol: 'ia', texto: r.texto });
    }
  } catch (e) {
    ch.mensajes.pop();
    ch.error = mensajeError(e);
    ch.pendiente = pregunta;
  } finally {
    ch.espera = false;
    pintar();
    alFinal();
  }
}

export const vistaAsistente = {
  alEntrar() {
    const ch = charla();
    const semilla = E.ui.semillaIA;
    E.ui.semillaIA = null;
    if (semilla) preguntar(semilla);
    else if (ch.mensajes.length) alFinal();
  },
  pintar() {
    const ch = charla();
    return html`${cabecera('Asistente', { atras: '#/mas' })}
      <main class="contenido charla">
        ${ch.mensajes.length ? '' : html`<div class="ia-hola">
          <span class="redondo">${icono('chispa')}</span>
          <h2>¿En qué te ayudo?</h2>
          <p>Veo tus tareas, tu plata, tus materias, tus metas y tus notas, así que pregunta con confianza.</p>
          <div class="chips envuelve">${SUGERENCIAS.map((s) => html`<button class="chip" data-a="ia-preguntar" data-q="${s}">${s}</button>`)}</div>
        </div>`}
        ${ch.mensajes.map((/** @type {any} */ m, /** @type {number} */ i) => html`<div class="burbuja ${m.rol}" data-k="ia-${i}">${m.texto}</div>`)}
        ${ch.espera ? html`<div class="burbuja ia pensando" data-k="ia-espera"><i></i><i></i><i></i></div>` : ''}
        ${ch.error ? html`<div class="burbuja error" data-k="ia-error">${ch.error}
          <button class="boton" data-a="ia-reintentar">Reintentar</button></div>` : ''}
        ${ch.mensajes.length ? html`<button class="ia-limpiar" data-a="ia-limpiar">Empezar de cero</button>` : ''}
      </main>
      <form class="redactar" data-envio="ia-enviar">
        <input class="entrada" placeholder="Pregúntale a tu asistente" maxlength="${MAX_PREGUNTA}" autocomplete="off" aria-label="Mensaje para el asistente" enterkeyhint="send">
        <button class="boton primario" aria-label="Enviar" ${ch.espera ? 'disabled' : ''}>${icono('enviar')}</button>
      </form>`;
  },
};

registrar({
  'ia-enviar': (el) => {
    const campo = /** @type {HTMLInputElement | null} */ (el.querySelector('input'));
    const texto = campo?.value ?? '';
    if (!texto.trim() || charla().espera) return;
    if (campo) campo.value = '';
    preguntar(texto);
  },
  // Sirve desde cualquier pantalla: abre el asistente con la pregunta ya hecha.
  'ia-preguntar': (el) => {
    const q = el.dataset.q ?? '';
    if (E.ui.ruta?.vista === 'ia') preguntar(q);
    else { E.ui.semillaIA = q; ir('#/ia'); }
  },
  'ia-reintentar': () => {
    const ch = charla();
    const q = ch.pendiente ?? '';
    ch.error = '';
    ch.pendiente = '';
    preguntar(q);
  },
  'ia-limpiar': () => { E.ui.ia = null; pintar(); window.scrollTo(0, 0); },
});
