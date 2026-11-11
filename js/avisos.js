// Notificaciones en este dispositivo (Web Push).

import { pedir } from './datos/api.js';

/** @param {string} t */
function deB64u(t) {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

export const soportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** @returns {Promise<'no' | 'bloqueado' | 'apagado' | 'activo'>} */
export async function estadoAvisos() {
  if (!soportado()) return 'no';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'activo' : 'apagado';
}

export async function activarAvisos() {
  if (!soportado()) throw new Error('Este navegador no permite notificaciones. En iPhone, primero agrega la app a la pantalla de inicio.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('No diste permiso para las notificaciones.');
  const reg = await navigator.serviceWorker.ready;
  const { clave } = await pedir('/push/clave');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(clave) });
  await pedir('/push/suscribir', { suscripcion: sub.toJSON() });
}

export async function desactivarAvisos() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await pedir('/push/quitar', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
}

/** Envía una notificación de prueba. Devuelve true si el servicio la aceptó. */
export async function probarAvisos() {
  const r = await pedir('/push/probar', {});
  return Array.isArray(r.estados) && r.estados.some((/** @type {number} */ e) => e >= 200 && e < 300);
}
