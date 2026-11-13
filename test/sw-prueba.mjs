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
    setTimeout: (f, ms) => setTimeout(f, ms >= 10000 ? 120 : Math.min(ms, 30)),   // acelera las esperas: 4 s -> 30 ms; la espera larga (12 s) -> 120 ms
    caches: { open: async n => cache(n), keys: async () => [...almacenes.keys()], delete: async n => almacenes.delete(n) },
    fetch: async r => red.fetch(typeof r === 'string' ? new Request(new URL(r, ORIGEN)) : r),
    clients: { claim: async () => {} },
  };
  sandbox.self = { addEventListener: (t, f) => { oyentes[t] = f; }, skipWaiting: async () => {}, clients: sandbox.clients, location: sandbox.location };
  vm.createContext(sandbox); vm.runInContext(codigo, sandbox);
  const despachar = async (tipo, req, extra = {}) => { const ev = { request: req, respondWith(p) { this.resp = p; }, waitUntil(p) { this.espera = p; }, ...extra }; oyentes[tipo](ev); return ev; };
  return { almacenes, ctx: sandbox, instalar: async () => (await despachar('install')).espera, pedir: async (req, extra) => despachar('fetch', req, extra) };
}
const pedido = (ruta, extra = {}) => new Request(ORIGEN + ruta, extra);
const redOk = { fetch: async r => new Response(new URL(r.url).pathname.startsWith('/api/') ? JSON.stringify({ canciones: [] }) : 'ok:' + new URL(r.url).pathname, { status: 200 }) };

test('instalación: guarda la página y los datos, pero NO precarga Tone.js, Tonal ni el piano', async () => {
  const e = entorno(redOk); await e.instalar();
  const guardado = [...e.almacenes.get('acordes-v21').keys()];
  for (const u of ['/', '/index.html', '/estilos.css', '/app.js', '/teoria.js', '/notacion.js', '/lecciones.js', '/practicar.js', '/sorpresa.js', '/improvisar.js', '/editor.js', '/canciones.js', '/local.js', '/romanos.js', '/analisis.js', '/manifest.webmanifest', '/icono-192.png', '/api/canciones']) assert.ok(guardado.includes(u), 'falta ' + u);
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

// ---- Paquete completo (hallazgo 6): la página y sus archivos se guardan juntos o no se guardan ----
const nav = (ruta = '/') => ({ url: ORIGEN + ruta, method: 'GET', mode: 'navigate' });
const marcaEn = (e, t, ok) => e.almacenes.get('acordes-v21').set('/__paquete', new Response(JSON.stringify({ t, ok })));
const paquete = e => vm.runInContext('PAQUETE', e.ctx);

test('paquete: todos los archivos de la lista existen de verdad en el proyecto', async () => {
  const { access } = await import('node:fs/promises');
  const e = entorno(redOk);
  for (const u of paquete(e)) if (u !== '/') await access(new URL('..' + u, import.meta.url));
});

test('paquete: si un archivo no baja, la instalación falla y no queda nada a medias', async () => {
  const red = { fetch: async r => new URL(r.url).pathname === '/hoja.js' ? new Response('no', { status: 404 }) : redOk.fetch(r) };
  const e = entorno(red);
  await assert.rejects(e.instalar());
  const guardado = [...(e.almacenes.get('acordes-v21') || new Map()).keys()].filter(u => u !== '/__paquete');
  assert.deepEqual(guardado, [], 'ningún archivo suelto guardado');
});

test('paquete: con internet un archivo sale de la red pero NO se guarda suelto (no se mezcla con la copia)', async () => {
  const red = { fetch: redOk.fetch }; const e = entorno(red); await e.instalar();
  red.fetch = async r => new Response('nuevo:' + new URL(r.url).pathname, { status: 200 });
  const r = await (await e.pedir(pedido('/app.js'))).resp;
  assert.equal(await r.text(), 'nuevo:/app.js');
  assert.equal(await (await e.almacenes.get('acordes-v21').get('/app.js')).clone().text(), 'ok:/app.js', 'la copia sigue siendo la del paquete');
});

test('paquete: sin internet todos los archivos salen de la misma copia, marcados', async () => {
  const red = { fetch: redOk.fetch }; const e = entorno(red); await e.instalar();
  red.fetch = async () => { throw new TypeError('sin red'); };
  for (const u of ['/app.js', '/hoja.js', '/estilos.css']) {
    const r = await (await e.pedir(pedido(u))).resp;
    assert.equal(r.headers.get('X-Copia'), '1', u); assert.equal(await r.text(), 'ok:' + u);
  }
});

test('paquete: una página que salió de la copia no recibe archivos nuevos aunque vuelva la red', async () => {
  const red = { fetch: redOk.fetch }; const e = entorno(red); await e.instalar();
  red.fetch = () => new Promise(() => {});                                   // señal muerta: la página sale de la copia
  const p = await (await e.pedir(nav(), { resultingClientId: 'a' })).resp;
  assert.equal(p.headers.get('X-Copia'), '1');
  red.fetch = async r => new Response('nuevo:' + new URL(r.url).pathname, { status: 200 });   // vuelve la señal
  const js = await (await e.pedir(pedido('/app.js'), { clientId: 'a' })).resp;
  assert.equal(await js.text(), 'ok:/app.js', 'sigue con la copia, no mezcla');
  const otra = await (await e.pedir(pedido('/app.js'), { clientId: 'b' })).resp;   // otra página distinta: lo más nuevo
  assert.equal(await otra.text(), 'nuevo:/app.js');
});

test('paquete: una página que salió de la red espera más a sus archivos antes de usar la copia', async () => {
  const red = { fetch: redOk.fetch }; const e = entorno(red); await e.instalar();
  await (await e.pedir(nav(), { resultingClientId: 'a' })).resp;
  red.fetch = r => new Promise(res => setTimeout(() => res(new Response('nuevo:' + new URL(r.url).pathname, { status: 200 })), 80));   // más lento que la espera normal (30 ms aquí)
  const js = await (await e.pedir(pedido('/app.js'), { clientId: 'a' })).resp;
  assert.equal(await js.text(), 'nuevo:/app.js');
});

test('paquete: con internet se renueva completo, como mucho una vez por hora', async () => {
  let pedidos = 0;
  const red = { fetch: async r => { pedidos++; return redOk.fetch(r); } };
  const e = entorno(red); await e.instalar();
  const alInstalar = pedidos;
  assert.equal(alInstalar, paquete(e).length + 1, 'instalación: el paquete entero + los datos');
  let ev = await e.pedir(nav(), { resultingClientId: 'a' }); await ev.resp; await ev.espera;
  assert.equal(pedidos, alInstalar + 1, 'recién renovado: solo la página, sin bajar el paquete otra vez');
  marcaEn(e, 0, true);                                                       // hace más de una hora
  red.fetch = async r => new Response('v2:' + new URL(r.url).pathname, { status: 200 });
  ev = await e.pedir(nav(), { resultingClientId: 'a' }); await ev.resp; await ev.espera;
  const copia = e.almacenes.get('acordes-v21');
  for (const u of paquete(e)) assert.equal(await copia.get(u).clone().text(), 'v2:' + u, 'renovado: ' + u);
});

test('paquete: una renovación que falla a medias no toca la copia anterior', async () => {
  const red = { fetch: redOk.fetch }; const e = entorno(red); await e.instalar();
  marcaEn(e, 0, true);
  red.fetch = async r => new URL(r.url).pathname === '/teoria.js' ? new Response('no', { status: 500 }) : new Response('v2:' + new URL(r.url).pathname, { status: 200 });
  const ev = await e.pedir(nav(), { resultingClientId: 'a' }); await ev.resp; await ev.espera;
  const copia = e.almacenes.get('acordes-v21');
  assert.equal(await copia.get('/app.js').clone().text(), 'ok:/app.js', 'la copia anterior sigue entera');
  assert.equal(JSON.parse(await copia.get('/__paquete').clone().text()).ok, false, 'queda anotado el fallo (se reintenta a los 10 min)');
});

test('red lenta: lo que sigue en camino se guarda al llegar (datos), para la próxima vez', async () => {
  const red = { fetch: redOk.fetch }; const e = entorno(red); await e.instalar();
  red.fetch = () => new Promise(res => setTimeout(() => res(new Response(JSON.stringify({ canciones: ['nueva'] }), { status: 200 })), 80));
  const ev = await e.pedir(pedido('/api/canciones'));
  const r = await ev.resp;
  assert.equal(r.headers.get('X-Copia'), '1', 'esta vez sale la copia');
  await ev.espera;
  red.fetch = async () => { throw new TypeError('sin red'); };
  const luego = await (await e.pedir(pedido('/api/canciones'))).resp;
  assert.deepEqual(await luego.json(), { canciones: ['nueva'] });
});
