// "Más", Actividad y Ajustes: dispositivos vinculados, notificaciones, Google, tema y respaldo.

import { html } from '../nucleo/html.js';
import { E, prefs, guardarPrefs, pintar } from '../datos/estado.js';
import { pedir, mensajeError } from '../datos/api.js';
import { registrar, avisar } from '../nucleo/acciones.js';
import { cabecera, hoja, icono, vacio } from './comun.js';
import * as acceso from '../seguridad/acceso.js';
import { estadoAvisos, activarAvisos, desactivarAvisos, probarAvisos } from '../avisos.js';
import { hace } from '../nucleo/util.js';

// ---------- Más ----------

export const vistaMas = {
  pintar() {
    const enlaces = [
      ['#/ia', 'Asistente', 'Pregúntale lo que sea sobre lo tuyo', 'chispa'],
      ['#/reto', 'Reto', 'Juego de Python e inglés contra el reloj', 'juego'],
      ['#/metas', 'Metas', 'A dónde quieres llegar', 'meta'],
      ['#/materias', 'Materias y calificaciones', '¿Gano el año? Y tu horario', 'libro'],
      ['#/datos', 'Mis datos', 'Perfil, habilidades y proyectos', 'persona'],
      ['#/buscar', 'Buscar', 'En todo lo tuyo a la vez', 'buscar'],
      ['#/actividad', 'Actividad', 'Todo lo que ha cambiado', 'reloj'],
      ['#/ajustes', 'Ajustes', 'Dispositivos, avisos, Google y respaldo', 'ajustes'],
    ];
    return html`${cabecera('Más')}
      <main class="contenido"><div class="lista" style="margin-top:8px">
        ${enlaces.map(([h, t, d, i]) => html`<a class="fila" href="${h}"><span class="redondo">${icono(i)}</span><div class="cuerpo"><div class="titulo">${t}</div><div class="detalle">${d}</div></div>${icono('flecha')}</a>`)}
      </div></main>`;
  },
};

// ---------- Actividad ----------

export const vistaActividad = {
  alEntrar() {
    E.ui.actividad = null;
    if (E.demo) { E.ui.actividad = []; return; }
    pedir('/actividad').then((r) => { E.ui.actividad = r.cambios; }).catch(() => { E.ui.actividad = []; }).finally(pintar);
  },
  pintar() {
    const lista = E.ui.actividad;
    return html`${cabecera('Actividad', { atras: '#/mas' })}
      <main class="contenido">
        ${!lista ? vacio('Cargando…', '') : !lista.length ? vacio('Sin actividad', E.demo ? 'En la demostración no se guarda el registro.' : 'Aquí verás cada cambio y desde dónde se hizo.')
          : html`<div class="lista" style="margin-top:8px">${lista.map((/** @type {any} */ c) => html`<div class="fila" data-k="c-${c.id}">
              <div class="cuerpo"><div class="titulo" style="white-space:normal">${c.resumen}</div><div class="detalle">${c.origen} · ${hace(c.creado_en)}</div></div>
            </div>`)}</div>`}
      </main>`;
  },
};

// ---------- Ajustes ----------

async function cargarAjustes() {
  const a = E.ui.ajustes;
  a.avisos = await estadoAvisos().catch(() => 'no');
  a.huellaDisponible = await acceso.hayHuella();
  if (!E.demo) {
    await Promise.all([
      pedir('/dispositivos').then((r) => { a.dispositivos = r.dispositivos; }).catch(() => {}),
      pedir('/puente/estado').then((r) => { a.puente = r; }).catch(() => {}),
    ]);
  }
  pintar();
}

/** Corre una acción mostrando el error si falla. @param {() => Promise<void>} fn */
async function intentar(fn) {
  try {
    await fn();
  } catch (e) {
    avisar(mensajeError(e));
  }
  await cargarAjustes();
}

/** @param {string} clave @param {string} titulo @param {string} detalle */
function interruptor(clave, titulo, detalle) {
  return html`<label class="interruptor"><div class="cuerpo"><div>${titulo}</div><div class="detalle">${detalle}</div></div>
    <input type="checkbox" data-c="pref-cambiar" data-clave="${clave}" ${prefs()[clave] ? 'checked' : ''}></label>`;
}

function hojaAjustes() {
  const a = E.ui.ajustes;
  if (a.codigo) {
    return hoja('Vincular otro dispositivo', html`
      <ol class="pasos-lista">
        <li>Abre <b>${location.host}</b> en el otro celular o computador.</li>
        <li>Escribe este código. Sirve una sola vez y vence en ${a.codigo.minutos} minutos.</li>
      </ol>
      <div class="codigo-grande">${a.codigo.codigo}</div>
      <div class="pie"><button class="boton primario" data-a="cerrar-hoja">Listo</button></div>`);
  }
  if (a.guion) {
    return hoja('Conectar Google', html`
      <p class="nota-pie" style="margin:0">Un pequeño programa en tu cuenta de Google envía los correos a tu Gmail y pone las tareas en tu calendario. Corre dentro de tu cuenta: nadie más ve tus datos.</p>
      <ol class="pasos-lista">
        <li>Toca <b>Copiar código</b>.</li>
        <li>Abre <a href="https://script.new" target="_blank" rel="noopener noreferrer">script.new</a> con tu cuenta de Google.</li>
        <li>Borra lo que haya, pega el código y guarda.</li>
        <li>Arriba elige la función <b>instalar</b> y toca <b>Ejecutar</b>.</li>
        <li>Google te pide permiso: acepta. Si dice que la app no está verificada, entra por <b>Configuración avanzada</b>.</li>
      </ol>
      <div class="pie"><button class="boton primario" data-a="google-copiar">Copiar código</button></div>
      <p class="nota-pie">Cuando termines, vuelve a Ajustes: en unos minutos dirá "Conectado".</p>`);
  }
  return '';
}

export const vistaAjustes = {
  alEntrar() {
    E.ui.ajustes = { avisos: 'apagado', dispositivos: null, puente: null, codigo: null, guion: null, huellaDisponible: false };
    cargarAjustes();
  },
  pintar() {
    const a = E.ui.ajustes ?? {};
    const yo = E.dispositivo;
    const p = prefs();
    const textoAvisos = { no: 'Este navegador no las permite', bloqueado: 'Bloqueadas en el navegador', apagado: 'Apagadas en este dispositivo', activo: 'Activas en este dispositivo' }[/** @type {string} */ (a.avisos)] ?? '';
    return html`${cabecera('Ajustes', { atras: '#/mas' })}
      <main class="contenido">
        <section class="seccion"><h2>Este dispositivo</h2><div class="lista">
          <div class="fila"><div class="cuerpo"><div class="titulo">${yo?.nombre}</div><div class="detalle">${yo?.con_huella ? 'Entra con huella' : 'Entra sin huella'}</div></div>
            ${!yo?.con_huella && a.huellaDisponible && !E.demo ? html`<button class="boton" data-a="huella-activar">Activar huella</button>` : ''}</div>
          ${yo?.con_huella && !E.demo ? html`<label class="interruptor"><div class="cuerpo"><div>Bloquear al salir</div><div class="detalle">Pide Face ID o huella cada vez que abres la app</div></div>
            <input type="checkbox" data-c="bloqueo-cambiar" ${acceso.bloqueoActivo() ? 'checked' : ''}></label>` : ''}
          <div class="fila"><div class="cuerpo"><div class="titulo">Notificaciones</div><div class="detalle">${textoAvisos}</div></div>
            ${E.demo ? '' : a.avisos === 'activo'
              ? html`<button class="boton" data-a="avisos-probar">Probar</button><button class="boton-icono" data-a="avisos-apagar" aria-label="Apagar notificaciones">${icono('x')}</button>`
              : a.avisos === 'apagado' ? html`<button class="boton primario" data-a="avisos-activar">Activar</button>` : ''}</div>
        </div></section>

        <section class="seccion"><h2>Avisos</h2><div class="lista">
          ${interruptor('avisar_cambios', 'Avisar cada cambio', 'Un aviso cuando algo se crea, se edita o se borra')}
          ${interruptor('avisar_mismo_dispositivo', 'También en este dispositivo', 'Avisar aunque el cambio lo hayas hecho aquí')}
          ${interruptor('resumen_push', 'Resumen del día', 'Una notificación con lo que toca hoy')}
          ${interruptor('resumen_correo', 'Resumen por correo', 'Llega a tu Gmail si Google está conectado')}
          ${interruptor('calendario', 'Tareas al calendario', 'Las tareas con fecha pasan a Google Calendar')}
          ${interruptor('respaldo_semanal', 'Respaldo semanal', 'Cada domingo, una copia de todo a tu Gmail')}
          <label class="interruptor"><div class="cuerpo"><div>Hora del resumen</div></div>
            <input class="entrada" type="time" data-c="pref-hora" value="${p.resumen_hora}" style="appearance:auto;width:auto;height:auto;background:var(--capa-2);border-radius:10px;padding:6px 8px;min-height:0"></label>
        </div></section>

        <section class="seccion"><h2>Dispositivos vinculados</h2>
          ${E.demo ? html`<p class="nota-pie">No disponible en la demostración.</p>` : html`<div class="lista">
            ${(a.dispositivos ?? []).map((/** @type {any} */ d) => html`<div class="fila" data-k="dv-${d.id}">
              <div class="cuerpo"><div class="titulo">${d.nombre}${d.actual ? ' (este)' : ''}</div>
                <div class="detalle">${d.con_huella ? 'Con huella' : 'Sin huella'} · ${d.avisos ? 'con avisos' : 'sin avisos'} · visto ${hace(d.ultimo_uso)}</div></div>
              ${d.actual ? '' : html`<button class="boton peligro" data-a="dispositivo-quitar" data-id="${d.id}" data-nombre="${d.nombre}">Quitar</button>`}
            </div>`)}
            ${a.dispositivos ? '' : html`<div class="fila"><div class="cuerpo detalle">Cargando…</div></div>`}
          </div>
          <button class="boton ancho" data-a="dispositivo-vincular" style="margin-top:10px">${icono('suma')} Vincular otro dispositivo</button>`}
        </section>

        <section class="seccion"><h2>Google: correo y calendario</h2>
          ${E.demo ? html`<p class="nota-pie">No disponible en la demostración.</p>` : html`<div class="lista"><div class="fila">
            <div class="cuerpo"><div class="titulo">${a.puente?.visto_en ? 'Conectado' : a.puente?.conectado ? 'Esperando el primer contacto' : 'Sin conectar'}</div>
              <div class="detalle">${a.puente?.visto_en ? `Último contacto ${hace(a.puente.visto_en)}` : 'Hace falta para los correos y el calendario'}</div></div>
            ${a.puente?.conectado ? html`<button class="boton peligro" data-a="google-quitar">Quitar</button>` : ''}
            <button class="boton ${a.puente?.conectado ? '' : 'primario'}" data-a="google-conectar">${a.puente?.conectado ? 'Reconectar' : 'Conectar'}</button>
          </div></div>`}
        </section>

        ${E.demo ? '' : html`<section class="seccion"><h2>Tus datos</h2><div class="botones">
          <button class="boton" data-a="respaldo-bajar">Descargar respaldo</button>
          <button class="boton peligro" data-a="desvincular-este">Desvincular este dispositivo</button>
        </div><p class="nota-pie">Desvincular borra los datos guardados en este dispositivo. En el servidor siguen intactos.</p></section>`}
      </main>
      ${hojaAjustes()}`;
  },
};

registrar({
  'pref-cambiar': (el) => guardarPrefs({ [/** @type {string} */ (el.dataset.clave)]: /** @type {HTMLInputElement} */ (el).checked }),
  'bloqueo-cambiar': (el) => { acceso.ponerBloqueo(/** @type {HTMLInputElement} */ (el).checked); pintar(); },
  'pref-hora': (el) => { const v = /** @type {HTMLInputElement} */ (el).value; if (v) guardarPrefs({ resumen_hora: v }); },
  'huella-activar': () => intentar(async () => { await acceso.activarHuella(); avisar('Huella activada'); }),
  'avisos-activar': () => intentar(async () => { await activarAvisos(); avisar('Notificaciones activadas'); }),
  'avisos-apagar': () => intentar(desactivarAvisos),
  'avisos-probar': () => intentar(async () => { avisar(await probarAvisos() ? 'Enviada. Debe llegarte en unos segundos.' : 'El servicio no la aceptó. Apaga y activa de nuevo.'); }),
  'dispositivo-vincular': () => intentar(async () => { E.ui.ajustes.codigo = await pedir('/vincular/codigo', {}); }),
  'dispositivo-quitar': (el) => {
    if (!confirm(`¿Quitar "${el.dataset.nombre}"? Ya no podrá entrar y sus datos locales se borrarán.`)) return;
    intentar(async () => { await pedir('/dispositivos/revocar', { id: el.dataset.id }); avisar('Dispositivo desvinculado'); });
  },
  'google-conectar': () => intentar(async () => {
    const plantilla = await fetch('/puente-google/Codigo.gs').then((r) => r.text());
    const { secreto, url } = await pedir('/puente/secreto', {});
    E.ui.ajustes.guion = plantilla.replace('__URL__', url).replace('__SECRETO__', secreto);
  }),
  'google-copiar': async () => {
    try {
      await navigator.clipboard.writeText(E.ui.ajustes.guion);
      avisar('Código copiado');
    } catch {
      avisar('No se pudo copiar. Inténtalo desde un computador.');
    }
  },
  'google-quitar': () => {
    if (confirm('¿Quitar la conexión con Google? Dejarán de llegar correos y eventos.')) intentar(async () => { await pedir('/puente/desconectar', {}); });
  },
  'respaldo-bajar': () => intentar(async () => {
    const datos = await pedir('/exportar');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
    a.download = `mi-central-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }),
  'desvincular-este': () => {
    if (confirm('¿Desvincular este dispositivo? Se borran sus datos locales y tendrás que vincularlo de nuevo con un código.')) acceso.desvincularEste();
  },
});
