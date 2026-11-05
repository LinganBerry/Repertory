// Pruebas de local.js (ayudas comunes: datos del dispositivo, pase de sesión y POST con tiempo límite). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';

const almacen = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = almacen(); globalThis.sessionStorage = almacen();
await import('../local.js');
const L = globalThis.RepertorioLocal;

test('leer/guardar: ida y vuelta, valor por defecto y datos dañados', () => {
  assert.equal(L.leer('x'), null);
  assert.deepEqual(L.leer('x', { a: 1 }), { a: 1 });
  L.guardar('x', { n: 5, l: [1, 2] });
  assert.deepEqual(L.leer('x', 0), { n: 5, l: [1, 2] });
  L.guardar('cero', 0); assert.equal(L.leer('cero', 9), 0, 'un 0 guardado no se cambia por el valor por defecto');
  localStorage.setItem('roto', '{no es json'); assert.equal(L.leer('roto', 'por-defecto'), 'por-defecto');
});

test('leer/guardar: sin almacenamiento (bloqueado o lleno) no lanza error', () => {
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('lleno'); } };
  assert.equal(L.leer('x', 7), 7); assert.doesNotThrow(() => L.guardar('x', 1));
  globalThis.localStorage = real;
});

test('pase: solo en la pestaña (sessionStorage) o fijo (localStorage), y olvidar borra los dos', () => {
  assert.equal(L.leerPase(), '');
  L.guardarPase('p1', false); assert.equal(L.leerPase(), 'p1'); assert.equal(localStorage.getItem('repertorio-sesion-v3'), null);
  L.guardarPase('p2', true); assert.equal(L.leerPase(), 'p2'); assert.equal(sessionStorage.getItem('repertorio-sesion-v3'), null, 'no queda uno viejo en la pestaña');
  L.olvidarPase(); assert.equal(L.leerPase(), '');
});

test('enviar: devuelve la respuesta y su JSON; un cuerpo que no es JSON da {}', async () => {
  globalThis.fetch = async (url, o) => { assert.equal(o.method, 'POST'); assert.equal(JSON.parse(o.body).a, 1); return new Response('no json', { status: 400 }); };
  const { r, j } = await L.enviar('/api/x', { a: 1 });
  assert.equal(r.status, 400); assert.deepEqual(j, {});
});

test('enviar: si la red no responde a tiempo, falla con e.tiempo = true; si no hay red, sin e.tiempo', async () => {
  globalThis.fetch = (url, o) => new Promise((_, no) => o.signal.addEventListener('abort', () => no(new DOMException('abortado', 'AbortError'))));
  await assert.rejects(L.enviar('/api/x', {}, 20), e => e.tiempo === true);
  globalThis.fetch = async () => { throw new TypeError('sin red'); };
  await assert.rejects(L.enviar('/api/x', {}, 20), e => e.tiempo === undefined);
});
