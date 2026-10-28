// Pruebas de notacion.js (lógica pura de Practicar). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, stat } from 'node:fs/promises';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../notacion.js', import.meta.url), 'utf8'), ctx);
const N = ctx.Notacion;
// Generador pseudoaleatorio con semilla (para que las pruebas sean repetibles).
const semilla = s => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const n = (l, a, o) => N.nota(l, a, o);

test('midi y nombres', () => {
  assert.equal(N.midi(n('C', 0, 4)), 60); assert.equal(N.midi(n('A', 0, 4)), 69); assert.equal(N.midi(n('B', -1, 3)), 58);
  assert.equal(N.midi(n('F', 1, 5)), 78); assert.equal(N.nombre(n('F', 1, 5)), 'F#5'); assert.equal(N.bonito(n('B', -1, 3)), 'B♭');
});

test('posiciones en las claves de sol y fa (0 = línea inferior)', () => {
  assert.equal(N.posicion('sol', n('E', 0, 4)), 0);  assert.equal(N.posicion('sol', n('C', 0, 4)), -2); assert.equal(N.posicion('sol', n('F', 0, 5)), 8);
  assert.equal(N.posicion('fa', n('G', 0, 2)), 0);   assert.equal(N.posicion('fa', n('F', 0, 3)), 6);   assert.equal(N.posicion('fa', n('C', 0, 4)), 10);
  assert.deepEqual(Object.keys(N.CLAVES), ['sol', 'fa'], 'solo las claves del piano');
  assert.deepEqual(Object.keys(N.TEMAS).filter(t => N.TEMAS[t].tipo === 'pentagrama'), ['sol', 'fa']);
  for (const c of Object.keys(N.CLAVES)) for (let p = -8; p <= 16; p++) assert.equal(N.posicion(c, N.notaEnPos(c, p)), p, `${c} ${p}`);
});

test('niveles: cada candidato cae donde dice el nivel y no hay dobles alteraciones', () => {
  for (const [id, T] of Object.entries(N.TEMAS)) for (const nv of T.niveles) {
    const c = N.candidatos(id, nv.id);
    assert.ok(c.length >= 3, `${id} nivel ${nv.id} tiene pocas opciones`);
    if (T.tipo === 'pentagrama') for (const x of c) {
      assert.ok(nv.pos.includes(N.posicion(id, x.nota)), `${id}/${nv.id}: ${N.nombre(x.nota)}`);
      assert.ok(Math.abs(x.nota.a) <= 1);
      if (!nv.alt) assert.equal(x.nota.a, 0, 'sin alteraciones en niveles 1 a 4');
    } else for (const x of c) assert.ok(nv.pcs.includes(x.pc));
  }
  assert.ok(N.candidatos('sol', 5).some(x => x.nota.a === 1) && N.candidatos('sol', 5).some(x => x.nota.a === -1));
});

test('preguntas: 300 por tema y nivel, siempre válidas, con respuesta correcta que comprueba y sin repetir seguida', () => {
  const rng = semilla(7);
  for (const [id, T] of Object.entries(N.TEMAS)) for (const nv of T.niveles) {
    let previa = null;
    for (let i = 0; i < 300; i++) {
      const p = N.crearPregunta(id, nv.id, { items: {} }, rng, previa);
      assert.notEqual(p.item, previa, `${id}/${nv.id} repitió ${p.item}`); previa = p.item;
      if (p.tipo === 'pentagrama') {
        assert.ok(N.comprobar(p, { l: p.nota.l, a: p.nota.a }));
        assert.ok(!N.comprobar(p, { l: N.LETRAS[(N.LETRAS.indexOf(p.nota.l) + 1) % 7], a: p.nota.a }), 'otra letra es incorrecta');
        if (p.nota.a) assert.ok(!N.comprobar(p, { l: p.nota.l, a: 0 }), 'sin la alteración es incorrecto');
      } else {
        assert.ok(N.comprobar(p, { pc: p.respuesta.pc })); assert.ok(N.comprobar(p, { pc: p.respuesta.pc + 12 }), 'cualquier octava vale');
        assert.ok(!N.comprobar(p, { pc: p.respuesta.pc + 1 }));
        if (p.tipo === 'teclado') assert.equal(p.midi % 12, p.respuesta.pc);
      }
    }
  }
});

test('lo que fallas sale más que lo que dominas (pesos)', () => {
  const rng = semilla(11), cands = N.candidatos('sol', 1);
  const [mal, bien] = [cands[0].item, cands[1].item];
  const est = { items: { [mal]: { v: 10, a: 0, ms: 0 }, [bien]: { v: 10, a: 10, ms: 0 } } };
  for (const c of cands.slice(2)) est.items[c.item] = { v: 10, a: 10, ms: 0 };
  const cuenta = {};
  for (let i = 0; i < 4000; i++) { const p = N.crearPregunta('sol', 1, est, rng, null); cuenta[p.item] = (cuenta[p.item] || 0) + 1; }
  assert.ok(cuenta[mal] > 3 * cuenta[bien], `mal=${cuenta[mal]} bien=${cuenta[bien]}`);
  assert.equal(N.peso(est, 'sol:no-visto'), 2); assert.equal(N.peso(est, mal), 5); assert.equal(N.peso(est, bien), 1);
});

test('botones de respuesta según tema y nivel', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(N.botones('sol', 3))), { tipo: 'letras', letras: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], alteraciones: false });
  assert.equal(N.botones('sol', 5).alteraciones, true);
  assert.equal(N.botones('tecla', 2).tipo, 'ninguno');
  assert.equal(N.botones('teclado', 3).pcs.length, 7); assert.equal(N.botones('teclado', 4).pcs.length, 5); assert.equal(N.botones('teclado', 5).pcs.length, 12);
  assert.deepEqual(JSON.parse(JSON.stringify(N.botones('teclado', 4).pcs.map(x => x.texto))), ['C#/Db', 'D#/Eb', 'F#/Gb', 'G#/Ab', 'A#/Bb']);
});

test('estadísticas, precisión y racha', () => {
  const s = (id, f, a, extra = {}) => ({ id, t: 'sol', l: 1, f, n: 4, a, ms: 8000, q: [['sol:E4', 1, 1000], ['sol:G4', a > 2 ? 1 : 0, 1500], ['sol:E4', 1, 1000], ['sol:B4', a > 3 ? 1 : 0, 2000]], ...extra });
  const lista = [s('a1', '2026-10-24', 2), s('a2', '2026-10-26', 3), s('a3', '2026-10-27', 4)];
  const est = N.estadisticas(lista);
  assert.deepEqual({ ...est.items['sol:E4'] }, { v: 6, a: 6, ms: 6000 });
  assert.equal(est.items['sol:G4'].v, 3); assert.equal(est.items['sol:G4'].a, 2);
  assert.ok(Math.abs(N.precision(est, 'sol', 1) - (0.5 + 0.75 + 1) / 3) < 1e-9);
  assert.equal(N.precision(est, 'fa', 1), null);
  assert.equal(N.racha(lista, '2026-10-27'), 2, '26 y 27 seguidos; el 24 no cuenta por el hueco del 25');
  assert.equal(N.racha(lista, '2026-10-28'), 2, 'si hoy aún no practicaste, la racha cuenta hasta ayer');
  assert.equal(N.racha(lista, '2026-10-29'), 0);
  assert.equal(N.racha([], '2026-10-27'), 0);
});

test('pentagrama SVG: 5 líneas + las líneas adicionales que toquen, clave (sol o fa) y alteración', () => {
  const lineas = svg => (svg.match(/<line /g) || []).length;
  for (const [pos, extra] of [[0, 0], [8, 0], [-1, 0], [-2, 1], [-3, 1], [-4, 2], [9, 0], [10, 1], [11, 1], [12, 2]]) {
    assert.equal(lineas(N.svgPentagrama('sol', N.notaEnPos('sol', pos))), 5 + extra, 'posición ' + pos);
  }
  for (const [c, glifo] of [['sol', '\uE050'], ['fa', '\uE062']]) assert.ok(N.svgPentagrama(c, N.notaEnPos(c, 3)).includes(glifo));
  assert.ok(N.svgPentagrama('sol', n('F', 1, 4)).includes('\uE262')); assert.ok(N.svgPentagrama('sol', n('B', -1, 4)).includes('\uE260'));
  assert.ok(!/\uE262|\uE260/.test(N.svgPentagrama('sol', n('F', 0, 4))));
  assert.ok(!N.svgPentagrama('sol', n('F', 0, 4)).includes('style='), 'sin estilos en línea (la CSP los bloquea)');
});

test('teclado SVG: 24 teclas, una marcada, interactivo con teclado', () => {
  const s = N.svgTeclado({ marcar: [66] });
  assert.equal((s.match(/<rect /g) || []).length, 24); assert.equal((s.match(/pk-on/g) || []).length, 1);
  assert.ok(!s.includes('tabindex'));
  const i = N.svgTeclado({ interactivo: true });
  assert.equal((i.match(/tabindex="0"/g) || []).length, 24); assert.ok(i.includes('aria-label="C#/Db"'));
  assert.equal((N.svgTeclado({ clases: { 60: 'pk-ok', 61: 'pk-mal' } }).match(/pk-ok|pk-mal/g) || []).length, 2);
});

test('la fuente musical está incluida, es pequeña y trae su licencia', async () => {
  assert.ok((await stat(new URL('../vendor/atril-notas.woff2', import.meta.url))).size < 20_000);
  assert.match(await readFile(new URL('../vendor/OFL-Bravura.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/i);
});
