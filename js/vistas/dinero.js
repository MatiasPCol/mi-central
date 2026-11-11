// Dinero: registro de ingresos y gastos, con lo que tienes y el balance del mes.

import { html } from '../nucleo/html.js';
import { E, filas, fila, guardar, borrar, restaurar, pintar } from '../datos/estado.js';
import { registrar, volver, avisar } from '../nucleo/acciones.js';
import { cabecera, hoja, icono, vacio } from './comun.js';
import { fechaISO, fechaCorta, nuevoId } from '../nucleo/util.js';

const CATEGORIAS = {
  gasto: ['Comida', 'Transporte', 'Estudio', 'Ropa', 'Diversión', 'Celular', 'Salud', 'Otro'],
  ingreso: ['Mesada', 'Trabajo', 'Proyecto', 'Regalo', 'Venta', 'Otro'],
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "$ 12.500" @param {number} n */
export function pesos(n) {
  return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
}

/** @param {string} mes "2026-11" */
function nombreMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/** @param {string} mes @param {number} salto */
function moverMes(mes, salto) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + salto, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Resumen de un mes. @param {string} mes */
export function resumenMes(mes) {
  const lista = filas('movimientos').filter((m) => m.fecha.slice(0, 7) === mes);
  const ingresos = lista.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const gastos = lista.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto), 0);
  return { lista, ingresos, gastos, balance: ingresos - gastos };
}

/** Lo que tienes en total: todos los ingresos menos todos los gastos. */
export function saldoTotal() {
  return filas('movimientos').reduce((s, m) => s + (m.tipo === 'ingreso' ? 1 : -1) * Number(m.monto), 0);
}

/** Tarjeta grande de la pantalla "Hoy": lo que tienes, el mes y dos botones para anotar al instante. */
export function tarjetaDinero() {
  const hoy = fechaISO();
  const r = resumenMes(hoy.slice(0, 7));
  const total = saldoTotal();
  const gastoHoy = r.lista.filter((m) => m.tipo === 'gasto' && m.fecha === hoy).reduce((s, m) => s + Number(m.monto), 0);
  return html`<div class="tarjeta destacada plata">
    <a class="plata-cabeza" href="#/dinero"><span class="rotulo">${icono('dinero')} Tu plata</span><span class="ver">Ver todo ${icono('flecha')}</span></a>
    <a href="#/dinero"><b class="grande ${total < 0 ? 'rojo' : ''}">${pesos(total)}</b></a>
    <div class="par"><span><i class="punto"></i> Entró este mes <b>${pesos(r.ingresos)}</b></span><span><i class="punto mal"></i> Salió <b>${pesos(r.gastos)}</b></span></div>
    ${gastoHoy ? html`<p class="plata-hoy">Hoy llevas gastado <b>${pesos(gastoHoy)}</b></p>` : ''}
    <div class="botones">
      <a class="boton" href="#/dinero/nuevo/gasto">${icono('suma')} Gasto</a>
      <a class="boton" href="#/dinero/nuevo/ingreso">${icono('suma')} Ingreso</a>
    </div>
  </div>`;
}

function hojaMovimiento() {
  const b = E.ui.borrador;
  if (!b) return '';
  return hoja(b.nueva ? 'Nuevo movimiento' : 'Movimiento', html`
    <form data-envio="dinero-guardar">
      <div class="segmento">
        <button type="button" class="${b.tipo === 'gasto' ? 'activo gasto' : ''}" data-a="dinero-tipo" data-v="gasto">Gasto</button>
        <button type="button" class="${b.tipo === 'ingreso' ? 'activo ingreso' : ''}" data-a="dinero-tipo" data-v="ingreso">Ingreso</button>
      </div>
      <label class="campo"><span>Cuánto</span>
        <input class="entrada monto" inputmode="numeric" data-campo="montoTxt" value="${b.montoTxt}" placeholder="0" autocomplete="off" ${b.nueva ? 'autofocus' : ''}></label>
      <div class="campo"><span>Categoría</span><div class="chips envuelve">
        ${CATEGORIAS[/** @type {'gasto' | 'ingreso'} */ (b.tipo)].map((c) => html`<button type="button" class="chip ${b.categoria === c ? 'activo' : ''}" data-a="dinero-categoria" data-v="${c}">${c}</button>`)}
      </div></div>
      <div class="dos">
        <label class="campo"><span>Fecha</span><input class="entrada" type="date" data-campo="fecha" value="${b.fecha}"></label>
        <label class="campo"><span>Nota</span><input class="entrada" data-campo="nota" value="${b.nota}" placeholder="Opcional" maxlength="500" autocomplete="off"></label>
      </div>
      <div class="pie">
        ${b.nueva ? '' : html`<button type="button" class="boton peligro" data-a="dinero-borrar">${icono('basura')}</button>`}
        <button class="boton primario">Guardar</button>
      </div>
    </form>`);
}

export const vistaDinero = {
  /** @param {{ id: string | null, extra?: string | null }} ruta */
  alEntrar(ruta) {
    E.ui.borrador = null;
    if (!ruta.id) return;
    const m = ruta.id === 'nuevo' ? null : fila('movimientos', ruta.id);
    if (m) E.ui.borrador = { ...m, montoTxt: String(Math.round(Number(m.monto))) };
    else if (ruta.id === 'nuevo') {
      const tipo = ruta.extra === 'ingreso' ? 'ingreso' : 'gasto';
      E.ui.borrador = { id: nuevoId(), nueva: true, tipo, montoTxt: '', categoria: CATEGORIAS[tipo][0], nota: '', fecha: fechaISO() };
    }
  },
  pintar() {
    const mes = E.ui.mesDinero ?? fechaISO().slice(0, 7);
    const r = resumenMes(mes);
    const lista = r.lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en));
    /** @type {Record<string, number>} */
    const porCategoria = {};
    for (const m of lista.filter((x) => x.tipo === 'gasto')) porCategoria[m.categoria || 'Otro'] = (porCategoria[m.categoria || 'Otro'] ?? 0) + Number(m.monto);
    const categorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
    const fechas = Array.from(new Set(lista.map((m) => m.fecha)));
    const total = saldoTotal();
    return html`${cabecera('Dinero')}
      <main class="contenido">
        <div class="mes">
          <button class="boton-icono" data-a="dinero-mes" data-s="-1" aria-label="Mes anterior">${icono('atras')}</button>
          <b>${nombreMes(mes)}</b>
          <button class="boton-icono" data-a="dinero-mes" data-s="1" aria-label="Mes siguiente">${icono('flecha')}</button>
        </div>
        <div class="tarjeta destacada">
          <span class="rotulo">Balance del mes</span>
          <b class="grande ${r.balance < 0 ? 'rojo' : ''}">${pesos(r.balance)}</b>
          <div class="par"><span><i class="punto"></i> Ingresos <b>${pesos(r.ingresos)}</b></span><span><i class="punto mal"></i> Gastos <b>${pesos(r.gastos)}</b></span></div>
          <div class="plata-total"><span>Tienes en total</span><b class="${total < 0 ? 'rojo' : 'verde'}">${pesos(total)}</b></div>
        </div>
        <div class="botones" style="margin-top:10px">
          <a class="boton" href="#/dinero/nuevo/gasto">${icono('suma')} Gasto</a>
          <a class="boton" href="#/dinero/nuevo/ingreso">${icono('suma')} Ingreso</a>
        </div>
        ${lista.length ? html`<button class="boton ancho ia-boton" data-a="ia-preguntar" data-q="Revisa mi plata de ${nombreMes(mes)}: en qué se me va, cómo voy frente a lo que entra y qué me recomiendas.">${icono('chispa')} Que la IA revise este mes</button>` : ''}
        ${categorias.length ? html`<section class="seccion"><h2>En qué se fue</h2><div class="tarjeta">
          ${categorias.map(([c, v]) => html`<div class="renglon"><span>${c}</span><b>${pesos(v)}</b></div>
            <div class="barra roja"><i style="width:${Math.round((v / r.gastos) * 100)}%"></i></div>`)}
        </div></section>` : ''}
        ${lista.length ? fechas.map((f) => html`<section class="seccion"><h2>${fechaCorta(f)}</h2><div class="lista">
          ${lista.filter((m) => m.fecha === f).map((m) => html`<a class="fila" href="#/dinero/${m.id}" data-k="mv-${m.id}">
            <div class="cuerpo"><div class="titulo">${m.categoria || 'Sin categoría'}</div>${m.nota ? html`<div class="detalle">${m.nota}</div>` : ''}</div>
            <b class="${m.tipo === 'ingreso' ? 'verde' : 'rojo'}">${m.tipo === 'ingreso' ? '+' : '−'} ${pesos(m.monto)}</b>
          </a>`)}
        </div></section>`) : vacio('Sin movimientos este mes', 'Toca + para anotar un gasto o un ingreso.')}
      </main>
      <a class="fab" href="#/dinero/nuevo" aria-label="Nuevo movimiento">${icono('suma')}</a>
      ${hojaMovimiento()}`;
  },
};

registrar({
  'dinero-mes': (el) => { E.ui.mesDinero = moverMes(E.ui.mesDinero ?? fechaISO().slice(0, 7), Number(el.dataset.s)); pintar(); },
  'dinero-tipo': (el) => {
    const b = E.ui.borrador;
    b.tipo = el.dataset.v;
    b.categoria = CATEGORIAS[/** @type {'gasto' | 'ingreso'} */ (b.tipo)][0];
    pintar();
  },
  'dinero-categoria': (el) => { E.ui.borrador.categoria = el.dataset.v; pintar(); },
  'dinero-guardar': () => {
    const { nueva, montoTxt, ...b } = E.ui.borrador;
    const monto = Number(String(montoTxt).replace(/[^\d]/g, ''));
    if (!monto) { avisar('Escribe cuánto fue.'); return; }
    guardar('movimientos', { ...b, monto, fecha: b.fecha || fechaISO() });
    E.ui.mesDinero = (b.fecha || fechaISO()).slice(0, 7);
    volver('#/dinero');
  },
  'dinero-borrar': () => {
    const id = E.ui.borrador.id;
    borrar('movimientos', id);
    volver('#/dinero');
    avisar('Movimiento borrado', { etiqueta: 'Deshacer', accion: () => restaurar('movimientos', id) });
  },
});
