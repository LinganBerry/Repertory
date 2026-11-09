// Modo offline. Estrategia: RED PRIMERO, copia guardada como respaldo.
//  - Con internet: siempre carga lo más nuevo (los cambios del editor se ven sin pasos manuales).
//  - Sin internet (o con señal muy mala): usa la última copia guardada de la página y de las canciones.
// La copia de la página (BASE + ESCUCHA) es UN PAQUETE: se baja completo o no se guarda, y se renueva completo (no archivo por archivo),
// así sin internet nunca se mezcla HTML de una versión con JS de otra. Cambia CACHE solo si cambia esta estrategia o la lista de archivos.
// La primera visita debe ser con internet. No toca el editor ni los POST (guardar / entrar).
const CACHE = 'acordes-v16';
// Tone.js, Tonal y las muestras del piano NO se precargan: se guardan la primera vez que abres Teoría (con internet).
// Motor de escucha (PitchPlease, ~1,2 MB): se guarda junto con la página para que Escuchar funcione sin internet.
const ESCUCHA = ['/escucha/escucha.js', '/escucha/pitchplease/pitchplease.js', '/escucha/pitchplease/engine/errors.js', '/escucha/pitchplease/engine/fft.js', '/escucha/pitchplease/engine/incport-relaxed.wasm', '/escucha/pitchplease/engine/incport-wasm.js', '/escucha/pitchplease/engine/incport.js', '/escucha/pitchplease/engine/incport.wasm', '/escucha/pitchplease/engine/kernel-load.js', '/escucha/pitchplease/engine/kernels.js', '/escucha/pitchplease/engine/load.js', '/escucha/pitchplease/engine/models.js', '/escucha/pitchplease/engine/music.js', '/escucha/pitchplease/engine/processor.js', '/escucha/pitchplease/engine/resample.js', '/escucha/pitchplease/engine/tracker.js', '/escucha/pitchplease/engine/worklet.js', '/escucha/pitchplease/models/piano.bin'];
const BASE = ['/', '/index.html', '/estilos.css', '/app.js', '/hoja.js', '/romanos.js', '/analisis.js', '/local.js', '/canciones.js', '/editor.js', '/teoria.js', '/notacion.js', '/lecciones.js', '/practicar.js', '/retos.js', '/progresiones.js', '/escalas.js', '/rearmonizar.js', '/preparar.js', '/listas.js', '/manifest.webmanifest', '/icono-192.png'];
const API = '/api/canciones';
const ESPERA_MS = 4000;          // si la red tarda más, se muestra la copia guardada
const ESPERA_FRESCA_MS = 12000;  // archivos de una página que ya salió de la red: se espera más para no mezclar versiones
const PAQUETE = [...BASE, ...ESCUCHA];
const EN_PAQUETE = new Set(PAQUETE.map(u => new URL(u, location.href).pathname));
const MARCA = '/__paquete';      // anota cuándo se renovó el paquete (no es un archivo real)
const RENOVAR_MS = 60 * 60 * 1000;    // con internet, el paquete guardado se renueva como mucho una vez por hora
const REINTENTO_MS = 10 * 60 * 1000;  // si la última renovación falló, se reintenta a los 10 minutos

// Baja TODO el paquete (revisando con el servidor, sin gastar datos si no cambió) y solo si bajó completo lo guarda.
// Si algo falla no se toca la copia anterior. Devuelve true si quedó guardado.
async function armarPaquete() {
  const c = await caches.open(CACHE);
  const anotar = ok => c.put(MARCA, new Response(JSON.stringify({ t: Date.now(), ok }))).catch(() => {});
  try {
    const bajados = [];
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (i < PAQUETE.length) {
        const u = PAQUETE[i++];
        const r = await fetch(new Request(u, { cache: 'no-cache' }));
        if (!r.ok) throw new Error('no se pudo bajar ' + u);
        await r.clone().blob();   // espera a que llegue completo
        bajados.push([u, r]);
      }
    }));
    for (const [u, r] of bajados) await c.put(u, r);
    await anotar(true);
    return true;
  } catch (err) { await anotar(false); return false; }
}
let renovando = null;
function renovarSiToca() {
  if (!renovando) renovando = (async () => {
    try {
      const c = await caches.open(CACHE);
      let m = null;
      try { const g = await c.match(MARCA); m = g ? await g.json() : null; } catch (err) { m = null; }
      if (m && Date.now() - m.t < (m.ok ? RENOVAR_MS : REINTENTO_MS)) return;
      await new Promise(listo => setTimeout(listo, 3000));   // que primero cargue la página
      await armarPaquete();
    } finally { renovando = null; }
  })();
  return renovando;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Si el paquete no baja completo, la instalación falla y sigue la versión anterior (con su copia completa); se reintenta luego.
    if (!(await armarPaquete())) throw new Error('paquete incompleto');
    await c.add(new Request(API, { cache: 'reload' })).catch(() => { /* se guarda luego */ });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);   // incluye la caché vieja 'escucha-v1' (~90 MB)
    await self.clients.claim();
  })());
});

// Lo que sale de la copia guardada lleva X-Copia: 1 para que la página avise "estás viendo una copia".
const marcada = g => {
  const h = new Headers(g.headers); h.set('X-Copia', '1');
  return new Response(g.body, { status: g.status, statusText: g.statusText, headers: h });
};

const guardable = url => url.origin === location.origin && (!url.pathname.startsWith('/api/') || (url.pathname === API && !url.search));

// De dónde salió cada página abierta ('red' o 'copia'), mientras el service worker sigue vivo: sus archivos salen de la misma fuente.
const fuentes = new Map();
const anotarFuente = (id, f) => {
  if (!id) return;
  fuentes.set(id, f);
  if (fuentes.size > 50) fuentes.delete(fuentes.keys().next().value);
};

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || !guardable(url)) return;
  const nav = req.mode === 'navigate';
  const delPaquete = nav || EN_PAQUETE.has(url.pathname);   // la página y sus archivos: solo se guardan como paquete
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const copia = () => c.match(nav ? '/' : req, { ignoreSearch: nav });
    // Las muestras del piano no cambian: primero lo guardado (la 1ª vez se bajan y quedan para el modo offline).
    if (url.pathname.startsWith('/vendor/piano/')) { const g = await copia(); if (g) return g; }
    const fuente = !nav && delPaquete ? fuentes.get(e.clientId) : undefined;
    // Una página que salió de la copia guardada sigue con la copia: no se le mezclan archivos más nuevos.
    if (fuente === 'copia') { const g = await copia(); if (g) return marcada(g); }
    const red = fetch(req, { cache: 'no-store' });
    red.catch(() => {}); // si se queda sin atender, que no ensucie la consola
    const guardar = r => { if (!delPaquete && r.status === 200) c.put(req, r.clone()).catch(() => {}); return r; };
    const espera = fuente === 'red' ? ESPERA_FRESCA_MS : ESPERA_MS;
    try {
      const r = guardar(await Promise.race([red, new Promise((_, no) => setTimeout(no, espera))]));
      if (nav && r.status === 200) { anotarFuente(e.resultingClientId, 'red'); e.waitUntil(renovarSiToca()); }
      return r;
    } catch (err) {
      const g = await copia();
      if (g) {
        if (nav) anotarFuente(e.resultingClientId, 'copia');
        e.waitUntil(red.then(guardar).catch(() => {}));         // lo que sigue en camino se guarda al llegar (salvo el paquete)
        return marcada(g);                                      // red lenta o sin internet: copia guardada
      }
      return red.then(guardar).catch(() => Response.error());   // sin copia: esperar a la red lo que haga falta
    }
  })());
});
