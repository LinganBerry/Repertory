// Prueba de sw.js (modo sin conexión) ejecutándolo en un entorno simulado de service worker. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ORIGEN = 'http://prueba.local';
const codigo = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function entorno(red) {
  const almacenes = new Map(), oyentes = {};
  const clave = (r, ignorarBusqueda) => { const u = new URL(typeof r === 'string' ? r : r.url, ORIGEN); return ignorarBusqueda ? u.pathname : u.pathname + u.search; };
  const cache = nombre => {
    if (!almacenes.has(nombre)) almacenes.set(nombre, new Map());
    const m = almacenes.get(nombre);
    return {
      match: async (r, o = {}) => { const k = clave(r, o.ignoreSearch); for (const [kk, v] of m) if ((o.ignoreSearch ? kk.split('?')[0] : kk) === k) return v.clone(); },
      put: async (r, resp) => { m.set(clave(r), resp); },
      add: async r => { const resp = await sandbox.fetch(r); if (!resp.ok) throw new Error('fallo'); m.set(clave(r), resp); },
    };
  };
  const sandbox = {
    URL, Response, Headers,
    // En un service worker real las rutas relativas se resuelven solas; aquí se resuelven contra ORIGEN.
    Request: class extends Request { constructor(u, o) { super(typeof u === 'string' ? new URL(u, ORIGEN).href : u, o); } },
    Promise, console, location: new URL(ORIGEN),
    setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 30)),   // acelera la espera de 4 s
    caches: { open: async n => cache(n), keys: async () => [...almacenes.keys()], delete: async n => almacenes.delete(n) },
    fetch: async r => red.fetch(typeof r === 'string' ? new Request(new URL(r, ORIGEN)) : r),
    clients: { claim: async () => {} },
  };
  sandbox.self = { addEventListener: (t, f) => { oyentes[t] = f; }, skipWaiting: async () => {}, clients: sandbox.clients, location: sandbox.location };
  vm.createContext(sandbox); vm.runInContext(codigo, sandbox);
  const despachar = async (tipo, req) => { const ev = { request: req, respondWith(p) { this.resp = p; }, waitUntil(p) { this.espera = p; } }; oyentes[tipo](ev); return ev; };
  return { almacenes, instalar: async () => (await despachar('install')).espera, pedir: async req => despachar('fetch', req) };
}
const pedido = (ruta, extra = {}) => new Request(ORIGEN + ruta, extra);
const redOk = { fetch: async r => new Response(new URL(r.url).pathname.startsWith('/api/') ? JSON.stringify({ canciones: [] }) : 'ok:' + new URL(r.url).pathname, { status: 200 }) };

test('instalación: guarda la página y los datos, pero NO precarga Tone.js, Tonal ni el piano', async () => {
  const e = entorno(redOk); await e.instalar();
  const guardado = [...e.almacenes.get('acordes-v8').keys()];
  for (const u of ['/', '/index.html', '/estilos.css', '/app.js', '/teoria.js', '/notacion.js', '/lecciones.js', '/practicar.js', '/editor.js', '/canciones.js', '/manifest.webmanifest', '/icono-192.png', '/api/canciones']) assert.ok(guardado.includes(u), 'falta ' + u);
  assert.ok(!guardado.some(u => u.startsWith('/vendor/')), 'no debe precargar /vendor/: ' + guardado.filter(u => u.startsWith('/vendor/')));
});

test('con internet: devuelve lo más nuevo y NO lo marca como copia', async () => {
  const e = entorno(redOk); await e.instalar();
  const r = await (await e.pedir(pedido('/api/canciones'))).resp;
  assert.equal(r.status, 200); assert.equal(r.headers.get('X-Copia'), null);
});

test('sin internet: devuelve la copia guardada marcada con X-Copia: 1', async () => {
  const red = { fetch: redOk.fetch }; const e = entorno(red); await e.instalar();
  red.fetch = async () => { throw new TypeError('sin red'); };
  const api = await (await e.pedir(pedido('/api/canciones'))).resp;
  assert.equal(api.headers.get('X-Copia'), '1'); assert.deepEqual(await api.json(), { canciones: [] });
  const nav = await (await e.pedir({ url: ORIGEN + '/?editar', method: 'GET', mode: 'navigate' })).resp;   // Node no permite crear Request con mode 'navigate'
  assert.equal(nav.headers.get('X-Copia'), '1'); assert.equal(await nav.text(), 'ok:/', 'cualquier /?algo usa la página guardada');
});

test('red muy lenta (pasa el tiempo de espera): usa la copia guardada', async () => {
  const red = { fetch: redOk.fetch }; const e = entorno(red); await e.instalar();
  red.fetch = () => new Promise(() => {});                      // nunca responde
  const r = await (await e.pedir(pedido('/api/canciones'))).resp;
  assert.equal(r.headers.get('X-Copia'), '1');
});

test('los POST (guardar, entrar) y otras rutas /api/ no se tocan', async () => {
  const e = entorno(redOk); await e.instalar();
  assert.equal((await e.pedir(pedido('/api/canciones', { method: 'POST', body: '{}' }))).resp, undefined);
  assert.equal((await e.pedir(pedido('/api/entrar', { method: 'POST', body: '{}' }))).resp, undefined);
  assert.equal((await e.pedir(pedido('/api/canciones?x=1'))).resp, undefined);
});

test('los archivos de teoría se guardan la primera vez que se piden y luego sirven sin red', async () => {
  const red = { fetch: redOk.fetch }; const e = entorno(red); await e.instalar();
  await (await e.pedir(pedido('/vendor/tonal.min.js'))).resp;
  red.fetch = async () => { throw new TypeError('sin red'); };
  const r = await (await e.pedir(pedido('/vendor/tonal.min.js'))).resp;
  assert.equal(await r.text(), 'ok:/vendor/tonal.min.js');
});
