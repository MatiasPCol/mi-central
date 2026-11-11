// ¿Gano el año? El mismo cálculo del script gano_año.py, ahora dentro de la app.

/** @typedef {{ periodos: number, minima: number, maxima: number, aprobacion: number }} ConfigNotas */

/** @type {ConfigNotas} */
export const CONFIG_NOTAS = { periodos: 3, minima: 1, maxima: 5, aprobacion: 3 };

const dos = (/** @type {number} */ n) => n.toFixed(2);
/** Redondea hacia arriba a dos decimales, como el script original. @param {number} n */
const techo = (n) => Math.ceil(n * 100 - 1e-9) / 100;

/** Promedio de las notas que ya hay, o null. @param {number[]} notas */
export function promedio(notas) {
  return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
}

/**
 * @param {number[]} notas @param {ConfigNotas} [c]
 * @returns {{ estado: 'aprobada' | 'reprobada' | 'pendiente', mensaje: string, necesita: number | null }}
 */
export function estadoMateria(notas, c = CONFIG_NOTAS) {
  const suma = notas.reduce((a, b) => a + b, 0);
  const meta = c.aprobacion * c.periodos;
  const faltan = c.periodos - notas.length;
  if (faltan <= 0) {
    const final = suma / c.periodos;
    return final >= c.aprobacion
      ? { estado: 'aprobada', mensaje: `¡Ya aprobaste esta materia! Tu promedio final es ${dos(final)}.`, necesita: null }
      : { estado: 'reprobada', mensaje: `Completaste las ${c.periodos} notas, pero no alcanzaste el promedio mínimo de ${c.aprobacion}. Tu promedio final es ${dos(final)}.`, necesita: null };
  }
  const necesario = (meta - suma) / faltan;
  if (necesario <= c.minima) {
    return { estado: 'aprobada', mensaje: `¡Ya aprobaste esta materia! Incluso sacando la nota mínima (${c.minima}) en lo que falta, mantienes promedio ${c.aprobacion} o más.`, necesita: null };
  }
  if (necesario > c.maxima) {
    return { estado: 'reprobada', mensaje: `Con las notas actuales ya no es posible llegar al promedio mínimo de ${c.aprobacion}. Necesitarías un promedio de ${dos(necesario)} en las notas restantes (el máximo es ${c.maxima}).`, necesita: null };
  }
  const n = techo(necesario);
  const siguiente = `P${notas.length + 1}`;
  return {
    estado: 'pendiente',
    necesita: n,
    mensaje: faltan === 1
      ? `Para aprobar esta materia necesitas sacar al menos ${dos(n)} en ${siguiente}.`
      : `Para aprobar esta materia necesitas un promedio de al menos ${dos(n)} entre ${siguiente} y P${c.periodos}.`,
  };
}

/** Promedio general: cada nota que falta cuenta como la mínima. @param {number[][]} materias @param {ConfigNotas} [c] */
export function promedioGeneral(materias, c = CONFIG_NOTAS) {
  if (!materias.length) return null;
  let total = 0;
  for (const notas of materias) {
    total += notas.reduce((a, b) => a + b, 0) + Math.max(0, c.periodos - notas.length) * c.minima;
  }
  return total / (materias.length * c.periodos);
}
