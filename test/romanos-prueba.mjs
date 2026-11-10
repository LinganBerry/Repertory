// Pruebas de romanos.js: números romanos por nombre de nota (F en G es ♭VII, nunca ♯VI) y separación de compases. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import '../romanos.js';

const { romano, nashville, compases } = globalThis.Romanos;
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

const n = (prog, tono) => compases(prog).flat().map(a => nashville(a, tono)).join(' ');

test('Nashville: el grado como número, con m para los menores', () => {
  assert.equal(n('G D Em C', 'G'), '1 5 6m 4');
  assert.equal(n('C Dm Em F G Am Bdim', 'C'), '1 2m 3m 4 5 6m 7dim');
  assert.equal(n('Bb Eb F Gm', 'Bb'), '1 4 5 6m');
});

test('Nashville: prestados con ♭ o ♯ por nombre de nota, y en tono menor se cuenta desde la tónica', () => {
  assert.equal(n('F', 'G'), '♭7', 'F en G es ♭7');
  assert.equal(n('Eb Ab Bb', 'C'), '♭3 ♭6 ♭7');
  assert.equal(n('Am F C G', 'Am'), '1m ♭6 ♭3 ♭7');
  assert.equal(n('Am Dm E', 'Am'), '1m 4m 5');
  assert.equal(n('G#', 'C'), '♯5');
});

test('Nashville: sufijos conservados, séptima del dominante en superíndice y bajo como número', () => {
  assert.equal(n('Em7 Cmaj7 Dsus4 Gadd9', 'G'), '6m7 4maj7 5sus4 1add9');
  assert.equal(n('B7 D9 A13', 'G'), '3⁷ 5⁹ 2¹³');
  assert.equal(n('D/F# C/E', 'G'), '5/7 4/6');
  assert.equal(n('F#m7b5 B7', 'G'), '7m7b5 3⁷');
  assert.equal(n('A-7 Amin', 'C'), '6m7 6m', 'guion y min son menor');
});

test('Nashville: lo que no se puede leer queda vacío (como los romanos)', () => {
  assert.equal(nashville('N.C.', 'G'), ''); assert.equal(nashville('G', ''), ''); assert.equal(nashville('', 'G'), '');
});
