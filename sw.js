// Offline simple: abre al instante desde lo guardado y, si hay internet, lo actualiza en segundo plano.
// Lo nuevo (canciones o código) se ve en la apertura siguiente. Para forzar todo de nuevo: cambia VERSION.
const VERSION = 'repertorio-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(['/index.html', '/canciones.js', '/editor.js'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  // Guardar (POST), otros sitios y ?fresco=1 (modo editor) van directo a la red.
  if (r.method !== 'GET' || u.origin !== location.origin || u.searchParams.has('fresco')) return;
  const llave = r.mode === 'navigate' ? '/index.html' : r;
  e.respondWith(caches.open(VERSION).then(async c => {
    const guardado = await c.match(llave);
    const red = fetch(r).then(x => { if (x.ok) c.put(llave, x.clone()); return x; }).catch(() => null);
    if (guardado) { e.waitUntil(red); return guardado; }
    return (await red) || new Response('Sin conexión', { status: 503 });
  }));
});
