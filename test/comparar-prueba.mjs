// Pruebas de scripts/ (comparar, generar-respaldo, contraste). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comparar } from '../scripts/comparar.mjs';
import { construir, archivoJs } from '../scripts/generar-respaldo.mjs';
import { medir, ratio, hex } from '../scripts/contraste.mjs';

const correr = promisify(execFile);
const C = (extra = {}) => ({ id: 'abc12345', titulo: 'Canción', artista: 'X', tono: 'G', nota: '', enlace: '', partes: [{ nombre: 'Coro', tono: '', prog: 'G D', pista: '' }], ...extra });

test('comparar: copia idéntica = 0 diferencias', () => {
  const r = comparar({ canciones: [C()] }, { canciones: [C(), C({ id: 'zzz99999', titulo: 'Solo servidor' })] });
  assert.equal(r.diferencias, 0);
  assert.equal(r.soloServidor, 1, 'lo que solo está en el servidor se informa pero no cuenta');
});
test('comparar: detecta canciones que faltan y canciones distintas', () => {
  const r = comparar({ canciones: [C(), C({ id: 'otra1234', titulo: 'Falta' }), C({ id: 'dist1234', titulo: 'Cambió', tono: 'D' })] },
    { canciones: [C(), C({ id: 'dist1234', titulo: 'Cambió', tono: 'E' })] });
  assert.deepEqual(r.faltan, ['Falta']);
  assert.deepEqual(r.distintas, ['Cambió']);
  assert.equal(r.diferencias, 2);
});
test('comparar: reconoce por título + artista cuando no hay id', () => {
  const sinId = C(); delete sinId.id;
  assert.equal(comparar({ canciones: [sinId] }, { canciones: [C({ id: 'cualquiera1' })] }).diferencias, 0);
});

async function servidor(datos, status = 200) {
  const s = http.createServer((req, res) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(datos)); });
  await new Promise(ok => s.listen(0, '127.0.0.1', ok));
  return { url: 'http://127.0.0.1:' + s.address().port, cerrar: () => new Promise(ok => s.close(ok)) };
}
const cli = async (...args) => { try { const r = await correr('node', ['scripts/comparar.mjs', ...args]); return { codigo: 0, salida: r.stdout }; } catch (e) { return { codigo: e.code, salida: e.stdout + e.stderr }; } };

test('comparar (línea de comandos): "0 diferencias" con código 0, y código 1 si algo cambió', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rep-'));
  const archivo = join(dir, 'copia.json');
  await writeFile(archivo, JSON.stringify({ version: 2, canciones: [C()] }));
  let s = await servidor({ canciones: [C()] });
  let r = await cli(archivo, s.url, '2');
  await s.cerrar();
  assert.equal(r.codigo, 0); assert.match(r.salida, /^0 diferencias/m);
  s = await servidor({ canciones: [C({ tono: 'A' })] });
  r = await cli(archivo, s.url, '0');
  await s.cerrar();
  assert.equal(r.codigo, 1); assert.match(r.salida, /1 diferencias/);
  assert.equal((await cli(archivo, 'http://127.0.0.1:9', '0')).codigo, 2, 'servidor inalcanzable: error claro, no "0 diferencias"');
  assert.equal((await cli(archivo, s.url, 'x')).codigo, 2, 'reintentos inválidos');
});

test('generar-respaldo: omite papelera, limpia datos y produce un canciones.js que la página puede cargar', async () => {
  const copia = { nombre: 'Mi repertorio', canciones: [C(), C({ id: 'borr1234', titulo: 'Borrada', borrada: true }), C({ id: 'bad12345', titulo: 'Enlace malo', enlace: 'javascript:alert(1)' }), { titulo: 'Sin tono' }, C({ id: 'x'.repeat(5), titulo: 'ID inválido' })] };
  const datos = construir(copia);
  assert.deepEqual(datos.canciones.map(c => c.titulo), ['Canción', 'Enlace malo', 'ID inválido']);
  assert.equal(datos.canciones[1].enlace, '');
  assert.equal(datos.canciones[2].id, undefined, 'un id inválido no se copia');
  const ventana = {}; vm.runInNewContext(archivoJs(datos), { window: ventana });
  assert.equal(ventana.REPERTORIO.nombre, 'Mi repertorio');
  assert.equal(ventana.REPERTORIO.canciones.length, 3);
  const peligro = construir({ canciones: [C({ titulo: '</script><script>alert(1)' })] });
  assert.ok(!archivoJs(peligro).includes('</script>'), 'no puede cerrar la etiqueta <script>');
});

test('contraste: todos los pares de colores de estilos.css cumplen WCAG AA', async () => {
  const malos = (await medir()).filter(f => f.ratio < f.min).map(f => `${f.tema}: ${f.par} = ${f.ratio.toFixed(2)}`);
  assert.deepEqual(malos, []);
  assert.ok(Math.abs(ratio(hex('#000000'), hex('#ffffff')) - 21) < 0.01, 'el cálculo da 21:1 para negro sobre blanco');
});
