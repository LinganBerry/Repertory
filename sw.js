// Modo offline. Estrategia: RED PRIMERO, copia guardada como respaldo.
//  - Con internet: siempre carga y guarda lo más nuevo (los cambios del editor se ven sin pasos manuales).
//  - Sin internet (o con señal muy mala): usa la última copia guardada de la página y de las canciones.
// La primera visita debe ser con internet. No toca el editor ni los POST (guardar / entrar).
const CACHE = 'repertorio-v1';
const BASE = ['/', '/index.html', '/estilos.css', '/app.js', '/canciones.js', '/editor.js', '/teoria.js', '/vendor/tonal.min.js'];
const API = '/api/canciones';
const ESPERA_MS = 4000; // si la red tarda más, se muestra la copia guardada

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all([...BASE, API].map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { /* se guarda luego */ })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const guardable = url => url.origin === location.origin && (!url.pathname.startsWith('/api/') || (url.pathname === API && !url.search));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || !guardable(url)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const nav = req.mode === 'navigate';
    const copia = () => c.match(nav ? '/' : req, { ignoreSearch: nav });
    try {
      const r = await Promise.race([
        fetch(req, { cache: 'no-store' }),
        new Promise((_, no) => setTimeout(no, ESPERA_MS))
      ]);
      if (r.ok) c.put(nav ? '/' : req, r.clone());
      return r;
    } catch (err) {
      return (await copia()) || Response.error();
    }
  })());
});
