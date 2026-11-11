// Guardado local en el dispositivo (IndexedDB). Aquí viven los datos para usarlos sin conexión
// y la llave privada del dispositivo, que el navegador no deja copiar.

const NOMBRE = 'mi-central';

/** @returns {Promise<IDBDatabase>} */
function abrir() {
  return new Promise((ok, mal) => {
    const p = indexedDB.open(NOMBRE, 1);
    p.onupgradeneeded = () => p.result.createObjectStore('kv');
    p.onsuccess = () => ok(p.result);
    p.onerror = () => mal(p.error);
  });
}

/** @param {string} clave @returns {Promise<any>} */
export async function leer(clave) {
  const bd = await abrir();
  return new Promise((ok, mal) => {
    const p = bd.transaction('kv').objectStore('kv').get(clave);
    p.onsuccess = () => ok(p.result);
    p.onerror = () => mal(p.error);
  });
}

/** @param {string} clave @param {any} valor */
export async function escribir(clave, valor) {
  const bd = await abrir();
  return new Promise((ok, mal) => {
    const t = bd.transaction('kv', 'readwrite');
    t.objectStore('kv').put(valor, clave);
    t.oncomplete = () => ok(undefined);
    t.onerror = () => mal(t.error);
  });
}

export async function borrarTodo() {
  const bd = await abrir();
  return new Promise((ok, mal) => {
    const t = bd.transaction('kv', 'readwrite');
    t.objectStore('kv').clear();
    t.oncomplete = () => ok(undefined);
    t.onerror = () => mal(t.error);
  });
}
