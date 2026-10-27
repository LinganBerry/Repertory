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
  const archivos = ['lib/almacen.js', 'lib/auth.js', 'lib/intentos.js', 'lib/limpiar.js', 'api/canciones.js', 'api/entrar.js'];
  for (const a of archivos) {
    const src = await readFile(new URL('../' + a, import.meta.url), 'utf8');
    const imp = /import\s*\{([^}]*)\}\s*from\s*'@vercel\/blob'/.exec(src);
    if (imp) assert.ok(imp[1].split(',').map(s => s.trim()).every(n => ['get', 'put', 'BlobPreconditionFailedError'].includes(n)), a + ' importa algo más que get/put: ' + imp[1]);
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
