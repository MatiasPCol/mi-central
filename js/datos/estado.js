// El estado de la app: los datos en memoria, lo pendiente por subir y la sincronización.
// Todo cambio se aplica primero aquí (al instante, aun sin conexión) y luego sube al servidor.

import * as almacen from './almacen.js';
import { pedir, ErrorApi } from './api.js';
import { CONFIG_NOTAS } from '../calculo/notas.js';

export const TABLAS = ['tareas', 'notas', 'materias', 'metas', 'proyectos', 'datos', 'movimientos', 'fotos', 'preferencias'];
export const ID_PREFS = '00000000-0000-4000-8000-000000000001';

const PREFS_BASE = {
  zona: 'America/Bogota', resumen_hora: '07:00', avisar_cambios: true, avisar_mismo_dispositivo: true,
  resumen_push: true, resumen_correo: true, respaldo_semanal: true, calendario: true,
  avisos_predeterminados: [1440], notas: CONFIG_NOTAS,
};

/** @typedef {Record<string, any>} Fila */

export const E = {
  /** @type {'cargando' | 'vincular' | 'bloqueada' | 'app'} */
  modo: 'cargando',
  demo: false,
  /** La app está abierta pero tapada hasta que el teléfono verifique la huella. */
  candado: false,
  /** @type {{ id: string, nombre: string, con_huella: boolean } | null} */
  dispositivo: null,
  /** @type {Record<string, Map<string, Fila>>} */
  tablas: Object.fromEntries(TABLAS.map((t) => [t, new Map()])),
  /** @type {Map<string, { tabla: string, id: string, borrar: boolean, n: number }>} */
  pendientes: new Map(),
  cursor: 0,
  enLinea: navigator.onLine,
  sincronizando: false,
  /** @type {number | null} */
  ultimaSync: null,
  /** Datos de pantalla: hoja abierta, borradores, filtros. @type {Record<string, any>} */
  ui: {},
  /** Lo llama la sincronización cuando el servidor dice que ya no hay sesión. @type {(codigo: string) => void} */
  alPerderSesion: () => {},
};

/** @type {Set<() => void>} */
const oyentes = new Set();
let pintura = false;

/** @param {() => void} fn */
export function alCambiar(fn) { oyentes.add(fn); }

/** Pide volver a dibujar la pantalla (junta varios pedidos en uno). */
export function pintar() {
  if (pintura) return;
  pintura = true;
  const hacer = () => {
    if (!pintura) return;
    pintura = false;
    for (const fn of oyentes) fn();
  };
  // El reloj de respaldo sirve cuando la pestaña está en segundo plano y el navegador no dibuja.
  requestAnimationFrame(hacer);
  setTimeout(hacer, 80);
}

// ---------- Leer ----------

/** Filas vivas de una tabla. @param {string} tabla @returns {Fila[]} */
export function filas(tabla) {
  return Array.from(E.tablas[tabla].values()).filter((f) => !f.eliminado_en);
}

/** @param {string} tabla @param {string | null | undefined} id @returns {Fila | null} */
export function fila(tabla, id) {
  const f = id ? E.tablas[tabla].get(id) : null;
  return f && !f.eliminado_en ? f : null;
}

/** @returns {typeof PREFS_BASE & Record<string, any>} */
export function prefs() {
  return { ...PREFS_BASE, ...(E.tablas.preferencias.get(ID_PREFS)?.valores ?? {}) };
}

// ---------- Cambiar ----------

let contador = 0;

/** @param {string} tabla @param {string} id @param {boolean} borrar */
function marcar(tabla, id, borrar) {
  E.pendientes.set(`${tabla}:${id}`, { tabla, id, borrar, n: ++contador });
  persistir();
  programarSync(900);
  pintar();
}

/** Crea o cambia una fila. @param {string} tabla @param {Fila} datos */
export function guardar(tabla, datos) {
  const ahora = new Date().toISOString();
  const previa = E.tablas[tabla].get(datos.id);
  E.tablas[tabla].set(datos.id, { creado_en: ahora, ...previa, ...datos, actualizado_en: ahora, eliminado_en: null });
  marcar(tabla, datos.id, false);
}

/** @param {string} tabla @param {string} id */
export function borrar(tabla, id) {
  const f = E.tablas[tabla].get(id);
  if (!f) return;
  E.tablas[tabla].set(id, { ...f, eliminado_en: new Date().toISOString() });
  marcar(tabla, id, true);
}

/** Deshace un borrado. @param {string} tabla @param {string} id */
export function restaurar(tabla, id) {
  const f = E.tablas[tabla].get(id);
  if (f) guardar(tabla, f);
}

/** @param {Record<string, any>} cambios */
export function guardarPrefs(cambios) {
  guardar('preferencias', { id: ID_PREFS, valores: { ...prefs(), ...cambios } });
}

// ---------- Guardado local ----------

let relojPersistir = 0;
function persistir() {
  if (E.demo) return;
  clearTimeout(relojPersistir);
  relojPersistir = setTimeout(() => {
    almacen.escribir('datos', {
      tablas: Object.fromEntries(TABLAS.map((t) => [t, Array.from(E.tablas[t].values())])),
      pendientes: Array.from(E.pendientes.values()),
      cursor: E.cursor,
    }).catch(() => {});
  }, 250);
}

export async function cargarLocal() {
  const d = await almacen.leer('datos').catch(() => null);
  if (!d) return;
  for (const t of TABLAS) E.tablas[t] = new Map((d.tablas?.[t] ?? []).map((/** @type {Fila} */ f) => [f.id, f]));
  E.pendientes = new Map((d.pendientes ?? []).map((/** @type {any} */ p) => [`${p.tabla}:${p.id}`, { ...p, n: ++contador }]));
  E.cursor = d.cursor ?? 0;
}

/** Borra los datos de memoria (al desvincular o cerrar sesión con borrado). */
export function vaciar() {
  for (const t of TABLAS) E.tablas[t] = new Map();
  E.pendientes = new Map();
  E.cursor = 0;
}

// ---------- Sincronizar ----------

let relojSync = 0;
/** @param {number} [ms] */
export function programarSync(ms = 0) {
  clearTimeout(relojSync);
  relojSync = setTimeout(() => { sincronizar(); }, ms);
}

export async function sincronizar() {
  if (E.demo || E.sincronizando || !E.dispositivo || E.modo !== 'app') return;
  E.sincronizando = true;
  pintar();
  const envio = Array.from(E.pendientes.values());
  const cambios = envio.map((p) => (p.borrar
    ? { tabla: p.tabla, id: p.id, borrar: true }
    : { tabla: p.tabla, id: p.id, datos: E.tablas[p.tabla].get(p.id) ?? {} }));
  try {
    const r = await pedir('/sincronizar', { cursor: E.cursor, cambios });
    for (const p of envio) {
      const k = `${p.tabla}:${p.id}`;
      if (E.pendientes.get(k)?.n === p.n) E.pendientes.delete(k);
    }
    for (const t of TABLAS) {
      const mapa = E.tablas[t];
      if (r.reiniciar) {
        for (const id of Array.from(mapa.keys())) if (!E.pendientes.has(`${t}:${id}`)) mapa.delete(id);
      }
      for (const f of r.filas?.[t] ?? []) {
        if (E.pendientes.has(`${t}:${f.id}`)) continue;
        if (f.eliminado_en) mapa.delete(f.id);
        else mapa.set(f.id, f);
      }
    }
    E.cursor = r.cursor;
    E.enLinea = true;
    E.ultimaSync = Date.now();
    persistir();
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 401) E.alPerderSesion(e.codigo);
    else if (e instanceof ErrorApi && e.estado === 0) E.enLinea = false;
  } finally {
    E.sincronizando = false;
    pintar();
    if (E.pendientes.size > 0 && E.enLinea && E.modo === 'app') programarSync(4000);
  }
}
