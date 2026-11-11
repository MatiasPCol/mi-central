// Llamadas al servidor. La sesión va en una cookie que el código de la página no puede leer.

export class ErrorApi extends Error {
  /** @param {number} estado @param {string} codigo */
  constructor(estado, codigo) {
    super(codigo);
    this.estado = estado;
    this.codigo = codigo;
  }
}

/**
 * GET si no hay cuerpo, POST si lo hay.
 * @param {string} ruta @param {any} [cuerpo] @returns {Promise<any>}
 */
export async function pedir(ruta, cuerpo) {
  /** @type {Response} */
  let r;
  try {
    r = await fetch('/api' + ruta, cuerpo === undefined
      ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mc': '1' }, body: JSON.stringify(cuerpo) });
  } catch {
    throw new ErrorApi(0, 'sin_conexion');
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, datos.error ?? 'error');
  return datos;
}

/** @type {Record<string, string>} */
const MENSAJES = {
  sin_conexion: 'No hay conexión. Intenta de nuevo.',
  codigo_invalido: 'Ese código no sirve o ya venció. Pide uno nuevo.',
  demasiados_intentos: 'Demasiados intentos. Espera 15 minutos.',
  reto_invalido: 'Se venció el tiempo. Intenta de nuevo.',
  huella_invalida: 'No se pudo comprobar la huella.',
  falta_huella: 'Este dispositivo necesita la huella para entrar.',
  firma_invalida: 'Este dispositivo no coincide con el vinculado.',
  no_vinculado: 'Este dispositivo no está vinculado.',
  revocado: 'Este dispositivo fue desvinculado.',
  origen_no_permitido: 'La app se abrió desde una dirección no permitida.',
  ia_sin_configurar: 'La IA todavía no tiene su llave. Falta ponerla en Supabase.',
  ia_llave: 'La llave de la IA no sirve. Revísala en Supabase.',
  ia_limite: 'Se acabaron las preguntas gratis por ahora. Intenta en un rato o mañana.',
  ia_ocupada: 'La IA está muy ocupada. Intenta en un momento.',
  ia_fallo: 'La IA no pudo responder. Intenta de nuevo.',
  ia_pregunta_invalida: 'Esa pregunta es demasiado larga.',
  suscripcion_invalida: 'Este navegador usa un servicio de notificaciones no admitido.',
};

/** @param {unknown} e */
export function mensajeError(e) {
  if (e instanceof ErrorApi) return MENSAJES[e.codigo] ?? 'Algo falló en el servidor. Intenta de nuevo.';
  return e instanceof Error ? e.message : 'Algo falló.';
}
