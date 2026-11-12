// Reto: un juego de preguntas contra el reloj. "¿Qué imprime este código?" en Python y preguntas de inglés.
// Tres vidas, dificultad que sube rápido y la explicación después de cada respuesta. El récord se guarda en este dispositivo.

import { html } from '../nucleo/html.js';
import { E, pintar } from '../datos/estado.js';
import { registrar } from '../nucleo/acciones.js';
import { cabecera, icono } from './comun.js';
import { PYTHON } from '../datos/reto-python.js';
import { INGLES } from '../datos/reto-ingles.js';

const MODOS = {
  python: { nombre: 'Python', detalle: '¿Qué imprime este código?' },
  ingles: { nombre: 'Inglés', detalle: 'Gramática, phrasal verbs y falsos amigos' },
  mezcla: { nombre: 'Mezcla', detalle: 'Una de Python, una de inglés' },
};
/** @typedef {keyof typeof MODOS} Modo */

const VIDAS = 3;
/** Segundos para responder según el tipo y el nivel. */
const TIEMPO = { python: [0, 25, 30, 40], ingles: [0, 14, 16, 20] };
const CLAVE = 'mc-reto';

/** @returns {Record<string, number>} */
function records() {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') ?? {}; } catch { return {}; }
}
/** @param {string} modo @param {number} puntos @returns {boolean} si es récord nuevo */
function anotarRecord(modo, puntos) {
  const r = records();
  if (puntos <= (r[modo] ?? 0)) return false;
  try { localStorage.setItem(CLAVE, JSON.stringify({ ...r, [modo]: puntos })); } catch { /* sin almacenamiento: el récord dura esta partida */ }
  return true;
}

/** @template T @param {T[]} lista @returns {T[]} */
function revolver(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Nivel según cuántas preguntas van: dos fáciles, cuatro medias y de ahí en adelante difíciles. @param {number} n */
const nivelDe = (n) => (n < 2 ? 1 : n < 6 ? 2 : 3);

function partida() {
  E.ui.reto ??= { fase: 'inicio' };
  return E.ui.reto;
}

/** Saca del mazo una pregunta del nivel pedido (o del más cercano que quede). */
function siguientePregunta() {
  const p = partida();
  const tipo = p.modo === 'mezcla' ? (p.n % 2 === 0 ? 'python' : 'ingles') : p.modo;
  const banco = tipo === 'python' ? PYTHON : INGLES;
  const nivel = nivelDe(p.n);
  let libres = banco.map((_, i) => i).filter((i) => !p.usadas[tipo].has(i));
  if (!libres.length) { p.usadas[tipo].clear(); libres = banco.map((_, i) => i); }
  const cerca = Math.min(...libres.map((i) => Math.abs(banco[i].n - nivel)));
  const elegida = revolver(libres.filter((i) => Math.abs(banco[i].n - nivel) === cerca))[0];
  p.usadas[tipo].add(elegida);
  const q = /** @type {any} */ (banco[elegida]);
  const bien = tipo === 'python' ? q.sale : q.bien;
  const segundos = TIEMPO[/** @type {'python' | 'ingles'} */ (tipo)][q.n];
  p.actual = { tipo, nivel: q.n, codigo: q.codigo ?? '', pregunta: q.pregunta ?? '', bien, por: q.por, opciones: revolver([bien, ...q.mal]), segundos, hasta: Date.now() + segundos * 1000 };
  p.elegida = null;
  p.ganado = 0;
  p.fase = 'pregunta';
  window.scrollTo(0, 0);
}

/** @param {string | null} opcion null si se acabó el tiempo */
function responder(opcion) {
  const p = partida();
  if (p.fase !== 'pregunta') return;
  const q = p.actual;
  const resto = Math.max(0, q.hasta - Date.now()) / (q.segundos * 1000);
  p.elegida = opcion;
  p.acerto = opcion === q.bien;
  if (p.acerto) {
    p.racha++;
    p.mejorRacha = Math.max(p.mejorRacha, p.racha);
    p.aciertos++;
    // Más puntos por nivel, por responder rápido y por la racha.
    p.ganado = Math.round((100 + 100 * resto) * q.nivel) + 25 * Math.min(p.racha - 1, 6);
    p.puntos += p.ganado;
  } else {
    p.racha = 0;
    p.vidas--;
    try { navigator.vibrate?.(120); } catch { /* sin vibración */ }
  }
  p.n++;
  p.fase = 'respuesta';
  // En pantallas pequeñas el botón de seguir queda abajo: se trae a la vista.
  setTimeout(() => document.querySelector('[data-a="reto-seguir"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
}

let reloj = 0;
function prenderReloj() {
  clearInterval(reloj);
  reloj = setInterval(() => {
    const p = partida();
    // Salir de la pantalla en plena pregunta abandona la partida.
    if (E.ui.ruta?.vista !== 'reto') { clearInterval(reloj); if (p.fase === 'pregunta' || p.fase === 'respuesta') E.ui.reto = { fase: 'inicio' }; return; }
    if (p.fase !== 'pregunta') return;
    if (Date.now() >= p.actual.hasta) responder(null);
    pintar();
  }, 200);
}

/** @param {Modo} modo */
function empezar(modo) {
  E.ui.reto = { fase: 'pregunta', modo, vidas: VIDAS, puntos: 0, racha: 0, mejorRacha: 0, aciertos: 0, n: 0, usadas: { python: new Set(), ingles: new Set() }, record: records()[modo] ?? 0 };
  siguientePregunta();
  prenderReloj();
}

// ---------- Pantallas ----------

function pantallaInicio() {
  const r = records();
  return html`<div class="reto-hola">
      <span class="redondo">${icono('juego')}</span>
      <h2>Reto</h2>
      <p>Contra el reloj y con ${VIDAS} vidas. Empieza suave y se pone difícil rápido. Entre más rápido respondas y más larga la racha, más puntos.</p>
    </div>
    <div class="lista">
      ${Object.entries(MODOS).map(([m, d]) => html`<button class="fila" data-a="reto-empezar" data-m="${m}">
        <div class="cuerpo"><div class="titulo">${d.nombre}</div><div class="detalle">${d.detalle}</div></div>
        <span class="derecha">${r[m] ? `Récord ${r[m].toLocaleString('es-CO')}` : 'Sin récord'}</span>${icono('flecha')}
      </button>`)}
    </div>`;
}

function marcador() {
  const p = partida();
  return html`<div class="reto-marcador">
    <span class="reto-vidas" aria-label="${p.vidas} vidas">${Array.from({ length: VIDAS }, (_, i) => html`<i class="${i < p.vidas ? 'viva' : ''}"></i>`)}</span>
    ${p.racha > 1 ? html`<span class="etiqueta ojo">Racha ${p.racha}</span>` : ''}
    <b>${p.puntos.toLocaleString('es-CO')}</b>
  </div>`;
}

function pantallaPregunta() {
  const p = partida();
  const q = p.actual;
  const respondida = p.fase === 'respuesta';
  const resto = respondida ? 0 : Math.max(0, q.hasta - Date.now());
  const fraccion = resto / (q.segundos * 1000);
  return html`${marcador()}
    <div class="reto-tiempo ${fraccion < 0.25 && !respondida ? 'poco' : ''}"><i style="width:${respondida ? 0 : Math.round(fraccion * 100)}%"></i></div>
    <div class="reto-rotulo"><span class="etiqueta">${q.tipo === 'python' ? 'Python' : 'English'} · nivel ${q.nivel}</span>${respondida ? '' : html`<span>${Math.ceil(resto / 1000)} s</span>`}</div>
    ${q.tipo === 'python'
      ? html`<p class="reto-pregunta">¿Qué imprime?</p><pre class="reto-codigo">${q.codigo}</pre>`
      : html`<p class="reto-pregunta grande-p">${q.pregunta}</p>`}
    <div class="reto-opciones ${q.tipo === 'python' ? 'mono' : ''}">
      ${q.opciones.map((/** @type {string} */ o, /** @type {number} */ i) => html`<button class="reto-opcion ${respondida && o === q.bien ? 'bien' : ''} ${respondida && o === p.elegida && o !== q.bien ? 'mal' : ''}"
        data-a="reto-responder" data-i="${i}" ${respondida ? 'disabled' : ''}>${o}</button>`)}
    </div>
    ${respondida ? html`<div class="tarjeta reto-explica ${p.acerto ? 'bien' : 'mal'}">
        <b>${p.acerto ? `¡Bien! +${p.ganado}` : p.elegida === null ? 'Se acabó el tiempo' : 'No era esa'}</b>
        <p>${q.por}</p>
      </div>
      <button class="boton primario ancho" data-a="reto-seguir">${p.vidas > 0 ? 'Siguiente' : 'Ver resultado'}</button>` : ''}`;
}

function pantallaFin() {
  const p = partida();
  return html`<div class="reto-hola">
      <span class="redondo">${icono('juego')}</span>
      <h2>${p.nuevoRecord ? '¡Récord nuevo!' : 'Se acabaron las vidas'}</h2>
      <b class="grande">${p.puntos.toLocaleString('es-CO')}</b>
      <p>${MODOS[/** @type {Modo} */ (p.modo)].nombre} · ${p.aciertos} ${p.aciertos === 1 ? 'acierto' : 'aciertos'} · mejor racha ${p.mejorRacha}${p.nuevoRecord ? '' : ` · récord ${Math.max(p.record, p.puntos).toLocaleString('es-CO')}`}</p>
    </div>
    <div class="botones">
      <button class="boton" data-a="reto-salir">Cambiar de modo</button>
      <button class="boton primario" data-a="reto-empezar" data-m="${p.modo}">Otra vez</button>
    </div>`;
}

export const vistaReto = {
  alEntrar() {
    const p = partida();
    if (p.fase === 'pregunta' || p.fase === 'respuesta') prenderReloj();
  },
  pintar() {
    const p = partida();
    return html`${cabecera('Reto', { atras: '#/mas' })}
      <main class="contenido reto">
        ${p.fase === 'inicio' ? pantallaInicio() : p.fase === 'fin' ? pantallaFin() : pantallaPregunta()}
      </main>`;
  },
};

registrar({
  'reto-empezar': (el) => { empezar(/** @type {Modo} */ (el.dataset.m)); pintar(); },
  'reto-responder': (el) => { responder(partida().actual.opciones[Number(el.dataset.i)]); pintar(); },
  'reto-seguir': () => {
    const p = partida();
    if (p.vidas > 0) siguientePregunta();
    else { p.nuevoRecord = anotarRecord(p.modo, p.puntos); p.fase = 'fin'; clearInterval(reloj); window.scrollTo(0, 0); }
    pintar();
  },
  'reto-salir': () => { E.ui.reto = { fase: 'inicio' }; pintar(); },
});
