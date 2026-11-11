// Pruebas de analisis.js: canciones con la misma progresión. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import '../romanos.js';
import '../analisis.js';

const A = globalThis.Analisis;
const C = (titulo, tono, ...partes) => ({ titulo, tono, partes: partes.map(([nombre, prog, t]) => ({ nombre, prog, ...(t ? { tono: t } : {}) })) });
const titulos = r => r.map(x => x.c.titulo);

test('firma: un bloque repetido y los acordes seguidos iguales se reducen', () => {
  const f = (prog, tono) => A.firmaDe(A.fichasDeParte({ prog }, tono));
  assert.deepEqual(f('G D Em C', 'G'), ['I', 'V', 'vi', 'IV']);
  assert.deepEqual(f('G D Em C | G D Em C', 'G'), ['I', 'V', 'vi', 'IV'], 'el ciclo repetido cuenta una vez');
  assert.deepEqual(f('G G D D Em Em C C', 'G'), ['I', 'V', 'vi', 'IV'], 'acordes repetidos seguidos cuentan una vez');
  assert.deepEqual(f('Gmaj7 D7 Em7 Cadd9/E', 'G'), ['I', 'V', 'vi', 'IV'], 'extensiones y bajo no cambian la firma');
  assert.deepEqual(f('C G Am F', 'C'), f('G D Em C', 'G'), 'el tono no importa');
});

test('canciones con la misma progresión: igual, mismo ciclo, y lo que NO cuenta', () => {
  const actual = C('Actual', 'G', ['Coro', 'G D Em C']);
  const lista = [
    actual,
    C('Otra en Do', 'C', ['Coro', 'C G Am F']),                                 // igual
    C('Misma por Am', 'C', ['Verso', 'Am F C G']),                              // mismo ciclo, empieza en otro acorde
    C('Repetida', 'D', ['A', 'D A Bm G | D A Bm G']),                           // igual (ciclo repetido)
    C('Otra distinta', 'G', ['A', 'G C D G']),                                  // no
    C('Solo dos acordes', 'G', ['A', 'G D G D']),                               // no: demasiado corta para comparar
    C('Sin partes', 'G'),                                                       // no
    { ...C('Borrada', 'G', ['A', 'G D Em C']), borrada: true },                 // no
    C('En otro tono por parte', 'F', ['A', 'F C Dm Bb']),                       // igual (F C Dm Bb en F = I V vi IV)
  ];
  const r = A.relacionadas(actual, lista);
  assert.deepEqual(titulos(r).sort(), ['En otro tono por parte', 'Misma por Am', 'Otra en Do', 'Repetida']);
  assert.equal(r.find(x => x.c.titulo === 'Misma por Am').tipo, 'ciclo');
  assert.equal(r.find(x => x.c.titulo === 'Otra en Do').tipo, 'igual');
  assert.equal(r[r.length - 1].c.titulo, 'Misma por Am', 'las iguales van antes que las de mismo ciclo');
  assert.ok(!titulos(r).includes('Actual'), 'no se lista a sí misma');
  assert.deepEqual(A.relacionadas(C('Sola', 'C'), lista), []);
  assert.deepEqual(A.relacionadas(null, lista), []);
});

test('relación: el ciclo solo vale de 4 a 8 acordes (I–IV–V no es «lo mismo» que IV–V–I)', () => {
  assert.equal(A.relacion(['I', 'IV', 'V'], ['IV', 'V', 'I']), null);
  assert.equal(A.relacion(['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V']), 'ciclo');
  assert.equal(A.relacion(['I', 'V', 'vi', 'IV'], ['I', 'V', 'vi', 'IV']), 'igual');
  assert.equal(A.relacion(['I', 'V'], ['I', 'V']), null);
});
