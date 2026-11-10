// Pruebas de improvisar.js (motor: acordes, notas guía, escalas y pasos para el piano, con Tonal real). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../vendor/tonal.min.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(await readFile(new URL('../improvisar.js', import.meta.url), 'utf8'), ctx);
const I = ctx.Improvisar, M = I.motor(ctx.Tonal);
const J = x => JSON.parse(JSON.stringify(x));

test('ii–V–I en C: acordes, notas guía y cómo baja la 7ª hasta la 3ª siguiente', () => {
  const a = J(M.construir('C', 'ii-V-I'));
  assert.deepEqual(a.map(x => x.simbolo), ['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
  assert.deepEqual(a.map(x => [x.tercera, x.septima]), [['F', 'C'], ['B', 'F'], ['E', 'B'], ['E', 'B']]);
  assert.equal(a[0].resuelve, 'baja medio tono', 'C → B'); assert.equal(a[0].destino, 'B'); assert.equal(a[0].siguiente, 'G7');
  assert.equal(a[1].resuelve, 'baja medio tono', 'F → E');
  assert.equal(a[2].resuelve, 'sube 5 semitonos', 'Cmaj7: su 7ª (B) hasta la 3ª (E) del Cmaj7 que sigue');
  assert.equal(a[3].resuelve, 'sube 6 semitonos', 'y al volver a empezar, B hasta la F de Dm7');
});

test('la resolución es el camino más corto, en cualquier tono (también con bemoles y sostenidos)', () => {
  const r = M.resolucion;
  assert.equal(r('C', 'B'), 'baja medio tono'); assert.equal(r('B', 'C'), 'sube medio tono'); assert.equal(r('Bb', 'A'), 'baja medio tono');
  assert.equal(r('D', 'C'), 'baja un tono'); assert.equal(r('C', 'D'), 'sube un tono'); assert.equal(r('G', 'G'), 'se queda en la misma nota');
  assert.equal(r('B', 'F'), 'sube 6 semitonos'); assert.equal(r('F#', 'D'), 'baja 4 semitonos');
  for (const [t] of I.TONOS) for (const p of I.PLANTILLAS) {
    const a = J(M.construir(t, p.id));
    a.forEach((x, i) => { const s = a[(i + 1) % a.length]; assert.equal(x.siguiente, s.simbolo); assert.equal(x.destino, s.tercera); assert.ok(x.resuelve.length > 5); });
  }
});

test('las 5 bases salen bien en los 12 tonos: ortografía, tercera y séptima dentro del acorde, escala con 7 notas', () => {
  const largo = { 'ii-V-I': 4, vuelta: 4, pop: 4, blues: 12, menor: 4 };
  for (const [t] of I.TONOS) for (const p of I.PLANTILLAS) {
    const a = J(M.construir(t, p.id));
    assert.equal(a.length, largo[p.id], p.id);
    for (const x of a) {
      assert.equal(x.notas.length, 4, x.simbolo); assert.equal(x.tercera, x.notas[1]); assert.equal(x.septima, x.notas[3]);
      assert.equal(x.escala.notas.length, 7, x.simbolo + ' ' + x.escala.nombre);
      assert.ok(x.escala.notas.includes(x.tercera) && x.escala.notas.includes(x.septima), 'las notas guía están en la escala: ' + x.simbolo + ' ' + x.escala.nombre);
      assert.ok(!/[#b]{2}/.test(x.simbolo.replace(/m7|maj7|7/, '')), 'sin dobles alteraciones: ' + x.simbolo);
    }
  }
  assert.deepEqual(J(M.construir('G', 'blues')).map(x => x.simbolo).slice(0, 5), ['G7', 'G7', 'G7', 'G7', 'C7']);
  assert.deepEqual(J(M.construir('A', 'menor')).map(x => x.simbolo), ['Am7', 'G7', 'Fmaj7', 'E7']);
  assert.deepEqual(J(M.construir('Bb', 'vuelta')).map(x => x.simbolo), ['Bbmaj7', 'Gm7', 'Cm7', 'F7']);
  assert.equal(J(M.construir('F#', 'pop'))[0].simbolo, 'F#maj7');
  assert.deepEqual(J(M.construir('Db', 'menor')).map(x => x.simbolo), ['Dbm7', 'B7', 'Amaj7', 'Ab7'], 'en D♭ menor, ♭VII y ♭VI se escriben B y A (no C♭ ni B♭♭)');
});

test('escala sugerida: Jónico en maj7, Mixolidio en dominantes, Eólico en vi7 e i7, y en el ii7 las notas del tono desde el ii', () => {
  const a = J(M.construir('C', 'ii-V-I'));
  assert.equal(a[0].escala.nombre, 'C mayor desde D'); assert.deepEqual(a[0].escala.notas, ['D', 'E', 'F', 'G', 'A', 'B', 'C']);
  assert.equal(a[1].escala.nombre, 'G Mixolidio'); assert.deepEqual(a[1].escala.notas, ['G', 'A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(a[2].escala.nombre, 'C Jónico');
  const m = J(M.construir('A', 'menor'));
  assert.equal(J(M.construir('C', 'vuelta'))[1].escala.nombre, 'A Eólico', 'el vi7 de C');
  assert.equal(m[0].escala.nombre, 'A Eólico'); assert.deepEqual(m[0].escala.notas, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
});

test('pasos del piano: un acorde por compás con su bajo, tiempos exactos y vueltas', () => {
  const a = M.construir('C', 'ii-V-I');
  const p = J(M.pasos(a, 80, 3));
  assert.equal(p.length, 12);
  p.forEach((s, k) => { assert.equal(s.en, Math.round(k * 3000)); assert.ok(s.dur > 2.5 && s.dur < 3); });
  assert.deepEqual(p[0].midis, [38, 50, 53, 57, 60], 'D2 de bajo y Dm7: D3 F3 A3 C4');
  assert.deepEqual(p[1].midis[0], 43, 'G2 de bajo');
  assert.ok(p.every(s => s.midis.every(m => m >= 30 && m <= 80)));
  assert.equal(J(M.pasos(a, 60, 1))[1].en, 4000); assert.equal(J(M.pasos(a, 100, 1))[1].en, 2400);
  assert.equal(M.vueltasPara(4), 8); assert.equal(M.vueltasPara(12), 3); assert.equal(M.vueltasPara(40), 1);
});

test('tono o base que no existen no rompen: devuelven null', () => {
  assert.equal(M.construir('', 'ii-V-I'), null); assert.equal(M.construir('X', 'ii-V-I'), null); assert.equal(M.construir('C', 'nada'), null);
});
