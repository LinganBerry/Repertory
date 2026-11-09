// Pruebas de analisis.js: canciones con la misma progresión y tip de teoría por canción. Ejecutar: npm test
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

test('tonalidad: armadura y escala con el nombre correcto de cada nota', () => {
  assert.deepEqual(A.armadura('C'), { n: 0, tipo: 'sostenidos', notas: [] });
  assert.deepEqual(A.armadura('G'), { n: 1, tipo: 'sostenidos', notas: ['F♯'] });
  assert.deepEqual(A.armadura('Em'), { n: 1, tipo: 'sostenidos', notas: ['F♯'] });
  assert.deepEqual(A.armadura('Bb'), { n: 2, tipo: 'bemoles', notas: ['B♭', 'E♭'] });
  assert.deepEqual(A.armadura('Gm'), { n: 2, tipo: 'bemoles', notas: ['B♭', 'E♭'] });
  assert.equal(A.armadura('F#').n, 6); assert.equal(A.armadura('Db').n, 5); assert.equal(A.armadura('Dbm'), null, 'D♭ menor llevaría 8 bemoles: no se muestra');
  assert.deepEqual(A.escala('G'), ['G', 'A', 'B', 'C', 'D', 'E', 'F♯']);
  assert.deepEqual(A.escala('Bb'), ['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A']);
  assert.deepEqual(A.escala('Em'), ['E', 'F♯', 'G', 'A', 'B', 'C', 'D']);
  assert.deepEqual(A.escala('F#'), ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']);
  assert.equal(A.escala('hola'), null);
});

test('tip: reconoce las progresiones conocidas, en mayor y en menor, empiecen donde empiecen', () => {
  const t = c => A.tip(c);
  assert.equal(t(C('a', 'G', ['Coro', 'G D Em C'])).titulo, 'Los cuatro acordes del pop');
  assert.equal(t(C('a', 'C', ['V', 'Am F C G'])).titulo, 'Los cuatro acordes del pop', 'vi–IV–I–V es el mismo ciclo');
  assert.match(t(C('a', 'C', ['V', 'Am F C G'])).texto, /empieza por otro acorde del ciclo/);
  assert.equal(t(C('a', 'D', ['A', 'D Bm G A'])).titulo, 'La progresión de los años 50');
  assert.equal(t(C('a', 'C', ['A', 'Dm7 G7 Cmaj7'])).titulo, 'ii–V–I, la cadencia del jazz');
  assert.equal(t(C('a', 'G', ['A', 'G F C G'])).titulo, 'El ♭VII del rock');
  assert.equal(t(C('a', 'Am', ['A', 'Am G F E'])).titulo, 'La cadencia andaluza');
  assert.equal(t(C('a', 'Am', ['A', 'Am F C G'])).titulo, 'La del pop, vista desde el relativo menor');
  assert.equal(t(C('a', 'E', ['A', 'E A B'])).titulo, 'Los tres acordes base');
});

test('tip: V–I y IV–I solo salen cuando no hay nada más característico', () => {
  const t = c => A.tip(c);
  assert.equal(t(C('a', 'C', ['A', 'C G'])).titulo, 'Tu tonalidad: C', 'C–G es I–V: no es V–I');
  assert.equal(t(C('a', 'C', ['A', 'G C'])).titulo, 'La cadencia auténtica');
  assert.equal(t(C('a', 'C', ['A', 'F C'])).titulo, 'La cadencia plagal («amén»)');
  assert.equal(t(C('a', 'C', ['A', 'C Fm C G'])).titulo, 'Un acorde prestado: iv', 'lo propio de la canción gana a la cadencia común');
});

test('tip: modulación (sube un tono, relativo, paralelo)', () => {
  const m = (a, b, ta, tb) => A.tip(C('x', ta, ['Verso', a], ['Final', b, tb]));
  const sube = m('G C D G', 'A D E A', 'G', 'A');
  assert.equal(sube.titulo, 'La canción modula'); assert.match(sube.texto, /sube un tono, de G a A/);
  assert.match(m('G C D G', 'G# C# D# G#', 'G', 'Ab').texto, /sube medio tono, de G a A♭/);
  assert.match(m('G C D G', 'Em Am Em', 'G', 'Em').texto, /relativo, Em/);
  assert.match(m('C F G C', 'Cm Eb Fm Cm', 'C', 'Cm').texto, /paralela, Cm/);
  assert.match(m('G C D G', 'C F G C', 'G', 'C').texto, /cambia de tonalidad, de G a C/);
});

test('tip: acorde prestado y dominante secundario, con la nota fuera de la tonalidad', () => {
  const p = A.tip(C('x', 'C', ['A', 'C Ab F G']));
  assert.equal(p.titulo, 'Un acorde prestado: ♭VI'); assert.match(p.texto, /A♭ \(♭VI\) en C/);
  assert.match(A.tip(C('x', 'G', ['A', 'G F D'])).texto, /séptima bajada/, '♭VII (F en G) la pide, pero primero sale la progresión característica si la hay');
  const s = A.tip(C('x', 'C', ['A', 'C E Am F G']));
  assert.equal(s.titulo, 'Un dominante secundario');
  assert.match(s.texto, /E \(III\) es el V de Am \(vi\)/); assert.match(s.texto, /G♯/);
  const s2 = A.tip(C('x', 'C', ['A', 'C A7 Dm F']));
  assert.match(s2.texto, /A7 \(VI\) es el V de Dm \(ii\)/); assert.match(s2.texto, /C♯/, 'la 3ª de A7 es C♯');
  assert.notEqual(A.tip(C('x', 'C', ['A', 'C F G C'])).titulo, 'Un dominante secundario', 'C→F no es secundario si el C no es C7');
  assert.notEqual(A.tip(C('x', 'C', ['A', 'G C'])).titulo, 'Un dominante secundario', 'V–I es el dominante normal');
});

test('tip: inversión, bajo ajeno y colores', () => {
  const i = A.tip(C('x', 'D', ['A', 'D A/C# Bm E']));
  assert.equal(i.titulo, 'Una inversión'); assert.match(i.texto, /A\/C♯ es A con la 3ª en el bajo \(primera inversión\)/);
  assert.match(A.tip(C('x', 'D', ['A', 'D A/E Bm E'])).texto, /segunda inversión/);
  assert.equal(A.tip(C('x', 'C', ['A', 'C F/G Am'])).titulo, 'Un acorde con bajo distinto');
  assert.equal(A.tip(C('x', 'D', ['A', 'D Asus4 Bm E'])).titulo, 'Un acorde suspendido (sus)');
  assert.equal(A.tip(C('x', 'E', ['A', 'Eadd9 C#m B'])).titulo, 'Un acorde con add9');
  assert.equal(A.tip(C('x', 'E', ['A', 'Emaj7 C#m B'])).titulo, 'Un acorde maj7');
});

test('tip: si nada más aplica, un dato seguro de la tonalidad; sin acordes no hay tip', () => {
  const g = A.tip(C('x', 'A', ['A', 'A D F#m E']));
  assert.equal(g.titulo, 'Tu tonalidad: A');
  assert.match(g.texto, /lleva 3 sostenidos \(F♯ C♯ G♯\)/); assert.match(g.texto, /relativo menor es F♯m/); assert.match(g.texto, /A {2}Bm {2}C♯m {2}D {2}E {2}F♯m {2}G♯dim/);
  assert.match(A.tip(C('x', 'Bb', ['A', 'Bb Gm Cm'])).texto, /lleva 2 bemoles \(B♭ E♭\)/);
  assert.match(A.tip(C('x', 'C', ['A', 'C Am Dm G'])).texto, /no lleva sostenidos ni bemoles/);
  assert.match(A.tip(C('x', 'Em', ['A', 'Em Am D G'])).texto, /relativo mayor es G/);
  assert.equal(A.tip(C('x', 'C')), null); assert.equal(A.tip(null), null); assert.equal(A.tip(C('x', 'C', ['A', ''])), null);
  assert.equal(A.tip({ titulo: 'sin tono', partes: [{ prog: 'C G' }] }), null, 'sin tonalidad no se inventa nada');
});

test('tip: nunca nombra los modos que se quitaron (dórico, frigio, lidio, locrio)', () => {
  const casos = [['G', 'G F C G'], ['Am', 'Am G F E'], ['C', 'C Ab F G'], ['C', 'C E Am F G'], ['D', 'D Asus4 Bm G'], ['Am', 'Am F C G'], ['C', 'Cm6 Fm']];
  for (const [tono, prog] of casos) { const t = A.tip(C('x', tono, ['A', prog])); assert.ok(t, prog); assert.doesNotMatch(JSON.stringify(t), /d[óo]rico|frigio|(?<!mixo)lidio|locrio/i, prog); }
});
