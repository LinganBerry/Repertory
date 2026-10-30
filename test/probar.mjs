// Pruebas del servidor (api/ y lib/) con un almacén falso en memoria. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CLAVE = 'clave-de-prueba-larga-123', SECRETO = 's'.repeat(40);
process.env.ADMIN_PASSWORD = CLAVE;
process.env.SESSION_SECRET = SECRETO;

const { memoria, registro } = await import('./blob-falso.mjs');
const canciones = await import('../api/canciones.js');
const entrar = await import('../api/entrar.js');
const progreso = await import('../api/progreso.js');
const { limpiarSesion, MAX_SESIONES } = await import('../lib/progreso.js');
const auth = await import('../lib/auth.js');
const { LIMITES } = await import('../lib/limpiar.js');

const limpiarTodo = () => { memoria.clear(); registro.length = 0; };
const post = (modulo, cuerpo, cabeceras = {}) =>
  modulo.POST(new Request('http://prueba.local/api', { method: 'POST', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), headers: { 'content-type': 'application/json', ...cabeceras } }));
const ver = () => canciones.GET();
const json = async r => ({ status: r.status, ...(await r.json()), cabeceras: r.headers });
const entrarCon = (ip, clave) => entrar.POST(new Request('http://prueba.local/api/entrar', { method: 'POST', body: JSON.stringify({ clave }), headers: { 'x-vercel-forwarded-for': ip } }));
async function pase() { const j = await json(await entrarCon('9.9.9.9', CLAVE)); assert.equal(j.status, 200); return j.token; }
const cancion = (extra = {}) => ({ titulo: 'Canción de prueba', artista: 'Artista', tono: 'G', partes: [{ nombre: 'Coro', prog: 'G D | Em C' }], ...extra });
const guardar = async (token, c) => json(await post(canciones, { token, accion: 'guardar', cancion: c }));
const lista = async () => (await json(await ver())).canciones;

test('configuración insegura: sin variables o muy cortas el servidor se niega', async () => {
  limpiarTodo();
  const guardado = { ...process.env };
  delete process.env.ADMIN_PASSWORD;
  assert.equal((await post(canciones, { token: 'x' })).status, 500);
  assert.equal((await entrarCon('1.1.1.1', 'x')).status, 500);
  process.env.ADMIN_PASSWORD = 'corta';
  assert.match((await json(await post(canciones, {}))).error, /demasiado corta/);
  process.env.ADMIN_PASSWORD = CLAVE; process.env.SESSION_SECRET = 'corto';
  assert.match((await json(await post(canciones, {}))).error, /SESSION_SECRET/);
  Object.assign(process.env, { ADMIN_PASSWORD: guardado.ADMIN_PASSWORD, SESSION_SECRET: guardado.SESSION_SECRET });
});

test('GET sin datos devuelve 404 y no inventa canciones', async () => {
  limpiarTodo();
  assert.equal((await ver()).status, 404);
});

test('sin pase válido no se puede guardar nada', async () => {
  limpiarTodo();
  for (const token of [undefined, '', 'v3.1.abc', 'v3.9999999999999.' + 'a'.repeat(64), 123, {}]) {
    const r = await post(canciones, { token, accion: 'guardar', cancion: cancion() });
    assert.equal(r.status, 401, 'token ' + JSON.stringify(token));
  }
  assert.equal(memoria.size, 0, 'no debe haberse escrito nada');
});

test('un pase vencido (más de 30 días) se rechaza', async () => {
  limpiarTodo();
  const real = Date.now;
  Date.now = () => real() - 31 * 864e5;
  const { token } = auth.crearToken();
  Date.now = real;
  assert.equal((await post(canciones, { token, accion: 'guardar', cancion: cancion() })).status, 401);
});

test('un pase con la firma alterada se rechaza', async () => {
  limpiarTodo();
  const { token } = auth.crearToken();
  const malo = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
  assert.equal(auth.tokenValido(token), true);
  assert.equal(auth.tokenValido(malo), false);
});

test('contraseña incorrecta: 401; correcta: pase válido', async () => {
  limpiarTodo();
  assert.equal((await entrarCon('2.2.2.2', 'mala')).status, 401);
  const j = await json(await entrarCon('2.2.2.2', CLAVE));
  assert.equal(j.status, 200);
  assert.equal(auth.tokenValido(j.token), true);
});

test('límite por IP: 5 fallos y la 6ª entrada se bloquea, incluso con la clave correcta', async () => {
  limpiarTodo();
  const fallos = await Promise.all(Array.from({ length: 5 }, () => entrarCon('3.3.3.3', 'mala')));
  assert.deepEqual(fallos.map(r => r.status), [401, 401, 401, 401, 401]);
  const bloqueada = await entrarCon('3.3.3.3', CLAVE);
  assert.equal(bloqueada.status, 429);
  assert.ok(Number(bloqueada.headers.get('Retry-After')) > 0);
  assert.equal((await entrarCon('4.4.4.4', CLAVE)).status, 200, 'otra IP no queda bloqueada');
});

test('entrar bien borra los fallos de esa IP', async () => {
  limpiarTodo();
  await entrarCon('5.5.5.5', 'mala'); await entrarCon('5.5.5.5', 'mala');
  assert.equal((await entrarCon('5.5.5.5', CLAVE)).status, 200);
  const intentos = JSON.parse(memoria.get('repertorio/intentos.json').texto);
  assert.equal(intentos.ips['5.5.5.5'], undefined);
});

test('límite global: 20 fallos desde IPs distintas bloquean a todos', async () => {
  limpiarTodo();
  await Promise.all(Array.from({ length: 20 }, (_, i) => entrarCon('10.0.0.' + i, 'mala')));
  assert.equal((await entrarCon('10.9.9.9', CLAVE)).status, 429);
});

test('si el almacén falla al contar intentos, NO se deja pasar', async () => {
  limpiarTodo();
  const almacen = await import('./blob-falso.mjs');
  // Se rompe el almacén sustituyendo temporalmente el contenido por algo ilegible
  almacen.memoria.set('repertorio/intentos.json', { texto: '{no es json', etag: '"x"' });
  const r = await entrarCon('6.6.6.6', CLAVE);
  assert.equal(r.status, 503);
});

test('guardar: crea, valida y limpia los datos', async () => {
  limpiarTodo();
  const token = await pase();
  const largo = 'C '.repeat(400);                         // 800 caracteres
  const muchas = Array.from({ length: 40 }, (_, i) => ({ nombre: 'P' + i, prog: 'C G' }));
  const j = await guardar(token, cancion({ enlace: 'javascript:alert(1)', partes: [{ nombre: 'Largo', prog: largo }, ...muchas] }));
  assert.equal(j.status, 200);
  const c = (await lista())[0];
  assert.equal(c.enlace, '', 'solo se aceptan enlaces http(s)');
  assert.ok(c.partes[0].prog.length <= LIMITES.prog, 'prog se corta al límite');
  assert.equal(c.partes.length, LIMITES.partes, 'máximo de partes');
  assert.equal((await guardar(token, cancion({ titulo: '' }))).status, 400);
  assert.equal((await guardar(token, cancion({ tono: 'H#' }))).status, 400);
  assert.equal((await guardar(token, cancion({ enlace: 'https://ejemplo.com/a' }))).status, 200);
});

test('editar con el mismo id actualiza y no duplica', async () => {
  limpiarTodo();
  const token = await pase();
  const { cancion: c } = await guardar(token, cancion());
  await guardar(token, { ...c, titulo: 'Título nuevo' });
  const todas = await lista();
  assert.equal(todas.length, 1);
  assert.equal(todas[0].titulo, 'Título nuevo');
});

test('borrar = papelera; restaurar la devuelve; nada se elimina del almacén', async () => {
  limpiarTodo();
  const token = await pase();
  const { cancion: c } = await guardar(token, cancion());
  assert.equal((await json(await post(canciones, { token, accion: 'borrar', id: c.id }))).status, 200);
  assert.equal((await lista()).length, 0, 'ya no se ve en la lista pública');
  const papelera = await json(await post(canciones, { token, accion: 'papelera' }));
  assert.equal(papelera.canciones.length, 1);
  const guardado = JSON.parse(memoria.get('repertorio/canciones.json').texto);
  assert.equal(guardado.canciones.length, 1, 'sigue guardada en el servidor');
  assert.equal(guardado.canciones[0].borrada, true);
  await post(canciones, { token, accion: 'restaurar', id: c.id });
  assert.equal((await lista()).length, 1);
  assert.equal((await json(await post(canciones, { token, accion: 'borrar', id: 'noexiste1234' }))).status, 404);
});

test('no existe ninguna acción de borrado definitivo', async () => {
  limpiarTodo();
  const token = await pase();
  await guardar(token, cancion());
  for (const accion of ['eliminar', 'borrar_definitivo', 'vaciar', 'delete', 'remove', '__proto__', 'constructor', 'toString', undefined, 5]) {
    const r = await post(canciones, { token, accion, id: 'x' });
    assert.equal(r.status, 400, 'acción ' + String(accion));
  }
  assert.equal((await lista()).length, 1);
});

test('el código no importa ni define funciones de borrado del almacén', async () => {
  const archivos = ['lib/almacen.js', 'lib/auth.js', 'lib/intentos.js', 'lib/limpiar.js', 'lib/progreso.js', 'api/canciones.js', 'api/entrar.js', 'api/progreso.js'];
  for (const a of archivos) {
    const src = await readFile(new URL('../' + a, import.meta.url), 'utf8');
    const imp = /import\s*\{([^}]*)\}\s*from\s*'@vercel\/blob'/.exec(src);
    if (imp) assert.ok(imp[1].split(',').map(s => s.trim()).every(n => ['get', 'put', 'head', 'BlobPreconditionFailedError'].includes(n)), a + ' importa algo más que get/put: ' + imp[1]);
    assert.ok(!/\bdel\s*\(|\.delete\(|unlink|rmSync|\brm\(|export (async )?(function|const) (borrar|eliminar|delete|remove)/i.test(src.replace(/\/\/.*$/gm, '')), a + ' parece borrar archivos');
  }
});

test('importar: simular no escribe; importar suma y actualiza, nunca quita', async () => {
  limpiarTodo();
  const token = await pase();
  await guardar(token, cancion({ titulo: 'Existente', artista: 'A' }));
  await guardar(token, cancion({ titulo: 'Se queda', artista: 'B' }));
  const antes = memoria.get('repertorio/canciones.json').texto;
  const copia = [cancion({ titulo: 'Existente', artista: 'A', tono: 'D' }), cancion({ titulo: 'Nueva', artista: 'C' }), { titulo: 'Sin tono' }];
  const sim = await json(await post(canciones, { token, accion: 'importar', canciones: copia, simular: true }));
  assert.deepEqual([sim.nuevas, sim.actualizadas, sim.omitidas], [1, 1, 1]);
  assert.equal(memoria.get('repertorio/canciones.json').texto, antes, 'simular no cambia nada');
  const real = await json(await post(canciones, { token, accion: 'importar', canciones: copia }));
  assert.deepEqual([real.nuevas, real.actualizadas], [1, 1]);
  const t = (await lista()).map(c => c.titulo).sort();
  assert.deepEqual(t, ['Existente', 'Nueva', 'Se queda']);
  assert.equal((await lista()).find(c => c.titulo === 'Existente').tono, 'D');
  assert.equal((await json(await post(canciones, { token, accion: 'importar', canciones: [] }))).status, 400);
  assert.equal((await json(await post(canciones, { token, accion: 'importar', canciones: Array.from({ length: 301 }, () => cancion()) }))).status, 400);
});

test('copia del día: el primer cambio guarda el estado anterior en historial/', async () => {
  limpiarTodo();
  const token = await pase();
  await guardar(token, cancion({ titulo: 'Uno' }));        // crea el archivo (no hay estado anterior)
  await guardar(token, cancion({ titulo: 'Dos' }));        // aquí se respalda el estado con 1 canción
  await guardar(token, cancion({ titulo: 'Tres' }));       // el respaldo del día ya existe: no se pisa
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  const copia = memoria.get(`repertorio/historial/${dia}.json`);
  assert.ok(copia, 'existe la copia del día');
  assert.equal(JSON.parse(copia.texto).canciones.length, 1, 'conserva el estado anterior al primer cambio del día');
});

test('8 guardados simultáneos: ninguno se pierde (control de concurrencia)', async () => {
  limpiarTodo();
  const token = await pase();
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => guardar(token, cancion({ titulo: 'Simultánea ' + i, artista: 'X' + i }))));
  assert.ok(rs.every(r => r.status === 200), JSON.stringify(rs.map(r => r.status)));
  assert.equal((await lista()).length, 8);
});

test('cuerpo demasiado grande: 413; JSON roto: 400', async () => {
  limpiarTodo();
  const grande = 'a'.repeat(600_001);
  assert.equal((await post(canciones, grande)).status, 413);
  assert.equal((await post(canciones, '{no es json')).status, 400);
  assert.equal((await post(canciones, 'null')).status, 400);
});

test('la lista pública nunca incluye canciones de la papelera ni el campo "borrada"', async () => {
  limpiarTodo();
  const token = await pase();
  const { cancion: c } = await guardar(token, cancion());
  await guardar(token, cancion({ titulo: 'Otra' }));
  await post(canciones, { token, accion: 'borrar', id: c.id });
  const texto = JSON.stringify(await lista());
  assert.ok(!texto.includes('"borrada"'));
  assert.ok(!texto.includes('Canción de prueba'));
});

test('los límites de editor.js coinciden con los del servidor', async () => {
  const src = await readFile(new URL('../editor.js', import.meta.url), 'utf8');
  const m = /const LIM = (\{[^}]*\})/.exec(src);
  assert.ok(m, 'editor.js debe declarar LIM');
  assert.deepEqual(new Function('return ' + m[1])(), LIMITES);
});

// --- progreso de práctica ---
const sesion = (extra = {}) => ({ id: 'abc' + Math.random().toString(36).slice(2, 12), t: 'sol', l: 1, f: '2026-10-27', n: 3, a: 2, ms: 9000, q: [['sol:E4', 1, 2000], ['sol:G4', 0, 5000], ['sol:B4', 1, 2000]], ...extra });
const enviar = async (token, sesiones) => json(await post(progreso, { token, accion: 'sesiones', sesiones }));

test('progreso: sin pase no se lee ni se guarda nada', async () => {
  limpiarTodo();
  for (const accion of ['leer', 'sesiones']) assert.equal((await post(progreso, { token: 'malo', accion, sesiones: [sesion()] })).status, 401);
  assert.equal(memoria.has('repertorio/progreso.json'), false);
});

test('progreso: guarda sesiones válidas, las devuelve y no repite una con el mismo id', async () => {
  limpiarTodo();
  const token = await pase();
  const s = sesion();
  const r1 = await enviar(token, [s]);
  assert.equal(r1.status, 200); assert.equal(r1.guardadas, 1);
  const r2 = await enviar(token, [s, sesion()]);
  assert.equal(r2.guardadas, 1, 'la repetida no se vuelve a guardar'); assert.equal(r2.total, 2);
  const leido = await json(await post(progreso, { token, accion: 'leer' }));
  assert.equal(leido.sesiones.length, 2);
  assert.deepEqual(leido.sesiones[0], limpiarSesion(s));
});

test('progreso: acepta los temas y ejercicios de oído', async () => {
  limpiarTodo();
  const token = await pase();
  const r = await enviar(token, [sesion({ t: 'int-asc', q: [['ia:3M', 1, 1800], ['ia:TT', 0, 4000], ['ia:8J', 1, 900]] }), sesion({ t: 'acordes', q: [['ac:m7b5', 0, 5000], ['ac:dom7', 1, 2500], ['ac:mayor', 1, 1200]] })]);
  assert.equal(r.status, 200); assert.equal(r.guardadas, 2);
});

test('progreso: rechaza sesiones inválidas sin guardar nada', async () => {
  limpiarTodo();
  const token = await pase();
  const malas = [sesion({ id: 'x' }), sesion({ t: 'Tema Raro!' }), sesion({ f: '2026-13-45' }), sesion({ n: 0 }), sesion({ a: 9 }), sesion({ l: 0 }), sesion({ ms: -1 }),
    sesion({ q: [['sol:E4', 2, 100]] }), sesion({ q: [['<script>', 1, 100]] }), sesion({ q: 'no' }), sesion({ q: Array.from({ length: 101 }, () => ['sol:E4', 1, 10]) }), null, 'texto'];
  for (const m of malas) assert.equal((await enviar(token, [m])).status, 400, JSON.stringify(m)?.slice(0, 60));
  assert.equal((await enviar(token, [])).status, 400);
  assert.equal((await enviar(token, Array.from({ length: 21 }, () => sesion()))).status, 400);
  assert.equal(memoria.has('repertorio/progreso.json'), false);
});

test('progreso: conserva solo las últimas ' + 500 + ' sesiones', async () => {
  limpiarTodo();
  const token = await pase();
  const todas = Array.from({ length: MAX_SESIONES + 30 }, (_, i) => sesion({ id: 'sesion' + String(i).padStart(5, '0') }));
  for (let i = 0; i < todas.length; i += 20) assert.equal((await enviar(token, todas.slice(i, i + 20))).status, 200);
  const { sesiones } = await json(await post(progreso, { token, accion: 'leer' }));
  assert.equal(sesiones.length, MAX_SESIONES);
  assert.equal(sesiones.at(-1).id, 'sesion' + String(MAX_SESIONES + 29).padStart(5, '0'), 'la más reciente se conserva');
  assert.equal(sesiones[0].id, 'sesion' + String(30).padStart(5, '0'), 'las más antiguas salen primero');
});

test('progreso: 8 envíos simultáneos no pierden ninguna sesión', async () => {
  limpiarTodo();
  const token = await pase();
  const rs = await Promise.all(Array.from({ length: 8 }, () => enviar(token, [sesion()])));
  assert.ok(rs.every(r => r.status === 200));
  assert.equal((await json(await post(progreso, { token, accion: 'leer' }))).sesiones.length, 8);
});

test('progreso: acción desconocida y cuerpo grande', async () => {
  limpiarTodo();
  const token = await pase();
  assert.equal((await post(progreso, { token, accion: 'borrar' })).status, 400);
  assert.equal((await post(progreso, 'a'.repeat(200_001))).status, 413);
  assert.equal((await post(progreso, '{roto')).status, 400);
});

test('canciones viejas sin id: reciben un id estable, se pueden editar sin duplicar y mandar a la papelera', async () => {
  limpiarTodo();
  const token = await pase();
  const vieja = (t, a) => ({ titulo: t, artista: a, tono: 'G', partes: [{ nombre: 'Coro', prog: 'G D | Em C' }] });
  memoria.set('repertorio/canciones.json', { texto: JSON.stringify({ version: 2, canciones: [vieja('Uno', 'A'), vieja('Dos', 'B'), vieja('Uno', 'A')] }), etag: '"v0"' });
  const antes = await lista();
  assert.equal(antes.length, 3);
  assert.equal(new Set(antes.map(c => c.id)).size, 3, 'ids distintos');
  assert.deepEqual((await lista()).map(c => c.id), antes.map(c => c.id), 'los ids son iguales en cada lectura');
  // editar una: no se duplica
  const r = await guardar(token, { ...antes[1], nota: 'capo 2' });
  assert.equal(r.status, 200);
  const despues = await lista();
  assert.equal(despues.length, 3, 'no se duplicó');
  assert.equal(despues.find(c => c.id === antes[1].id).nota, 'capo 2');
  // mandar una a la papelera
  const b = await json(await post(canciones, { token, accion: 'borrar', id: antes[0].id }));
  assert.equal(b.status, 200);
  assert.equal((await lista()).length, 2);
});
