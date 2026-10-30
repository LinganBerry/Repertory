// Pruebas de preparar.js ("Preparar sin internet"): lista de archivos, descarga con límite de paralelismo y verificación. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ctx = { console, URL }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../preparar.js', import.meta.url), 'utf8'), ctx);
const P = ctx.Preparar;
const J = x => JSON.parse(JSON.stringify(x));
const origen = 'https://ejemplo.vercel.app';

test('armarLista: solo archivos propios, sin repetidos ni "?algo", y siempre incluye la fuente, las canciones y la página', () => {
  const l = J(P.armarLista({
    origen,
    pagina: ['estilos.css', '/app.js?v=3', 'https://otro.com/x.js', '/app.js', 'manifest.webmanifest', 'http://[malo'],
    audio: ['/vendor/Tone.js', '/vendor/piano/A0.mp3', '/vendor/Tone.js']
  }));
  assert.deepEqual(l.sort(), ['/', '/api/canciones', '/app.js', '/estilos.css', '/manifest.webmanifest', '/vendor/Tone.js', '/vendor/atril-notas.woff2', '/vendor/piano/A0.mp3'].sort());
  assert.deepEqual(J(P.armarLista({ origen })).sort(), ['/', '/api/canciones', '/vendor/atril-notas.woff2'].sort());
});

test('ejecutar: todo bien → todo guardado; avisa el avance y nunca pasa del límite en paralelo', async () => {
  const urls = Array.from({ length: 30 }, (_, i) => '/f' + i);
  let activos = 0, maximo = 0; const avances = [];
  const r = await P.ejecutar({
    urls, paralelo: 4,
    pedir: async () => { activos++; maximo = Math.max(maximo, activos); await new Promise(ok => setTimeout(ok, 2)); activos--; return { ok: true }; },
    guardado: async () => ({}),
    alAvanzar: (h, t) => avances.push([h, t])
  });
  assert.deepEqual(J(r), { total: 30, guardados: 30, faltan: [] });
  assert.ok(maximo <= 4 && maximo > 1, 'máximo en paralelo: ' + maximo);
  assert.equal(avances.length, 30); assert.deepEqual(avances.at(-1), [30, 30]);
  assert.deepEqual(avances.map(a => a[0]), avances.map((_, i) => i + 1), 'el avance solo sube');
});

test('ejecutar: si algo falla o no quedó guardado, se dice cuál (no se oculta)', async () => {
  const urls = ['/ok', '/error500', '/sinred', '/noguardado', '/lanza'];
  const r = await P.ejecutar({
    urls,
    pedir: async u => { if (u === '/sinred') throw new Error('sin red'); return { ok: u !== '/error500' }; },
    guardado: async u => { if (u === '/lanza') throw new Error('x'); return u !== '/noguardado' && u !== '/error500' ? {} : undefined; }
  });
  assert.equal(r.total, 5); assert.equal(r.guardados, 1);
  assert.deepEqual(J(r.faltan).sort(), ['/error500', '/lanza', '/noguardado', '/sinred'].sort());
});

test('ejecutar: un archivo que se pidió bien pero no está en la copia guardada cuenta como faltante', async () => {
  const r = await P.ejecutar({ urls: ['/a', '/b'], pedir: async () => ({ ok: true }), guardado: async u => (u === '/a' ? {} : null) });
  assert.deepEqual(J(r), { total: 2, guardados: 1, faltan: ['/b'] });
});

test('ejecutar: sin archivos no se cuelga', async () => {
  assert.deepEqual(J(await P.ejecutar({ urls: [], pedir: async () => ({ ok: true }), guardado: async () => ({}) })), { total: 0, guardados: 0, faltan: [] });
});
