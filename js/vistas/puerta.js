// La puerta: vincular este dispositivo con un código, o volver a entrar con la huella.

import { html } from '../nucleo/html.js';
import { E, pintar } from '../datos/estado.js';
import { mensajeError } from '../datos/api.js';
import { registrar } from '../nucleo/acciones.js';
import * as acceso from '../seguridad/acceso.js';

function nombreSugerido() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Celular Android';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Windows/i.test(ua)) return 'PC Windows';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Mi dispositivo';
}

export function vistaVincular() {
  const p = (E.ui.puerta ??= { codigo: '', nombre: nombreSugerido(), ocupado: false, error: '', huella: null });
  if (p.huella === null) {
    p.huella = false;
    acceso.hayHuella().then((si) => { p.huella = si; p.conHuella = si; pintar(); });
  }
  return html`<div class="puerta"><div class="caja">
    <div class="logo"></div>
    <h1>Mi Central</h1>
    <p class="lema">Privada. Solo entran tus dispositivos vinculados.</p>
    ${E.ui.aviso ? html`<p class="error" style="margin-bottom:12px">${E.ui.aviso}</p>` : ''}
    <form data-envio="puerta-vincular">
      <label class="campo"><span>Código de vinculación</span>
        <input class="entrada codigo" data-puerta="codigo" value="${p.codigo}" placeholder="XXXXX-XXXXX" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <label class="campo"><span>Nombre de este dispositivo</span>
        <input class="entrada" data-puerta="nombre" value="${p.nombre}" maxlength="60" autocomplete="off"></label>
      ${p.huella ? html`<label class="interruptor" style="padding:14px 2px 0;border:0"><div class="cuerpo"><div>Pedir huella para entrar</div><div class="detalle">Recomendado: usa la huella o el bloqueo del teléfono</div></div>
        <input type="checkbox" data-c="puerta-huella" ${p.conHuella ? 'checked' : ''}></label>` : ''}
      <button class="boton primario ancho" style="margin-top:20px" ${p.ocupado ? 'disabled' : ''}>${p.ocupado ? 'Vinculando…' : 'Vincular este dispositivo'}</button>
      ${p.error ? html`<p class="error">${p.error}</p>` : ''}
    </form>
    <p class="nota-pie" style="text-align:center;margin-top:18px">El código lo da un dispositivo ya vinculado, en Ajustes. Si es el primero, pídeselo a Claude.</p>
  </div></div>`;
}

export function vistaBloqueada() {
  const p = (E.ui.puerta ??= { ocupado: false, error: '' });
  return html`<div class="puerta"><div class="caja">
    <div class="logo"></div>
    <h1>Mi Central</h1>
    <p class="lema">${E.dispositivo?.nombre ?? ''}</p>
    <button class="boton primario ancho" data-a="puerta-entrar" ${p.ocupado ? 'disabled' : ''}>${p.ocupado ? 'Entrando…' : E.dispositivo?.con_huella ? 'Entrar con huella' : 'Entrar'}</button>
    ${p.error ? html`<p class="error">${p.error}</p>` : ''}
  </div></div>`;
}

/** @param {() => Promise<void>} fn */
async function conPuerta(fn) {
  const p = E.ui.puerta;
  p.ocupado = true;
  p.error = '';
  pintar();
  try {
    await fn();
  } catch (e) {
    const cancelado = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError');
    if (E.ui.puerta) {
      E.ui.puerta.error = cancelado ? 'Se canceló la huella. Intenta de nuevo.' : mensajeError(e);
      E.ui.puerta.ocupado = false;
    }
    pintar();
  }
}

registrar({
  'puerta-huella': (el) => { E.ui.puerta.conHuella = /** @type {HTMLInputElement} */ (el).checked; },
  'puerta-vincular': () => {
    const p = E.ui.puerta;
    if (p.codigo.replace(/[^A-Za-z0-9]/g, '').length !== 10) { p.error = 'El código tiene 10 letras y números.'; pintar(); return; }
    E.ui.aviso = '';
    conPuerta(() => acceso.vincular(p.codigo, p.nombre.trim() || nombreSugerido(), !!p.conHuella));
  },
  'puerta-entrar': () => conPuerta(() => acceso.entrar()),
});
