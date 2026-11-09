// Pruebas de romanos.js: números romanos por nombre de nota (F en G es ♭VII, nunca ♯VI) y separación de compases. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import '../romanos.js';

const { romano, compases } = globalThis.Romanos;
const r = (prog, tono) => compases(prog).flat().map(a => romano(a, tono)).join(' ');

test('tono mayor: los grados de la escala, con mayúscula o minúscula según el acorde', () => {
  assert.equal(r('G D Em C', 'G'), 'I V vi IV');
  assert.equal(r('C Dm Em F G Am Bdim', 'C'), 'I ii iii IV V vi vii°');
  assert.equal(r('D G A Bm', 'D'), 'I IV V vi');
  assert.equal(r('Bb Eb F Gm', 'Bb'), 'I IV V vi');
});

test('acordes prestados y alterados se escriben con su ♭ o ♯ correcto (por nombre de nota)', () => {
  assert.equal(r('F', 'G'), '♭VII', 'F en G es ♭VII');
  assert.equal(r('Eb Ab Bb', 'C'), '♭III ♭VI ♭VII');
  assert.equal(r('E A', 'C'), 'III VI', 'E y A mayores en Do: III y VI (dominantes secundarios), sin alteración');
  assert.equal(r('F#m7b5 B7', 'G'), 'viiø7 III7', 'F#m7b5 en G es viiø7; B7 es III7');
  assert.equal(r('Fm', 'C'), 'iv', 'iv menor en mayor');
  assert.equal(r('C#dim', 'D'), 'vii°');
  assert.equal(r('G#', 'C'), '♯V', 'G♯ en Do es ♯V');
  assert.equal(r('Ab', 'F'), '♭III', 'La♭ en Fa es ♭III');
  assert.equal(r('Cb', 'F'), '♭V', 'Do♭ en Fa es ♭V');
});

test('tono menor: escala menor natural (III, VI y VII sin alteración)', () => {
  assert.equal(r('Am F C G', 'Am'), 'i VI III VII');
  assert.equal(r('Am Dm E', 'Am'), 'i iv V');
  assert.equal(r('Am Dm Em', 'Am'), 'i iv v');
  assert.equal(r('Cm Ab Eb Bb', 'Cm'), 'i VI III VII');
  assert.equal(r('F#m D A E', 'F#m'), 'i VI III VII');
});

test('sufijos y bajo con barra se conservan; el bajo es un grado de la escala', () => {
  assert.equal(romano('Am7', 'C'), 'vi7');
  assert.equal(romano('Cmaj7', 'C'), 'Imaj7');
  assert.equal(romano('Bbmaj7', 'F'), 'IVmaj7');
  assert.equal(romano('G7', 'C'), 'V7');
  assert.equal(romano('Dsus4', 'D'), 'Isus4');
  assert.equal(romano('D/F#', 'G'), 'V/7');
  assert.equal(romano('C/E', 'C'), 'I/3');
  assert.equal(romano('Em7b5', 'D'), 'iiø7', 'Em7b5 en D: Mi es el segundo grado');
});

test('sin tono válido o sin acorde válido no inventa nada', () => {
  assert.equal(romano('G', ''), '');
  assert.equal(romano('G', 'xyz'), '');
  assert.equal(romano('hola', 'C'), '');
  assert.equal(romano('', 'C'), '');
});

test('compases: separa por | y por espacio; el guion pegado entre acordes separa, el guion + número no', () => {
  assert.deepEqual(compases('G D | Em C'), [['G', 'D'], ['Em', 'C']]);
  assert.deepEqual(compases('F#-G-A'), [['F#', 'G', 'A']]);
  assert.deepEqual(compases('A-7 D'), [['A-7', 'D']]);
  assert.deepEqual(compases('  G   |  | C  '), [['G'], ['C']]);
  assert.deepEqual(compases(''), []);
});
