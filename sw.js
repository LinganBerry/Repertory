// Modo offline. Estrategia: RED PRIMERO, copia guardada como respaldo.
//  - Con internet: siempre carga y guarda lo más nuevo (los cambios del editor se ven sin pasos manuales).
//  - Sin internet (o con señal muy mala): usa la última copia guardada de la página y de las canciones.
// La primera visita debe ser con internet. No toca el editor ni los POST (guardar / entrar).
const CACHE = 'acordes-v2';
const BASE = ['/', '/index.html', '/estilos.css', '/app.js', '/canciones.js', '/editor.js', '/teoria.js', '/vendor/tonal.min.js', '/vendor/Tone.js'];
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
  const nav = req.mode === 'navigate';
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const copia = () => c.match(nav ? '/' : req, { ignoreSearch: nav });
    // Las muestras del piano no cambian: primero lo guardado (la 1ª vez se bajan y quedan para el modo offline).
    if (url.pathname.startsWith('/vendor/piano/')) { const g = await copia(); if (g) return g; }
    const red = fetch(req, { cache: 'no-store' });
    red.catch(() => {}); // si se queda sin atender, que no ensucie la consola
    const guardar = r => { if (r.status === 200) c.put(nav ? '/' : req, r.clone()).catch(() => {}); return r; };
    try {
      return guardar(await Promise.race([red, new Promise((_, no) => setTimeout(no, ESPERA_MS))]));
    } catch (err) {
      const g = await copia();
      if (g) return g;                                          // red lenta o sin internet: copia guardada
      return red.then(guardar).catch(() => Response.error());   // sin copia: esperar a la red lo que haga falta
    }
  })());
});
