// Pruebas de hoja.js (letra con acordes entre corchetes) y de la limpieza del campo letra. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { limpiarCancion, LIMITES } from '../lib/limpiar.js';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../hoja.js', import.meta.url), 'utf8'), ctx);
const H = ctx.Hoja;
const plano = o => JSON.parse(JSON.stringify(o));

test('esAcorde: acordes de verdad sí, palabras no', () => {
  for (const a of ['G', 'Am', 'F#m7', 'Bb', 'Cmaj7', 'D/F#', 'Em(add9)', 'C#dim7', 'Gsus4', 'A7sus4', 'N.C.', 'Bm7b5', 'F♯m', 'B♭maj7', 'Cø', 'C+', 'C°'])
    assert.ok(H.esAcorde(a), a);
  for (const a of ['Coro', 'Verso 1', 'Intro', 'Final', 'Puente', 'Bridge', 'x', '', 'Hola mundo', 'H'])
    assert.ok(!H.esAcorde(a), a);
});

test('el acorde queda justo antes de la sílaba que le sigue', () => {
  const [l] = plano(H.interpretar('[Am]Cuando salga el [F]sol'));
  assert.equal(l.t, 'l'); assert.ok(l.conAc);
  assert.deepEqual(l.segs, [{ ac: 'Am', tx: 'Cuando salga el ' }, { ac: 'F', tx: 'sol' }]);
});

test('texto antes del primer acorde, acordes seguidos y línea sin acordes', () => {
  const r = plano(H.interpretar('Oh [G]Señor [C][D]\nSolo letra'));
  assert.deepEqual(r[0].segs, [{ ac: '', tx: 'Oh ' }, { ac: 'G', tx: 'Señor ' }, { ac: 'C', tx: '' }, { ac: 'D', tx: '' }]);
  assert.equal(r[1].conAc, false); assert.deepEqual(r[1].segs, [{ ac: '', tx: 'Solo letra' }]);
});

test('una línea que es solo [Coro] es título de sección; [G] solo es acorde', () => {
  const r = plano(H.interpretar('[Coro]\n[Verso 1]:\n[G]\n[Am] [F]'));
  assert.deepEqual(r[0], { t: 's', x: 'Coro' }); assert.deepEqual(r[1], { t: 's', x: 'Verso 1' });
  assert.equal(r[2].t, 'l'); assert.deepEqual(r[2].segs, [{ ac: 'G', tx: '' }]);
  assert.equal(r[3].t, 'l');
});

test('corchetes sueltos o mal puestos se muestran tal cual y no rompen nada', () => {
  const casos = ['Una [ suelta', 'Otra ] suelta', 'Vacíos [] y [ ] aquí', '[Am sin cerrar', 'Anidado [[Am]] raro', '[' + 'x'.repeat(40) + ']'];
  for (const c of casos) {
    const r = plano(H.interpretar(c));
    assert.equal(r.length, 1, c);
    const texto = r[0].t === 's' ? r[0].x : r[0].segs.map(s => (s.ac ? '[' + s.ac + ']' : '') + s.tx).join('');
    assert.ok(texto.length > 0, c);
  }
  assert.deepEqual(plano(H.interpretar('Una [ suelta'))[0].segs, [{ ac: '', tx: 'Una [ suelta' }]);
  assert.deepEqual(plano(H.interpretar('Vacíos [] aquí'))[0].segs, [{ ac: '', tx: 'Vacíos [] aquí' }]);
});

test('un nombre raro entre corchetes se muestra tal cual (no se valida)', () => {
  const [l] = plano(H.interpretar('[Cmaj13#11]Hola'));
  assert.deepEqual(l.segs, [{ ac: 'Cmaj13#11', tx: 'Hola' }]);
});

test('líneas vacías: una sola entre bloques, ninguna al inicio ni al final; CRLF y espacios finales', () => {
  const r = plano(H.interpretar('\n\n[Am]Uno   \r\n\r\n\r\n\r\n[F]Dos\n\n'));
  assert.deepEqual(r.map(x => x.t), ['l', 'v', 'l']);
  assert.equal(r[0].segs[0].tx, 'Uno');
  assert.deepEqual(plano(H.interpretar('')), []); assert.deepEqual(plano(H.interpretar(null)), []);
});

test('acordes(): distintos y en orden, sin los títulos de sección', () => {
  assert.deepEqual(plano(H.acordes('[Coro]\n[G]Hola [D]amigo [G]mío\n[Em]Adiós [Rara]x')), ['G', 'D', 'Em']);
});

test('limpiar: el campo letra (opcional, ≤ límite, conserva corchetes y saltos de línea)', () => {
  const base = { titulo: 'x', tono: 'G' };
  assert.equal(limpiarCancion(base).letra, '');
  assert.equal(limpiarCancion({ ...base, letra: 42 }).letra, '');
  assert.equal(limpiarCancion({ ...base, letra: '[Am]Hola\r\n[F]Mundo' }).letra, '[Am]Hola\n[F]Mundo');
  assert.equal(limpiarCancion({ ...base, letra: 'a\u0000b\u0007c\td' }).letra, 'abc\td');
  const larga = limpiarCancion({ ...base, letra: '[G]a\n'.repeat(10000) }).letra;
  assert.ok(larga.length <= LIMITES.letraCancion && larga.length > 1000);
  assert.equal(limpiarCancion({ ...base, letra: '   \n  ' }).letra, '');
});
