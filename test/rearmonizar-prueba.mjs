// Pruebas de rearmonizar.js (motor de reglas por niveles, con Tonal real). Reglas adaptadas de Jangle (MIT). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../vendor/tonal.min.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(await readFile(new URL('../rearmonizar.js', import.meta.url), 'utf8'), ctx);
const T = ctx.Tonal, R = ctx.Rearmonizar, M = R.motor(T);
const J = x => JSON.parse(JSON.stringify(x));
const ver = (ops, i) => J(ops[i]).map(o => o.acordes.join(' '));
const NOTE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

test('cada regla pertenece a un solo nivel, y los 4 niveles juntos cubren todas las reglas del motor', () => {
  const ids = M.RULES.map(r => r.id), enNiveles = R.NIVELES.flatMap(n => n.reglas);
  assert.equal(new Set(enNiveles).size, enNiveles.length, 'ninguna regla repetida entre niveles');
  assert.deepEqual([...ids].sort(), [...enNiveles].sort());
  assert.equal(R.NIVELES.length, 4);
  assert.deepEqual(J(R.NIVELES).map(n => n.n), [1, 2, 3, 4]);
  assert.equal(R.nivelDe('ninth'), 1); assert.equal(R.nivelDe('dimPassing'), 2); assert.equal(R.nivelDe('iiV'), 3); assert.equal(R.nivelDe('tritone'), 4); assert.equal(R.nivelDe('nada'), 0);
});

test('nivel 1 (adornos) sobre G D Em C: add9, sus2, sus4 y sexta; nada más', () => {
  const ops = M.opciones(['G', 'D', 'Em', 'C'], 1, 'G');
  assert.deepEqual(ver(ops, 0), ['Gadd9', 'Gsus2', 'Gsus4 G', 'G6']);
  assert.deepEqual(ver(ops, 2), ['Emadd9', 'Esus2', 'Esus4 Em', 'Em6']);
  for (const op of ops) for (const o of op) assert.equal(o.nivel, 1);
});

test('nivel 2: disminuido de paso entre D y Em, séptima de V, paso diatónico Em → D → C, relativo y mediante', () => {
  const ops = M.opciones(['G', 'D', 'Em', 'C'], 2, 'G');
  const d = ver(ops, 1);
  assert.ok(d.includes('D Ebdim7'), d); assert.ok(d.includes('D7'), 'D es el V de G: pide séptima menor'); assert.ok(d.includes('Bm')); assert.ok(d.includes('F#m'));
  assert.ok(ver(ops, 0).includes('Gmaj7'), 'el I lleva maj7');
  assert.ok(ver(ops, 2).includes('Em D'), 'paso diatónico bajando hacia C');
  assert.ok(ver(ops, 3).includes('Am'), 'relativo menor');
});

test('nivel 3: dominante secundario, ii-V, tensión del dominante y 7b9 cuando resuelve a menor', () => {
  const o = M.opciones(['C', 'G7', 'Am'], 3, 'C');
  assert.ok(ver(o, 0).includes('G7 C'), 'V7 de C'); assert.ok(ver(o, 0).includes('Dm7 G7 C'), 'ii-V de C');
  assert.ok(ver(o, 1).includes('Dm7 G7'), 'inserción ii-V'); assert.ok(ver(o, 1).includes('G13')); assert.ok(ver(o, 1).includes('G7b9'), 'G7 resuelve a Am: 7b9');
  assert.ok(M.opciones(['C', 'G7', 'C'], 3, 'C')[1].map(x => x.acordes.join(' ')).includes('G7#9'), 'resolviendo a mayor: 7#9');
  assert.ok(ver(M.opciones(['Am'], 3, 'C'), 0).includes('Am AmMaj7 Am7 Am6'), 'línea cromática interna');
});

test('nivel 4: tritono, menor prestado, puerta trasera, sin fundamental y disminuido dominante', () => {
  const o = M.opciones(['C', 'G7', 'C'], 4, 'C');
  assert.ok(ver(o, 1).includes('C#7'), 'tritono de G7'); assert.ok(ver(o, 1).includes('Bm7b5')); assert.ok(ver(o, 1).includes('Bdim7'));
  assert.ok(ver(o, 0).includes('Cm'), 'intercambio modal'); assert.ok(ver(o, 0).includes('Bb7 C'), 'puerta trasera'); assert.ok(ver(o, 0).includes('Fm C'), 'subdominante menor');
});

test('cada idea trae regla, razón, notas y nunca repite el acorde original ni dos ideas iguales', () => {
  for (let n = 1; n <= 4; n++) {
    const ops = M.opciones(['C', 'Am', 'F', 'G7'], n, 'C');
    ops.forEach((lista, i) => {
      const vistos = new Set();
      for (const o of lista) {
        assert.ok(o.regla && o.porque.length > 20 && o.acordes.length >= 1, o.id);
        assert.equal(o.notas.length, o.acordes.length); assert.ok(o.notas.every(ns => ns.length >= 3), 'notas para tocar: ' + o.acordes);
        assert.ok(!vistos.has(o.acordes.join(' ')), 'repetida: ' + o.acordes); vistos.add(o.acordes.join(' '));
        assert.notEqual(o.acordes.join(' '), ['C', 'Am', 'F', 'G7'][i]);
        assert.ok(!/guitarra|cuerda al aire|traste/i.test(o.porque), 'los textos son para piano: ' + o.porque);
      }
    });
  }
});

test('acordes que no se pueden leer (N.C., vacíos) no llevan ideas y no rompen a los vecinos', () => {
  const ops = M.opciones(['G', 'N.C.', '', 'D'], 2, 'G');
  assert.deepEqual(J(ops[1]), []); assert.deepEqual(J(ops[2]), []); assert.ok(ops[0].length && ops[3].length);
  assert.deepEqual(J(M.opciones([], 1)), []);
  assert.ok(ver(M.opciones(['C/E', 'F'], 1, 'C'), 0).includes('Cadd9'), 'acordes con bajo se entienden');
});

test('el tono de la canción manda: tono menor se lee en su relativo mayor; sin tono se detecta', () => {
  assert.equal(M.llaveDe('G', []), 7); assert.equal(M.llaveDe('Am', []), 0); assert.equal(M.llaveDe('F#m', []), 9); assert.equal(M.llaveDe('Bb', []), 10);
  assert.equal(M.llaveDe(undefined, ['G', 'D', 'Em', 'C'].map(s => T.Chord.get(s))), 7, 'detecta Sol mayor');
});

test('midis: las notas de cada acorde suben de grave a agudo para oírlas en el piano', () => {
  assert.deepEqual(J(M.midis('Gadd9')), [55, 59, 62, 69]);
  assert.deepEqual(J(M.midis('Cmaj7')), [48, 52, 55, 59]);
  for (const s of ['Am7', 'Ebdim7', 'F#m7b5', 'Bb13', 'Esus4', 'G7#9', 'AmMaj7']) { const m = M.midis(s); assert.ok(m.length >= 3 && m.every((x, i) => i === 0 || x > m[i - 1]) && m.every(Number.isInteger), s + ' ' + m); }
});

test('en los 12 tonos y 6 progresiones comunes, toda idea es un acorde que Tonal reconoce (se puede mostrar y oír)', () => {
  const g = { I: [0, ''], ii: [2, 'm'], iii: [4, 'm'], IV: [5, ''], V: [7, ''], V7: [7, '7'], vi: [9, 'm'], i: [0, 'm'], VII: [10, ''], VI: [8, ''] };
  let total = 0;
  for (let k = 0; k < 12; k++) for (const p of ['I V vi IV', 'I IV V I', 'vi IV I V', 'I vi IV V7', 'ii V I vi', 'i VII VI VII']) {
    const prog = p.split(' ').map(x => NOTE[(k + g[x][0]) % 12] + g[x][1]);
    for (let n = 1; n <= 4; n++) for (const lista of M.opciones(prog, n, NOTE[k]))
      for (const o of lista) for (const s of o.acordes) { total++; assert.ok(!T.Chord.get(s).empty, s + ' en ' + prog); assert.ok(M.midis(s).length >= 3, s); }
  }
  assert.ok(total > 1500, 'se revisaron muchas ideas: ' + total);
});
