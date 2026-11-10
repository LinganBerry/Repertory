// Pruebas de sorpresa.js (Canción sorpresa: lógica pura). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../sorpresa.js', import.meta.url), 'utf8'), ctx);
const S = ctx.Sorpresa;
const semilla = s => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const lista = n => Array.from({ length: n }, (_, i) => ({ id: 'id' + i, titulo: 'Canción ' + i, artista: 'A', tono: 'C' }));

test('sin canciones (o sin título) no hay nada que sacar', () => {
  assert.equal(S.elegir([], [], Math.random), null);
  assert.equal(S.elegir(undefined, [], Math.random), null);
  assert.equal(S.elegir([{ id: 'x', titulo: '   ' }, null], [], Math.random), null);
});

test('no repite ninguna hasta que hayan salido todas', () => {
  const cs = lista(7), azar = semilla(3);
  let usadas = [];
  const vistas = new Set();
  for (let i = 0; i < cs.length; i++) {
    const r = S.elegir(cs, usadas, azar);
    assert.equal(r.vuelta, false);
    assert.ok(!vistas.has(r.cancion.id), 'repetida: ' + r.cancion.id);
    assert.equal(r.quedan, cs.length - 1 - i);
    vistas.add(r.cancion.id); usadas = r.usadas;
  }
  assert.equal(vistas.size, cs.length);
});

test('al terminar la vuelta empieza otra y la última no sale de seguido', () => {
  const cs = lista(4);
  for (let semi = 1; semi <= 40; semi++) {
    const azar = semilla(semi);
    let usadas = [], ultima = null;
    for (let i = 0; i < 4; i++) { const r = S.elegir(cs, usadas, azar); usadas = r.usadas; ultima = r.cancion.id; }
    const r = S.elegir(cs, usadas, azar);
    assert.equal(r.vuelta, true);
    assert.notEqual(r.cancion.id, ultima);
    assert.deepEqual([...r.usadas], [r.cancion.id]);
    assert.equal(r.quedan, 3);
  }
});

test('con una sola canción siempre sale esa, sin romperse', () => {
  const cs = lista(1);
  let r = S.elegir(cs, [], Math.random);
  assert.equal(r.cancion.id, 'id0');
  r = S.elegir(cs, r.usadas, Math.random);
  assert.equal(r.cancion.id, 'id0'); assert.equal(r.vuelta, true); assert.equal(r.quedan, 0);
});

test('ignora las usadas que ya no existen (canción borrada) y azar en los extremos no se sale de la lista', () => {
  const cs = lista(3);
  const r = S.elegir(cs, ['fantasma', 'id0'], () => 0.999999);
  assert.ok(['id1', 'id2'].includes(r.cancion.id));
  assert.ok(!r.usadas.includes('fantasma'));
  assert.equal(S.elegir(cs, [], () => 1).cancion.id, 'id2');   // un azar de 1 exacto no debe salirse del arreglo
});

test('canciones sin id se identifican por título y artista', () => {
  const cs = [{ titulo: 'Uno', artista: 'X', tono: 'G' }, { titulo: 'Uno', artista: 'Y', tono: 'G' }];
  const a = S.elegir(cs, [], () => 0), b = S.elegir(cs, a.usadas, () => 0);
  assert.notEqual(a.cancion.artista, b.cancion.artista);
});
