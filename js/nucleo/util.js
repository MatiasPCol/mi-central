// Fechas, textos y pequeñas ayudas.

export const nuevoId = () => crypto.randomUUID();

/** Fecha local en formato AAAA-MM-DD. @param {Date} [d] */
export function fechaISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** @param {string} iso @param {number} dias */
export function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  return fechaISO(new Date(a, m - 1, d + dias));
}

/** @param {string} iso */
export function aFecha(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** "martes 10 de noviembre" @param {Date} [d] */
export function fechaLarga(d = new Date()) {
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** "Hoy", "Mañana", "Ayer" o "mar 12 nov". @param {string} iso */
export function fechaCorta(iso) {
  const hoy = fechaISO();
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  if (iso === sumarDias(hoy, -1)) return 'Ayer';
  const d = aFecha(iso);
  const base = `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "14:30:00" → "2:30 p. m." @param {string | null | undefined} hora */
export function horaCorta(hora) {
  if (!hora) return '';
  const [h, m] = hora.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** "hace 5 min" @param {string | number | Date} cuando */
export function hace(cuando) {
  const seg = Math.max(0, (Date.now() - new Date(cuando).getTime()) / 1000);
  if (seg < 60) return 'ahora';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  const dias = Math.floor(seg / 86400);
  if (dias < 30) return dias === 1 ? 'ayer' : `hace ${dias} días`;
  return new Date(cuando).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Quita tildes y pasa a minúsculas, para buscar. @param {string} t */
export function plano(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** @template {(...a: any[]) => void} F @param {F} fn @param {number} ms @returns {F} */
export function conPausa(fn, ms) {
  /** @type {any} */
  let reloj;
  return /** @type {F} */ ((...a) => {
    clearTimeout(reloj);
    reloj = setTimeout(() => fn(...a), ms);
  });
}

export function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
