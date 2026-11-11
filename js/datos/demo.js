// Modo demostración: datos inventados que viven solo en memoria. No habla con el servidor.
// Se abre con /?demo y sirve para mostrar la app sin enseñar datos reales.

import { E, ID_PREFS } from './estado.js';
import { fechaISO, sumarDias, nuevoId } from '../nucleo/util.js';

export function cargarDemo() {
  const hoy = fechaISO();
  const ahora = new Date().toISOString();
  /** @param {string} tabla @param {Record<string, any>[]} lista */
  const poner = (tabla, lista) => {
    E.tablas[tabla] = new Map(lista.map((f) => {
      const id = f.id ?? nuevoId();
      return [id, { id, creado_en: ahora, actualizado_en: ahora, eliminado_en: null, ...f }];
    }));
  };
  const mat = nuevoId(), fis = nuevoId(), ing = nuevoId(), meta1 = nuevoId(), meta2 = nuevoId();
  const dia = new Date().getDay();
  poner('materias', [
    { id: mat, nombre: 'Matemáticas', profesor: 'Prof. Gómez', color: 'azul', calificaciones: [3.8, 4.2], horario: [{ dia, inicio: '07:00', fin: '08:50' }], orden: 1 },
    { id: fis, nombre: 'Física', profesor: 'Prof. Ruiz', color: 'verde', calificaciones: [2.5, 2.9], horario: [{ dia, inicio: '09:10', fin: '10:50' }], orden: 2 },
    { id: ing, nombre: 'Inglés', profesor: '', color: 'morado', calificaciones: [4.5, 4.8, 4.6], horario: [], orden: 3 },
    { nombre: 'Sociales', profesor: '', color: 'rosa', calificaciones: [1.5, 2.0], horario: [], orden: 4 },
  ]);
  poner('metas', [
    { id: meta1, titulo: 'Aprender inteligencia artificial', descripcion: 'Entender cómo funcionan los modelos y usarlos en proyectos.', plazo: 'largo', fecha_objetivo: sumarDias(hoy, 300), estado: 'activa',
      pasos: [{ id: '1', texto: 'Terminar la guía de NumPy', hecho: true }, { id: '2', texto: 'Practicar con pandas', hecho: true }, { id: '3', texto: 'Primer modelo con scikit-learn', hecho: false }, { id: '4', texto: 'Proyecto propio con IA', hecho: false }] },
    { id: meta2, titulo: 'Ganar el año', descripcion: '', plazo: 'corto', fecha_objetivo: sumarDias(hoy, 25), estado: 'activa', pasos: [] },
    { titulo: 'Primer trabajo como programador', descripcion: '', plazo: 'largo', fecha_objetivo: null, estado: 'pausada', pasos: [] },
  ]);
  poner('tareas', [
    { titulo: 'Taller de funciones', detalle: 'Ejercicios 1 al 12 del libro.', fecha: hoy, hora: '14:00:00', prioridad: 1, hecha: false, materia_id: mat, meta_id: meta2, avisos: [60, 1440] },
    { titulo: 'Repasar vocabulario', detalle: '', fecha: hoy, hora: null, prioridad: 3, hecha: true, hecha_en: ahora, materia_id: ing, avisos: [] },
    { titulo: 'Informe de laboratorio', detalle: '', fecha: sumarDias(hoy, -1), hora: null, prioridad: 1, hecha: false, materia_id: fis, meta_id: meta2, avisos: [1440] },
    { titulo: 'Exposición de historia', detalle: '', fecha: sumarDias(hoy, 1), hora: '08:00:00', prioridad: 2, hecha: false, avisos: [1440] },
    { titulo: 'Practicar pandas 30 minutos', detalle: '', fecha: sumarDias(hoy, 3), hora: null, prioridad: 2, hecha: false, meta_id: meta1, avisos: [0] },
    { titulo: 'Comprar cuaderno', detalle: '', fecha: null, hora: null, prioridad: 3, hecha: false, avisos: [] },
  ]);
  poner('notas', [
    { titulo: 'Fórmulas de física', contenido: 'v = d / t\na = (vf - vi) / t\nF = m · a\n\nRepasar unidades antes del examen.', fijada: true, color: 'verde', materia_id: fis },
    { titulo: 'Ideas para proyectos', contenido: 'Un lector de facturas con IA.\nUna app para el inventario del taller.\nUn bot que me recuerde las tareas.', fijada: false, color: 'amarillo' },
    { titulo: '', contenido: 'Preguntarle al profe por la fecha del examen final.', fijada: false, color: '' },
    { titulo: 'Verbos irregulares', contenido: 'go · went · gone\nsee · saw · seen\nwrite · wrote · written', fijada: false, color: 'morado', materia_id: ing },
  ]);
  poner('proyectos', [
    { nombre: 'Portafolio personal', descripcion: 'Página personal con terminal interactiva.', tecnologias: 'HTML, CSS, JavaScript', enlace: 'https://ejemplo.com', tipo: 'real', estado: 'en uso', orden: 1 },
    { nombre: 'Contador de palabras', descripcion: 'Programa que cuenta palabras.', tecnologias: 'Python', enlace: '', tipo: 'practica', estado: 'terminado', orden: 2 },
  ]);
  poner('datos', [
    { grupo: 'Perfil', titulo: 'Nombre', contenido: 'Persona de Ejemplo', orden: 1 },
    { grupo: 'Perfil', titulo: 'Ciudad', contenido: 'Pereira, Colombia', orden: 2 },
    { grupo: 'Habilidades', titulo: 'Python', contenido: 'Junior', orden: 1 },
    { grupo: 'Habilidades', titulo: 'Git y GitHub', contenido: 'Junior', orden: 2 },
    { grupo: 'Idiomas', titulo: 'Español', contenido: 'Nativo', orden: 1 },
  ]);
  E.tablas.preferencias = new Map([[ID_PREFS, { id: ID_PREFS, valores: {} }]]);
  E.demo = true;
  E.dispositivo = { id: 'demo', nombre: 'Demostración', con_huella: false };
  E.modo = 'app';
}
