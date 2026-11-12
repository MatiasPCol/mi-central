// Service worker de Mi Central: deja abrir la app sin conexión y muestra las notificaciones.
// Con conexión siempre trae los archivos nuevos; sin conexión usa la última copia guardada.

const CACHE = 'mi-central-v5';
const BASE = ['/', '/estilos/app.css', '/js/app.js', '/js/tema.js', '/manifest.webmanifest', '/iconos/icono-192.png'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

/** Responde al instante con la copia guardada y la actualiza por detrás para la próxima vez. */
async function guardadoPrimero(pedido, ev) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(pedido, { ignoreSearch: pedido.mode === 'navigate' });
  const deRed = fetch(pedido, { cache: 'no-cache' }).then((r) => {
    if (r.ok) cache.put(pedido, r.clone());
    return r;
  });
  if (guardado) {
    ev.waitUntil(deRed.catch(() => {}));
    return guardado;
  }
  try {
    return await deRed;
  } catch {
    return (pedido.mode === 'navigate' ? await cache.match('/') : null) ?? Response.error();
  }
}

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // los datos nunca se guardan aquí
  ev.respondWith(guardadoPrimero(ev.request, ev));
});

self.addEventListener('push', (ev) => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch { d = {}; }
  ev.waitUntil(Promise.all([
    self.registration.showNotification(d.t || 'Mi Central', {
      body: d.c || '',
      icon: '/iconos/icono-192.png',
      badge: '/iconos/insignia-96.png',
      tag: d.i ? `aviso-${d.i}` : undefined,
      data: { url: d.u || '/' },
    }),
    self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ tipo: 'sincronizar' }))),
  ]));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const destino = new URL(ev.notification.data?.url || '/', self.location.origin).href;
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (cs) => {
    for (const c of cs) {
      if ('focus' in c) {
        await c.focus();
        if ('navigate' in c) await c.navigate(destino).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(destino);
  }));
});
