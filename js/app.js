// Arranque de Mi Central: decide qué pantalla mostrar, escucha los toques y mantiene todo sincronizado.

import { html, pintarEn } from './nucleo/html.js';
import { E, alCambiar, pintar, programarSync, sincronizar } from './datos/estado.js';
import { acciones, registrar, volver } from './nucleo/acciones.js';
import { icono } from './vistas/comun.js';
import * as acceso from './seguridad/acceso.js';
import { cargarDemo } from './datos/demo.js';
import { vistaVincular, vistaBloqueada } from './vistas/puerta.js';
import { vistaHoy } from './vistas/hoy.js';
import { vistaTareas } from './vistas/tareas.js';
import { vistaNotas, guardarNotaAbierta } from './vistas/notas.js';
import { vistaMetas } from './vistas/metas.js';
import { vistaMaterias } from './vistas/materias.js';
import { vistaDatos } from './vistas/datos.js';
import { vistaMas, vistaActividad, vistaAjustes } from './vistas/ajustes.js';
import { vistaDinero } from './vistas/dinero.js';
import { vistaBuscar } from './vistas/buscar.js';
import { vistaRutinas } from './vistas/rutinas.js';
import { vistaAsistente } from './vistas/asistente.js';
import { visor } from './vistas/fotos.js';

/** @type {Record<string, { pintar: (r: any) => unknown, alEntrar?: (r: any) => void }>} */
const VISTAS = {
  hoy: vistaHoy, tareas: vistaTareas, notas: vistaNotas, metas: vistaMetas, materias: vistaMaterias,
  datos: vistaDatos, dinero: vistaDinero, rutinas: vistaRutinas, ia: vistaAsistente, buscar: vistaBuscar, mas: vistaMas, actividad: vistaActividad, ajustes: vistaAjustes,
};
const NAV = [['hoy', 'Hoy', 'casa'], ['tareas', 'Tareas', 'tareas'], ['dinero', 'Dinero', 'dinero'], ['rutinas', 'Rutinas', 'ciclo'], ['notas', 'Notas', 'nota'], ['mas', 'Más', 'mas']];
const EN_MAS = ['mas', 'metas', 'materias', 'datos', 'ia', 'buscar', 'actividad', 'ajustes'];

const raiz = /** @type {HTMLElement} */ (document.getElementById('app'));

function leerRuta() {
  const [vista = '', id = null, extra = null] = location.hash.replace(/^#\/?/, '').split('/');
  return { vista: VISTAS[vista] ? vista : 'hoy', id: id || null, extra: extra || null };
}

function pantalla() {
  if (E.modo === 'cargando') return html`<div class="arranque"><div class="marca"></div></div>`;
  if (E.modo === 'vincular') return vistaVincular();
  if (E.modo === 'bloqueada') return vistaBloqueada();
  if (E.candado) {
    return html`<div class="puerta"><div class="caja">
      <div class="logo"></div><h1>Mi Central</h1><p class="lema">Bloqueada</p>
      <button class="boton primario ancho" data-a="candado-abrir">${icono('candado')} Desbloquear</button>
      ${E.ui.errorCandado ? html`<p class="error">${E.ui.errorCandado}</p>` : ''}
    </div></div>`;
  }
  const r = E.ui.ruta ?? leerRuta();
  const activa = EN_MAS.includes(r.vista) ? 'mas' : r.vista;
  return html`
    ${E.demo ? html`<div class="franja ojo">Modo demostración: datos inventados, nada se guarda.</div>` : ''}
    <div class="destellos" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    ${VISTAS[r.vista].pintar(r)}
    <nav class="nav">${NAV.map(([v, t, i]) => html`<a href="#/${v}" class="${activa === v ? 'activa' : ''}">${icono(i)}${t}</a>`)}</nav>
    ${visor()}
    ${E.ui.toast ? html`<div class="toast" role="status">${E.ui.toast.texto}${E.ui.toast.etiqueta ? html`<button data-a="toast-boton">${E.ui.toast.etiqueta}</button>` : ''}</div>` : ''}`;
}

alCambiar(() => pintarEn(raiz, pantalla()));

function alCambiarRuta() {
  guardarNotaAbierta();
  const anterior = E.ui.ruta;
  const r = leerRuta();
  E.ui.ruta = r;
  E.ui.pasos = (E.ui.pasos ?? -1) + 1;
  VISTAS[r.vista].alEntrar?.(r);
  if (!anterior || anterior.vista !== r.vista) window.scrollTo(0, 0);
  pintar();
}
window.addEventListener('hashchange', alCambiarRuta);

// ---------- Toques y escritura ----------

/** Guarda en el borrador lo que se escribe. Soporta rutas como "horario.0.inicio". @param {HTMLElement} el */
function alBorrador(el) {
  const campo = /** @type {HTMLInputElement} */ (el);
  const valor = campo.type === 'checkbox' ? campo.checked : campo.value;
  if (el.dataset.puerta && E.ui.puerta) { E.ui.puerta[el.dataset.puerta] = valor; return; }
  const b = E.ui.borrador;
  if (!b) return;
  if (el.dataset.campo) b[el.dataset.campo] = valor;
  else if (el.dataset.paso) b.pasos[Number(el.dataset.paso)].texto = valor;
  else if (el.dataset.ruta) {
    const partes = el.dataset.ruta.split('.');
    let o = b;
    for (const p of partes.slice(0, -1)) o = o?.[p];
    if (o) o[partes[partes.length - 1]] = valor;
  }
}

raiz.addEventListener('click', (ev) => {
  const blanco = /** @type {HTMLElement} */ (ev.target);
  const el = /** @type {HTMLElement | null} */ (blanco.closest('[data-a]'));
  if (!el) return;
  // Tocar dentro de la hoja no la cierra; tocar el velo sí.
  if (el.dataset.a === 'cerrar-hoja' && el.classList.contains('velo') && blanco !== el) return;
  acciones[el.dataset.a ?? '']?.(el, ev);
});
raiz.addEventListener('input', (ev) => {
  const el = /** @type {HTMLElement} */ (ev.target);
  alBorrador(el);
  if (el.dataset.i) acciones[el.dataset.i]?.(el, ev);
  if (el.hasAttribute('data-repinta')) pintar();
});
raiz.addEventListener('change', (ev) => {
  const el = /** @type {HTMLElement} */ (ev.target);
  alBorrador(el);
  if (el.dataset.c) acciones[el.dataset.c]?.(el, ev);
  if (el.dataset.i) acciones[el.dataset.i]?.(el, ev);
});
raiz.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = /** @type {HTMLElement} */ (ev.target);
  acciones[f.dataset.envio ?? '']?.(f, ev);
});

registrar({
  'candado-abrir': () => {
    E.ui.errorCandado = '';
    acceso.desbloquear().catch(() => { E.ui.errorCandado = 'No se pudo verificar. Intenta de nuevo.'; pintar(); });
  },
  'cerrar-hoja': () => {
    if (E.ui.ajustes?.codigo || E.ui.ajustes?.guion) { E.ui.ajustes.codigo = null; E.ui.ajustes.guion = null; pintar(); return; }
    volver(`#/${E.ui.ruta?.vista ?? 'hoy'}`);
  },
});

// ---------- Mantener al día ----------

window.addEventListener('online', () => { E.enLinea = true; pintar(); programarSync(); });
window.addEventListener('offline', () => { E.enLinea = false; pintar(); });
let ocultaDesde = 0;
const debeBloquear = () => !E.demo && E.modo === 'app' && !!E.dispositivo?.con_huella && acceso.bloqueoActivo();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Más de un minuto fuera de la app: vuelve a pedir la huella.
    if (ocultaDesde && Date.now() - ocultaDesde > 60000 && debeBloquear()) { E.candado = true; pintar(); }
    programarSync();
  } else {
    ocultaDesde = Date.now();
    guardarNotaAbierta();
  }
});
window.addEventListener('pagehide', guardarNotaAbierta);
setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 30000);

// ---------- Arranque ----------

E.alPerderSesion = (codigo) => { acceso.sinSesion(codigo); };

const consulta = new URLSearchParams(location.search);
// Texto compartido desde otra app ("Compartir → Mi Central") se vuelve una nota nueva.
const compartido = [consulta.get('titulo'), consulta.get('texto'), consulta.get('enlace')].filter(Boolean);
if (compartido.length) {
  E.ui.semilla = { titulo: consulta.get('titulo') ?? '', contenido: [consulta.get('texto'), consulta.get('enlace')].filter(Boolean).join('\n') };
  history.replaceState(null, '', '/#/notas/nueva');
}

if (consulta.has('demo')) {
  cargarDemo();
} else {
  if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (ev) => { if (ev.data?.tipo === 'sincronizar') programarSync(); });
  }
  await acceso.iniciar();
  if (debeBloquear()) E.candado = true;
}
alCambiarRuta();
