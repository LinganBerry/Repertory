// Pruebas de escalas.js (retos de escalas y modos: lógica pura, con Tonal real). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../vendor/tonal.min.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(await readFile(new URL('../escalas.js', import.meta.url), 'utf8'), ctx);
const E = ctx.Escalas, T = ctx.Tonal;
const J = x => JSON.parse(JSON.stringify(x));
const MODOS = [['ionian', 'Jónico', 'mayor'], ['dorian', 'Dórico'], ['phrygian', 'Frigio'], ['lydian', 'Lidio'], ['mixolydian', 'Mixolidio'], ['aeolian', 'Eólico', 'menor natural'], ['locrian', 'Locrio']];
const datos = { T, modos: MODOS };
const semilla = s => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const IDS = [...MODOS.map(m => m[0]), ...E.OTRAS.map(o => o[0])];

test('armar: cada tónica elige el nombre más limpio y nunca sale un doble sostenido ni doble bemol', () => {
  let nulos = 0;
  for (let pc = 0; pc < 12; pc++) for (const id of IDS) {
    const r = E.armar(T, pc, id);
    if (!r) { nulos++; continue; }
    assert.ok(r.notas.every(n => !/##|bb/.test(n)), `${r.tonica} ${id}: ${r.notas}`);
    assert.equal(T.Note.get(r.tonica).chroma, pc, 'la tónica es la pedida');
  }
  assert.ok(nulos <= 3, 'casi todas las combinaciones se pueden escribir limpias: ' + nulos);
  assert.deepEqual(J(E.armar(T, 2, 'dorian').notas), ['D', 'E', 'F', 'G', 'A', 'B', 'C']);
  assert.equal(E.armar(T, 8, 'locrian').tonica, 'G#', 'Ab locrio tendría dobles bemoles: se usa G#');
  assert.equal(E.armar(T, 3, 'lydian').tonica, 'Eb');
  assert.equal(E.armar(T, 6, 'major pentatonic').tonica, 'F#');
});

test('grados: cada escala se compara con la mayor (♭ y ♯ bien puestos)', () => {
  const g = id => E.grados(T, T.Scale.get('C ' + id).intervals).map(x => x.texto).join(' ');
  assert.equal(g('ionian'), '1 2 3 4 5 6 7');
  assert.equal(g('dorian'), '1 2 ♭3 4 5 6 ♭7');
  assert.equal(g('phrygian'), '1 ♭2 ♭3 4 5 ♭6 ♭7');
  assert.equal(g('lydian'), '1 2 3 ♯4 5 6 7');
  assert.equal(g('mixolydian'), '1 2 3 4 5 6 ♭7');
  assert.equal(g('aeolian'), '1 2 ♭3 4 5 ♭6 ♭7');
  assert.equal(g('locrian'), '1 ♭2 ♭3 4 ♭5 ♭6 ♭7');
  assert.equal(g('harmonic minor'), '1 2 ♭3 4 5 ♭6 7');
  assert.equal(g('melodic minor'), '1 2 ♭3 4 5 6 7');
  assert.equal(g('major pentatonic'), '1 2 3 5 6');
  assert.equal(g('minor pentatonic'), '1 ♭3 4 5 ♭7');
});

test('lista: los 7 modos, las otras 4 escalas, o todas (sin repetir la mayor ni la menor natural)', () => {
  assert.deepEqual(J(E.lista(MODOS, 'modos')).map(x => x.id), MODOS.map(m => m[0]));
  assert.deepEqual(J(E.lista(MODOS, 'otras')).map(x => x.id), J(E.OTRAS).map(o => o[0]));
  assert.equal(E.lista(MODOS, 'todas').length, 11);
});

test('crearReto: respeta el tipo, escribe bien el título y las notas, y no repite la anterior', () => {
  const azar = semilla(11);
  for (let i = 0; i < 80; i++) {
    const r = J(E.crearReto(datos, { tipo: 'modos' }, azar));
    assert.ok(MODOS.some(m => m[0] === r.item), r.item);
    assert.equal(r.notas.length, 8); assert.equal(r.notas[0], r.notas[7], 'sube una octava: termina en la tónica');
    assert.ok(r.titulo.startsWith(r.tonica + ' '), r.titulo);
  }
  for (let i = 0; i < 40; i++) {
    const r = J(E.crearReto(datos, { tipo: 'otras' }, azar));
    assert.ok(E.OTRAS.some(o => o[0] === r.item));
    assert.equal(r.notas.length, r.item.includes('pentatonic') ? 6 : 8);
    assert.equal(r.cambia, r.item.includes('pentatonic') ? null : r.cambia, 'las pentatónicas no se comparan con la mayor 1 a 1');
  }
  let previo = null;
  for (let i = 0; i < 60; i++) { const r = E.crearReto(datos, { tipo: 'todas' }, azar, previo); assert.notEqual(r.item, previo); previo = r.item; }
  assert.equal(E.crearReto({ T, modos: [] }, { tipo: 'modos' }, azar), null);
});

test('crearReto: textos del jónico, el dórico y los cambios respecto a la mayor', () => {
  const azar = semilla(21), buscar = id => { for (let i = 0; i < 2000; i++) { const r = E.crearReto(datos, { tipo: 'todas' }, azar); if (r.item === id) return J(r); } };
  const jo = buscar('ionian'), dor = buscar('dorian'), mel = buscar('melodic minor');
  assert.ok(jo.titulo.endsWith('jónico (mayor)')); assert.deepEqual(jo.cambia, []);
  assert.ok(dor.titulo.endsWith('dórico')); assert.deepEqual(dor.cambia, ['♭3', '♭7']); assert.equal(dor.grados, '1 2 ♭3 4 5 6 ♭7 1');
  assert.ok(mel.titulo.endsWith('menor melódica')); assert.deepEqual(mel.cambia, ['♭3']);
});

test('repasar: con lo fallado activado, sale más seguido; sin activarlo, no influye', () => {
  const est = E.vacias(); for (let i = 0; i < 5; i++) E.registrar(est, 'locrian', false, 0);
  const cuenta = op => { const azar = semilla(5); let n = 0; for (let i = 0; i < 400; i++) if (E.crearReto(datos, op, azar, null, est).item === 'locrian') n++; return n; };
  const con = cuenta({ tipo: 'modos', repasar: true }), sin = cuenta({ tipo: 'modos', repasar: false });
  assert.ok(con > sin * 1.6, `con repaso ${con} vs sin ${sin}`);
});

test('estadísticas: registrar, limpiar datos alterados y resumir solo lo que existe', () => {
  const est = E.vacias();
  E.registrar(est, 'dorian', true, 4000); E.registrar(est, 'dorian', true, 2000); E.registrar(est, 'lydian', false, 0); E.registrar(est, 'lydian', false, 0); E.registrar(est, 'lydian', true, 3000);
  E.registrar(est, 'bebop', false, 0);
  const r = J(E.resumen(est, MODOS));
  assert.equal(r.v, 5); assert.equal(r.a, 3);
  assert.deepEqual(r.repasar.map(x => x.id), ['lydian']);
  assert.equal(est.items.dorian.mejor, 2000);
  const sucio = J(E.limpiar({ items: { dorian: { v: 3, a: 9, ms: -5, mejor: 'x' }, 'Raro!': { v: 1, a: 1 }, '../x': { v: 1 }, lydian: null } }));
  assert.deepEqual(Object.keys(sucio.items), ['dorian']);
  assert.deepEqual(sucio.items.dorian, { v: 3, a: 3, ms: 0, mejor: 0 });
  assert.deepEqual(J(E.limpiar(null)), { items: {} }); assert.deepEqual(J(E.limpiar('hola')), { items: {} });
});
